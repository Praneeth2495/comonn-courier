const { prisma } = require('../config/db');
const {
  createOrder: createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
} = require('../services/paymentService');
const { sendReceiverBookingNotification } = require('./label.controller');
const { PAYABLE_STATUSES } = require('./order.controller');

/**
 * Idempotent: Razorpay retries webhooks at-least-once, and the client-side
 * /confirm call can race with (or duplicate) the webhook. The PENDING_PAYMENT
 * condition on the order update is checked and applied atomically by
 * Postgres, so only the first caller — webhook or confirm — actually
 * transitions the order and writes a tracking event/number; later callers
 * just keep the payment record in sync.
 */
async function markOrderPaid(orderId, extra = {}) {
  await prisma.payment.update({
    where: { orderId },
    data: { status: 'SUCCEEDED', ...extra },
  });

  // Tracking number is just the order number — one identifier for the
  // customer to remember instead of two unrelated-looking ones.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { senderAddress: true, receiverAddress: true },
  });
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: { in: PAYABLE_STATUSES } },
    data: { status: 'PAID', trackingNumber: order.orderNumber },
  });

  if (count > 0) {
    await prisma.trackingEvent.create({
      data: { orderId, status: 'PAID', note: 'Payment confirmed' },
    });
    // Pickup-booking orders ("Not sure, book pickup") never got a receiver
    // alert at booking time — only once payment is actually confirmed.
    if (order.pricingPending) {
      await sendReceiverBookingNotification({ ...order, trackingNumber: order.orderNumber });
    }
  }
}

/**
 * POST /api/payments/:orderId/order
 * Step 3 ("Payment"): creates (or reuses) a Razorpay Order for the order's
 * grand total and returns it for the frontend to open with Razorpay Checkout.
 */
async function createOrder(req, res, next) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { payment: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!PAYABLE_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: `Order is not awaiting payment (status: ${order.status})` });
    }
    if (!order.dgAcknowledged) {
      return res.status(409).json({ error: 'Please acknowledge the dangerous goods declaration first' });
    }
    if (!order.otpVerifiedAt) {
      return res.status(409).json({ error: 'Please verify your email before proceeding to payment' });
    }

    // Reuse an existing unpaid Razorpay order rather than creating duplicates
    // — but only if the amount still matches (add-ons/promo can change the
    // total after an order was first created).
    if (
      order.payment?.providerOrderId &&
      order.payment.status === 'REQUIRES_PAYMENT' &&
      Number(order.payment.amount) === Number(order.grandTotal)
    ) {
      return res.json({ payment: order.payment, keyId: process.env.RAZORPAY_KEY_ID });
    }

    const rzpOrder = await createRazorpayOrder({
      amount: order.grandTotal,
      currency: order.currency,
      orderId: order.id,
      orderNumber: order.orderNumber,
    });

    const payment = await prisma.payment.upsert({
      where: { orderId: order.id },
      update: {
        providerOrderId: rzpOrder.id,
        amount: order.grandTotal,
        currency: order.currency,
        status: 'REQUIRES_PAYMENT',
      },
      create: {
        orderId: order.id,
        providerOrderId: rzpOrder.id,
        amount: order.grandTotal,
        currency: order.currency,
        status: 'REQUIRES_PAYMENT',
      },
    });

    res.json({ payment, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/:orderId/confirm
 * Called by the frontend immediately after Razorpay Checkout's handler fires.
 * Verifies the HMAC SHA256 signature Razorpay returns before trusting the
 * client's "payment succeeded" claim. The webhook remains the authoritative
 * source of truth in case this call is skipped (e.g. tab closed).
 */
async function confirmPayment(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay payment fields' });
    }

    const valid = verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
    if (!valid) return res.status(400).json({ error: 'Invalid payment signature' });

    const payment = await prisma.payment.findFirst({ where: { orderId: req.params.orderId, providerOrderId: razorpay_order_id } });
    if (!payment) return res.status(404).json({ error: 'No matching payment found for this order' });

    if (payment.status !== 'SUCCEEDED') {
      await markOrderPaid(req.params.orderId, { providerPaymentId: razorpay_payment_id, method: 'razorpay' });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/webhook (Razorpay webhook — raw body required, see index.js)
 * Marks the payment/order as PAID/FAILED once Razorpay confirms the event.
 * This is the source of truth for payment status — never trust the client
 * confirm call alone.
 */
async function handleWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const valid = verifyWebhookSignature(req.body, signature);
    if (!valid) return res.status(400).json({ error: 'Invalid webhook signature' });

    const event = JSON.parse(req.body);

    if (event.event === 'payment.captured') {
      const entity = event.payload.payment.entity;
      const orderId = entity.notes?.orderId;
      if (orderId) {
        await markOrderPaid(orderId, {
          providerPaymentId: entity.id,
          rawWebhookPayload: event,
          method: entity.method,
        });
      }
    }

    if (event.event === 'payment.failed') {
      const entity = event.payload.payment.entity;
      const orderId = entity.notes?.orderId;
      if (orderId) {
        await prisma.payment.update({
          where: { orderId },
          data: { status: 'FAILED', rawWebhookPayload: event },
        });
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}

/** GET /api/payments/:orderId — poll payment status (used by frontend after Checkout) */
async function getPaymentStatus(req, res, next) {
  try {
    const payment = await prisma.payment.findUnique({ where: { orderId: req.params.orderId } });
    if (!payment) return res.status(404).json({ error: 'No payment found for this order' });
    res.json({ payment });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/:orderId/cash
 * "Not sure, book pickup" flow only: no online payment happens — the order
 * is confirmed for pickup immediately and cash is collected once the
 * courier assesses the actual weight/price in person. Same DG/OTP gates as
 * the online flow, just no Razorpay involved.
 */
async function confirmCashBooking(req, res, next) {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.pricingPending) {
      return res.status(409).json({ error: 'Cash booking is only available for pickup orders' });
    }
    if (!PAYABLE_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: `Order is not awaiting payment (status: ${order.status})` });
    }
    if (!order.dgAcknowledged) {
      return res.status(409).json({ error: 'Please acknowledge the dangerous goods declaration first' });
    }
    if (!order.otpVerifiedAt) {
      return res.status(409).json({ error: 'Please verify your email before proceeding to payment' });
    }

    await prisma.payment.upsert({
      where: { orderId: order.id },
      update: { provider: 'cash', method: 'cash', amount: 0, currency: order.currency, status: 'CASH_PENDING' },
      create: { orderId: order.id, provider: 'cash', method: 'cash', amount: 0, currency: order.currency, status: 'CASH_PENDING' },
    });

    // Distinct from PAID: no money has actually changed hands yet — cash is
    // only collected once the courier weighs the parcel at pickup. Tracking
    // number is just the order number — one identifier for the customer to
    // remember instead of two unrelated-looking ones.
    const { count } = await prisma.order.updateMany({
      where: { id: order.id, status: { in: PAYABLE_STATUSES } },
      data: { status: 'PICKUP_CONFIRMED', trackingNumber: order.orderNumber },
    });
    if (count > 0) {
      await prisma.trackingEvent.create({
        data: { orderId: order.id, status: 'PICKUP_CONFIRMED', note: 'Cash pickup booking confirmed — amount to be collected at pickup' },
      });
    }

    const updated = await prisma.order.findUnique({ where: { id: order.id }, include: { payment: true } });
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, confirmPayment, handleWebhook, getPaymentStatus, confirmCashBooking };
