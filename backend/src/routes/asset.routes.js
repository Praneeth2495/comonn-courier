const router = require('express').Router();
const { requireAuth, requireRole, requirePage } = require('../middleware/auth');
const { listAssets, createAsset, updateAsset, deleteAsset, downloadAssetAttachment } = require('../controllers/asset.controller');

router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), requirePage('assets'));
router.get('/', listAssets);
router.post('/', createAsset);
router.patch('/:id', updateAsset);
router.get('/:id/attachment', downloadAssetAttachment);
// Deleting an asset purchase record is ADMIN-only — layered on top of the
// router-level requireRole(...) above, same pattern as
// admin.routes.js's rate-cards delete route.
router.delete('/:id', requireRole('ADMIN'), deleteAsset);

module.exports = router;
