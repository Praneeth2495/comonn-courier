const { prisma } = require('../config/db');

/** GET /api/locations — available to ADMIN, STAFF, DRIVER (used during scanning) */
async function listLocations(req, res, next) {
  try {
    const locations = await prisma.scanLocation.findMany({
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ locations });
  } catch (err) {
    next(err);
  }
}

/** POST /api/locations — ADMIN/STAFF only */
async function createLocation(req, res, next) {
  try {
    const { name, barcodeValue, status } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!barcodeValue || !barcodeValue.trim()) return res.status(400).json({ error: 'barcodeValue is required' });
    if (!status) return res.status(400).json({ error: 'status is required' });

    const location = await prisma.scanLocation.create({
      data: { name: name.trim(), barcodeValue: barcodeValue.trim(), status, createdById: req.user.id },
      include: { createdBy: { select: { fullName: true } } },
    });
    res.status(201).json({ location });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'This barcode is already assigned to a location' });
    next(err);
  }
}

/** PATCH /api/locations/:id — ADMIN/STAFF only */
async function updateLocation(req, res, next) {
  try {
    const { name, barcodeValue, status } = req.body;
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (barcodeValue !== undefined) data.barcodeValue = barcodeValue.trim();
    if (status !== undefined) data.status = status;

    const location = await prisma.scanLocation.update({
      where: { id: req.params.id },
      data,
      include: { createdBy: { select: { fullName: true } } },
    });
    res.json({ location });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'This barcode is already assigned to a location' });
    next(err);
  }
}

/** DELETE /api/locations/:id — ADMIN/STAFF only */
async function deleteLocation(req, res, next) {
  try {
    await prisma.scanLocation.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { listLocations, createLocation, updateLocation, deleteLocation };
