const { prisma } = require('../config/db');
const { generateQuote, round2 } = require('../services/pricingEngine');
const { generateOrderNumber } = require('../utils/orderNumber');

/**
 * POST /api/orders
 * Step 2 of the flow ("Add Details"): takes the chosen service + parcel
 * details + sender/receiver addresses, re-prices server-side (never trust
 * a client-supplied price), persists an immutable pricing snapshot, and
 * creates a DRAFT/PENDING_PAYMENT order ready for the payment step.
 *
 * Works for both logged-in customers (userId attached) and guest checkout
 * (userId omitted — order still gets created, can be claimed on the
 * receipt/track page later by matching orderNumber + email).
 */
async function createOrder(req, res, next) {
  try {
    const {
      serviceCode,
      sender,   // { contactName, phone, line1, line2, city, state, postcode, countryCode }
      receiver, // same shape
      items,    // [{ itemType, actualWeightKg, lengthCm, widthCm, heightCm, quantity }]
      declaredValue = 0,
      contentsDescription,
      taxRate = 0,
    } = req.body;

    if (!serviceCode || !sender || !receiver || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'serviceCode, sender, receiver and at least one item are required' });
    }
    for (const [label, addr] of [['sender', sender], ['receiver', receiver]]) {
      for (const f of ['contactName', 'phone', 'line1', 'city', 'postcode', 'countryCode']) {
        if (!addr[f]) return res.status(400).json({ error: `${label}.${f} is required` });
      }
    }

    // Re-price authoritatively on the server.
    const quote = await generateQuote({
      serviceCode,
      destinationCountryCode: receiver.countryCode,
      items,
      declaredValue,
      taxRate,
    });

    const service = await prisma.service.findUnique({ where: { code: serviceCode } });

    const senderAddress = await prisma.address.create({
      data: { userId: req.user?.id, ...sender },
    });
    const receiverAddress = await prisma.address.create({
      data: { userId: req.user?.id, ...receiver },
    });

    const orderNumber = await generateOrderNumber();

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: req.user?.id,
        serviceId: service.id,
        senderAddressId: senderAddress.id,
        receiverAddressId: receiverAddress.id,
        actualWeightKg: quote.weight.actualWeightKg,
        volumetricWeightKg: quote.weight.volumetricWeightKg,
        chargeableWeightKg: quote.weight.chargeableWeightKg,
        declaredValue,
        contentsDescription,
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
        taxTotal: quote.pricing.taxTotal,
        grandTotal: quote.pricing.grandTotal,
        currency: quote.pricing.currency,
        pricingBreakdown: quote,
        status: 'PENDING_PAYMENT',
      },
      include: { service: true, senderAddress: true, receiverAddress: true, items: true },
    });

    res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
}

/** GET /api/orders (customer: own orders | admin/staff: all, with filters) */
async function listOrders(req, res, next) {
  try {
    const { status, q, page = 1, pageSize = 20 } = req.query;
    const where = {};

    if (req.user.role === 'CUSTOMER') where.userId = req.user.id;
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { trackingNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { service: true, senderAddress: true, receiverAddress: true, payment: true, items: true },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ orders, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/orders/:id */
async function getOrder(req, res, next) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        service: true,
        senderAddress: true,
        receiverAddress: true,
        payment: true,
        label: true,
        items: true,
        trackingEvents: { orderBy: { occurredAt: 'asc' } },
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (req.user.role === 'CUSTOMER' && order.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not your order' });
    }
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/orders/:id/status — admin/staff only, also logs a tracking event */
async function updateOrderStatus(req, res, next) {
  try {
    const { status, location, note } = req.body;
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        status,
        trackingEvents: { create: { status, location, note } },
      },
    });
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

/** POST /api/orders/:id/cancel */
async function cancelOrder(req, res, next) {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (req.user.role === 'CUSTOMER' && order.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not your order' });
    }
    if (['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status)) {
      return res.status(409).json({ error: 'Order already in transit — cannot cancel. Contact support.' });
    }
    const updated = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
    });
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, listOrders, getOrder, updateOrderStatus, cancelOrder, round2 };
