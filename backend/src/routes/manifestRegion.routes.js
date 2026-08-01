const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { listManifestRegions, createManifestRegion, updateManifestRegion } = require('../controllers/manifestRegion.controller');

router.get('/', requireAuth, requireRole('ADMIN', 'STAFF'), listManifestRegions);
router.post('/', requireAuth, requireRole('ADMIN'), createManifestRegion);
router.patch('/:id', requireAuth, requireRole('ADMIN'), updateManifestRegion);

module.exports = router;
