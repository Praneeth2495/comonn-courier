const { prisma } = require('../config/db');

/** GET /api/admin/hubs — the "from" address options when creating a manifest. */
async function listHubs(req, res, next) {
  try {
    const hubs = await prisma.hub.findMany({ orderBy: { name: 'asc' } });
    res.json({ hubs });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/hubs */
async function createHub(req, res, next) {
  try {
    const { name, address } = req.body;
    if (!name?.trim() || !address?.trim()) {
      return res.status(400).json({ error: 'name and address are required' });
    }
    const hub = await prisma.hub.create({ data: { name: name.trim(), address: address.trim() } });
    res.status(201).json({ hub });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/hubs/:id */
async function updateHub(req, res, next) {
  try {
    const { name, address, isActive } = req.body;
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (address !== undefined) data.address = address.trim();
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    const hub = await prisma.hub.update({ where: { id: req.params.id }, data });
    res.json({ hub });
  } catch (err) {
    next(err);
  }
}

module.exports = { listHubs, createHub, updateHub };
