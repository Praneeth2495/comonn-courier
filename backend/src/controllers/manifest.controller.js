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
 * GET /api/admin/manifests/eligible-orders?airportCode= — orders that can
 * be added to a manifest for this destination airport: not already in a
 * (different) manifest, and confirmed (excludes PAYABLE_STATUSES, i.e.
 * unpaid/unconfirmed orders) — everything else, including pickup bookings,
 * is included per the "straight from order placement" requirement. Reuses
 * buildOrdersWhere so STAFF still only see orders in their assigned zones.
 */
async function listEligibleOrders(req, res, next) {
  try {
    const { airportCode } = req.query;
    if (!airportCode) return res.status(400).json({ error: 'airportCode is required' });

    const where = await buildOrdersWhere({ ...req, query: { ...req.query, notStatus: PAYABLE_STATUSES.join(',') } });
    where.manifestId = null;
    where.airportCode = airportCode;

    const orders = await prisma.order.findMany({ where, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' } });
    res.json({ orders: orders.map(withQty) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/manifests/available-airports — the country/airport chips
 * for the Build Manifest tab: one entry per distinct (destination country,
 * airportCode) pair currently found among manifest-eligible orders (not
 * already in a manifest, not unpaid/unconfirmed), with a live count. Reuses
 * buildOrdersWhere so STAFF only see airports covering their assigned
 * zones. Grouping is done in JS rather than a DB groupBy since it needs the
 * receiver's countryCode, which lives on the related Address, not Order
 * itself — fine at this order volume.
 */
async function listAvailableAirports(req, res, next) {
  try {
    const where = await buildOrdersWhere({ ...req, query: { ...req.query, notStatus: PAYABLE_STATUSES.join(',') } });
    where.manifestId = null;
    where.airportCode = { not: null };

    const orders = await prisma.order.findMany({
      where,
      select: { airportCode: true, receiverAddress: { select: { countryCode: true } } },
    });

    const counts = new Map(); // `${countryCode}:${airportCode}` -> count
    for (const o of orders) {
      const key = `${o.receiverAddress.countryCode}:${o.airportCode}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const codes = [...new Set(orders.map((o) => o.airportCode))];
    const regions = codes.length ? await prisma.manifestRegion.findMany({ where: { code: { in: codes } } }) : [];
    const regionByCode = new Map(regions.map((r) => [r.code, r]));

    const airports = [...counts.entries()].map(([key, count]) => {
      const [countryCode, airportCode] = key.split(':');
      const region = regionByCode.get(airportCode);
      return { countryCode, airportCode, count, name: region?.name || airportCode, airportAddress: region?.airportAddress || '' };
    });

    res.json({ airports });
  } catch (err) {
    next(err);
  }
}

/**
 * Finds (or auto-creates, with a placeholder name/address) the
 * ManifestRegion for a given airport code — admin can rename it and fix the
 * real cargo address afterward from the Manifest tab's setup panel.
 */
async function findOrCreateRegion(airportCode, countryCode, fallbackAddress) {
  const existing = await prisma.manifestRegion.findUnique({ where: { code: airportCode } });
  if (existing) return existing;
  return prisma.manifestRegion.create({
    data: {
      code: airportCode,
      name: airportCode,
      countryCode: countryCode.toUpperCase(),
      airportAddress: fallbackAddress?.trim() || '',
    },
  });
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

/** POST /api/admin/manifests — { orderIds, hubId, airportCode, toAddress, manifestDate } */
async function createManifest(req, res, next) {
  try {
    const { orderIds, hubId, airportCode, toAddress, manifestDate } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) return res.status(400).json({ error: 'orderIds is required' });
    if (!hubId) return res.status(400).json({ error: 'hubId is required' });
    if (!airportCode) return res.status(400).json({ error: 'airportCode is required' });
    if (!toAddress?.trim()) return res.status(400).json({ error: 'toAddress is required' });
    if (!manifestDate) return res.status(400).json({ error: 'manifestDate is required' });

    const firstOrder = await prisma.order.findUnique({ where: { id: orderIds[0] }, include: { receiverAddress: true } });
    if (!firstOrder) return res.status(400).json({ error: 'orderIds contains an unknown order' });
    const region = await findOrCreateRegion(airportCode, firstOrder.receiverAddress.countryCode, toAddress);

    const manifestNumber = await generateManifestNumber();
    const manifest = await prisma.$transaction(async (tx) => {
      const created = await tx.manifest.create({
        data: {
          manifestNumber,
          barcodeValue: manifestNumber,
          hubId,
          regionId: region.id,
          toAddress: toAddress.trim(),
          manifestDate: new Date(manifestDate),
          createdById: req.user.id,
        },
      });
      const claimed = await tx.order.updateMany({
        where: { id: { in: orderIds }, manifestId: null, status: { notIn: PAYABLE_STATUSES }, airportCode },
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

    const manifest = await prisma.manifest.findUnique({ where: { id: req.params.id }, include: { region: true } });
    if (!manifest) return res.status(404).json({ error: 'Manifest not found' });

    const claimed = await prisma.order.updateMany({
      where: {
        id: { in: orderIds },
        manifestId: null,
        status: { notIn: PAYABLE_STATUSES },
        ...(manifest.region ? { airportCode: manifest.region.code } : {}),
      },
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
  listAvailableAirports,
  createManifest,
  listManifests,
  getManifest,
  addOrdersToManifest,
  removeOrderFromManifest,
  downloadManifest,
};
