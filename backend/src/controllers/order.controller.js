const crypto = require('crypto');
const { prisma } = require('../config/db');
const { generateQuote, round2, recomputeOrderTotals, resolveZoneForCountry } = require('../services/pricingEngine');
const { generateOrderNumber } = require('../utils/orderNumber');
const { generateInvoiceNumber } = require('../utils/invoiceNumber');
const { WARRANTY_TIERS, FLAT_ADDONS, warrantyLabel } = require('../services/addonCatalog');
const { sendEmail } = require('../services/emailService');
const { sendReceiverBookingNotification } = require('./label.controller');

// UNFINISHED: a customer created a quote + entered details but hasn't
// completed payment yet — the resting status for every newly-created order.
// PENDING_PAYMENT is now reserved for a narrower, staff-driven case: a
// pickup-booking order ("Not sure, book pickup") that's just been given a
// real price via admin/staff Edit order, ready for actual payment — these
// are tracked in the Pickup orders tab rather than Unconfirmed, since
// they're already a confirmed pickup, just awaiting payment completion.
// Both are "not yet paid" for gating purposes (editable, payable), so
// guards throughout this file and payment.controller.js check against
// this combined list rather than the single literal status.
const PAYABLE_STATUSES = ['UNFINISHED', 'PENDING_PAYMENT'];

/**
 * POST /api/orders
 * Step 2 of the flow ("Add Details"): takes the chosen service + parcel
 * details + sender/receiver addresses, re-prices server-side (never trust
 * a client-supplied price), persists an immutable pricing snapshot, and
 * creates a DRAFT/UNFINISHED order ready for the payment step.
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
    const invoiceNumber = await generateInvoiceNumber();

    let orderData;
    if (pricingPending) {
      const service = await prisma.service.findUnique({ where: { code: 'PICKUP' } });
      const zone = await resolveZoneForCountry(receiver.countryCode);
      orderData = {
        orderNumber,
        invoiceNumber,
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
        status: 'UNFINISHED',
      };
    } else {
      // Re-price authoritatively on the server.
      const quote = await generateQuote({
        serviceCode,
        destinationCountryCode: receiver.countryCode,
        items,
        declaredValue,
        taxRate,
        originCountryCode: sender.countryCode,
        originPostcode: sender.postcode,
      });
      const service = await prisma.service.findUnique({ where: { code: serviceCode } });
      orderData = {
        orderNumber,
        invoiceNumber,
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
        status: 'UNFINISHED',
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

/**
 * Shared filter-building logic for both the paginated order list and the
 * Accounts summary — both need the exact same role-scoped visibility rules
 * (customers see only their own orders, staff only their assigned zones).
 */
