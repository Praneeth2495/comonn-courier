const router = require('express').Router();
const { optionalAuth } = require('../middleware/auth');
const { createOrder, createCombinedOrder, confirmPayment, getPaymentStatus, confirmCashBooking } = require('../controllers/payment.controller');

// NOTE: the webhook route is mounted separately in src/index.js because it
// needs the raw request body (Razorpay signature verification requirement).

// Must come before /:orderId/order — otherwise "combined" would match as
// the :orderId param.
router.post('/combined/order', optionalAuth, createCombinedOrder);
router.post('/:orderId/order', optionalAuth, createOrder);
router.post('/:orderId/confirm', optionalAuth, confirmPayment);
router.post('/:orderId/cash', optionalAuth, confirmCashBooking);
router.get('/:orderId', optionalAuth, getPaymentStatus);

module.exports = router;
