const { prisma } = require('../config/db');
const { round2 } = require('../services/pricingEngine');
const { createOrder: createRazorpayOrder, verifyPaymentSignature, refundPayment } = require('../services/paymentService');

const BOX_STORAGE_ADDRESS = process.env.BOX_STORAGE_ADDRESS || '<office address not configured — set BOX_STORAGE_ADDRESS>';

function computeAmount(monthlyRate, days) {
  return round2((Number(monthlyRate) / 30) * days);
}

// Adds the customer-facing "<office address>, Box <N>" string whenever a
// box has been assigned — same BOX_STORAGE_ADDRESS env var boxBookingExpiry.js
// uses for the expiry-reminder email, so both surfaces always agree.
function withBoxAddress(booking) {
  if (!booking?.box) return booking;
  return { ...booking, boxAddress: `${BOX_STORAGE_ADDRESS}, Box ${booking.box.number}` };
}

/** GET /api/box-bookings/sizes — public, shows live availability so sold-out sizes can be greyed out. */
async function listBoxSizes(req, res, next) {
  try {
    const sizes = await prisma.boxSize.findMany({ where: { isActive: true }, orderBy: { monthlyRate: 'asc' } });
    const withAvailability = await Promise.all(
      sizes.map(async (size) => {
        const availableCount = await prisma.box.count({ where: { boxSizeId: size.id, status: 'AVAILABLE' } });
        return { ...size, availableCount };
      })
    );
    res.json({ sizes: withAvailability });
  } catch (err) {
    next(err);
  }
}

