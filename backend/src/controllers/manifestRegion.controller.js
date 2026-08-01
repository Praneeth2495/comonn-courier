const { prisma } = require('../config/db');

/** GET /api/admin/manifest-regions — every sub-region, with the zones currently assigned to it. */
async function listManifestRegions(req, res, next) {
  try {
    const regions = await prisma.manifestRegion.findMany({
      include: { zones: { select: { id: true, code: true, name: true } } },
      orderBy: [{ countryCode: 'asc' }, { name: 'asc' }],
    });
    res.json({ regions });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/manifest-regions */
async function createManifestRegion(req, res, next) {
  try {
    const { name, countryCode, airportAddress } = req.body;
    if (!name?.trim() || !countryCode?.trim() || !airportAddress?.trim()) {
      return res.status(400).json({ error: 'name, countryCode and airportAddress are required' });
    }
    const region = await prisma.manifestRegion.create({
      data: { name: name.trim(), countryCode: countryCode.trim().toUpperCase(), airportAddress: airportAddress.trim() },
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

/**
 * PATCH /api/admin/zones/:id/manifest-region — assigns (or clears, with
 * regionId: null) which sub-region a destination Zone routes through. Lives
 * here rather than admin.controller.js since it's purely a Manifest-feature
 * concern layered onto the existing Zone model.
 */
async function setZoneManifestRegion(req, res, next) {
  try {
    const { regionId } = req.body;
    const zone = await prisma.zone.update({
      where: { id: req.params.id },
      data: { manifestRegionId: regionId || null },
      include: { manifestRegion: true },
    });
    res.json({ zone });
  } catch (err) {
    next(err);
  }
}

module.exports = { listManifestRegions, createManifestRegion, updateManifestRegion, setZoneManifestRegion };
