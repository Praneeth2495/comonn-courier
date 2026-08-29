const { prisma } = require('../config/db');

/** GET /api/admin/assets — list, newest first, plus the all-time total value. */
async function listAssets(req, res, next) {
  try {
    const [assets, { _sum }] = await Promise.all([
      prisma.asset.findMany({
        include: { createdBy: { select: { fullName: true } } },
        orderBy: { purchaseDate: 'desc' },
      }),
      prisma.asset.aggregate({ _sum: { value: true } }),
    ]);
    res.json({ assets, totalValue: _sum.value || 0 });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/assets */
async function createAsset(req, res, next) {
  try {
    const { name, value, quantity, purchaseDate, staffName } = req.body;
    if (!name?.trim() || !staffName?.trim() || !purchaseDate) {
      return res.status(400).json({ error: 'name, purchaseDate and staffName are required' });
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return res.status(400).json({ error: 'value must be a positive number' });
    }
    const numericQuantity = quantity === undefined || quantity === '' ? 1 : Number(quantity);
    if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive whole number' });
    }

    const asset = await prisma.asset.create({
      data: {
        name: name.trim(),
        value: numericValue,
        quantity: numericQuantity,
        purchaseDate: new Date(purchaseDate),
        staffName: staffName.trim(),
        createdById: req.user.id,
      },
      include: { createdBy: { select: { fullName: true } } },
    });
    res.status(201).json({ asset });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAssets, createAsset };
