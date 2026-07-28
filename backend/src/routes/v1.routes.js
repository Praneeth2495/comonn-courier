const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { requireMerchantAuth } = require('../middleware/merchantAuth');
const { createQuote, createShipment, getShipment } = require('../controllers/merchantApi.controller');

// Generous but bounded — a real integration calls this per-checkout, not
// per-pageview, so this is well above normal traffic while still capping
// a runaway/misconfigured integration.
const merchantLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });

router.use(merchantLimiter, requireMerchantAuth);

router.post('/quotes', createQuote);
router.post('/shipments', createShipment);
router.get('/shipments/:trackingNumber', getShipment);

module.exports = router;
