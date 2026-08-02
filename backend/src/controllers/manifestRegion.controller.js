const { prisma } = require('../config/db');

/** GET /api/admin/manifest-regions — every destination airport known so far (auto-created on first manifest, or pre-provisioned here). */
async function listManifestRegions(req, res, next) {
  try {
    const regions = await prisma.manifestRegion.findMany({
      orderBy: [{ countryCode: 'asc' }, { name: 'asc' }],
    });
    res.json({ regions });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/manifest-regions — pre-provision an airport code before any order reaches it, or to set its real cargo address ahead of time. */
async function createManifestRegion(req, res, next) {
  try {
    const { code, name, countryCode, airportAddress } = req.body;
    if (!code?.trim() || !name?.trim() || !countryCode?.trim() || !airportAddress?.trim()) {
      return res.status(400).json({ error: 'code, name, countryCode and airportAddress are required' });
    }
    const region = await prisma.manifestRegion.create({
      data: {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        countryCode: countryCode.trim().toUpperCase(),
        airportAddress: airportAddress.trim(),
      },
    });
    res.status(201).json({ region });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/manifest-regions/:id */
async function updateManifestRegion(req, res, next) {
  try {
    const { name, countryCode, airportAddress, isActive } = req.body;
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (countryCode !== undefined) data.countryCode = countryCode.trim().toUpperCase();
    if (airportAddress !== undefined) data.airportAddress = airportAddress.trim();
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    const region = await prisma.manifestRegion.update({ where: { id: req.params.id }, data });
    res.json({ region });
  } catch (err) {
    next(err);
  }
}

module.exports = { listManifestRegions, createManifestRegion, updateManifestRegion };
