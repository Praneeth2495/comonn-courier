const { prisma } = require('../config/db');
const { resolveOriginFilters, buildOrdersWhere, PAYABLE_STATUSES } = require('./order.controller');
const { getIstDateParts } = require('../utils/orderNumber');
const { round2 } = require('../services/pricingEngine');
const { PARTY_INVOICE_CATEGORY_LABELS } = require('../constants/partyInvoiceCategories');
const { PAGE_KEYS, DEFAULT_ALLOWED_PAGES_BY_ROLE, ORDER_TAB_KEYS, ACCOUNTS_TAB_KEYS, OVERVIEW_TAB_KEYS, PRINTLABEL_TAB_KEYS } = require('../constants/pages');
const { expandInState } = require('../constants/regions');

// ---------------- Dashboard ----------------
// "Paid" is cumulative — every order that has ever actually cleared
// payment, not just whatever's currently sitting in the literal PAID
// status (which would undercount, since most orders move on to
// LABEL_GENERATED/PICKED_UP/etc. within a day or two). PICKUP_CONFIRMED
// does NOT count, regardless of how the order eventually gets paid — cash
// collected in person, or a Razorpay link staff sends later. Either way
// nothing has been paid yet AT the moment a "book pickup" order sits in
// PICKUP_CONFIRMED (see confirmCashBooking, payment.controller.js: "no
// money has actually changed hands yet"); real payment always requires
// staff to price it first, which moves it to PENDING_PAYMENT (see
// updateOrderDetails, order.controller.js) before it can reach PAID by
// either payment method. Same exclusion list the revenue aggregate below
// uses, for the same reason.
const UNPAID_STATUSES = ['DRAFT', 'UNFINISHED', 'PENDING_PAYMENT', 'PICKUP_CONFIRMED', 'CANCELLED'];

// UNFINISHED (a quote+details started but payment never reached) never
// shows up outside the dedicated Unconfirmed-orders tab anywhere else in
// the admin panel (Bookings/Pickup/Manifest/Delivery/Accounts all exclude
// it the same way) — Overview and its breakdown tabs follow the same rule.
// `extraWhere` layers on a scope (a single staff's region assignments, or
// one specific region) on top of the shared date-range filter.
function buildDashboardWhere(from, to, extraWhere = {}) {
  const where = { status: { not: 'UNFINISHED' }, ...extraWhere };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999Z`);
  }
  return where;
}

// Shared by dashboardStats (whole-business or one staff member's scope) and
// the staffOverview/regionOverview breakdown tabs (one row per staff/region)
// — same five numbers, just computed against whatever `where` the caller
// already scoped down to.
async function computeOrderTotals(where) {
  const [totalOrders, pendingPayment, paid, inTransit, delivered, revenueAgg] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.count({ where: { ...where, status: 'PENDING_PAYMENT' } }),
    prisma.order.count({ where: { ...where, status: { notIn: UNPAID_STATUSES } } }),
    prisma.order.count({ where: { ...where, status: { in: ['PICKED_UP', 'ORIGIN_CUSTOMS_CLEARED', 'IN_TRANSIT', 'CLEARED_DESTINATION_CUSTOMS', 'OUT_FOR_DELIVERY'] } } }),
    prisma.order.count({ where: { ...where, status: 'DELIVERED' } }),
    prisma.order.aggregate({
      _sum: { grandTotal: true },
      where: { ...where, status: { notIn: UNPAID_STATUSES } },
    }),
  ]);
  return { totalOrders, pendingPayment, paid, inTransit, delivered, totalRevenue: revenueAgg._sum.grandTotal || 0 };
}

async function dashboardStats(req, res, next) {
  try {
    const { from, to } = req.query;
    const scopeWhere = {};

    // A STAFF viewer only sees orders picked up from the state/region
    // they've been assigned (Users panel) — same origin-region scoping the
    // Pickup-orders tab uses, e.g. a staff member assigned only "Chittoor"
    // sees only orders whose sender address is in Chittoor. ADMIN is never
    // restricted. A STAFF member with no region assignments sees none,
    // same as the existing zone-assignment default elsewhere.
    if (req.user.role === 'STAFF') {
      const assignments = await prisma.staffRegionAssignment.findMany({
        where: { userId: req.user.id },
        select: { state: true, region: true },
      });
      scopeWhere.senderAddress = { OR: await resolveOriginFilters(assignments) };
    }

    const where = buildDashboardWhere(from, to, scopeWhere);
    const totals = await computeOrderTotals(where);

    const recentOrders = await prisma.order.findMany({
      where,
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { service: true, receiverAddress: { select: { city: true, countryCode: true } } },
    });

    res.json({ totals, recentOrders });
  } catch (err) {
    next(err);
  }
}

// Both breakdown tabs are ADMIN-only by default; a STAFF/ACCOUNTS member
// can only reach one if individually granted that specific tab key
// ('staff' or 'region') via allowedOverviewTabs (Users panel) — checked
// fresh from the DB rather than trusting the JWT payload, since the grant
// needs to take effect immediately, without waiting for the user to log
// out and back in.
async function requireOverviewTabAccess(req, res, tabKey) {
  if (req.user.role === 'ADMIN') return true;
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { allowedOverviewTabs: true } });
  if (user?.allowedOverviewTabs?.includes(tabKey)) return true;
  res.status(403).json({ error: 'You do not have access to this view.' });
  return false;
}

// Same rule as requireOverviewTabAccess but a plain boolean, no response
// side-effect — for the KPI bundle, where lacking this permission just
// means the Region tile is omitted, not the whole request rejected.
async function hasOverviewTabAccess(req, tabKey) {
  if (req.user.role === 'ADMIN') return true;
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { allowedOverviewTabs: true } });
  return Boolean(user?.allowedOverviewTabs?.includes(tabKey));
}

/**
 * GET /api/admin/dashboard/staff — one row per STAFF account, each scoped
 * to that staff member's own assigned pickup region(s) (same rule
 * dashboardStats applies when a STAFF views their own Overview). A staff
 * member with no region assignments shows all-zero, same as their own
 * Overview would.
 */
async function staffOverview(req, res, next) {
  try {
    if (!(await requireOverviewTabAccess(req, res, 'staff'))) return;
    const { from, to } = req.query;

    const staff = await prisma.user.findMany({
      where: { role: 'STAFF' },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: 'asc' },
    });

    const rows = await Promise.all(
      staff.map(async (s) => {
        const assignments = await prisma.staffRegionAssignment.findMany({
          where: { userId: s.id },
          select: { state: true, region: true },
        });
        const where = buildDashboardWhere(from, to, {
          senderAddress: { OR: assignments.length ? await resolveOriginFilters(assignments) : [] },
        });
        const totals = await computeOrderTotals(where);
        return { staff: s, regions: assignments, totals };
      })
    );

    res.json({ rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/dashboard/regions — one row per distinct state/region
 * pair currently assigned to at least one staff member (the operationally
 * relevant set, not every region in the postcode database — most of which
 * no staff covers).
 */
async function computeRegionBreakdown(from, to) {
  const assignments = await prisma.staffRegionAssignment.findMany({
    select: { state: true, region: true },
  });
  const seen = new Set();
  const distinctRegions = [];
  for (const a of assignments) {
    const key = `${a.state}|${a.region || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinctRegions.push({ state: a.state, region: a.region });
  }
  distinctRegions.sort((a, b) => a.state.localeCompare(b.state) || (a.region || '').localeCompare(b.region || ''));

  return Promise.all(
    distinctRegions.map(async (r) => {
      const [originFilter] = await resolveOriginFilters([r]);
      const where = buildDashboardWhere(from, to, { senderAddress: originFilter });
      const totals = await computeOrderTotals(where);
      return { region: r, totals };
    })
  );
}

