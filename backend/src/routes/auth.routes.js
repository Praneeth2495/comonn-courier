const rateLimit = require('express-rate-limit');
const router = require('express').Router();
const { register, login, me, updateProfile, changePassword, forgotPassword, setPassword } = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');

const forgotPasswordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, updateProfile);
router.post('/change-password', requireAuth, changePassword);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/set-password', setPassword);

module.exports = router;
