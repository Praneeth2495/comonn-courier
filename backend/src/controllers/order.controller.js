const crypto = require('crypto');
const { prisma } = require('../config/db');
const { generateQuote, round2, recomputeOrderTotals, resolveZoneForCountry } = require('../services/pricingEngine');
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
      pricingPending = false, // "Not sure, book pickup": weight unknown, no price, cash at pickup
    } = req.body;

    if (!pricingPending && !serviceCode) {
      return res.status(400).json({ error: 'serviceCode is required' });
    }
    if (!sender || !receiver || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'sender, receiver and at least one item are required' });
    }
    for (const [label, addr] of [['sender', sender], ['receiver', receiver]]) {
      for (const f of ['contactName', 'phone', 'line1', 'city', 'postcode', 'countryCode']) {
        if (!addr[f]) return res.status(400).json({ error: `${label}.${f} is required` });
      }
    }

    const senderAddress = await prisma.address.create({
      data: { userId: req.user?.id, ...sender },
    });
    const receiverAddress = await prisma.address.create({
      data: { userId: req.user?.id, ...receiver },
    });

    const orderNumber = await generateOrderNumber();

    let orderData;
    if (pricingPending) {
      const service = await prisma.service.findUnique({ where: { code: 'PICKUP' } });
      const zone = await resolveZoneForCountry(receiver.countryCode);
      orderData = {
        orderNumber,
        userId: req.user?.id,
        serviceId: service.id,
        senderAddressId: senderAddress.id,
        receiverAddressId: receiverAddress.id,
        actualWeightKg: 0,
        volumetricWeightKg: 0,
        chargeableWeightKg: 0,
        declaredValue,
        contentsDescription,
        pricingPending: true,
        items: {
          create: items.map((it) => ({
            itemType: it.itemType || 'Box',
            actualWeightKg: 0,
            lengthCm: 0,
            widthCm: 0,
            heightCm: 0,
            quantity: Number(it.quantity) || 1,
            volumetricWeightKg: 0,
            chargeableWeightKg: 0,
          })),
        },
        zoneCode: zone.code,
        baseFreight: 0,
        surchargesTotal: 0,
        taxRate: 0,
        taxTotal: 0,
        grandTotal: 0,
        currency: 'INR',
        status: 'PENDING_PAYMENT',
      };
    } else {
      // Re-price authoritatively on the server.
      const quote = await generateQuote({
        serviceCode,
        destinationCountryCode: receiver.countryCode,
        items,
        declaredValue,
        taxRate,
      });
      const service = await prisma.service.findUnique({ where: { code: serviceCode } });
      orderData = {
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
      };
    }

    const order = await prisma.order.create({
      data: orderData,
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
    const { status, notStatus, zoneCode, hasUser, includeConfirmedPickups, excludeConfirmedPickups, q, page = 1, pageSize = 20 } = req.query;
    const where = {};
    const and = [];

    if (req.user.role === 'CUSTOMER') where.userId = req.user.id;
    // status may be a single value or a comma-separated list (for admin tab groupings)
    if (status) {
      const statuses = String(status).split(',').filter(Boolean);
      const statusCondition = { status: statuses.length > 1 ? { in: statuses } : statuses[0] };
      // "Pickup orders" also wants confirmed cash pickup bookings — these
      // stay PENDING_PAYMENT (cash isn't collected until the courier
      // weighs the parcel) rather than PAID, so they need an explicit OR
      // rather than falling under the plain status list above.
      if (includeConfirmedPickups === 'true') {
        and.push({ OR: [statusCondition, { pricingPending: true, trackingNumber: { not: null }, status: 'PENDING_PAYMENT' }] });
      } else {
        and.push(statusCondition);
      }
    }
    if (notStatus) {
      and.push({ status: { notIn: String(notStatus).split(',').filter(Boolean) } });
    }
    // "Unconfirmed orders" means the customer hasn't finished booking —
    // a confirmed cash pickup (trackingNumber assigned) doesn't belong
    // there even though it's still technically PENDING_PAYMENT.
    if (excludeConfirmedPickups === 'true') {
      and.push({ NOT: { pricingPending: true, trackingNumber: { not: null } } });
    }
    if (zoneCode) where.zoneCode = zoneCode;
    if (hasUser === 'true') where.userId = { not: null };
    if (hasUser === 'false') where.userId = null;

    // Admin-controlled zone visibility: STAFF only ever see orders in zones
    // they've been individually assigned, regardless of what zoneCode
    // filter is requested (a staff member with no assignments sees none).
    if (req.user.role === 'STAFF') {
      const assignments = await prisma.staffZoneAssignment.findMany({
        where: { userId: req.user.id },
        select: { zone: { select: { code: true } } },
      });
      const visibleCodes = assignments.map((a) => a.zone.code);
      where.zoneCode = zoneCode && visibleCodes.includes(zoneCode) ? zoneCode : { in: visibleCodes };
    }
    if (q) {
      and.push({
        OR: [
          { orderNumber: { contains: q, mode: 'insensitive' } },
          { trackingNumber: { contains: q, mode: 'insensitive' } },
          { receiverAddress: { city: { contains: q, mode: 'insensitive' } } },
          { senderAddress: { city: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    if (and.length > 0) where.AND = and;

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
function titleCaseStatus(status) {
  return status.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
}

async function updateOrderStatus(req, res, next) {
  try {
    const { status, location, note } = req.body;
    const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        status,
        trackingEvents: { create: { status, location, note } },
      },
    });

    // Auto-log a system comment so the change is visible (with who/when) in
    // the same internal comment history admins & staff already check.
    if (status !== existing.status) {
      await prisma.orderComment.create({
        data: {
          orderId: order.id,
          authorId: req.user.id,
          body: `Order status updated to ${titleCaseStatus(status)}.`,
        },
      });
    }

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

function siteUrl(pathname) {
  const base = (process.env.CLIENT_ORIGIN || 'https://www.comonn.in').split(',')[0].trim();
  return `${base}${pathname}`;
}

async function sendPriceConfirmedEmail(order) {
  const to = order.otpEmail || order.senderAddress?.email;
  if (!to) return;
  try {
    await sendEmail({
      to,
      from: process.env.EMAIL_FROM_NOREPLY || 'Comonn <noreply@comonn.in>',
      subject: `Your pickup has been weighed — Order ${order.orderNumber}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#171C2C;">
          <h2 style="color:#0E1B3D;margin-bottom:6px;">Your price is confirmed</h2>
          <p style="font-size:13.5px;color:#5B6478;line-height:1.6;">
            Our courier has weighed and measured your shipment for order <b>${order.orderNumber}</b>.
            Chargeable weight: <b>${Number(order.chargeableWeightKg).toFixed(2)} kg</b>.
            Total: <b>₹${Number(order.grandTotal).toFixed(2)}</b>.
          </p>
          <p style="margin:22px 0;"><a href="${siteUrl('/dashboard')}" style="background:#FF5A36;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Complete payment →</a></p>
          <p style="font-size:12px;color:#8A93A6;">Go to Active orders and tap "Complete booking" to pay online, add extra protection if you'd like, and get your shipping label.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('sendPriceConfirmedEmail failed:', err.message);
  }
}

/**
 * PATCH /api/orders/:id/finalize-pricing — ADMIN/STAFF only.
 * For a "Not sure, book pickup" order: once the courier has physically
 * weighed/measured the package, records the real per-item weight/
 * dimensions and chosen service, and recomputes pricing through the same
 * engine as an upfront quote. Clears pricingPending — the order was
 * already sitting at PENDING_PAYMENT (confirmCashBooking never moves it
 * to PAID, since no money changes hands until real payment), so no
 * status change is needed here; the customer's next visit to Payment
 * now shows the normal online flow (Razorpay + add-ons) instead of the
 * cash-only one, since both are gated on pricingPending.
 */
async function finalizePricing(req, res, next) {
  try {
    const { serviceCode, items } = req.body;
    if (!serviceCode) return res.status(400).json({ error: 'serviceCode is required' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }
    for (const it of items) {
      for (const f of ['actualWeightKg', 'lengthCm', 'widthCm', 'heightCm', 'quantity']) {
        if (!it[f] || Number(it[f]) <= 0) return res.status(400).json({ error: `Every item needs a positive ${f}` });
      }
    }

    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { receiverAddress: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.pricingPending) return res.status(409).json({ error: 'This order already has a confirmed price' });
    if (order.status !== 'PENDING_PAYMENT' || !order.trackingNumber) {
      return res.status(409).json({ error: 'Order is not a confirmed pickup booking awaiting weighing' });
    }

    const quote = await generateQuote({
      serviceCode,
      destinationCountryCode: order.receiverAddress.countryCode,
      items,
      declaredValue: Number(order.declaredValue),
      taxRate: 0,
    });
    const service = await prisma.service.findUnique({ where: { code: serviceCode } });

    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.payment.deleteMany({ where: { orderId: order.id } });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        serviceId: service.id,
        pricingPending: false,
        actualWeightKg: quote.weight.actualWeightKg,
        volumetricWeightKg: quote.weight.volumetricWeightKg,
        chargeableWeightKg: quote.weight.chargeableWeightKg,
        baseFreight: quote.pricing.baseFreight,
        surchargesTotal: quote.pricing.surchargesTotal,
        taxRate: quote.pricing.taxRate,
        taxTotal: quote.pricing.taxTotal,
        grandTotal: quote.pricing.grandTotal,
        currency: quote.pricing.currency,
        pricingBreakdown: quote,
        trackingEvents: {
          create: {
            status: 'PENDING_PAYMENT',
            note: `Weighed by courier: ${quote.weight.chargeableWeightKg} kg chargeable. Price confirmed at ₹${quote.pricing.grandTotal} — awaiting payment.`,
          },
        },
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
      },
      include: { service: true, senderAddress: true, receiverAddress: true, items: true },
    });

    await sendPriceConfirmedEmail(updated);

    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

/** GET /api/orders/:id/comments — internal admin/staff notes, never exposed publicly */
async function listOrderComments(req, res, next) {
  try {
    const comments = await prisma.orderComment.findMany({
      where: { orderId: req.params.id },
      include: { author: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ comments });
  } catch (err) {
    next(err);
  }
}

/** POST /api/orders/:id/comments */
async function addOrderComment(req, res, next) {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body is required' });

    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const comment = await prisma.orderComment.create({
      data: { orderId: order.id, authorId: req.user.id, body: body.trim() },
      include: { author: { select: { fullName: true, email: true } } },
    });
    res.status(201).json({ comment });
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
  finalizePricing,
  listOrderComments,
  addOrderComment,
  updateAddons,
  sendOtp,
  verifyOtp,
  applyPromo,
  round2,
};