async function regionOverview(req, res, next) {
  try {
    if (!(await requireOverviewTabAccess(req, res, 'region'))) return;
    const { from, to } = req.query;
    const rows = await computeRegionBreakdown(from, to);
    res.json({ rows });
  } catch (err) {
    next(err);
  }
}

// ---------------- Overview KPI widgets ----------------
// Day boundaries follow the same loose convention buildDashboardWhere
// already uses for the Overview date-range picker (a calendar-date string
// mapped onto UTC midnight, not a precisely-converted IST instant) — kept
// consistent rather than introducing a second, more exact scheme just for
// these three windows. The date *label* itself (which calendar day is
// "today") is resolved correctly via getIstDateParts, same as order
// numbering — only the exact midnight instant has the ~5.5h looseness.
function isoDateIst(date) {
  const { year, month, day } = getIstDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
function windowRange(fromIso, toIso) {
  return { gte: new Date(`${fromIso}T00:00:00.000Z`), lte: new Date(`${toIso}T23:59:59.999Z`) };
}
function activityWindows() {
  const todayIso = isoDateIst(new Date());
  return {
    today: windowRange(todayIso, todayIso),
    last7Days: windowRange(isoDateIst(daysAgo(6)), todayIso),
    currentMonth: windowRange(`${todayIso.slice(0, 7)}-01`, todayIso),
  };
}

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' });
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Trailing window for the "Orders by day of week" tile, selectable from
// the frontend dropdown — independent of the Overview page's own date
// range (mixing an admin-chosen historical range into "which weekday is
// busiest lately" would be confusing rather than useful, same reasoning
// as the Staff/Rider/Accounts fixed windows below).
const DAY_WISE_RANGE_DAYS = { week: 6, '4weeks': 27, '3months': 89 };
function dayWiseWindow(rangeKey) {
  const todayIso = isoDateIst(new Date());
  // Monday-start, same as the chart's own WEEKDAYS ordering — "currentWeek"
  // is this calendar week to date, not a rolling trailing-7-days window
  // (that's what "week" already means).
  if (rangeKey === 'currentWeek') {
    const daysSinceMonday = WEEKDAYS.indexOf(WEEKDAY_FORMATTER.format(new Date()));
    return windowRange(isoDateIst(daysAgo(daysSinceMonday)), todayIso);
  }
  const days = DAY_WISE_RANGE_DAYS[rangeKey] ?? DAY_WISE_RANGE_DAYS['4weeks'];
  return windowRange(isoDateIst(daysAgo(days)), todayIso);
}

async function dayOfWeekBreakdown(scopeWhere, rangeKey) {
  const where = { ...scopeWhere, status: { not: 'UNFINISHED' }, createdAt: dayWiseWindow(rangeKey) };
  const orders = await prisma.order.findMany({ where, select: { createdAt: true } });
  const counts = Object.fromEntries(WEEKDAYS.map((d) => [d, 0]));
  for (const o of orders) counts[WEEKDAY_FORMATTER.format(o.createdAt)]++;
  return WEEKDAYS.map((day) => ({ day, count: counts[day] }));
}

// Airports currently holding manifest-eligible weight (not yet bagged into
// a manifest, not unpaid/unconfirmed) — same eligibility rule
// manifest.controller.js's listEligibleOrders/listAvailableAirports use,
// just grouped with a weight sum instead of a plain count. Only airports
// with at least 1kg show up at all (an airport with a single stray
// document-weight order isn't operationally interesting here); 500kg+ is
// flagged as ready to manifest — an operational rule of thumb, not a hard
// system limit.
const MANIFEST_READY_KG = 500;
async function airportWeightBreakdown(req) {
  // Deliberately ignores the Overview page's from/to date range — this is a
  // live snapshot of everything currently sitting unmanifested, not a
  // booked-within-window figure (an order from last month that's still
  // unmanifested is exactly the kind of thing this KPI exists to surface).
  // Mirrors manifest.controller.js's listEligibleOrders/listAvailableAirports,
  // which are never date-scoped either.
  const where = await buildOrdersWhere({ ...req, query: { ...req.query, from: undefined, to: undefined, notStatus: PAYABLE_STATUSES.join(',') } });
  where.manifestId = null;
  where.airportCode = { not: null };

  const orders = await prisma.order.findMany({
    where,
    select: { airportCode: true, chargeableWeightKg: true, receiverAddress: { select: { countryCode: true } } },
  });

  const byAirport = new Map(); // airportCode -> { countryCode, totalWeightKg, orderCount }
  for (const o of orders) {
    const key = o.airportCode;
    const entry = byAirport.get(key) || { countryCode: o.receiverAddress.countryCode, totalWeightKg: 0, orderCount: 0 };
    entry.totalWeightKg += Number(o.chargeableWeightKg);
    entry.orderCount += 1;
    byAirport.set(key, entry);
  }

  const codes = [...byAirport.keys()];
  const regions = codes.length ? await prisma.manifestRegion.findMany({ where: { code: { in: codes } } }) : [];
  const nameByCode = new Map(regions.map((r) => [r.code, r.name]));

  return [...byAirport.entries()]
    .map(([airportCode, v]) => ({
      airportCode,
      name: nameByCode.get(airportCode) || airportCode,
      countryCode: v.countryCode,
      orderCount: v.orderCount,
      totalWeightKg: Math.round(v.totalWeightKg * 1000) / 1000,
      readyForManifest: v.totalWeightKg >= MANIFEST_READY_KG,
    }))
    .filter((a) => a.totalWeightKg >= 1)
    .sort((a, b) => b.totalWeightKg - a.totalWeightKg);
}

// One row per STAFF account — same region-scoped order ownership
// staffOverview uses, just counted across three fixed rolling windows
// instead of one admin-chosen date range.
async function staffActivityBreakdown() {
  const windows = activityWindows();
  const staff = await prisma.user.findMany({ where: { role: 'STAFF' }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: 'asc' } });

  return Promise.all(
    staff.map(async (s) => {
      const assignments = await prisma.staffRegionAssignment.findMany({ where: { userId: s.id }, select: { state: true, region: true } });
      const senderAddress = { OR: assignments.length ? await resolveOriginFilters(assignments) : [] };
      const [today, last7Days, currentMonth] = await Promise.all([
        prisma.order.count({ where: { status: { not: 'UNFINISHED' }, senderAddress, createdAt: windows.today } }),
        prisma.order.count({ where: { status: { not: 'UNFINISHED' }, senderAddress, createdAt: windows.last7Days } }),
        prisma.order.count({ where: { status: { not: 'UNFINISHED' }, senderAddress, createdAt: windows.currentMonth } }),
      ]);
      return { staff: s, today, last7Days, currentMonth };
    })
  );
}

// One row per DRIVER (rider) account — orders they personally picked up
// (Order.assignedDriverId + pickedUpAt), the one rider action the data
// model actually attributes to a specific person today. "Scanned" isn't
// tracked per-user anywhere yet (batch-scan status updates don't record
// who performed them) so it's deliberately left out rather than guessed at.
async function riderActivityBreakdown() {
  const windows = activityWindows();
  const riders = await prisma.user.findMany({ where: { role: 'DRIVER' }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: 'asc' } });

  return Promise.all(
    riders.map(async (r) => {
      const base = { assignedDriverId: r.id };
      const [today, last7Days, currentMonth] = await Promise.all([
        prisma.order.count({ where: { ...base, pickedUpAt: windows.today } }),
        prisma.order.count({ where: { ...base, pickedUpAt: windows.last7Days } }),
        prisma.order.count({ where: { ...base, pickedUpAt: windows.currentMonth } }),
      ]);
      return { rider: r, today, last7Days, currentMonth };
    })
  );
}

