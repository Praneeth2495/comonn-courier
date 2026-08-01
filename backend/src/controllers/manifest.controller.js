const fs = require('fs');
const path = require('path');
const { prisma } = require('../config/db');
const { generateManifestNumber } = require('../utils/invoiceNumber');
const { generateManifestPdf, STORAGE_DIR } = require('../services/manifestPdf');
const { PAYABLE_STATUSES, buildOrdersWhere } = require('./order.controller');

const ORDER_INCLUDE = { senderAddress: true, receiverAddress: true, items: true };

function withQty(order) {
  const qty = (order.items || []).reduce((sum, it) => sum + it.quantity, 0);
  return { ...order, qty };
}

/**
 * GET /api/admin/manifests/eligible-orders?regionId= — orders that can be
 * added to a manifest for this sub-region: not already in a (different)
 * manifest, and confirmed (excludes PAYABLE_STATUSES, i.e. unpaid/unconfirmed
 * orders) — everything else, including pickup bookings, is included per the
 * "straight from order placement" requirement. Reuses buildOrdersWhere so
 * STAFF still only see orders in their assigned zones, intersected with the
 * region's zones.
 */
async function listEligibleOrders(req, res, next) {
  try {
    const { regionId } = req.query;
    if (!regionId) return res.status(400).json({ error: 'regionId is required' });

    const zones = await prisma.zone.findMany({ where: { manifestRegionId: regionId }, select: { code: true } });
    const regionCodes = zones.map((z) => z.code);
    if (regionCodes.length === 0) return res.json({ orders: [] });

    const where = await buildOrdersWhere({ ...req, query: { ...req.query, notStatus: PAYABLE_STATUSES.join(',') } });
    where.manifestId = null;
    if (where.zoneCode && where.zoneCode.in) {
      where.zoneCode = { in: where.zoneCode.in.filter((c) => regionCodes.includes(c)) };
    } else {
      where.zoneCode = { in: regionCodes };
    }

    const orders = await prisma.order.findMany({ where, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' } });
    res.json({ orders: orders.map(withQty) });
  } catch (err) {
    next(err);
  }
}

/** Recomputes and persists orderCount/totalQty/totalWeightKg from the manifest's current orders, then regenerates the PDF sheet. Called after every create/add/remove so the numbers and PDF never drift from the real linked orders. */
async function recomputeAndRegenerate(manifestId) {
  const manifest = await prisma.manifest.findUnique({
    where: { id: manifestId },
    include: { hub: true, region: true, orders: { include: ORDER_INCLUDE } },
  });
  const totalQty = manifest.orders.reduce((sum, o) => sum + (o.items || []).reduce((s, it) => s + it.quantity, 0), 0);
  const totalWeightKg = manifest.orders.reduce((sum, o) => sum + Number(o.chargeableWeightKg), 0);
  const updated = await prisma.manifest.update({
    where: { id: manifestId },
    data: { orderCount: manifest.orders.length, totalQty, totalWeightKg },
    include: { hub: true, region: true, orders: { include: ORDER_INCLUDE } },
  });
  const { fileName } = await generateManifestPdf(updated);
  await prisma.manifest.update({ where: { id: manifestId }, data: { pdfFileUrl: fileName } });
  return { ...updated, pdfFileUrl: fileName };
}

/** POST /api/admin/manifests — { orderIds, hubId, regionId, toAddress, manifestDate } */
async function createManifest(req, res, next) {
  try {
    const { orderIds, hubId, regionId, toAddress, manifestDate } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) return res.status(400).json({ error: 'orderIds is required' });
    if (!hubId) return res.status(400).json({ error: 'hubId is required' });
    if (!toAddress?.trim()) return res.status(400).json({ error: 'toAddress is required' });
    if (!manifestDate) return res.status(400).json({ error: 'manifestDate is required' });

    const manifestNumber = await generateManifestNumber();
    const manifest = await prisma.$transaction(async (tx) => {
      const created = await tx.manifest.create({
        data: {
          manifestNumber,
          barcodeValue: manifestNumber,
          hubId,
          regionId: regionId || null,
          toAddress: toAddress.trim(),
          manifestDate: new Date(manifestDate),
          createdById: req.user.id,
        },
      });
      const claimed = await tx.order.updateMany({
        where: { id: { in: orderIds }, manifestId: null, status: { notIn: PAYABLE_STATUSES } },
        data: { manifestId: created.id },
      });
      if (claimed.count === 0) {
        throw Object.assign(new Error('None of the selected orders are eligible — they may already be in another manifest.'), { status: 409 });
      }
      return created;
    });

    const full = await recomputeAndRegenerate(manifest.id);
    res.status(201).json({ manifest: full });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

/** GET /api/admin/manifests */
async function listManifests(req, res, next) {
  try {
    const manifests = await prisma.manifest.findMany({
      include: { hub: true, region: true, createdBy: { select: { fullName: true } }, _count: { select: { orders: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ manifests });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/manifests/:id */
async function getManifest(req, res, next) {
  try {
    const manifest = await prisma.manifest.findUnique({
      where: { id: req.params.id },
      include: { hub: true, region: true, orders: { include: ORDER_INCLUDE } },
    });
    if (!manifest) return res.status(404).json({ error: 'Manifest not found' });
    res.json({ manifest: { ...manifest, orders: manifest.orders.map(withQty) } });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/manifests/:id/orders — add more orders to an existing manifest. */
async function addOrdersToManifest(req, res, next) {
  try {
    const { orderIds } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) return res.status(400).json({ error: 'orderIds is required' });

    const claimed = await prisma.order.updateMany({
      where: { id: { in: orderIds }, manifestId: null, status: { notIn: PAYABLE_STATUSES } },
      data: { manifestId: req.params.id },
    });
    if (claimed.count === 0) return res.status(409).json({ error: 'None of the selected orders are eligible.' });

    const full = await recomputeAndRegenerate(req.params.id);
    res.json({ manifest: full });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/manifests/:id/orders/:orderId — remove a single order from the manifest. */
async function removeOrderFromManifest(req, res, next) {
  try {
    const { count } = await prisma.order.updateMany({
      where: { id: req.params.orderId, manifestId: req.params.id },
      data: { manifestId: null },
    });
    if (count === 0) return res.status(404).json({ error: 'Order not found in this manifest' });

    const full = await recomputeAndRegenerate(req.params.id);
    res.json({ manifest: full });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/manifests/:id/download */
async function downloadManifest(req, res, next) {
  try {
    const manifest = await prisma.manifest.findUnique({
      where: { id: req.params.id },
      include: { hub: true, region: true, orders: { include: ORDER_INCLUDE } },
    });
    if (!manifest) return res.status(404).json({ error: 'Manifest not found' });

    const filePath = path.resolve(path.join(STORAGE_DIR, manifest.pdfFileUrl || `${manifest.manifestNumber}.pdf`));
    if (!fs.existsSync(filePath)) await generateManifestPdf(manifest);
    if (req.query.inline) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
      return res.sendFile(filePath);
    }
    res.download(filePath);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listEligibleOrders,
  createManifest,
  listManifests,
  getManifest,
  addOrdersToManifest,
  removeOrderFromManifest,
  downloadManifest,
};
