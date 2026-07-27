const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { sendContactMessage } = require('../controllers/contact.controller');

// Public form, no auth — cap abuse the same way order OTP/forgot-password do.
const contactLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

router.post('/', contactLimiter, sendContactMessage);

module.exports = router;
