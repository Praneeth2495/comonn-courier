const { prisma } = require('../config/db');
const { generateLabelPdf } = require('../services/labelService');

/**
 * POST /api/labels/:orderId/generate
 * Step 4 ("Print Labels"): only allowed once the order is PAID. Renders a
 * PDF label with a Code128 barcode of the tracking number and stores it.
 */
async function generateLabel(req, res, next) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { service: true, senderAddress: true, receiverAddress: true, label: true, items: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'DRAFT' || order.status === 'PENDING_PAYMENT') {
      return res.status(409).json({ error: 'Order must be paid before a label can be generated' });
    }
    if (order.label) {
      return res.json({ label: order.label, downloadUrl: `/api/labels/${order.id}/download` });
    }

    const { fileName } = await generateLabelPdf(order);

    const label = await prisma.label.create({
      data: {
        orderId: order.id,
        fileUrl: fileName,
        barcodeValue: order.trackingNumber,
      },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'LABEL_GENERATED',
        trackingEvents: { create: { status: 'LABEL_GENERATED', note: 'Shipping label generated' } },
      },
    });

    res.status(201).json({ label, downloadUrl: `/api/labels/${order.id}/download` });
  } catch (err) {
    next(err);
  }
}

/** GET /api/labels/:orderId/download — streams the PDF */
async function downloadLabel(req, res, next) {
  try {
    const path = require('path');
    const { STORAGE_DIR } = require('../services/labelService');
    const label = await prisma.label.findUnique({ where: { orderId: req.params.orderId } });
    if (!label) return res.status(404).json({ error: 'Label not found — generate it first' });
    res.download(path.join(STORAGE_DIR, label.fileUrl));
  } catch (err) {
    next(err);
  }
}

module.exports = { generateLabel, downloadLabel };