// One row per ACCOUNTS account. Neither a manual "marked paid" nor a
// manual balance top-up has its own actor column — both are attributed via
// the OrderComment auto-logged alongside the action (updateOrderStatus and
// markBalancePaymentManual, order.controller.js/payment.controller.js),
// which does record authorId. Matched on that comment's exact body text
// rather than introducing a new column, since the text is already a
// reliable, unique-enough marker for each action. Overdue party invoices
// are a team-wide total, not attributed to one accounts person — nothing
// in the data model ties an invoice to who's responsible for chasing it.
async function accountsActivityBreakdown() {
  const windows = activityWindows();
  const accountsUsers = await prisma.user.findMany({ where: { role: 'ACCOUNTS' }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: 'asc' } });

  const rows = await Promise.all(
    accountsUsers.map(async (u) => {
      const paidMarkedWhere = (createdAt) => ({ authorId: u.id, body: 'Order status updated to Paid.', createdAt });
      const topUpWhere = (createdAt) => ({ authorId: u.id, body: { startsWith: 'Additional payment of' }, createdAt });
      const [paidToday, paid7, paidMonth, topUpToday, topUp7, topUpMonth] = await Promise.all([
        prisma.orderComment.count({ where: paidMarkedWhere(windows.today) }),
        prisma.orderComment.count({ where: paidMarkedWhere(windows.last7Days) }),
        prisma.orderComment.count({ where: paidMarkedWhere(windows.currentMonth) }),
        prisma.orderComment.count({ where: topUpWhere(windows.today) }),
        prisma.orderComment.count({ where: topUpWhere(windows.last7Days) }),
        prisma.orderComment.count({ where: topUpWhere(windows.currentMonth) }),
      ]);
      return {
        accountsUser: u,
        today: paidToday + topUpToday,
        last7Days: paid7 + topUp7,
        currentMonth: paidMonth + topUpMonth,
      };
    })
  );

  const overdueWhere = { status: 'UNPAID', dueDate: { lt: new Date() } };
  const [overduePayable, overdueReceivable] = await Promise.all([
    prisma.partyInvoice.count({ where: { ...overdueWhere, direction: 'PAYABLE' } }),
    prisma.partyInvoice.count({ where: { ...overdueWhere, direction: 'RECEIVABLE' } }),
  ]);

  return { rows, overdueInvoices: { payable: overduePayable, receivable: overdueReceivable } };
}

/**
 * GET /api/admin/dashboard/kpis?dayWiseRange=week|4weeks|3months — the six
 * KPI tiles below the Overview summary's stat cards. dayOfWeek uses its own
 * selectable trailing window (dayWiseRange, independent of the page's
 * from/to range — see dayWiseWindow); airports is always a live snapshot
 * (manifest-readiness is a "right now" question, not historical);
 * staff/riders/accounts use their own fixed today/7-day/month windows
 * regardless of the page's date range, per explicit request. regions is
 * only included for viewers with Overview-breakdown access (same gate as
 * the dedicated Region overview tab) — omitted entirely otherwise, same as
 * that tab being hidden from them.
 */
async function dashboardKpis(req, res, next) {
  try {
    const { from, to, dayWiseRange } = req.query;
    const scopeWhere = {};
    if (req.user.role === 'STAFF') {
      const assignments = await prisma.staffRegionAssignment.findMany({ where: { userId: req.user.id }, select: { state: true, region: true } });
      scopeWhere.senderAddress = { OR: await resolveOriginFilters(assignments) };
    }

    const [dayOfWeek, airports, staffActivity, riderActivity, accountsActivity, canSeeRegions] = await Promise.all([
      dayOfWeekBreakdown(scopeWhere, dayWiseRange),
      airportWeightBreakdown(req),
      staffActivityBreakdown(),
      riderActivityBreakdown(),
      accountsActivityBreakdown(),
      hasOverviewTabAccess(req, 'region'),
    ]);
    const regions = canSeeRegions ? await computeRegionBreakdown(from, to) : null;

    res.json({ dayOfWeek, airports, staffActivity, riderActivity, accountsActivity, regions });
  } catch (err) {
    next(err);
  }
}

// ---------------- Accounts → Overview (P&L) ----------------
// Today/Yesterday/This week/Current month are calendar-anchored (IST) —
// "this week" is Monday-to-date, "current month" is the 1st-to-date, same
// conventions dayWiseWindow/activityWindows already use elsewhere in this
// file. The three longer options stay trailing windows (ending today) since
// there's no single obvious calendar anchor for "3 months" the way there is
// for a week or month. Every range's "previous" comparison window is a
// like-for-like window of the same shape immediately before it (yesterday
// for today, last calendar week for this week, last calendar month for
// current month, the same number of trailing days for the rest) — never
// skewed by different window lengths.
const ACCOUNTS_RANGE_KEYS = ['today', 'yesterday', 'thisWeek', 'currentMonth', 'threeMonths', 'sixMonths', 'year'];
const ACCOUNTS_TRAILING_DAYS = { threeMonths: 90, sixMonths: 182, year: 365 };
const ACCOUNTS_GRANULARITY = {
  today: 'hour',
  yesterday: 'hour',
  thisWeek: 'day',
  currentMonth: 'day',
  threeMonths: 'isoweek',
  sixMonths: 'month',
  year: 'month',
};

// First/last calendar day (IST, loose-UTC-midnight convention) of the
// month immediately before whichever month `todayIso` falls in.
function prevMonthRangeIso(todayIso) {
  const firstOfThisMonth = new Date(`${todayIso.slice(0, 7)}-01T00:00:00.000Z`);
  const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 86400000);
  const lastOfPrevMonthIso = lastOfPrevMonth.toISOString().slice(0, 10);
  const firstOfPrevMonthIso = `${lastOfPrevMonthIso.slice(0, 7)}-01`;
  return { firstOfPrevMonthIso, lastOfPrevMonthIso };
}

// Exact IST-midnight-to-IST-midnight boundaries — unlike windowRange's loose
// UTC-midnight approximation (fine for the wide trailing windows below,
// where the ~5.5h IST/UTC gap is negligible), Today/Yesterday/This
// week/Current month are narrow enough that the gap would actually hide or
// misplace same-day orders: e.g. right now (03:24 IST) is still 29 Oct in
// UTC, so windowRange('2026-10-30','2026-10-30') wouldn't even have started
// yet and every order placed since IST midnight would be invisible to it.
function istDayBoundsUtc(fromIso, toIso) {
  const gte = new Date(`${fromIso}T00:00:00.000+05:30`);
  const lte = new Date(new Date(`${toIso}T00:00:00.000+05:30`).getTime() + 86400000 - 1);
  return { gte, lte };
}

