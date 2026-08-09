const router = require('express').Router();
const { requireAuth, requireRole, requirePage } = require('../middleware/auth');
const batch = require('../controllers/batch.controller');

// DRIVER always passes requirePage (unaffected by the per-user page
// toggle — Scan is part of their own fixed dashboard); only STAFF is
// narrowed down to whether 'batchscan' is in their allowedPages.
router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'DRIVER'), requirePage('batchscan'));

router.get('/', batch.listBatches);
router.post('/', batch.createBatch);
router.post('/apply-status', batch.applyStatus);
router.post('/preview', batch.previewResolve);
router.get('/:id', batch.getBatch);
router.patch('/:id/status', batch.updateBatchStatus);
router.delete('/:id', batch.deleteBatch);

module.exports = router;
