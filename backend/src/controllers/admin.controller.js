const { prisma } = require('../config/db');
const { resolveOriginFilters } = require('./order.controller');

// ---------------- Dashboard ----------------
// "Paid" is cumulative — every order that has ever cleared payment, not
// just whatever's currently sitting in the literal PAID status (which
// would undercount, since most orders move on to LABEL_GENERATED/
// PICKED_UP/etc. within a day or two). PICKUP_CONFIRMED counts too — it's
// the "book pickup" flow's equivalent of PAID (cash collected in person
// instead of upfront), already treated the same way as PAID for the
// "your order is booked" notification (see orderNotifications.js). Same
// exclusion list the revenue aggregate below uses.
async function dashboardStats(req, res, next) {
  try {
    const { from, to } = req.query;
    // UNFINISHED (a quote+details started but payment never reached) never
    // shows up outside the dedicated Unconfirmed-orders tab anywhere else
    // in the admin panel (Bookings/Pickup/Manifest/Delivery/Accounts all
    // exclude it the same way) — Overview follows the same rule.
    const where = { status: { not: 'UNFINISHED' } };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999Z`);
    }

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
      where.senderAddress = { OR: await resolveOriginFilters(assignments) };
    }

    const [totalOrders, pendingPayment, paid, inTransit, delivered, revenueAgg] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.count({ where: { ...where, status: 'PENDING_PAYMENT' } }),
      prisma.order.count({ where: { ...where, status: { notIn: ['DRAFT', 'UNFINISHED', 'PENDING_PAYMENT', 'CANCELLED'] } } }),
      prisma.order.count({ where: { ...where, status: { in: ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] } } }),
      prisma.order.count({ where: { ...where, status: 'DELIVERED' } }),
      prisma.order.aggregate({
        _sum: { grandTotal: true },
        where: { ...where, status: { notIn: ['DRAFT', 'UNFINISHED', 'PENDING_PAYMENT', 'CANCELLED'] } },
      }),
    ]);

    const recentOrders = await prisma.order.findMany({
      where,
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { service: true, receiverAddress: { select: { city: true, countryCode: true } } },
    });

    res.json({
      totals: {
        totalOrders,
        pendingPayment,
        paid,
        inTransit,
        delivered,
        totalRevenue: revenueAgg._sum.grandTotal || 0,
      },
      recentOrders,
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

// ---------------- Users ----------------
async function listUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, fullName: true, phone: true, role: true, isActive: true, driverRegion: true, createdAt: true },
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

async function setUserRole(req, res, next) {
  try {
    const { role, isActive, driverRegion } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role, isActive, driverRegion: driverRegion === undefined ? undefined : (driverRegion.trim() || null) },
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
  setUserRole,
};
