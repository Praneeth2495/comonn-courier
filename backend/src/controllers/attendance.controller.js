const { prisma } = require('../config/db');
const { reverseGeocodeArea } = require('../services/geocoding');

function toCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** POST /api/attendance/clock-in — body: { lat?, lng? } */
async function clockIn(req, res, next) {
  try {
    const open = await prisma.attendanceLog.findFirst({
      where: { userId: req.user.id, clockOutAt: null },
    });
    if (open) return res.status(409).json({ error: 'Already clocked in — clock out first.' });

    const lat = toCoord(req.body.lat);
    const lng = toCoord(req.body.lng);
    const area = await reverseGeocodeArea(lat, lng);

    const log = await prisma.attendanceLog.create({
      data: { userId: req.user.id, clockInLat: lat, clockInLng: lng, clockInArea: area },
    });
    res.status(201).json({ log });
  } catch (err) {
    next(err);
  }
}

/** POST /api/attendance/clock-out — body: { lat?, lng? } */
async function clockOut(req, res, next) {
  try {
    const open = await prisma.attendanceLog.findFirst({
      where: { userId: req.user.id, clockOutAt: null },
      orderBy: { clockInAt: 'desc' },
    });
    if (!open) return res.status(404).json({ error: 'No active shift to clock out of.' });

    const lat = toCoord(req.body.lat);
    const lng = toCoord(req.body.lng);
    const area = await reverseGeocodeArea(lat, lng);

    const log = await prisma.attendanceLog.update({
      where: { id: open.id },
      data: { clockOutAt: new Date(), clockOutLat: lat, clockOutLng: lng, clockOutArea: area },
    });
    res.json({ log });
  } catch (err) {
    next(err);
  }
}

/** GET /api/attendance/mine — own shift history, newest first */
async function listMine(req, res, next) {
  try {
    const logs = await prisma.attendanceLog.findMany({
      where: { userId: req.user.id },
      orderBy: { clockInAt: 'desc' },
      take: 60,
    });
    res.json({ logs });
  } catch (err) {
    next(err);
  }
}

/** GET /api/attendance/admin?from=&to=&userId= — ADMIN only, every user's history */
async function listAll(req, res, next) {
  try {
    const { from, to, userId } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (from || to) {
      where.clockInAt = {};
      if (from) where.clockInAt.gte = new Date(from);
      if (to) where.clockInAt.lte = new Date(`${to}T23:59:59.999Z`);
    }
    const logs = await prisma.attendanceLog.findMany({
      where,
      include: { user: { select: { fullName: true, email: true, role: true } } },
      orderBy: { clockInAt: 'desc' },
      take: 500,
    });
    res.json({ logs });
  } catch (err) {
    next(err);
  }
}

module.exports = { clockIn, clockOut, listMine, listAll };
