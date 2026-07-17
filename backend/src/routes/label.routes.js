const router = require('express').Router();
const { optionalAuth } = require('../middleware/auth');
const { generateLabel, downloadLabel, downloadInvoice } = require('../controllers/label.controller');

router.post('/:orderId/generate', optionalAuth, generateLabel);
router.get('/download/:labelId', optionalAuth, downloadLabel);
router.get('/invoice/download/:orderId', optionalAuth, downloadInvoice);

module.exports = router;
