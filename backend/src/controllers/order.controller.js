const crypto = require('crypto');
const { prisma } = require('../config/db');
const { generateQuote, round2, recomputeOrderTotals } = require('../services/pricingEngine');
const { generateOrderNumber } = require('../utils/orderNumber');
const { WARRANTY_TIERS, FLAT_ADDONS, warrantyLabel } = require('../services/addonCatalog');
const { sendEmail } = require('../services/emailService');

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
        taxRate: quote.pricing.taxRate,
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
    const { status, notStatus, zoneCode, hasUser, q, page = 1, pageSize = 20 } = req.query;
    const where = {};

    if (req.user.role === 'CUSTOMER') where.userId = req.user.id;
    // status may be a single value or a comma-separated list (for admin tab groupings)
    if (status) {
      const statuses = String(status).split(',').filter(Boolean);
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }
    if (notStatus) {
      where.status = { notIn: String(notStatus).split(',').filter(Boolean) };
    }
    if (zoneCode) where.zoneCode = zoneCode;
    if (hasUser === 'true') where.userId = { not: null };
    if (hasUser === 'false') where.userId = null;
    if (q) {
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { trackingNumber: { contains: q, mode: 'insensitive' } },
        { receiverAddress: { city: { contains: q, mode: 'insensitive' } } },
        { senderAddress: { city: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { service: true, senderAddress: true, receiverAddress: true, payment: true, items: true, labels: true },
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
        labels: true,
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

/**
 * PATCH /api/orders/:id/addons
 * Payment page: selects transit-warranty tier + flat add-ons (heavy-duty
 * cardboard/packing/wrapping), pickup date, and the dangerous-goods
 * acknowledgment. Replaces the order's add-on selection wholesale each
 * call (simplest way to handle toggling) and recomputes totals.
 */
async function updateAddons(req, res, next) {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'PENDING_PAYMENT') {
      return res.status(409).json({ error: 'Order is no longer awaiting payment' });
    }

    const { warrantyCoverage, addons = [], pickupDate, dgAcknowledged } = req.body;
    const totalBoxQty = order.items.reduce((sum, it) => sum + it.quantity, 0) || 1;

    const rows = [];
    if (warrantyCoverage !== undefined && warrantyCoverage !== null) {
      const tier = WARRANTY_TIERS.find((t) => t.coverage === Number(warrantyCoverage));
      if (!tier) return res.status(400).json({ error: 'Unknown warranty tier' });
      rows.push({ orderId: order.id, code: 'WARRANTY', label: warrantyLabel(tier.coverage), quantity: 1, unitPrice: tier.price, amount: tier.price });
    }
    for (const code of addons) {
      const def = FLAT_ADDONS[code];
      if (!def) return res.status(400).json({ error: `Unknown addon "${code}"` });
      const quantity = def.perBox ? totalBoxQty : 1;
      rows.push({ orderId: order.id, code, label: def.label, quantity, unitPrice: def.unitPrice, amount: round2(def.unitPrice * quantity) });
    }

    await prisma.$transaction([
      prisma.orderAddon.deleteMany({ where: { orderId: order.id } }),
      ...(rows.length ? [prisma.orderAddon.createMany({ data: rows })] : []),
    ]);

    const dataUpdate = {};
    if (pickupDate !== undefined) dataUpdate.pickupDate = pickupDate;
    if (dgAcknowledged !== undefined) dataUpdate.dgAcknowledged = Boolean(dgAcknowledged);
    if (Object.keys(dataUpdate).length) await prisma.order.update({ where: { id: order.id }, data: dataUpdate });

    const updated = await recomputeOrderTotals(order.id);
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

/** POST /api/orders/:id/send-otp — emails a 6-digit code, valid for 10 minutes */
async function sendOtp(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'PENDING_PAYMENT') {
      return res.status(409).json({ error: 'Order is no longer awaiting payment' });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.order.update({
      where: { id: order.id },
      data: { otpEmail: email, otpCode: code, otpExpiresAt, otpVerifiedAt: null },
    });

    await sendEmail({
      to: email,
      from: process.env.EMAIL_FROM_VERIFY || 'Comonn Verification <verify@comonn.in>',
      subject: 'Your Comonn verification code',
      html: `<div style="font-family:sans-serif;"><p>Your Comonn verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p><p style="color:#8A93A6;font-size:13px;">This code expires in 10 minutes.</p></div>`,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** POST /api/orders/:id/verify-otp */
async function verifyOtp(req, res, next) {
  try {
    const { code } = req.body;
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.otpCode || !order.otpExpiresAt) {
      return res.status(400).json({ error: 'No verification code was sent for this order' });
    }
    if (order.otpExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Verification code expired — please resend' });
    }
    if (order.otpCode !== String(code)) {
      return res.status(400).json({ error: 'Incorrect verification code' });
    }

    await prisma.order.update({ where: { id: order.id }, data: { otpVerifiedAt: new Date(), otpCode: null } });
    res.json({ ok: true, verified: true });
  } catch (err) {
    next(err);
  }
}

/** POST /api/orders/:id/promo */
async function applyPromo(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });

    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'PENDING_PAYMENT') {
      return res.status(409).json({ error: 'Order is no longer awaiting payment' });
    }

    const promo = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });
    if (!promo || !promo.isActive) return res.status(404).json({ error: 'Invalid promo code' });
    if (promo.expiresAt && promo.expiresAt < new Date()) return res.status(400).json({ error: 'Promo code has expired' });
    if (promo.maxRedemptions && promo.timesRedeemed >= promo.maxRedemptions) {
      return res.status(400).json({ error: 'Promo code has reached its redemption limit' });
    }

    if (order.promoCode !== promo.code) {
      await prisma.promoCode.update({ where: { id: promo.id }, data: { timesRedeemed: { increment: 1 } } });
    }
    await prisma.order.update({ where: { id: order.id }, data: { promoCode: promo.code } });

    const updated = await recomputeOrderTotals(order.id);
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
  cancelOrder,
  updateAddons,
  sendOtp,
  verifyOtp,
  applyPromo,
  round2,
};