function accountsWindowFor(rangeKey) {
  const todayIso = isoDateIst(new Date());
  const granularity = ACCOUNTS_GRANULARITY[rangeKey];

  if (rangeKey === 'today') {
    const yestIso = isoDateIst(daysAgo(1));
    return { fromIso: todayIso, toIso: todayIso, window: istDayBoundsUtc(todayIso, todayIso), prevWindow: istDayBoundsUtc(yestIso, yestIso), granularity };
  }
  if (rangeKey === 'yesterday') {
    const yestIso = isoDateIst(daysAgo(1));
    const dayBeforeIso = isoDateIst(daysAgo(2));
    return { fromIso: yestIso, toIso: yestIso, window: istDayBoundsUtc(yestIso, yestIso), prevWindow: istDayBoundsUtc(dayBeforeIso, dayBeforeIso), granularity };
  }
  if (rangeKey === 'thisWeek') {
    // Monday-start, same as dayWiseWindow's 'currentWeek' and the
    // dayOfWeek chart's own WEEKDAYS ordering.
    const daysSinceMonday = WEEKDAYS.indexOf(WEEKDAY_FORMATTER.format(new Date()));
    const mondayIso = isoDateIst(daysAgo(daysSinceMonday));
    const prevMondayIso = isoDateIst(daysAgo(daysSinceMonday + 7));
    const prevSundayIso = isoDateIst(daysAgo(daysSinceMonday + 1));
    return { fromIso: mondayIso, toIso: todayIso, window: istDayBoundsUtc(mondayIso, todayIso), prevWindow: istDayBoundsUtc(prevMondayIso, prevSundayIso), granularity };
  }
  if (rangeKey === 'currentMonth') {
    const firstOfMonthIso = `${todayIso.slice(0, 7)}-01`;
    const { firstOfPrevMonthIso, lastOfPrevMonthIso } = prevMonthRangeIso(todayIso);
    return { fromIso: firstOfMonthIso, toIso: todayIso, window: istDayBoundsUtc(firstOfMonthIso, todayIso), prevWindow: istDayBoundsUtc(firstOfPrevMonthIso, lastOfPrevMonthIso), granularity };
  }

  // threeMonths / sixMonths / year — trailing windows, wide enough that the
  // loose UTC-midnight convention's ~5.5h fuzziness is negligible, so these
  // stay on windowRange for consistency with the rest of this file.
  const days = ACCOUNTS_TRAILING_DAYS[rangeKey];
  const fromIso = isoDateIst(daysAgo(days - 1));
  const prevFromIso = isoDateIst(daysAgo(days * 2 - 1));
  const prevToIso = isoDateIst(daysAgo(days));
  return { fromIso, toIso: todayIso, window: windowRange(fromIso, todayIso), prevWindow: windowRange(prevFromIso, prevToIso), granularity };
}
const IST_HOUR_FORMATTER = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
const IST_DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
const IST_MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', month: 'short' });

