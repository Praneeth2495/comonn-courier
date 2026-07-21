const { prisma } = require('../config/db');

/** Resolves scanned barcode values to their orders via the Label table. */
async function resolveBarcodes(barcodeValues) {
  const unique = [...new Set(barcodeValues)];
  const labels = await prisma.label.findMany({
    where: { barcodeValue: { in: unique } },
    include: { order: { select: { id: true, orderNumber: true } } },
  });
  const byBarcode = new Map(labels.map((l) => [l.barcodeValue, l]));

  return unique.map((barcodeValue) => {
    const label = byBarcode.get(barcodeValue);
    return label
      ? { barcodeValue, matched: true, orderId: label.order.id, orderNumber: label.order.orderNumber }
      : { barcodeValue, matched: false, orderId: null, orderNumber: null };
  });
}

/** Applies `status` to every distinct order among the resolved (matched) items. */
async function applyStatusToItems(items, status) {
  const orderIds = [...new Set(items.filter((i) => i.matched).map((i) => i.orderId))];
  await Promise.all(
    orderIds.map((orderId) =>
      prisma.order.update({
        where: { id: orderId },
        data: { status, trackingEvents: { create: { status, note: 'Updated via batch scan' } } },
      })
    )
  );
  return orderIds.length;
}

/**
 * POST /api/batches/apply-status
 * "Update status" flow: scan labels, apply a status to the matched orders,
 * and stop — nothing is saved to the batch history.
 */
async function applyStatus(req, res, next) {
  try {
    const { barcodeValues, status } = req.body;
    if (!Array.isArray(barcodeValues) || barcodeValues.length === 0) {
      return res.status(400).json({ error: 'barcodeValues must be a non-empty array' });
    }
    if (!status) return res.status(400).json({ error: 'status is required' });

    const items = await resolveBarcodes(barcodeValues);
    const updatedCount = await applyStatusToItems(items, status);
    res.json({ items, updatedCount });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/batches
 * "Create batch & update" flow: same as applyStatus, but also saves a named
 * ScanBatch record (with every scanned item, matched or not) for later
 * reference/deletion.
 */
async function createBatch(req, res, next) {
  try {
    const { name, barcodeValues, status } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!Array.isArray(barcodeValues) || barcodeValues.length === 0) {
      return res.status(400).json({ error: 'barcodeValues must be a non-empty array' });
    }
    if (!status) return res.status(400).json({ error: 'status is required' });

    const items = await resolveBarcodes(barcodeValues);
    const updatedCount = await applyStatusToItems(items, status);

    const batch = await prisma.scanBatch.create({
      data: {
        name: name.trim(),
        status,
        createdById: req.user.id,
        items: {
          create: items.map(({ barcodeValue, matched, orderId, orderNumber }) => ({ barcodeValue, matched, orderId, orderNumber })),
        },
      },
      include: { items: true, createdBy: { select: { fullName: true } } },
    });

    res.status(201).json({ batch, updatedCount });
  } catch (err) {
    next(err);
  }
}

/** GET /api/batches — saved batch history */
async function listBatches(req, res, next) {
  try {
    const batches = await prisma.scanBatch.findMany({
      include: { createdBy: { select: { fullName: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ batches });
  } catch (err) {
    next(err);
  }
}

/** GET /api/batches/:id */
async function getBatch(req, res, next) {
  try {
    const batch = await prisma.scanBatch.findUnique({
      where: { id: req.params.id },
      include: { items: true, createdBy: { select: { fullName: true } } },
    });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    res.json({ batch });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/batches/:id — removes the saved record only; already-applied status changes are not reverted */
async function deleteBatch(req, res, next) {
  try {
    await prisma.scanBatch.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { applyStatus, createBatch, listBatches, getBatch, deleteBatch };
