const router = require('express').Router();
const { requireAuth, requireRole, requirePage } = require('../middleware/auth');
const { listAssets, createAsset } = require('../controllers/asset.controller');

router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), requirePage('assets'));
router.get('/', listAssets);
router.post('/', createAsset);

module.exports = router;
