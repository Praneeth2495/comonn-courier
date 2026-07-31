const { prisma } = require('../config/db');
const { generateQuote } = require('../services/pricingEngine');
const { generateOrderNumber } = require('../utils/orderNumber');
const { generateInvoiceNumber } = require('../utils/invoiceNumber');
const { INVOICE_DUE_DAYS } = require('../services/merchantInvoiceGenerator');
const { notifyOrderStatusChange } = require('../services/orderNotifications');

// Blocks new shipments once a merchant has any invoice more than
// INVOICE_DUE_DAYS past its invoiceDate and still unpaid — reinstated only
// once they pay (manually by admin/staff, or via the invoice's payment
// link), never automatically beyond that.
async function findOverdueInvoice(merchantId) {
  const cutoff = new Date(Date.now() - INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000);
  return prisma.merchantInvoice.findFirst({
    where: { merchantId, status: 'UNPAID', invoiceDate: { lt: cutoff } },
  });
}

function validateAddress(label, addr, res) {
  if (!addr) {
    res.status(400).json({ error: `${label} is required` });
    return false;
  }
  for (const f of ['contactName', 'phone', 'line1', 'city', 'postcode', 'countryCode']) {
    if (!addr[f]) {
      res.status(400).json({ error: `${label}.${f} is required` });
      return false;
    }
  }
  return true;
}

/** POST /api/v1/quotes — same pricing engine the consumer checkout uses, no persistence. */
async function createQuote(req, res, next) {
  try {
    const { serviceCode, destinationCountryCode, destinationPostcode, originCountryCode, originPostcode, items, declaredValue = 0, taxRate = 0 } = req.body;
    if (!serviceCode) return res.status(400).json({ error: 'serviceCode is required' });
    if (!destinationCountryCode || !destinationPostcode) return res.status(400).json({ error: 'destinationCountryCode and destinationPostcode are required' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });

    const quote = await generateQuote({
      serviceCode,
      destinationCountryCode,
      destinationPostcode,
      items,
      declaredValue,
      taxRate,
      originCountryCode,
      originPostcode,
    });
    res.json({ quote });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/shipments
 * Merchant equivalent of the consumer createOrder (order.controller.js) —
 * same request shape, but skips the OTP/DG-checkbox/live-checkout gates a
 * walk-up customer goes through: the merchant is trusted and postpaid, so
 * the order is created already PAID. dgAcknowledged is a required boolean
 * in the payload instead of a UI checkbox. Billing happens later via the
 * daily consolidated invoice (see merchantInvoiceGenerator.js), not here.
 */
async function createShipment(req, res, next) {
  try {
    const { serviceCode, sender, receiver, items, declaredValue = 0, contentsDescription, taxRate = 0, dgAcknowledged } = req.body;

    if (!serviceCode) return res.status(400).json({ error: 'serviceCode is required' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });
    if (!validateAddress('sender', sender, res)) return;
    if (!validateAddress('receiver', receiver, res)) return;
    if (dgAcknowledged !== true) {
      return res.status(400).json({ error: 'dgAcknowledged must be true — confirm the shipment contains no dangerous goods' });
    }

    const overdueInvoice = await findOverdueInvoice(req.merchant.id);
    if (overdueInvoice) {
      return res.status(402).json({
        error: 'Payment overdue — new shipments are blocked until the outstanding invoice is paid.',
        invoiceId: overdueInvoice.id,
        amountDue: overdueInvoice.totalAmount,
      });
    }

    const senderAddress = await prisma.address.create({ data: { ...sender } });
    const receiverAddress = await prisma.address.create({ data: { ...receiver } });

    const orderNumber = await generateOrderNumber();
    const invoiceNumber = await generateInvoiceNumber();

    const quote = await generateQuote({
      serviceCode,
      destinationCountryCode: receiver.countryCode,
      destinationPostcode: receiver.postcode,
      items,
      declaredValue,
      taxRate,
      originCountryCode: sender.countryCode,
      originPostcode: sender.postcode,
    });
    const service = await prisma.service.findUnique({ where: { code: serviceCode } });

    const order = await prisma.order.create({
      data: {
        orderNumber,
        invoiceNumber,
        merchantId: req.merchant.id,
        serviceId: service.id,
        senderAddressId: senderAddress.id,
        receiverAddressId: receiverAddress.id,
        actualWeightKg: quote.weight.actualWeightKg,
        volumetricWeightKg: quote.weight.volumetricWeightKg,
        chargeableWeightKg: quote.weight.chargeableWeightKg,
        declaredValue,
        contentsDescription,
        dgAcknowledged: true,
        items: {
          create: quote.items.map((it) => ({
            itemType: it.itemType,
            actualWeightKg: it.actualWeightKg,
            lengthCm: it.lengthCm,
            widthCm: it.widthCm,
            heightCm: it.heightCm,
            quantity: it.quantity,
            volumetricWeightKg: it.volumetricWeightKg,
            chargeableWeightKg: it.chargeableWeightKg,
          })),
        },
        zoneCode: quote.zone.code,
        baseFreight: quote.pricing.baseFreight,
        surchargesTotal: quote.pricing.surchargesTotal,
        taxRate: quote.pricing.taxRate,
        taxTotal: quote.pricing.taxTotal,
        grandTotal: quote.pricing.grandTotal,
        currency: quote.pricing.currency,
        pricingBreakdown: quote,
        status: 'PAID',
        trackingNumber: orderNumber,
      },
    });

    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'merchant_credit',
        method: 'invoice',
        amount: quote.pricing.grandTotal,
        currency: quote.pricing.currency,
        status: 'SUCCEEDED',
      },
    });

    await prisma.trackingEvent.create({
      data: { orderId: order.id, status: 'PAID', note: `Booked via merchant API (${req.merchant.name})` },
    });
    notifyOrderStatusChange(order.id, 'PAID');

    res.status(201).json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      trackingNumber: order.trackingNumber,
      grandTotal: order.grandTotal,
      currency: order.currency,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/v1/shipments/:trackingNumber — scoped to the calling merchant. */
async function getShipment(req, res, next) {
  try {
    const order = await prisma.order.findFirst({
      where: {
        merchantId: req.merchant.id,
        OR: [{ trackingNumber: req.params.trackingNumber }, { orderNumber: req.params.trackingNumber }],
      },
      include: {
        service: true,
        receiverAddress: { select: { city: true, state: true, countryCode: true } },
        trackingEvents: { orderBy: { occurredAt: 'asc' } },
        labels: true,
        invoice: true,
      },
    });
    if (!order) return res.status(404).json({ error: 'No shipment found for that tracking/order number' });

    res.json({
      orderNumber: order.orderNumber,
      trackingNumber: order.trackingNumber,
      status: order.status,
      service: order.service.name,
      destination: order.receiverAddress,
      events: order.trackingEvents,
      labels: order.labels.map((l) => ({ id: l.id, packageIndex: l.packageIndex, downloadUrl: `/labels/download/${l.id}` })),
      invoice: order.invoice ? { downloadUrl: `/labels/invoice/download/${order.id}` } : null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createQuote, createShipment, getShipment };
