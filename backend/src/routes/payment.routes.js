const router = require('express').Router();
const { optionalAuth } = require('../middleware/auth');
const { createOrder, confirmPayment, getPaymentStatus, confirmCashBooking } = require('../controllers/payment.controller');

// NOTE: the webhook route is mounted separately in src/index.js because it
// needs the raw request body (Razorpay signature verification requirement).

router.post('/:orderId/order', optionalAuth, createOrder);
router.post('/:orderId/confirm', optionalAuth, confirmPayment);
router.post('/:orderId/cash', optionalAuth, confirmCashBooking);
router.get('/:orderId', optionalAuth, getPaymentStatus);

module.exports = router;
