const { prisma } = require('../config/db');

// ---------------- Dashboard ----------------
async function dashboardStats(req, res, next) {
  try {
    const [totalOrders, pendingPayment, paid, inTransit, delivered, revenueAgg] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: { in: ['UNFINISHED', 'PENDING_PAYMENT'] } } }),
      prisma.order.count({ where: { status: 'PAID' } }),
      prisma.order.count({ where: { status: { in: ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] } } }),
      prisma.order.count({ where: { status: 'DELIVERED' } }),
      prisma.order.aggregate({
        _sum: { grandTotal: true },
        where: { status: { notIn: ['DRAFT', 'UNFINISHED', 'PENDING_PAYMENT', 'CANCELLED'] } },
      }),
    ]);

    const recentOrders = await prisma.order.findMany({
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
    } = req.body;
    const data = { serviceId, zoneId, fromZoneId: fromZoneId || null, weightFromKg, weightToKg, basePrice, perKgOverage, currency, isActive };
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
      select: { id: true, email: true, fullName: true, phone: true, role: true, isActive: true, createdAt: true },
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
      select: { id: true, fullName: true, email: true, phone: true },
      orderBy: { fullName: 'asc' },
    });
    res.json({ drivers });
  } catch (err) {
    next(err);
  }
}

async function setUserRole(req, res, next) {
  try {
    const { role, isActive } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role, isActive },
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  dashboardStats,
  listZones,
  createZone,
  listStaffZoneAssignments,
  setStaffZoneAssignments,
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