/** POST /api/box-bookings — starts checkout. No box is assigned yet (see markBoxBookingPaid). */
async function createBooking(req, res, next) {
  try {
    const { boxSizeId, days } = req.body;
    const daysNum = Number(days);
    if (!boxSizeId || !Number.isInteger(daysNum) || daysNum <= 0) {
      return res.status(400).json({ error: 'boxSizeId and a positive integer days are required' });
    }

    const size = await prisma.boxSize.findUnique({ where: { id: boxSizeId } });
    if (!size || !size.isActive) return res.status(404).json({ error: 'Box size not found' });

    const availableCount = await prisma.box.count({ where: { boxSizeId: size.id, status: 'AVAILABLE' } });
    if (availableCount <= 0) return res.status(409).json({ error: `No ${size.name} boxes available right now` });

    const totalAmount = computeAmount(size.monthlyRate, daysNum);

    const booking = await prisma.boxBooking.create({
      data: {
        boxSizeId: size.id,
        customerId: req.user.id,
        days: daysNum,
        monthlyRate: size.monthlyRate,
        totalAmount,
        currency: size.currency,
        status: 'PENDING',
      },
    });

    const { providerOrderId } = await createCheckoutPayment(booking, daysNum, totalAmount, size.currency);

    res.status(201).json({ booking, providerOrderId, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    next(err);
  }
}

/** Creates the Razorpay order + matching BoxPayment row — shared by createBooking and renewBooking. */
async function createCheckoutPayment(booking, daysNum, amount, currency) {
  const rzpOrder = await createRazorpayOrder({
    amount,
    currency,
    orderId: booking.id,
    orderNumber: booking.id,
  });
  await prisma.boxPayment.create({
    data: {
      boxBookingId: booking.id,
      days: daysNum,
      providerOrderId: rzpOrder.id,
      amount,
      currency,
    },
  });
  return { providerOrderId: rzpOrder.id };
}

/**
 * The payment-confirmation critical section — called from both the
 * client-side /confirm call and the shared Razorpay webhook, same
 * idempotent pattern as markOrdersPaidForProviderOrder in
 * payment.controller.js. Handles BOTH the initial payment (booking still
 * PENDING — assigns a box) and any later renewal payment (booking already
 * ACTIVE/EXPIRED — just extends endDate), since both share the same
 * BoxPayment→BoxBooking lookup keyed by providerOrderId.
 *
 * Box assignment happens here (payment-confirmed time), not at checkout
 * start, so an abandoned checkout never holds a physical box hostage. If
 * two customers race for the last box of a size, the loser gets
 * auto-refunded.
 */
async function markBoxBookingPaid(providerOrderId, providerPaymentId) {
  const payment = await prisma.boxPayment.findUnique({ where: { providerOrderId } });
  if (!payment || payment.status === 'SUCCEEDED') return;

  const booking = await prisma.boxBooking.findUnique({ where: { id: payment.boxBookingId } });
  if (!booking) return;

  if (booking.status === 'ACTIVE' || booking.status === 'EXPIRED') {
    // Renewal payment — box already assigned, just extend the term.
    const base = booking.status === 'EXPIRED' || !booking.endDate ? new Date() : new Date(booking.endDate);
    const newEndDate = new Date(base.getTime() + payment.days * 24 * 60 * 60 * 1000);
    await prisma.boxBooking.update({
      where: { id: booking.id },
      data: { status: 'ACTIVE', endDate: newEndDate, expiryReminderSentAt: null },
    });
    await prisma.boxPayment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED', providerPaymentId } });
    return;
  }

  if (booking.status !== 'PENDING') return;

  const candidateBox = await prisma.box.findFirst({
    where: { boxSizeId: booking.boxSizeId, status: 'AVAILABLE' },
    orderBy: { number: 'asc' },
  });

  if (!candidateBox) {
    // Raced by another customer for the last box of this size — refund and
    // bail rather than leave the customer paid with nothing assigned.
    await refundPayment(providerPaymentId).catch((err) => console.error('Box booking refund failed:', err.message));
    await prisma.boxPayment.update({ where: { id: payment.id }, data: { status: 'REFUNDED', providerPaymentId } });
    await prisma.boxBooking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
    return;
  }

  // Guarded update — if a concurrent call already claimed this exact box,
  // this affects 0 rows and the booking is left PENDING for a retry
  // (extremely unlikely at this scale: findFirst just returned it
  // uncontended in the common case).
  const claimed = await prisma.box.updateMany({
    where: { id: candidateBox.id, status: 'AVAILABLE' },
    data: { status: 'RENTED' },
  });
  if (claimed.count === 0) return;

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + payment.days * 24 * 60 * 60 * 1000);

  await prisma.boxBooking.update({
    where: { id: booking.id },
    data: { boxId: candidateBox.id, status: 'ACTIVE', startDate, endDate },
  });
  await prisma.boxPayment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED', providerPaymentId } });
}

/** POST /api/box-bookings/:id/confirm — client-side call right after Checkout succeeds. Also used for renewal confirmation (same booking id, latest payment). */
async function confirmBookingPayment(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay payment fields' });
    }
    const valid = verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
    if (!valid) return res.status(400).json({ error: 'Invalid payment signature' });

    const booking = await prisma.boxBooking.findUnique({ where: { id: req.params.id } });
    if (!booking || booking.customerId !== req.user.id) return res.status(404).json({ error: 'Booking not found' });

    await markBoxBookingPaid(razorpay_order_id, razorpay_payment_id);

    const updated = await prisma.boxBooking.findUnique({
      where: { id: booking.id },
      include: { box: true, boxSize: true },
    });
    if (updated.status === 'CANCELLED') {
      return res.status(409).json({ error: 'Sorry, that box was just taken by another customer — you have been refunded.' });
    }
    res.json({ booking: withBoxAddress(updated) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/box-bookings/mine */
async function listMyBookings(req, res, next) {
  try {
    const bookings = await prisma.boxBooking.findMany({
      where: { customerId: req.user.id },
      include: { box: true, boxSize: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ bookings });
  } catch (err) {
    next(err);
  }
}

/** POST /api/box-bookings/:id/renew — extends the SAME booking/box, doesn't create a new one. Confirmed via the same /confirm endpoint above. */
async function renewBooking(req, res, next) {
  try {
    const { days } = req.body;
    const daysNum = Number(days);
    if (!Number.isInteger(daysNum) || daysNum <= 0) return res.status(400).json({ error: 'A positive integer days is required' });

    const booking = await prisma.boxBooking.findUnique({ where: { id: req.params.id }, include: { boxSize: true } });
    if (!booking || booking.customerId !== req.user.id) return res.status(404).json({ error: 'Booking not found' });
    if (!['ACTIVE', 'EXPIRED'].includes(booking.status)) {
      return res.status(409).json({ error: 'Only an active or expired booking can be renewed' });
    }

    const totalAmount = computeAmount(booking.boxSize.monthlyRate, daysNum);
    const { providerOrderId } = await createCheckoutPayment(booking, daysNum, totalAmount, booking.currency);

    res.status(201).json({ providerOrderId, keyId: process.env.RAZORPAY_KEY_ID, amount: totalAmount, days: daysNum });
  } catch (err) {
    next(err);
  }
}

// ------------------------------------------------------------
// Admin
// ------------------------------------------------------------

/** GET /api/box-bookings/admin/sizes */
async function listBoxSizesAdmin(req, res, next) {
  try {
    const sizes = await prisma.boxSize.findMany({ orderBy: { monthlyRate: 'asc' } });
    const withCounts = await Promise.all(
      sizes.map(async (size) => {
        const [availableCount, totalCount] = await Promise.all([
          prisma.box.count({ where: { boxSizeId: size.id, status: 'AVAILABLE' } }),
          prisma.box.count({ where: { boxSizeId: size.id, status: { not: 'RETIRED' } } }),
        ]);
        return { ...size, availableCount, totalCount };
      })
    );
    res.json({ sizes: withCounts });
  } catch (err) {
    next(err);
  }
}

/** POST /api/box-bookings/admin/sizes */
async function createBoxSize(req, res, next) {
  try {
    const { code, name, description, monthlyRate } = req.body;
    if (!code?.trim() || !name?.trim() || !monthlyRate) {
      return res.status(400).json({ error: 'code, name and monthlyRate are required' });
    }
    const size = await prisma.boxSize.create({
      data: { code: code.trim().toUpperCase(), name: name.trim(), description: description?.trim() || null, monthlyRate: Number(monthlyRate) },
    });
    res.status(201).json({ size });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A box size with this code already exists' });
    next(err);
  }
}

/** PATCH /api/box-bookings/admin/sizes/:id */
async function updateBoxSize(req, res, next) {
  try {
    const { name, description, monthlyRate, isActive } = req.body;
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (monthlyRate !== undefined) data.monthlyRate = Number(monthlyRate);
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    const size = await prisma.boxSize.update({ where: { id: req.params.id }, data });
    res.json({ size });
  } catch (err) {
    next(err);
  }
}

/** GET /api/box-bookings/admin/boxes?boxSizeId= */
async function listBoxes(req, res, next) {
  try {
    const where = req.query.boxSizeId ? { boxSizeId: req.query.boxSizeId } : {};
    const boxes = await prisma.box.findMany({
      where,
      include: { boxSize: true, bookings: { where: { status: 'ACTIVE' }, include: { customer: { select: { fullName: true, email: true } } } } },
      orderBy: [{ boxSizeId: 'asc' }, { number: 'asc' }],
    });
    res.json({ boxes });
  } catch (err) {
    next(err);
  }
}

/** POST /api/box-bookings/admin/boxes */
async function createBox(req, res, next) {
  try {
    const { boxSizeId, number } = req.body;
    const numberNum = Number(number);
    if (!boxSizeId || !Number.isInteger(numberNum) || numberNum <= 0) {
      return res.status(400).json({ error: 'boxSizeId and a positive integer number are required' });
    }
    const box = await prisma.box.create({ data: { boxSizeId, number: numberNum } });
    res.status(201).json({ box });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A box with this number already exists for this size' });
    next(err);
  }
}

/** PATCH /api/box-bookings/admin/boxes/:id/retire */
async function retireBox(req, res, next) {
  try {
    const box = await prisma.box.update({ where: { id: req.params.id }, data: { status: 'RETIRED', retiredAt: new Date() } });
    res.json({ box });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/box-bookings/admin/boxes/:id/release — the manual step after
 * staff physically clears out an expired box. Boxes never auto-return to
 * the pool (see boxBookingExpiry.js) — this is the only way one becomes
 * AVAILABLE again once rented.
 */
async function releaseBox(req, res, next) {
  try {
    const box = await prisma.box.update({ where: { id: req.params.id }, data: { status: 'AVAILABLE', retiredAt: null } });
    res.json({ box });
  } catch (err) {
    next(err);
  }
}

/** GET /api/box-bookings/admin/bookings */
async function listAllBookings(req, res, next) {
  try {
    const bookings = await prisma.boxBooking.findMany({
      where: { status: { in: ['ACTIVE', 'EXPIRED'] } },
      include: { box: true, boxSize: true, customer: { select: { fullName: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ bookings });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listBoxSizes,
  createBooking,
  confirmBookingPayment,
  markBoxBookingPaid,
  listMyBookings,
  renewBooking,
  listBoxSizesAdmin,
  createBoxSize,
  updateBoxSize,
  listBoxes,
  createBox,
  retireBox,
  releaseBox,
  listAllBookings,
  REMINDER_DAYS,
};