async function buildOrdersWhere(req) {
  const { status, notStatus, zoneCode, hasUser, q, from, to } = req.query;
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
    where.OR = [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { trackingNumber: { contains: q, mode: 'insensitive' } },
      { receiverAddress: { city: { contains: q, mode: 'insensitive' } } },
      { senderAddress: { city: { contains: q, mode: 'insensitive' } } },
    ];
  }
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999Z`);
  }

  return where;
}

/** GET /api/orders (customer: own orders | admin/staff: all, with filters) */
async function listOrders(req, res, next) {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const where = await buildOrdersWhere(req);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          service: true,
          senderAddress: true,
          receiverAddress: true,
          payment: true,
          items: true,
          labels: true,
          assignedDriver: { select: { id: true, fullName: true } },
        },
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

/**
 * GET /api/orders/summary
 * Aggregate totals for the Accounts overview — same filters/visibility as
 * listOrders, but summed across every matching order, not just the current
 * page.
 */
async function getOrdersSummary(req, res, next) {
  try {
    const where = await buildOrdersWhere(req);
    const orders = await prisma.order.findMany({
      where,
      select: { grandTotal: true, payment: { select: { status: true, amount: true } } },
    });

    let totalPaid = 0;
    let totalDue = 0;
    let totalCredit = 0;
    for (const o of orders) {
      const paid = o.payment?.status === 'SUCCEEDED' ? Number(o.payment.amount) : 0;
      const due = round2(Number(o.grandTotal) - paid);
      totalPaid += paid;
      if (due > 0) totalDue += due;
      else if (due < 0) totalCredit += Math.abs(due);
    }

    res.json({
      totalBookings: orders.length,
      totalPaid: round2(totalPaid),
      totalDue: round2(totalDue),
      totalCredit: round2(totalCredit),
    });
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

/**
 * GET /api/orders/:id/pay — public, shareable payment-link entry point.
 * Deliberately much narrower than the staff-only GET /:id: only ever
 * returns an order that's still awaiting payment, so the link stops
 * working once it's been paid, cancelled, or otherwise moved on — nothing
 * sensitive to leak via a guessed/expired link.
 */
async function getOrderForPayment(req, res, next) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { service: true, senderAddress: true, receiverAddress: true, items: true, addons: true, payment: true },
    });
    if (!order || !PAYABLE_STATUSES.includes(order.status)) {
      return res.status(404).json({ error: 'This payment link is no longer valid.' });
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
    const existing = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { senderAddress: true, receiverAddress: true },
    });
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

    // Pickup-booking orders ("Not sure, book pickup") never got a receiver
    // alert at booking time — it only goes out once payment is actually
    // confirmed. Staff manually marking cash collected as PAID is one way
    // that happens (the online payment flow's own markOrderPaid() covers
    // the other).
    if (existing.pricingPending && status === 'PAID' && existing.status !== 'PAID') {
      await sendReceiverBookingNotification({ ...order, senderAddress: existing.senderAddress, receiverAddress: existing.receiverAddress });
    }

    res.json({ order });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/orders/assign-driver
 * ADMIN/STAFF: sends one or more pickup jobs directly to a driver account in
 * a single action. The driver then sees these in their own portal and marks
 * each PICKED_UP once collected in person.
 */
async function assignDriver(req, res, next) {
  try {
    const { orderIds, driverId } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'orderIds must be a non-empty array' });
    }
    if (!driverId) return res.status(400).json({ error: 'driverId is required' });

    const driver = await prisma.user.findUnique({ where: { id: driverId } });
    if (!driver || driver.role !== 'DRIVER') {
      return res.status(400).json({ error: 'driverId must belong to a driver account' });
    }

    await prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { assignedDriverId: driverId, driverAssignedAt: new Date() },
    });

    await prisma.orderComment.createMany({
      data: orderIds.map((orderId) => ({
        orderId,
        authorId: req.user.id,
        body: `Pickup job sent to driver ${driver.fullName}.`,
      })),
    });

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, assignedDriver: { select: { id: true, fullName: true } } },
    });
    res.json({ orders });
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
 * PATCH /api/orders/:id/details
 * Edits an order's service/items/destination/addresses and re-prices it
 * server-side. Two callers:
 *  - The booking flow itself (Details.jsx), when a customer navigates back
 *    to Quote/Details and resubmits — this updates the in-progress order in
 *    place instead of creating a duplicate. Only allowed pre-payment.
 *  - Staff/admin "Edit order" action on an existing booking, at any status
 *    (per business decision — orders can be corrected even after pickup).
 * Existing add-ons/promo carry over; recomputeOrderTotals folds them into
 * the new grandTotal. Never touches order.status or payment records — the
 * caller (frontend) is responsible for surfacing any balance due/credit
 * against what was already paid.
 */
async function updateOrderDetails(req, res, next) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { payment: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const isStaff = req.user && ['ADMIN', 'STAFF'].includes(req.user.role);
    if (!PAYABLE_STATUSES.includes(order.status) && !isStaff) {
      return res.status(409).json({ error: 'This order can no longer be edited from the booking flow. Contact support.' });
    }

    const {
      serviceCode,
      sender,
      receiver,
      items,
      declaredValue = 0,
      contentsDescription,
      pricingPending = false,
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

    let orderData;
    let newItems;
    if (pricingPending) {
      const service = await prisma.service.findUnique({ where: { code: 'PICKUP' } });
      const zone = await resolveZoneForCountry(receiver.countryCode);
      orderData = {
        serviceId: service.id,
        actualWeightKg: 0,
        volumetricWeightKg: 0,
        chargeableWeightKg: 0,
        declaredValue,
        contentsDescription,
        pricingPending: true,
        zoneCode: zone.code,
        baseFreight: 0,
        surchargesTotal: 0,
        taxTotal: 0,
        grandTotal: 0,
      };
      newItems = items.map((it) => ({
        itemType: it.itemType || 'Box',
        actualWeightKg: 0,
        lengthCm: 0,
        widthCm: 0,
        heightCm: 0,
        quantity: Number(it.quantity) || 1,
        volumetricWeightKg: 0,
        chargeableWeightKg: 0,
      }));
    } else {
      const quote = await generateQuote({
        serviceCode,
        destinationCountryCode: receiver.countryCode,
        items,
        declaredValue,
        taxRate: Number(order.taxRate) || 0,
        originCountryCode: sender.countryCode,
        originPostcode: sender.postcode,
      });
      const service = await prisma.service.findUnique({ where: { code: serviceCode } });
      orderData = {
        serviceId: service.id,
        actualWeightKg: quote.weight.actualWeightKg,
        volumetricWeightKg: quote.weight.volumetricWeightKg,
        chargeableWeightKg: quote.weight.chargeableWeightKg,
        declaredValue,
        contentsDescription,
        pricingPending: false,
        zoneCode: quote.zone.code,
        baseFreight: quote.pricing.baseFreight,
        surchargesTotal: quote.pricing.surchargesTotal,
        taxTotal: quote.pricing.taxTotal,
        grandTotal: quote.pricing.grandTotal,
        currency: quote.pricing.currency,
        pricingBreakdown: quote,
      };
      // A pickup-booking order ("Not sure, book pickup") just getting a real
      // price for the first time (staff assessed the parcel and priced it)
      // needs to go through actual payment — not be treated as a
      // post-payment edit of an already-settled order.
      if (order.pricingPending) {
        orderData.status = 'PENDING_PAYMENT';
      }
      newItems = quote.items.map((it) => ({
        itemType: it.itemType,
        actualWeightKg: it.actualWeightKg,
        lengthCm: it.lengthCm,
        widthCm: it.widthCm,
        heightCm: it.heightCm,
        quantity: it.quantity,
        volumetricWeightKg: it.volumetricWeightKg,
        chargeableWeightKg: it.chargeableWeightKg,
      }));
    }

    const previousTotal = Number(order.grandTotal);

    await prisma.$transaction([
      prisma.address.update({ where: { id: order.senderAddressId }, data: sender }),
      prisma.address.update({ where: { id: order.receiverAddressId }, data: receiver }),
      prisma.orderItem.deleteMany({ where: { orderId: order.id } }),
      prisma.orderItem.createMany({ data: newItems.map((it) => ({ ...it, orderId: order.id })) }),
      prisma.order.update({ where: { id: order.id }, data: orderData }),
    ]);

    const updated = await recomputeOrderTotals(order.id);

    const amountPaid = order.payment?.status === 'SUCCEEDED' ? Number(order.payment.amount) : 0;
    const balance = round2(Number(updated.grandTotal) - amountPaid);

    if (isStaff) {
      await prisma.orderComment.create({
        data: {
          orderId: order.id,
          authorId: req.user.id,
          body: `Order details edited — total changed from ₹${previousTotal.toFixed(2)} to ₹${Number(updated.grandTotal).toFixed(2)}.${amountPaid > 0 ? ` Already paid ₹${amountPaid.toFixed(2)} — ${balance > 0 ? `₹${balance.toFixed(2)} due` : balance < 0 ? `₹${Math.abs(balance).toFixed(2)} credit owed to customer` : 'fully settled'}.` : ''}`,
        },
      });
    }

    res.json({ order: updated, amountPaid, balance });
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
    if (!PAYABLE_STATUSES.includes(order.status)) {
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
    if (!PAYABLE_STATUSES.includes(order.status)) {
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

/** POST /api/orders/:id/send-payment-link-email — ADMIN/STAFF: emails the pay-by-link URL to the customer's OTP-verified email */
async function sendPaymentLinkEmail(req, res, next) {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!PAYABLE_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: 'Order is no longer awaiting payment' });
    }
    if (!order.otpEmail || !order.otpVerifiedAt) {
      return res.status(400).json({ error: 'Verify the customer\'s email first' });
    }

    const base = (process.env.CLIENT_ORIGIN || 'https://www.comonn.in').split(',')[0].trim();
    const link = `${base}/pay/${order.id}`;

    await sendEmail({
      to: order.otpEmail,
      from: process.env.EMAIL_FROM_NOREPLY || 'Comonn <noreply@comonn.in>',
      subject: `Complete payment for order ${order.orderNumber}`,
      html: `<div style="font-family:sans-serif;"><p>Your Comonn order <b>${order.orderNumber}</b> is ready for payment.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#FF5A36;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;">Complete payment</a></p><p style="color:#8A93A6;font-size:13px;">Or copy this link: ${link}</p></div>`,
    });

    res.json({ ok: true });
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
    if (!PAYABLE_STATUSES.includes(order.status)) {
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
  getOrdersSummary,
  getOrder,
  updateOrderStatus,
  assignDriver,
  cancelOrder,
  listOrderComments,
  addOrderComment,
  updateOrderDetails,
  updateAddons,
  sendOtp,
  verifyOtp,
  sendPaymentLinkEmail,
  applyPromo,
  getOrderForPayment,
  round2,
  PAYABLE_STATUSES,
};
