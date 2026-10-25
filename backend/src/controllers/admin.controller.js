const { prisma } = require('../config/db');
const { resolveOriginFilters, buildOrdersWhere, PAYABLE_STATUSES } = require('./order.controller');
const { getIstDateParts } = require('../utils/orderNumber');
const { PAGE_KEYS, DEFAULT_ALLOWED_PAGES_BY_ROLE, ORDER_TAB_KEYS, ACCOUNTS_TAB_KEYS, OVERVIEW_TAB_KEYS, PRINTLABEL_TAB_KEYS } = require('../constants/pages');

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
    if (!(await requireOverviewBreakdownAccess(req, res))) return;
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
    if (!(await requireOverviewBreakdownAccess(req, res))) return;
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
      hasOverviewBreakdownAccess(req),
    ]);
    const regions = canSeeRegions ? await computeRegionBreakdown(from, to) : null;

    res.json({ dayOfWeek, airports, staffActivity, riderActivity, accountsActivity, regions });
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
      select: { id: true, email: true, fullName: true, phone: true, role: true, isActive: true, driverRegion: true, canViewOverviewBreakdown: true, allowedPages: true, allowedOrderTabs: true, createdAt: true },
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
    const { role, isActive, driverRegion, canViewOverviewBreakdown, allowedPages, allowedOrderTabs } = req.body;
    if (allowedPages !== undefined && (!Array.isArray(allowedPages) || allowedPages.some((p) => !PAGE_KEYS.includes(p)))) {
      return res.status(400).json({ error: 'allowedPages must be an array of valid page keys' });
    }
    if (allowedOrderTabs !== undefined && (!Array.isArray(allowedOrderTabs) || allowedOrderTabs.some((t) => !ORDER_TAB_KEYS.includes(t)))) {
      return res.status(400).json({ error: 'allowedOrderTabs must be an array of valid order tab keys' });
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
        canViewOverviewBreakdown,
        allowedPages: allowedPages !== undefined ? allowedPages : seededAllowedPages,
        allowedOrderTabs,
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
