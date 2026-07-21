const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const batch = require('../controllers/batch.controller');

router.use(requireAuth, requireRole('ADMIN', 'STAFF'));

router.get('/', batch.listBatches);
router.post('/', batch.createBatch);
router.post('/apply-status', batch.applyStatus);
router.get('/:id', batch.getBatch);
router.delete('/:id', batch.deleteBatch);

module.exports = router;
