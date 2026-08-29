const multer = require('multer');
const { prisma } = require('../config/db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('attachment');

// attachmentData is never included in list/detail JSON responses — served
// separately via downloadAssetAttachment, same care as
// partyInvoice.controller.js's toInvoiceResponse.
function toAssetResponse(asset) {
  const { attachmentData, ...rest } = asset;
  return { ...rest, hasAttachment: Boolean(attachmentData || asset.attachmentName) };
}

function validateFields({ name, staffName, purchaseDate, value, quantity }) {
  if (!name?.trim() || !staffName?.trim() || !purchaseDate) {
    return 'name, purchaseDate and staffName are required';
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 'value must be a positive number';
  }
  const numericQuantity = quantity === undefined || quantity === '' ? 1 : Number(quantity);
  if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) {
    return 'quantity must be a positive whole number';
  }
  return null;
}

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
    res.json({ assets: assets.map(toAssetResponse), totalValue: _sum.value || 0 });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/assets (multipart/form-data, optional `attachment` file) */
async function createAsset(req, res, next) {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    try {
      const { name, value, quantity, purchaseDate, staffName } = req.body;
      const error = validateFields({ name, staffName, purchaseDate, value, quantity });
      if (error) return res.status(400).json({ error });

      const asset = await prisma.asset.create({
        data: {
          name: name.trim(),
          value: Number(value),
          quantity: quantity === undefined || quantity === '' ? 1 : Number(quantity),
          purchaseDate: new Date(purchaseDate),
          staffName: staffName.trim(),
          attachmentName: req.file?.originalname || null,
          attachmentMime: req.file?.mimetype || null,
          attachmentData: req.file?.buffer || null,
          createdById: req.user.id,
        },
        include: { createdBy: { select: { fullName: true } } },
      });
      res.status(201).json({ asset: toAssetResponse(asset) });
    } catch (err) {
      next(err);
    }
  });
}

/** PATCH /api/admin/assets/:id (multipart/form-data, optional `attachment` file replaces the existing one) */
async function updateAsset(req, res, next) {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    try {
      const { name, value, quantity, purchaseDate, staffName } = req.body;
      const error = validateFields({ name, staffName, purchaseDate, value, quantity });
      if (error) return res.status(400).json({ error });

      const data = {
        name: name.trim(),
        value: Number(value),
        quantity: quantity === undefined || quantity === '' ? 1 : Number(quantity),
        purchaseDate: new Date(purchaseDate),
        staffName: staffName.trim(),
      };
      if (req.file) {
        data.attachmentName = req.file.originalname;
        data.attachmentMime = req.file.mimetype;
        data.attachmentData = req.file.buffer;
      }

      const asset = await prisma.asset.update({
        where: { id: req.params.id },
        data,
        include: { createdBy: { select: { fullName: true } } },
      });
      res.json({ asset: toAssetResponse(asset) });
    } catch (err) {
      if (err.code === 'P2025') return res.status(404).json({ error: 'Asset not found' });
      next(err);
    }
  });
}

/** DELETE /api/admin/assets/:id — ADMIN only, see asset.routes.js */
async function deleteAsset(req, res, next) {
  try {
    await prisma.asset.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Asset not found' });
    next(err);
  }
}

/** GET /api/admin/assets/:id/attachment */
async function downloadAssetAttachment(req, res, next) {
  try {
    const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    if (!asset.attachmentData) return res.status(404).json({ error: 'No attachment on this asset' });
    res.setHeader('Content-Type', asset.attachmentMime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${asset.attachmentName || 'attachment'}"`);
    res.send(asset.attachmentData);
  } catch (err) {
    next(err);
  }
}

module.exports = { listAssets, createAsset, updateAsset, deleteAsset, downloadAssetAttachment };
