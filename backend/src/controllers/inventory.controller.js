const { prisma } = require('../config/db');

/** GET /api/inventory */
async function listInventory(req, res, next) {
  try {
    const items = await prisma.inventoryItem.findMany({
      include: { updatedBy: { select: { fullName: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

/** POST /api/inventory */
async function createInventoryItem(req, res, next) {
  try {
    const { name, unit = 'pcs', quantity = 0, lowStockThreshold } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

    const item = await prisma.inventoryItem.create({
      data: {
        name: name.trim(),
        unit,
        quantity: Number(quantity) || 0,
        lowStockThreshold: lowStockThreshold !== undefined && lowStockThreshold !== '' ? Number(lowStockThreshold) : null,
        updatedById: req.user.id,
      },
    });
    res.status(201).json({ item });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'An item with this name already exists' });
    next(err);
  }
}

/** PATCH /api/inventory/:id */
async function updateInventoryItem(req, res, next) {
  try {
    const { name, unit, quantity, lowStockThreshold } = req.body;
    const data = { updatedById: req.user.id };
    if (name !== undefined) data.name = name.trim();
    if (unit !== undefined) data.unit = unit;
    if (quantity !== undefined) data.quantity = Number(quantity) || 0;
    if (lowStockThreshold !== undefined) data.lowStockThreshold = lowStockThreshold === '' || lowStockThreshold === null ? null : Number(lowStockThreshold);

    const item = await prisma.inventoryItem.update({
      where: { id: req.params.id },
      data,
      include: { updatedBy: { select: { fullName: true } } },
    });
    res.json({ item });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'An item with this name already exists' });
    next(err);
  }
}

/** DELETE /api/inventory/:id */
async function deleteInventoryItem(req, res, next) {
  try {
    await prisma.inventoryItem.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { listInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem };
