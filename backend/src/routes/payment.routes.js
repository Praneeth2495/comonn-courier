const router = require('express').Router();
const { optionalAuth, requireAuth, requireRole } = require('../middleware/auth');
const {
  createOrder,
  createCombinedOrder,
  confirmPayment,
  getPaymentStatus,
  confirmCashBooking,
  createBalanceOrder,
  confirmBalancePayment,
  markBalancePaymentManual,
  getBalancePaymentStatus,
} = require('../controllers/payment.controller');

// NOTE: the webhook route is mounted separately in src/index.js because it
// needs the raw request body (Razorpay signature verification requirement).

// Must come before /:orderId/order — otherwise "combined" would match as
// the :orderId param.
router.post('/combined/order', optionalAuth, createCombinedOrder);
router.post('/:orderId/order', optionalAuth, createOrder);
router.post('/:orderId/confirm', optionalAuth, confirmPayment);
router.post('/:orderId/cash', optionalAuth, confirmCashBooking);
router.get('/:orderId', optionalAuth, getPaymentStatus);

// Balance top-up (an already-paid order's price went up after a staff
// edit). Same order-id-scoped trust model as the routes above for the
// order/confirm pair — reachable by staff or the customer via a shared
// /pay/:orderId link. The manual (phone/UPI/bank transfer) entry point is
// staff-only, since it's staff asserting cash/transfer was received.
router.post('/:orderId/balance-order', optionalAuth, createBalanceOrder);
router.post('/:orderId/balance-confirm', optionalAuth, confirmBalancePayment);
router.post('/:orderId/balance-manual', requireAuth, requireRole('ADMIN', 'STAFF'), markBalancePaymentManual);

module.exports = router;
