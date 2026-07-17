const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');
const {
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
  cancelOrder,
  updateAddons,
  sendOtp,
  verifyOtp,
  applyPromo,
} = require('../controllers/order.controller');

// Prevents OTP-spam abuse (each call sends a real email / checks a guess).
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

// Guest checkout allowed — optionalAuth attaches req.user if logged in
router.post('/', optionalAuth, createOrder);

router.get('/', requireAuth, listOrders);
router.get('/:id', requireAuth, getOrder);
router.post('/:id/cancel', requireAuth, cancelOrder);
router.patch('/:id/status', requireAuth, requireRole('ADMIN', 'STAFF'), updateOrderStatus);

// Payment-page pre-payment steps — guest checkout allowed
router.patch('/:id/addons', optionalAuth, updateAddons);
router.post('/:id/send-otp', otpLimiter, optionalAuth, sendOtp);
router.post('/:id/verify-otp', otpLimiter, optionalAuth, verifyOtp);
router.post('/:id/promo', optionalAuth, applyPromo);

module.exports = router;
