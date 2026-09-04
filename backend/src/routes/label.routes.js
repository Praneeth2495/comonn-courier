const router = require('express').Router();
const { optionalAuth, requireAuth, requireRole, requirePage } = require('../middleware/auth');
const { generateLabel, downloadLabel, downloadLabelByBarcode, downloadInvoice } = require('../controllers/label.controller');
const { createManualLabels, listManualLabelBatches, downloadMasterLabel } = require('../controllers/manualLabel.controller');

router.post('/:orderId/generate', optionalAuth, generateLabel);
router.get('/download/barcode/:barcodeValue', optionalAuth, downloadLabelByBarcode);
router.get('/download/:labelId', optionalAuth, downloadLabel);
router.get('/invoice/download/:orderId', optionalAuth, downloadInvoice);
// Print Label page's Manual Label tab — staff/admin only, same page gate
// as the rest of that panel (see PAGE_KEYS 'printlabel').
router.post('/manual', requireAuth, requireRole('ADMIN', 'STAFF'), requirePage('printlabel'), createManualLabels);
router.get('/manual/history', requireAuth, requireRole('ADMIN', 'STAFF'), requirePage('printlabel'), listManualLabelBatches);
// optionalAuth, not requireAuth — this is opened via a plain <a href target="_blank">
// link (same as /download/:labelId above), which can't carry an Authorization
// header at all; the batchId itself (an unguessable UUID) is the only gate,
// same trust model the individual-label download routes already use.
router.get('/manual/:batchId/master', optionalAuth, downloadMasterLabel);

module.exports = router;
