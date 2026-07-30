const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/db');
const { round2 } = require('../services/pricingEngine');
const { createOrder: createRazorpayOrder, verifyPaymentSignature, refundPayment } = require('../services/paymentService');
const { sendEmail } = require('../services/emailService');
const { generateBoxInvoiceNumber } = require('../utils/invoiceNumber');
const { generateBoxBookingInvoicePdf, STORAGE_DIR } = require('../services/boxBookingInvoice');

const BOX_STORAGE_ADDRESS = process.env.BOX_STORAGE_ADDRESS || '<office address not configured — set BOX_STORAGE_ADDRESS>';

async function sendBoxBookingConfirmationEmail(booking, box, boxSize, customer) {
  if (!customer?.email) return;
  try {
    await sendEmail({
      to: customer.email,
      from: process.env.EMAIL_FROM_NOREPLY || 'Comonn <noreply@comonn.in>',
      subject: `Storage box confirmed — ${boxSize.name}, Box ${box.number}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#171C2C;">
          <h2 style="color:#0E1B3D;margin-bottom:8px;">Your storage box is booked</h2>
          <p style="font-size:13.5px;color:#5B6478;line-height:1.6;">Hi ${customer.fullName || ''},</p>
          <p style="font-size:13.5px;color:#5B6478;line-height:1.6;">Your ${boxSize.name} box is confirmed and ready to receive packages. Give this address to any e-commerce seller:</p>
          <div style="background:#F7F5F0;border-radius:12px;padding:14px 16px;margin:14px 0;">
            <p style="margin:0;font-size:14px;font-weight:700;color:#0E1B3D;">${BOX_STORAGE_ADDRESS}, Box ${box.number}</p>
          </div>
          <p style="font-size:13px;color:#5B6478;line-height:1.6;">Valid for ${booking.days} days, until ${new Date(booking.endDate).toLocaleDateString('en-IN')}. Amount paid: Rs. ${Number(booking.totalAmount).toFixed(2)}.</p>
          <p style="font-size:12px;color:#8A93A6;">Manage or renew this box any time from your Comonn dashboard.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('sendBoxBookingConfirmationEmail failed:', err.message);
  }
}

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

  const booking = await prisma.boxBooking.findUnique({
    where: { id: payment.boxBookingId },
    include: { boxSize: true, customer: true },
  });
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
  const invoiceNumber = await generateBoxInvoiceNumber();

  const updated = await prisma.boxBooking.update({
    where: { id: booking.id },
    data: { boxId: candidateBox.id, status: 'ACTIVE', startDate, endDate, invoiceNumber },
  });
  await prisma.boxPayment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED', providerPaymentId } });

  const { fileName } = await generateBoxBookingInvoicePdf({ ...updated, box: candidateBox, boxSize: booking.boxSize, customer: booking.customer });
  await prisma.boxBooking.update({ where: { id: booking.id }, data: { pdfFileUrl: fileName } });

  await sendBoxBookingConfirmationEmail({ ...booking, startDate, endDate }, candidateBox, booking.boxSize, booking.customer);
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
    const isOwner = booking && booking.customerId === req.user.id;
    const isStaff = ['ADMIN', 'STAFF'].includes(req.user.role);
    if (!booking || (!isOwner && !isStaff)) return res.status(404).json({ error: 'Booking not found' });

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
    res.json({ bookings: bookings.map(withBoxAddress) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/box-bookings/:id/invoice — customer downloads their own booking's
 * invoice PDF (admin/staff can download any). Only exists once the booking
 * has actually been paid (invoiceNumber/pdfFileUrl are set in
 * markBoxBookingPaid). Regenerates on the fly if the file went missing on
 * redeploy, same pattern as label/order invoice downloads.
 */
async function downloadInvoice(req, res, next) {
  try {
    const booking = await prisma.boxBooking.findUnique({
      where: { id: req.params.id },
      include: { box: true, boxSize: true, customer: true },
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const isOwner = booking.customerId === req.user.id;
    const isStaff = ['ADMIN', 'STAFF'].includes(req.user.role);
    if (!isOwner && !isStaff) return res.status(403).json({ error: 'Not authorized to view this invoice' });
    if (!booking.invoiceNumber) return res.status(404).json({ error: 'No invoice available for this booking yet' });

    const filePath = path.resolve(path.join(STORAGE_DIR, booking.pdfFileUrl || `${booking.invoiceNumber}.pdf`));
    if (!fs.existsSync(filePath)) await generateBoxBookingInvoicePdf(booking);
    if (req.query.inline) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
      return res.sendFile(filePath);
    }
    res.download(filePath);
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
 * staff physically clears out a box, whether its booking already expired on
 * its own (see boxBookingExpiry.js) or staff are ending it early. Also closes
 * out any still-ACTIVE booking on this box so it stops showing as active —
 * Release is the single "this tenancy is over" action.
 */
async function releaseBox(req, res, next) {
  try {
    const box = await prisma.box.update({ where: { id: req.params.id }, data: { status: 'AVAILABLE', retiredAt: null } });
    await prisma.boxBooking.updateMany({ where: { boxId: box.id, status: 'ACTIVE' }, data: { status: 'EXPIRED' } });
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
    res.json({ bookings: bookings.map(withBoxAddress) });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/box-bookings/admin/bookings/:id — manual correction of a
 * booking's end date (e.g. a phone/bank-transfer extension staff need to
 * apply without routing the customer through the pay-and-renew flow).
 * Deliberately doesn't touch `days` (the original purchased term stays a
 * fixed historical record) or expiryReminderSentAt is cleared so the
 * reminder cycle re-fires against the corrected date.
 */
async function updateBookingDates(req, res, next) {
  try {
    const { endDate } = req.body;
    if (!endDate) return res.status(400).json({ error: 'endDate is required' });
    const booking = await prisma.boxBooking.update({
      where: { id: req.params.id },
      data: { endDate: new Date(endDate), expiryReminderSentAt: null, status: 'ACTIVE' },
      include: { box: true, boxSize: true, customer: { select: { fullName: true, email: true, phone: true } } },
    });
    res.json({ booking: withBoxAddress(booking) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/box-bookings/admin/customers?search= — customer picker for the walk-in booking flow. */
async function searchCustomers(req, res, next) {
  try {
    const q = (req.query.search || '').trim();
    const where = {
      role: 'CUSTOMER',
      ...(q ? { OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    };
    const customers = await prisma.user.findMany({
      where,
      select: { id: true, fullName: true, email: true, phone: true },
      orderBy: { fullName: 'asc' },
      take: 20,
    });
    res.json({ customers });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/box-bookings/admin/bookings — staff books a box for a walk-in or
 * phone customer, either picking an existing account (customerId) or
 * creating one on the spot (newCustomer). A freshly-created account gets the
 * same unusable random password + "set up your account" email flow as
 * guest-checkout accounts (see accountProvisioning.js / accountSetupFollowup.js)
 * — the customer sets their own password later via that emailed link.
 * Payment still goes through Razorpay, same as a customer's own booking —
 * this just starts the checkout on their behalf.
 */
async function createBookingForCustomer(req, res, next) {
  try {
    const { boxSizeId, days, customerId, newCustomer } = req.body;
    const daysNum = Number(days);
    if (!boxSizeId || !Number.isInteger(daysNum) || daysNum <= 0) {
      return res.status(400).json({ error: 'boxSizeId and a positive integer days are required' });
    }

    let customer;
    if (customerId) {
      customer = await prisma.user.findUnique({ where: { id: customerId } });
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
    } else if (newCustomer?.email?.trim() && newCustomer?.fullName?.trim()) {
      const email = newCustomer.email.toLowerCase().trim();
      customer = await prisma.user.findUnique({ where: { email } });
      if (!customer) {
        const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
        customer = await prisma.user.create({
          data: { email, passwordHash, fullName: newCustomer.fullName.trim(), phone: newCustomer.phone?.trim() || null, role: 'CUSTOMER' },
        });
      }
    } else {
      return res.status(400).json({ error: 'customerId or newCustomer{fullName,email} is required' });
    }

    const size = await prisma.boxSize.findUnique({ where: { id: boxSizeId } });
    if (!size || !size.isActive) return res.status(404).json({ error: 'Box size not found' });
    const availableCount = await prisma.box.count({ where: { boxSizeId: size.id, status: 'AVAILABLE' } });
    if (availableCount <= 0) return res.status(409).json({ error: `No ${size.name} boxes available right now` });

    const totalAmount = computeAmount(size.monthlyRate, daysNum);
    const booking = await prisma.boxBooking.create({
      data: { boxSizeId: size.id, customerId: customer.id, days: daysNum, monthlyRate: size.monthlyRate, totalAmount, currency: size.currency, status: 'PENDING' },
    });
    const { providerOrderId } = await createCheckoutPayment(booking, daysNum, totalAmount, size.currency);

    res.status(201).json({
      booking,
      providerOrderId,
      keyId: process.env.RAZORPAY_KEY_ID,
      customer: { id: customer.id, fullName: customer.fullName, email: customer.email, phone: customer.phone },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/box-bookings/admin/bookings/:id/reactivate — undo an
 * accidental Release/expiry: puts the booking back to ACTIVE and re-rents
 * its box, as long as nobody else has been assigned that box in the
 * meantime (guarded — otherwise this would double-book it).
 */
async function reactivateBooking(req, res, next) {
  try {
    const booking = await prisma.boxBooking.findUnique({ where: { id: req.params.id }, include: { box: true } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'EXPIRED') return res.status(409).json({ error: 'Only an expired booking can be reactivated' });
    if (!booking.box) return res.status(409).json({ error: 'This booking has no box assigned' });
    if (booking.box.status !== 'AVAILABLE') {
      return res.status(409).json({ error: 'That box is no longer available — it may already be rented to someone else' });
    }

    await prisma.box.update({ where: { id: booking.box.id }, data: { status: 'RENTED' } });
    const updated = await prisma.boxBooking.update({
      where: { id: booking.id },
      data: { status: 'ACTIVE' },
      include: { box: true, boxSize: true, customer: { select: { fullName: true, email: true, phone: true } } },
    });
    res.json({ booking: withBoxAddress(updated) });
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
  downloadInvoice,
  renewBooking,
  listBoxSizesAdmin,
  createBoxSize,
  updateBoxSize,
  listBoxes,
  createBox,
  retireBox,
  releaseBox,
  listAllBookings,
  updateBookingDates,
  reactivateBooking,
  searchCustomers,
  createBookingForCustomer,
};
