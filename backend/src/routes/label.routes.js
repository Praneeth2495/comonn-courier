const router = require('express').Router();
const { optionalAuth, requireAuth, requireRole, requirePage } = require('../middleware/auth');
const { generateLabel, downloadLabel, downloadLabelByBarcode, downloadInvoice } = require('../controllers/label.controller');
const { createManualLabels } = require('../controllers/manualLabel.controller');

router.post('/:orderId/generate', optionalAuth, generateLabel);
router.get('/download/barcode/:barcodeValue', optionalAuth, downloadLabelByBarcode);
router.get('/download/:labelId', optionalAuth, downloadLabel);
router.get('/invoice/download/:orderId', optionalAuth, downloadInvoice);
// Print Label page's "Create Label" tool — staff/admin only, same page
// gate as the rest of that panel (see PAGE_KEYS 'printlabel').
router.post('/manual', requireAuth, requireRole('ADMIN', 'STAFF'), requirePage('printlabel'), createManualLabels);

module.exports = router;
