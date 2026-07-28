const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret',
});

/**
 * Creates a Razorpay Order for an order's grand total.
 * Amount must be in the smallest currency unit (paise for INR, cents for USD/AUD).
 */
async function createOrder({ amount, currency, orderId, orderNumber }) {
  const amountInSubunits = Math.round(Number(amount) * 100);
  return razorpay.orders.create({
    amount: amountInSubunits,
    currency: currency.toUpperCase(),
    receipt: orderNumber,
    notes: { orderId, orderNumber },
  });
}

async function fetchPayment(paymentId) {
  return razorpay.payments.fetch(paymentId);
}

/**
 * Creates a Razorpay Payment Link (a standalone hosted payment page, not
 * tied to a live Checkout.js session) — used for merchant consolidated
 * invoices, where one link needs to cover a whole day's worth of orders
 * rather than a single order's live checkout.
 */
async function createPaymentLink({ amount, currency, description, customerName, customerEmail, notes }) {
  const amountInSubunits = Math.round(Number(amount) * 100);
  return razorpay.paymentLink.create({
    amount: amountInSubunits,
    currency: (currency || 'INR').toUpperCase(),
    description,
    customer: { name: customerName, email: customerEmail },
    notify: { email: true, sms: false },
    notes,
  });
}

/** Verifies the razorpay_order_id|razorpay_payment_id signature returned by Checkout */
function verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  return expected === razorpay_signature;
}

/** Verifies an incoming Razorpay webhook signature (X-Razorpay-Signature header) */
function verifyWebhookSignature(rawBody, signature) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return expected === signature;
}

async function refundPayment(paymentId, amount) {
  return razorpay.payments.refund(paymentId, {
    amount: amount ? Math.round(amount * 100) : undefined,
  });
}

module.exports = {
  razorpay,
  createOrder,
  fetchPayment,
  createPaymentLink,
  verifyPaymentSignature,
  verifyWebhookSignature,
  refundPayment,
};
