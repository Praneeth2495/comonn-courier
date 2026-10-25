const { prisma } = require('../config/db');
const { generateQuote } = require('../services/pricingEngine');
const { generateOrderNumber } = require('../utils/orderNumber');
const { generateInvoiceNumber } = require('../utils/invoiceNumber');
const { INVOICE_DUE_DAYS } = require('../services/merchantInvoiceGenerator');
const { notifyOrderStatusChange } = require('../services/orderNotifications');
const { findMissingAddressField } = require('../utils/addressValidation');

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
  const err = findMissingAddressField(addr, label);
  if (err) {
    res.status(400).json({ error: err });
    return false;
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

    // Pricing runs BEFORE any write — a quote failure (bad rate card, zone
    // not found) never touches the database, not even to consume a
    // sequence number.
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
    // generateQuote already looked this service up internally (and
    // returns its id) — no need to query it again here.

    // Sequence numbers, both addresses, and the order are atomic — a
    // failure anywhere in here rolls back the numbers too, same reasoning
    // as the consumer booking flow (order.controller.js's createOrder).
    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = await generateOrderNumber(tx);
      const invoiceNumber = await generateInvoiceNumber(tx);
      const senderAddress = await tx.address.create({ data: { ...sender } });
      const receiverAddress = await tx.address.create({ data: { ...receiver } });
      return tx.order.create({
        data: {
          orderNumber,
          invoiceNumber,
          merchantId: req.merchant.id,
          serviceId: quote.service.id,
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
          airportCode: quote.airportCode,
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

module.exports = { createQuote, createShipment };
