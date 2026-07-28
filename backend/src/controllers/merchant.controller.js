const crypto = require('crypto');
const { prisma } = require('../config/db');
const { hashApiKey } = require('../middleware/merchantAuth');
const { INVOICE_DUE_DAYS } = require('../services/merchantInvoiceGenerator');

function isOverdue(invoice) {
  if (invoice.status !== 'UNPAID') return false;
  const dueAt = new Date(new Date(invoice.invoiceDate).getTime() + INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000);
  return new Date() > dueAt;
}

function toMerchantResponse(merchant) {
  const { apiKeyHash, ...rest } = merchant;
  return rest;
}

/** GET /api/admin/merchants */
async function listMerchants(req, res, next) {
  try {
    const merchants = await prisma.merchant.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ merchants: merchants.map(toMerchantResponse) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/merchants
 * The raw API key is returned exactly once here — only its hash is ever
 * persisted, so there is no "forgot my key, show it again" recovery path,
 * only reissue (see PATCH /:id).
 */
async function createMerchant(req, res, next) {
  try {
    const { name, contactEmail, contactPhone } = req.body;
    if (!name?.trim() || !contactEmail?.trim()) {
      return res.status(400).json({ error: 'name and contactEmail are required' });
    }

    const rawKey = `mk_${crypto.randomBytes(24).toString('hex')}`;
    const merchant = await prisma.merchant.create({
      data: {
        name: name.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone?.trim() || null,
        apiKeyHash: hashApiKey(rawKey),
        apiKeyPrefix: rawKey.slice(0, 12),
        createdById: req.user.id,
      },
    });

    res.status(201).json({ merchant: toMerchantResponse(merchant), apiKey: rawKey });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/merchants/:id — includes invoices with a computed overdue flag. */
async function getMerchant(req, res, next) {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: req.params.id },
      include: { invoices: { orderBy: { invoiceDate: 'desc' } } },
    });
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    const { invoices, ...rest } = toMerchantResponse(merchant);
    res.json({
      merchant: rest,
      invoices: invoices.map((inv) => ({ ...inv, overdue: isOverdue(inv) })),
    });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/merchants/:id — edit contact details, activate/deactivate, or reissue the API key. */
async function updateMerchant(req, res, next) {
  try {
    const { name, contactEmail, contactPhone, isActive, reissueKey } = req.body;
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (contactEmail !== undefined) data.contactEmail = contactEmail.trim();
    if (contactPhone !== undefined) data.contactPhone = contactPhone?.trim() || null;
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    let apiKey;
    if (reissueKey) {
      apiKey = `mk_${crypto.randomBytes(24).toString('hex')}`;
      data.apiKeyHash = hashApiKey(apiKey);
      data.apiKeyPrefix = apiKey.slice(0, 12);
    }

    const merchant = await prisma.merchant.update({ where: { id: req.params.id }, data });
    res.json({ merchant: toMerchantResponse(merchant), ...(apiKey ? { apiKey } : {}) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/merchants/invoices/:id */
async function getInvoice(req, res, next) {
  try {
    const invoice = await prisma.merchantInvoice.findUnique({
      where: { id: req.params.id },
      include: {
        merchant: { select: { id: true, name: true, contactEmail: true, contactPhone: true, apiKeyPrefix: true, isActive: true } },
        orders: { select: { id: true, orderNumber: true, trackingNumber: true, grandTotal: true, currency: true, createdAt: true } },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ invoice: { ...invoice, overdue: isOverdue(invoice) } });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/merchants/invoices/:id/status
 * Manual settlement path (bank transfer) — the Razorpay Payment Link path
 * marks PAID itself via the payment_link.paid webhook (payment.controller.js).
 */
async function updateInvoiceStatus(req, res, next) {
  try {
    const { status, paymentMethod } = req.body;
    if (!['PAID', 'UNPAID'].includes(status)) return res.status(400).json({ error: 'status must be PAID or UNPAID' });

    const invoice = await prisma.merchantInvoice.update({
      where: { id: req.params.id },
      data: {
        status,
        paymentMethod: status === 'PAID' ? (paymentMethod || 'bank_transfer') : null,
        paidAt: status === 'PAID' ? new Date() : null,
      },
    });

    // Same auto-comment pattern as updateOrderStatus (order.controller.js)
    // — attribution comes from the author relation the comment thread
    // already displays, not baked into the body text.
    await prisma.merchantInvoiceComment.create({
      data: {
        invoiceId: invoice.id,
        authorId: req.user.id,
        body: status === 'PAID'
          ? `Invoice marked as paid via ${invoice.paymentMethod === 'bank_transfer' ? 'bank transfer' : invoice.paymentMethod}.`
          : 'Invoice marked as unpaid.',
      },
    });

    res.json({ invoice: { ...invoice, overdue: isOverdue(invoice) } });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/merchants/invoices/:id/comments */
async function listInvoiceComments(req, res, next) {
  try {
    const comments = await prisma.merchantInvoiceComment.findMany({
      where: { invoiceId: req.params.id },
      include: { author: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ comments });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/merchants/invoices/:id/comments */
async function addInvoiceComment(req, res, next) {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body is required' });

    const invoice = await prisma.merchantInvoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const comment = await prisma.merchantInvoiceComment.create({
      data: { invoiceId: invoice.id, authorId: req.user.id, body: body.trim() },
      include: { author: { select: { fullName: true, email: true } } },
    });
    res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listMerchants,
  createMerchant,
  getMerchant,
  updateMerchant,
  getInvoice,
  updateInvoiceStatus,
  listInvoiceComments,
  addInvoiceComment,
};
