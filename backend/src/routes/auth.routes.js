const rateLimit = require('express-rate-limit');
const router = require('express').Router();
const { register, login, me, updateProfile, changePassword, forgotPassword, setPassword } = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');

const forgotPasswordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
// skipSuccessfulRequests means only failed (401) attempts count toward the
// limit — a run of wrong passwords locks out, but it doesn't also penalize
// someone who logs in successfully several times in the same window.
// `message` matches the shape every other error response uses ({ error })
// so the frontend can read it the same way — see Login.jsx, which also
// pattern-matches "Access restricted" to add a clickable forgot-password
// link next to it.
const loginLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Access restricted for this username. Please try again after 30 minutes.' },
});

router.post('/register', register);
router.post('/login', loginLimiter, login);
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, updateProfile);
router.post('/change-password', requireAuth, changePassword);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/set-password', setPassword);

module.exports = router;
