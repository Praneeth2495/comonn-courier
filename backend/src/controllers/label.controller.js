const fs = require('fs');
const path = require('path');
const { prisma } = require('../config/db');
const { generateLabelPdf, STORAGE_DIR } = require('../services/labelService');
const { generateInvoicePdf } = require('../services/invoiceService');
const { sendEmail } = require('../services/emailService');

function toLabelResponse(label) {
  // Relative to the API base URL (which already includes /api) — the
  // frontend prepends VITE_API_BASE_URL, so this must NOT also start with /api.
  return { ...label, downloadUrl: `/labels/download/${label.id}` };
}

function toInvoiceResponse(invoice) {
  return invoice ? { ...invoice, downloadUrl: `/labels/invoice/download/${invoice.orderId}` } : null;
}

async function ensureInvoice(order) {
  const existing = await prisma.invoice.findUnique({ where: { orderId: order.id } });
  if (existing) return existing;

  const { fileName } = await generateInvoicePdf(order);
  return prisma.invoice.create({ data: { orderId: order.id, fileUrl: fileName } });
}

async function emailLabelsAndInvoice(order, labels, invoice) {
  if (!order.otpEmail) return;
  try {
    const attachments = [
      ...labels.map((l) => ({
        filename: l.fileUrl,
        content: fs.readFileSync(path.join(STORAGE_DIR, l.fileUrl)).toString('base64'),
      })),
      {
        filename: invoice.fileUrl,
        content: fs.readFileSync(path.join(STORAGE_DIR, invoice.fileUrl)).toString('base64'),
      },
    ];
    await sendEmail({
      to: order.otpEmail,
      from: process.env.EMAIL_FROM_NOREPLY || 'Comonn <noreply@comonn.in>',
      subject: `Your Comonn shipping label${labels.length > 1 ? 's' : ''} and invoice — Order ${order.orderNumber}`,
      html: `<p>Your shipping label${labels.length > 1 ? 's are' : ' is'} attached for order ${order.orderNumber}, along with your invoice. Print the label(s) and attach one to each package before pickup.</p>`,
      attachments,
    });
  } catch (err) {
    // Labels/invoice are already generated and downloadable — a failed
    // email shouldn't fail the whole request.
    console.error('emailLabelsAndInvoice failed:', err.message);
  }
}

/**
 * POST /api/labels/:orderId/generate
 * Step 4 ("Print Labels"): only allowed once the order is PAID. Generates
 * one PDF label per physical package (sum of each OrderItem's quantity),
 * each with its own Code128 barcode, all linked back to the order's
 * tracking number — plus a single invoice PDF for the whole order.
 */
async function generateLabel(req, res, next) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: {
        service: true,
        senderAddress: true,
        receiverAddress: true,
        labels: true,
        items: true,
        addons: true,
        payment: true,
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'DRAFT' || order.status === 'PENDING_PAYMENT') {
      return res.status(409).json({ error: 'Order must be paid before a label can be generated' });
    }
    if (order.labels.length > 0) {
      const invoice = await ensureInvoice(order);
      return res.json({
        labels: order.labels.map(toLabelResponse),
        invoice: toInvoiceResponse(invoice),
        emailedTo: order.otpEmail || null,
      });
    }

    // One "package" entry per unit of quantity, across all items.
    const packages = [];
    for (const item of order.items) {
      for (let i = 0; i < item.quantity; i++) packages.push(item);
    }
    const totalPackages = packages.length || 1;

    const labels = [];
    for (let i = 0; i < packages.length; i++) {
      const packageIndex = i + 1;
      const barcodeValue = totalPackages > 1 ? `${order.trackingNumber}-${packageIndex}` : order.trackingNumber;
      const { fileName } = await generateLabelPdf(order, {
        packageIndex,
        totalPackages,
        item: packages[i],
        barcodeValue,
      });
      const label = await prisma.label.create({
        data: {
          orderId: order.id,
          packageIndex,
          itemType: packages[i].itemType,
          fileUrl: fileName,
          barcodeValue,
        },
      });
      labels.push(label);
    }

    const invoice = await ensureInvoice(order);

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'LABEL_GENERATED',
        trackingEvents: { create: { status: 'LABEL_GENERATED', note: `${totalPackages} shipping label(s) and invoice generated` } },
      },
    });

    await emailLabelsAndInvoice(order, labels, invoice);

    res.status(201).json({
      labels: labels.map(toLabelResponse),
      invoice: toInvoiceResponse(invoice),
      emailedTo: order.otpEmail || null,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/labels/download/:labelId — streams a label PDF */
async function downloadLabel(req, res, next) {
  try {
    const label = await prisma.label.findUnique({ where: { id: req.params.labelId } });
    if (!label) return res.status(404).json({ error: 'Label not found' });
    res.download(path.join(STORAGE_DIR, label.fileUrl));
  } catch (err) {
    next(err);
  }
}

/** GET /api/labels/invoice/download/:orderId — streams the invoice PDF */
async function downloadInvoice(req, res, next) {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { orderId: req.params.orderId } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.download(path.join(STORAGE_DIR, invoice.fileUrl));
  } catch (err) {
    next(err);
  }
}

module.exports = { generateLabel, downloadLabel, downloadInvoice };