// Buckets a single order's createdAt into the chart series for the chosen
// granularity. `key` sorts/groups; `label` is what the chart axis shows.
function accountsBucketFor(date, granularity) {
  if (granularity === 'hour') {
    const h = Number(IST_HOUR_FORMATTER.format(date));
    const label = `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
    return { key: String(h).padStart(2, '0'), label };
  }
  if (granularity === 'isoweek') {
    const iso = isoDateIst(date);
    const monday = new Date(`${iso}T00:00:00.000Z`);
    const dow = monday.getUTCDay() || 7; // Mon=1..Sun=7
    monday.setUTCDate(monday.getUTCDate() - (dow - 1));
    const weekKey = monday.toISOString().slice(0, 10);
    return { key: weekKey, label: IST_DAY_LABEL_FORMATTER.format(monday) };
  }
  if (granularity === 'month') {
    const { year, month } = getIstDateParts(date);
    return { key: `${year}-${String(month).padStart(2, '0')}`, label: IST_MONTH_LABEL_FORMATTER.format(date) };
  }
  // day
  const iso = isoDateIst(date);
  return { key: iso, label: IST_DAY_LABEL_FORMATTER.format(date) };
}

// Revenue is read straight off Order (grandTotal/discountTotal/taxTotal are
// a pricing-time snapshot — never recomputed off live rate cards, same rule
// the rest of the schema follows). Gross = pre-discount, pre-tax
// (baseFreight+surcharges+addons); Net = post-discount, pre-tax — tax is
// money collected on the government's behalf, never the business's own
// revenue. Cost currently only exists as the lump PartyInvoice(PAYABLE)
// ledger — not linked to individual orders or categorized yet, so
// Operating Cost/Profit/Margin below are real totals but not yet
// splittable by shipment or cost category (see the Phase 2 note surfaced
// to the frontend via costBreakdownAvailable: false).
function splitOrderRevenue(o) {
  const net = Number(o.grandTotal) - Number(o.taxTotal);
  const gross = net + Number(o.discountTotal);
  return { gross, net, discount: Number(o.discountTotal) };
}

// B2B is unambiguous (booked through the merchant API — see merchantId's
// comment on the Order model). Among the remaining consumer-checkout
// orders there's no explicit "is this a business" flag, so this uses the
// best available signal: whether the booking user filled in User.company —
// a business shipping through the retail flow (no merchant API access
// yet) counts as B2C, an order with no company on file (or no account at
// all, e.g. a guest booking) counts as C2C.
function classifyChannel(o) {
  if (o.merchantId) return 'b2b';
  if (o.user?.company?.trim()) return 'b2c';
  return 'c2c';
}

// ---------------- Accounts Overview → branch filter ----------------
// Starting point for a 3-hub rollout (HYD/Vijayawada/Vizag) — the user
// confirmed HYD covers the whole of Telangana for now, Vijayawada and
// Vizag are scoped to their own district (Krishna/Visakhapatnam) within
// Andhra Pradesh, and every other AP district is unmapped until the
// regions get split up further later. An order from an unmapped
// district only ever shows under "Total", never under a specific branch.
const BRANCH_KEYS = ['HYD', 'VIJAYAWADA', 'VIZAG'];
// Direct hub tag (salary, or any other manifest-less PAYABLE) — relies on
// the Hub being named exactly this, case-sensitively, when it's created
// on the Hubs admin page. If hub naming drifts from this, that entry's
// branch cost will silently show ₹0 rather than erroring.
const BRANCH_HUB_NAMES = { HYD: 'HYD', VIJAYAWADA: 'Vijayawada', VIZAG: 'Vizag' };

// Fetched once per request (not per branch) — both the revenue sender
// filter and the per-order cost-allocation split below read off the same
// two postcode sets.
async function loadBranchPostcodeSets() {
  const [krishnaRows, vizagRows] = await Promise.all([
    prisma.postcodeSuggestion.findMany({ where: { countryCode: 'IN', region: 'Krishna' }, select: { postcode: true } }),
    prisma.postcodeSuggestion.findMany({ where: { countryCode: 'IN', region: 'Visakhapatnam' }, select: { postcode: true } }),
  ]);
  return { krishna: new Set(krishnaRows.map((r) => r.postcode)), vizag: new Set(vizagRows.map((r) => r.postcode)) };
}

// Address.state stores the expanded full state name ("Telangana", "Andhra
// Pradesh"), never the 2-letter code — see frontend's normalizeRegionValue
// (utils/regionNames.js), which every address-entry path (postcode-suggestion
// pick, quote-origin prefill) runs through before it ever reaches form state
// or the order-creation payload. Comparing against 'TG'/'AP' here looked
// right (that's what PostcodeSuggestion.state itself holds) but silently
// matched zero real orders.
function branchSenderWhere(branchKey, sets) {
  if (branchKey === 'HYD') return { state: 'Telangana' };
  if (branchKey === 'VIJAYAWADA') return { state: 'Andhra Pradesh', postcode: { in: [...sets.krishna] } };
  if (branchKey === 'VIZAG') return { state: 'Andhra Pradesh', postcode: { in: [...sets.vizag] } };
  return null;
}

// The branch an individual order's sender resolves to — same three rules
// as branchSenderWhere, just evaluated against one address instead of
// turned into a Prisma filter. This is what the per-order cost split
// below uses — operating costs aren't tagged with a branch directly
// (except manifest-less entries like salary, via PartyInvoice.hubId);
// a manifest-linked cost's branch is computed live from whichever orders
// are actually in that manifest.
function branchOfAddress(addr, sets) {
  if (!addr) return null;
  if (addr.state === 'Telangana') return 'HYD';
  if (addr.state === 'Andhra Pradesh' && sets.krishna.has(addr.postcode)) return 'VIJAYAWADA';
  if (addr.state === 'Andhra Pradesh' && sets.vizag.has(addr.postcode)) return 'VIZAG';
  return null;
}

/**
 * Branch-scoped operating cost for one window. A manifest-linked
 * PartyInvoice splits its amount across branches by each of the
 * manifest's orders' weight share (an order with no resolvable branch
 * contributes its weight to neither — that slice of the cost simply
 * isn't attributed to this branch, same as it isn't attributed to any
 * other). A manifest-less PartyInvoice (salary; any other manual entry)
 * counts in full if its own hubId's Hub name matches this branch,
 * otherwise not at all. `onRow`, if given, is called with each row's
 * branch-attributed share for bucketing into the trend chart — only
 * meaningful for the current window, not the previous one.
 */
async function computeBranchCosts(branchKey, sets, window, onRow) {
  const rows = await prisma.partyInvoice.findMany({
    where: { direction: 'PAYABLE', createdAt: window },
    select: { createdAt: true, totalAmount: true, category: true, manifestId: true, hubId: true, hub: { select: { name: true } } },
  });
  const manifestIds = [...new Set(rows.map((r) => r.manifestId).filter(Boolean))];
  const manifests = manifestIds.length
    ? await prisma.manifest.findMany({
        where: { id: { in: manifestIds } },
        select: { id: true, totalWeightKg: true, orders: { select: { chargeableWeightKg: true, senderAddress: { select: { state: true, postcode: true } } } } },
      })
    : [];
  const manifestById = new Map(manifests.map((m) => [m.id, m]));

  let total = 0;
  const byCategory = new Map();
  for (const row of rows) {
    const amount = Number(row.totalAmount);
    let share = 0;
    if (row.manifestId) {
      const m = manifestById.get(row.manifestId);
      const totalWeight = m ? Number(m.totalWeightKg) : 0;
      if (m && totalWeight > 0) {
        const branchWeight = m.orders.reduce((sum, o) => (branchOfAddress(o.senderAddress, sets) === branchKey ? sum + Number(o.chargeableWeightKg) : sum), 0);
        share = amount * (branchWeight / totalWeight);
      }
    } else if (row.hubId && row.hub?.name === BRANCH_HUB_NAMES[branchKey]) {
      share = amount;
    }
    if (share <= 0) continue;
    total += share;
    const catKey = row.category || 'UNCATEGORIZED';
    byCategory.set(catKey, (byCategory.get(catKey) || 0) + share);
    if (onRow) onRow(row, share);
  }
  return { total, byCategory };
}

/**
 * GET /api/admin/accounts/overview?range=today|yesterday|thisWeek|currentMonth|threeMonths|sixMonths|year&branch=HYD|VIJAYAWADA|VIZAG
 * Powers the Accounts page's Overview tab — gross/net revenue, operating
 * cost, and profit for the selected window, bucketed for the trend chart,
 * plus a revenue-by-channel split and a point-in-time AR/AP snapshot.
 * `branch` omitted (or unrecognized) means Total — no filtering.
 */
async function accountsOverview(req, res, next) {
  try {
    const rangeKey = ACCOUNTS_RANGE_KEYS.includes(req.query.range) ? req.query.range : 'currentMonth';
    const { fromIso, toIso, window, prevWindow, granularity } = accountsWindowFor(rangeKey);

    // Same "did money actually move" exclusion the Overview summary card
    // uses — DRAFT/UNFINISHED/PENDING_PAYMENT/PICKUP_CONFIRMED/CANCELLED
    // never count as revenue, regardless of how far along the shipment is.
    const revenueWhere = { status: { notIn: UNPAID_STATUSES } };

    const branchKey = BRANCH_KEYS.includes(req.query.branch) ? req.query.branch : null;
    const branchSets = branchKey ? await loadBranchPostcodeSets() : null;
    if (branchKey) revenueWhere.senderAddress = branchSenderWhere(branchKey, branchSets);

    const [orders, prevOrders, receivablePartyAgg, receivableOverdueCount, payableAgg, payableOverdueCount, merchantUnpaidAgg] = await Promise.all([
      prisma.order.findMany({
        where: { ...revenueWhere, createdAt: window },
        select: { createdAt: true, grandTotal: true, discountTotal: true, taxTotal: true, merchantId: true, user: { select: { company: true } } },
      }),
      prisma.order.findMany({
        where: { ...revenueWhere, createdAt: prevWindow },
        select: { grandTotal: true, discountTotal: true, taxTotal: true },
      }),
      prisma.partyInvoice.aggregate({ where: { direction: 'RECEIVABLE', status: 'UNPAID' }, _sum: { totalAmount: true } }),
      prisma.partyInvoice.count({ where: { direction: 'RECEIVABLE', status: 'UNPAID', dueDate: { lt: new Date() } } }),
      prisma.partyInvoice.aggregate({ where: { direction: 'PAYABLE', status: 'UNPAID' }, _sum: { totalAmount: true } }),
      prisma.partyInvoice.count({ where: { direction: 'PAYABLE', status: 'UNPAID', dueDate: { lt: new Date() } } }),
      prisma.merchantInvoice.aggregate({ where: { status: 'UNPAID' }, _sum: { totalAmount: true } }),
    ]);

    const buckets = new Map();
    const getBucket = (key, label) => {
      if (!buckets.has(key)) buckets.set(key, { key, label, gross: 0, discount: 0, net: 0, cost: 0 });
      return buckets.get(key);
    };

    const totals = { gross: 0, discount: 0, net: 0, b2cGross: 0, b2bGross: 0, c2cGross: 0 };
    for (const o of orders) {
      const { gross, net, discount } = splitOrderRevenue(o);
      totals.gross += gross;
      totals.discount += discount;
      totals.net += net;
      totals[`${classifyChannel(o)}Gross`] += gross;

      const { key, label } = accountsBucketFor(o.createdAt, granularity);
      const b = getBucket(key, label);
      b.gross += gross; b.discount += discount; b.net += net;
    }

    // ---- costs ----
    // Total (no branch) stays the simple "every PAYABLE row counts in
    // full" path — no per-order splitting needed since nothing is being
    // sliced by branch. A specific branch goes through computeBranchCosts
    // instead (see its own comment for why).
    let costTotal = 0;
    let prevCostTotal = 0;
    let prevHubCost = 0;
    const costByCategory = new Map(); // category (or 'UNCATEGORIZED') -> ₹
    if (branchKey) {
      const curr = await computeBranchCosts(branchKey, branchSets, window, (row, share) => {
        const { key, label } = accountsBucketFor(row.createdAt, granularity);
        getBucket(key, label).cost += share;
      });
      costTotal = curr.total;
      for (const [k, v] of curr.byCategory) costByCategory.set(k, v);
      const prev = await computeBranchCosts(branchKey, branchSets, prevWindow, null);
      prevCostTotal = prev.total;
      prevHubCost = prev.byCategory.get('HUB') || 0;
    } else {
      const costRows = await prisma.partyInvoice.findMany({
        where: { direction: 'PAYABLE', createdAt: window },
        select: { createdAt: true, totalAmount: true, category: true },
      });
      for (const row of costRows) {
        const amount = Number(row.totalAmount);
        costTotal += amount;
        const { key, label } = accountsBucketFor(row.createdAt, granularity);
        getBucket(key, label).cost += amount;
        const catKey = row.category || 'UNCATEGORIZED';
        costByCategory.set(catKey, (costByCategory.get(catKey) || 0) + amount);
      }
      const [prevCostAgg, prevHubCostAgg] = await Promise.all([
        prisma.partyInvoice.aggregate({ where: { direction: 'PAYABLE', createdAt: prevWindow }, _sum: { totalAmount: true } }),
        prisma.partyInvoice.aggregate({ where: { direction: 'PAYABLE', category: 'HUB', createdAt: prevWindow }, _sum: { totalAmount: true } }),
      ]);
      prevCostTotal = Number(prevCostAgg._sum.totalAmount || 0);
      prevHubCost = Number(prevHubCostAgg._sum.totalAmount || 0);
    }

    const series = [...buckets.values()]
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((b) => ({ label: b.label, gross: round2(b.gross), discount: round2(b.discount), net: round2(b.net), cost: round2(b.cost), profit: round2(b.net - b.cost) }));

    const prevTotals = prevOrders.reduce((acc, o) => {
      const { gross, net } = splitOrderRevenue(o);
      acc.gross += gross; acc.net += net;
      return acc;
    }, { gross: 0, net: 0 });

    const hubCost = costByCategory.get('HUB') || 0;
    const profit = totals.net - costTotal;
    const prevProfit = prevTotals.net - prevCostTotal;
    const margin = totals.net > 0 ? profit / totals.net : 0;
    const prevMargin = prevTotals.net > 0 ? prevProfit / prevTotals.net : 0;

    const pctDelta = (curr, prev) => {
      if (prev === 0) return curr === 0 ? 0 : 100;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

    res.json({
      range: rangeKey,
      window: { from: fromIso, to: toIso },
      series,
      branch: branchKey || 'TOTAL',
      totals: {
        gross: round2(totals.gross),
        discount: round2(totals.discount),
        hub: round2(hubCost),
        net: round2(totals.net),
        cost: round2(costTotal),
        profit: round2(profit),
        margin: Number(margin.toFixed(4)),
      },
      deltas: {
        gross: pctDelta(totals.gross, prevTotals.gross),
        net: pctDelta(totals.net, prevTotals.net),
        hub: pctDelta(hubCost, prevHubCost),
        cost: pctDelta(costTotal, prevCostTotal),
        profit: pctDelta(profit, prevProfit),
        marginPp: (margin - prevMargin) * 100,
      },
      channel: {
        b2c: round2(totals.b2cGross),
        b2b: round2(totals.b2bGross),
        c2c: round2(totals.c2cGross),
      },
      outstanding: {
        receivable: {
          total: round2(Number(receivablePartyAgg._sum.totalAmount || 0) + Number(merchantUnpaidAgg._sum.totalAmount || 0)),
          partyInvoices: round2(Number(receivablePartyAgg._sum.totalAmount || 0)),
          merchantInvoices: round2(Number(merchantUnpaidAgg._sum.totalAmount || 0)),
          overdueCount: receivableOverdueCount,
        },
        payable: {
          total: round2(Number(payableAgg._sum.totalAmount || 0)),
          overdueCount: payableOverdueCount,
        },
      },
      // Live now that PartyInvoice carries a category (manifest cost
      // sheet + Payable tab's dropdown/salary form all tag it) — rows
      // predating that still have category: null and land in
      // "Uncategorized" rather than vanishing from the total.
      costBreakdownAvailable: true,
      costByCategory: [...costByCategory.entries()]
        .map(([key, amount]) => ({ category: key, label: key === 'UNCATEGORIZED' ? 'Uncategorized' : PARTY_INVOICE_CATEGORY_LABELS[key], amount: round2(amount) }))
        .sort((a, b) => b.amount - a.amount),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/pickup-origins — distinct origin (pickup) states and, per
 * state, the distinct regions assigned to postcodes within it. Powers the
 * Pickup-orders panel's origin State/Region filter chips. Both state and
 * region live on PostcodeSuggestion, so this is a single query.
 */
async function listPickupOrigins(req, res, next) {
  try {
    const countryCode = req.query.countryCode || 'IN';

    const rows = await prisma.postcodeSuggestion.findMany({
      where: { countryCode },
      select: { state: true, region: true },
    });

    let states = [...new Set(rows.map((r) => r.state).filter(Boolean))].sort();

    const regionSetByState = {};
    for (const { state, region } of rows) {
      if (!state || !region) continue;
      (regionSetByState[state] ||= new Set()).add(region);
    }
    let regionsByState = Object.fromEntries(
      Object.entries(regionSetByState).map(([state, set]) => [state, [...set].sort()])
    );

    // STAFF only ever see/filter by the states/regions they've been
    // individually assigned for Pickup orders (mirrors the STAFF branch of
    // listZones for destination zones) — ADMIN always gets the full
    // universe, both to browse freely and because the Users panel needs it
    // to assign staff in the first place.
    if (req.user.role === 'STAFF') {
      const assignments = await prisma.staffRegionAssignment.findMany({
        where: { userId: req.user.id },
        select: { state: true, region: true },
      });
      const wholeStates = new Set(assignments.filter((a) => !a.region).map((a) => a.state));
      const allowedRegionsByState = {};
      for (const a of assignments) {
        if (a.region) (allowedRegionsByState[a.state] ||= new Set()).add(a.region);
      }
      states = states.filter((s) => wholeStates.has(s) || allowedRegionsByState[s]);
      regionsByState = Object.fromEntries(
        states.map((s) => [
          s,
          // Whole-state access -> every region under it is fair game to
          // filter by; a region-scoped staffer only sees their own regions.
          wholeStates.has(s) ? regionsByState[s] || [] : [...(allowedRegionsByState[s] || [])].sort(),
        ])
      );
    }

    res.json({ states, regionsByState });
  } catch (err) {
    next(err);
  }
}

// ---------------- Zones & Countries ----------------
// kind=destination (default) — customer-facing shipping zones (Zone A/B/C…),
// matched via CountryZone and used as RateCard.zoneId. Staff only see their
// assigned subset. kind=origin — domestic India pickup-postcode zones (e.g.
// "India-urban"), used as RateCard.fromZoneId; not staff-restricted since
// they're unrelated to the destination-zone assignment feature.
async function listZones(req, res, next) {
  try {
    const kind = req.query.kind === 'origin' ? 'origin' : 'destination';
    let where = { kind };
    if (kind === 'destination' && req.user.role === 'STAFF') {
      const assignments = await prisma.staffZoneAssignment.findMany({ where: { userId: req.user.id }, select: { zoneId: true } });
      where = { ...where, id: { in: assignments.map((a) => a.zoneId) } };
    }
    // Rate-card entry only wants zones the current Total Zones - Zones file
    // actually assigns postcodes to — otherwise the "To zone" picker fills
    // up with stale zones left behind by an earlier source-file naming
    // scheme (see scripts/import-destination-zones.js) that no customer
    // postcode can ever resolve to anymore.
    if (req.query.onlyMapped === '1') {
      where = { ...where, postcodeZones: { some: {} } };
    }
    const zones = await prisma.zone.findMany({ where, include: { countries: true } });
    res.json({ zones });
  } catch (err) {
    next(err);
  }
}

async function createZone(req, res, next) {
  try {
    const { code, name } = req.body;
    const zone = await prisma.zone.create({ data: { code, name } });
    res.status(201).json({ zone });
  } catch (err) {
    next(err);
  }
}

// ---------------- Staff zone assignments ----------------
/** GET /api/admin/staff-zones — ADMIN only: every STAFF user with their currently assigned zones */
async function listStaffZoneAssignments(req, res, next) {
  try {
    const staff = await prisma.user.findMany({
      where: { role: 'STAFF' },
      select: {
        id: true,
        fullName: true,
        email: true,
        zoneAssignments: { select: { zone: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      staff: staff.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        email: s.email,
        zones: s.zoneAssignments.map((a) => a.zone),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/staff-zones/:userId — ADMIN only: replace a staff member's zone assignments wholesale */
async function setStaffZoneAssignments(req, res, next) {
  try {
    const { zoneIds } = req.body;
    if (!Array.isArray(zoneIds)) return res.status(400).json({ error: 'zoneIds must be an array' });

    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user || user.role !== 'STAFF') return res.status(404).json({ error: 'Staff account not found' });

    await prisma.$transaction([
      prisma.staffZoneAssignment.deleteMany({ where: { userId: req.params.userId } }),
      ...(zoneIds.length
        ? [prisma.staffZoneAssignment.createMany({ data: zoneIds.map((zoneId) => ({ userId: req.params.userId, zoneId })) })]
        : []),
    ]);

    const zones = await prisma.staffZoneAssignment.findMany({
      where: { userId: req.params.userId },
      select: { zone: { select: { id: true, code: true, name: true } } },
    });
    res.json({ zones: zones.map((a) => a.zone) });
  } catch (err) {
    next(err);
  }
}

// ---------------- Staff region assignments (Pickup orders scoping) ----------------
/** GET /api/admin/staff-regions — ADMIN only: every STAFF user with their currently assigned origin states/regions */
async function listStaffRegionAssignments(req, res, next) {
  try {
    const staff = await prisma.user.findMany({
      where: { role: 'STAFF' },
      select: {
        id: true,
        fullName: true,
        email: true,
        regionAssignments: { select: { id: true, state: true, region: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      staff: staff.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        email: s.email,
        regions: s.regionAssignments,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/admin/staff-regions/:userId — ADMIN only: replace a staff
 * member's origin state/region assignments wholesale (scopes what they see
 * on the Pickup orders tab). Body: { assignments: [{ state, region? }] } —
 * a row with no `region` grants the whole state.
 */
async function setStaffRegionAssignments(req, res, next) {
  try {
    const { assignments } = req.body;
    if (!Array.isArray(assignments)) return res.status(400).json({ error: 'assignments must be an array' });
    for (const a of assignments) {
      if (!a || !a.state) return res.status(400).json({ error: 'Each assignment needs a state' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user || user.role !== 'STAFF') return res.status(404).json({ error: 'Staff account not found' });

    await prisma.$transaction([
      prisma.staffRegionAssignment.deleteMany({ where: { userId: req.params.userId } }),
      ...(assignments.length
        ? [
            prisma.staffRegionAssignment.createMany({
              data: assignments.map((a) => ({ userId: req.params.userId, state: a.state, region: a.region || null })),
            }),
          ]
        : []),
    ]);

    const regions = await prisma.staffRegionAssignment.findMany({
      where: { userId: req.params.userId },
      select: { id: true, state: true, region: true },
    });
    res.json({ regions });
  } catch (err) {
    next(err);
  }
}

async function upsertCountryMapping(req, res, next) {
  try {
    const { countryCode, countryName, zoneId } = req.body;
    const mapping = await prisma.countryZone.upsert({
      where: { countryCode: countryCode.toUpperCase() },
      update: { countryName, zoneId },
      create: { countryCode: countryCode.toUpperCase(), countryName, zoneId },
    });
    res.json({ mapping });
  } catch (err) {
    next(err);
  }
}

// ---------------- Services ----------------
async function listServicesAdmin(req, res, next) {
  try {
    const services = await prisma.service.findMany({ orderBy: { name: 'asc' } });
    res.json({ services });
  } catch (err) {
    next(err);
  }
}

async function upsertService(req, res, next) {
  try {
    const { id, code, name, description, transitDaysMin, transitDaysMax, volumetricDivisor, isActive } = req.body;
    const data = { code, name, description, transitDaysMin, transitDaysMax, volumetricDivisor, isActive };
    const service = id
      ? await prisma.service.update({ where: { id }, data })
      : await prisma.service.create({ data });
    res.status(id ? 200 : 201).json({ service });
  } catch (err) {
    next(err);
  }
}

// ---------------- Rate cards ----------------
async function listRateCards(req, res, next) {
  try {
    const { serviceId, zoneId } = req.query;
    const where = {};
    if (serviceId) where.serviceId = serviceId;
    if (zoneId) where.zoneId = zoneId;
    const rateCards = await prisma.rateCard.findMany({
      where,
      include: { service: true, zone: true, fromZone: true },
      orderBy: [{ serviceId: 'asc' }, { zoneId: 'asc' }, { weightFromKg: 'asc' }],
    });
    res.json({ rateCards });
  } catch (err) {
    next(err);
  }
}

async function upsertRateCard(req, res, next) {
  try {
    const {
      id,
      serviceId,
      zoneId,
      fromZoneId,
      weightFromKg,
      weightToKg,
      basePrice,
      perKgOverage,
      currency,
      isActive,
      transitDaysMin,
      transitDaysMax,
    } = req.body;
    // Base price is optional — a bracket can be priced purely per-kg
    // (perKgOverage * weight) with no flat component. Delivery timeframe is
    // also optional — an unset bracket falls back to the Service's own
    // transitDaysMin/Max (see pricingEngine.js).
    const data = {
      serviceId,
      zoneId,
      fromZoneId: fromZoneId || null,
      weightFromKg,
      weightToKg,
      basePrice: basePrice === '' || basePrice === undefined || basePrice === null ? 0 : basePrice,
      perKgOverage,
      currency,
      isActive,
      transitDaysMin: transitDaysMin === '' || transitDaysMin === undefined ? null : Number(transitDaysMin),
      transitDaysMax: transitDaysMax === '' || transitDaysMax === undefined ? null : Number(transitDaysMax),
    };
    const rateCard = id
      ? await prisma.rateCard.update({ where: { id }, data })
      : await prisma.rateCard.create({ data });
    res.status(id ? 200 : 201).json({ rateCard });
  } catch (err) {
    next(err);
  }
}

async function deleteRateCard(req, res, next) {
  try {
    await prisma.rateCard.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// ---------------- Surcharges ----------------
async function listSurcharges(req, res, next) {
  try {
    const surcharges = await prisma.surcharge.findMany();
    res.json({ surcharges });
  } catch (err) {
    next(err);
  }
}

async function upsertSurcharge(req, res, next) {
  try {
    const { id, code, name, type, value, appliesToServiceId, isActive } = req.body;
    const data = { code, name, type, value, appliesToServiceId, isActive };
    const surcharge = id
      ? await prisma.surcharge.update({ where: { id }, data })
      : await prisma.surcharge.create({ data });
    res.status(id ? 200 : 201).json({ surcharge });
  } catch (err) {
    next(err);
  }
}

// ---------------- Add-on fees ----------------
/** GET /api/admin/addon-pricing — the 3 flat add-on fees, for the Overview page's editable "Service fees" card. */
async function listAddonPricing(req, res, next) {
  try {
    const addons = await prisma.addonPricing.findMany({ orderBy: { code: 'asc' } });
    res.json({ addons });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/addon-pricing — ADMIN only. Only `unitPrice` is
 * editable here (label/perBox are structural, not a "fee") — never
 * retroactive, since each OrderAddon snapshots its own unitPrice/label at
 * selection time (see updateAddons, order.controller.js).
 */
async function updateAddonPricing(req, res, next) {
  try {
    const { code, unitPrice } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });
    const price = Number(unitPrice);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'unitPrice must be a non-negative number' });
    const addon = await prisma.addonPricing.update({ where: { code }, data: { unitPrice: price } });
    res.json({ addon });
  } catch (err) {
    next(err);
  }
}

// ---------------- Users ----------------
async function listUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, fullName: true, phone: true, role: true, isActive: true, driverRegion: true, allowedPages: true, allowedOrderTabs: true, allowedAccountsTabs: true, allowedOverviewTabs: true, allowedPrintLabelTabs: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/drivers — ADMIN & STAFF: active driver accounts, for the pickup job assignment dropdown */
async function listDrivers(req, res, next) {
  try {
    const drivers = await prisma.user.findMany({
      where: { role: 'DRIVER', isActive: true },
      select: { id: true, fullName: true, email: true, phone: true, driverRegion: true },
      orderBy: { fullName: 'asc' },
    });
    res.json({ drivers });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/drivers/:id/dashboard — ADMIN & STAFF: one rider's active
 * jobs, job history, and last known location (from their most recent
 * attendance clock-in/out — there's no separate live-GPS tracking, this
 * reuses the same location already captured by Attendance). Lets dispatch
 * staff check on a rider without needing the rider's own device.
 */
async function getDriverDashboard(req, res, next) {
  try {
    const driver = await prisma.user.findFirst({
      where: { id: req.params.id, role: 'DRIVER' },
      select: { id: true, fullName: true, email: true, phone: true, driverRegion: true },
    });
    if (!driver) return res.status(404).json({ error: 'Rider not found' });

    const jobs = await prisma.order.findMany({
      where: { assignedDriverId: driver.id },
      include: {
        senderAddress: true,
        receiverAddress: true,
        service: true,
        items: true,
        trackingEvents: { orderBy: { occurredAt: 'asc' } },
      },
      orderBy: { driverAssignedAt: 'desc' },
    });

    const lastLog = await prisma.attendanceLog.findFirst({
      where: { userId: driver.id },
      orderBy: { clockInAt: 'desc' },
    });
    const lastLocation = lastLog ? {
      clockedIn: !lastLog.clockOutAt,
      area: lastLog.clockOutAt ? lastLog.clockOutArea : lastLog.clockInArea,
      lat: lastLog.clockOutAt ? lastLog.clockOutLat : lastLog.clockInLat,
      lng: lastLog.clockOutAt ? lastLog.clockOutLng : lastLog.clockInLng,
      at: lastLog.clockOutAt || lastLog.clockInAt,
    } : null;

    res.json({ driver, jobs, lastLocation });
  } catch (err) {
    next(err);
  }
}

async function setUserRole(req, res, next) {
  try {
    const { role, isActive, driverRegion, allowedPages, allowedOrderTabs, allowedAccountsTabs, allowedOverviewTabs, allowedPrintLabelTabs } = req.body;

    // Each of these grants a different page/sub-tab set (see
    // constants/pages.js) but validates identically: undefined is allowed
    // (field left untouched), otherwise it must be an array drawn only
    // from that field's own valid key list.
    const TAB_FIELD_VALIDATIONS = [
      ['allowedPages', allowedPages, PAGE_KEYS, 'page keys'],
      ['allowedOrderTabs', allowedOrderTabs, ORDER_TAB_KEYS, 'order tab keys'],
      ['allowedAccountsTabs', allowedAccountsTabs, ACCOUNTS_TAB_KEYS, 'accounts tab keys'],
      ['allowedOverviewTabs', allowedOverviewTabs, OVERVIEW_TAB_KEYS, 'overview tab keys'],
      ['allowedPrintLabelTabs', allowedPrintLabelTabs, PRINTLABEL_TAB_KEYS, 'print label tab keys'],
    ];
    for (const [field, value, validKeys, description] of TAB_FIELD_VALIDATIONS) {
      if (value !== undefined && (!Array.isArray(value) || value.some((k) => !validKeys.includes(k)))) {
        return res.status(400).json({ error: `${field} must be an array of valid ${description}` });
      }
    }

    let seededAllowedPages;
    // Same idempotent-safe "give full initial visibility, don't undo a
    // later deliberate narrowing" pattern as the zone/region auto-assign
    // below — a user newly promoted into STAFF/ACCOUNTS (and not already
    // customized) starts with that role's default page set instead of a
    // blank slate with nothing visible until an admin remembers to check
    // boxes.
    if (allowedPages === undefined && (role === 'STAFF' || role === 'ACCOUNTS')) {
      const current = await prisma.user.findUnique({ where: { id: req.params.id }, select: { allowedPages: true } });
      if (current && current.allowedPages.length === 0) {
        seededAllowedPages = DEFAULT_ALLOWED_PAGES_BY_ROLE[role];
      }
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        role,
        isActive,
        driverRegion: driverRegion === undefined ? undefined : (driverRegion.trim() || null),
        allowedPages: allowedPages !== undefined ? allowedPages : seededAllowedPages,
        allowedOrderTabs,
        allowedAccountsTabs,
        allowedOverviewTabs,
        allowedPrintLabelTabs,
      },
    });

    // New (or newly re-promoted) staff start with full visibility into
    // everything that already exists — every current destination zone and
    // every current origin state — rather than the strict opt-in blank
    // slate, so their Bookings/Pickup Orders tabs aren't empty until an
    // admin manually assigns them. Only applies when they have zero
    // assignments already, so deliberately narrowing a staff member down
    // later (e.g. toggling isActive here afterwards) doesn't get silently
    // undone on a subsequent call.
    if (role === 'STAFF') {
      const [zoneCount, regionCount] = await Promise.all([
        prisma.staffZoneAssignment.count({ where: { userId: user.id } }),
        prisma.staffRegionAssignment.count({ where: { userId: user.id } }),
      ]);
      if (zoneCount === 0) {
        const zones = await prisma.zone.findMany({ where: { kind: 'destination' } });
        if (zones.length) {
          await prisma.staffZoneAssignment.createMany({
            data: zones.map((z) => ({ userId: user.id, zoneId: z.id })),
          });
        }
      }
      if (regionCount === 0) {
        const rows = await prisma.postcodeSuggestion.findMany({
          where: { countryCode: 'IN' },
          distinct: ['state'],
          select: { state: true },
        });
        const states = rows.map((r) => r.state).filter(Boolean);
        if (states.length) {
          await prisma.staffRegionAssignment.createMany({
            data: states.map((state) => ({ userId: user.id, state, region: null })),
          });
        }
      }
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  dashboardStats,
  staffOverview,
  regionOverview,
  dashboardKpis,
  accountsOverview,
  listPickupOrigins,
  listZones,
  createZone,
  listStaffZoneAssignments,
  setStaffZoneAssignments,
  listStaffRegionAssignments,
  setStaffRegionAssignments,
  upsertCountryMapping,
  listServicesAdmin,
  upsertService,
  listRateCards,
  upsertRateCard,
  deleteRateCard,
  listSurcharges,
  upsertSurcharge,
  listUsers,
  listDrivers,
  getDriverDashboard,
  setUserRole,
  listAddonPricing,
  updateAddonPricing,
};
