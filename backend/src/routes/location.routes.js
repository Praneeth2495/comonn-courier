const router = require('express').Router();
const { requireAuth, requireRole, requirePage } = require('../middleware/auth');
const location = require('../controllers/location.controller');

router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'DRIVER'), requirePage('batchscan'));

// Listing is available to drivers too (needed while scanning); managing
// locations is admin/staff only.
router.get('/', location.listLocations);
router.get('/:id/barcode.pdf', location.printLocationBarcode);
router.post('/', requireRole('ADMIN', 'STAFF'), location.createLocation);
router.patch('/:id', requireRole('ADMIN', 'STAFF'), location.updateLocation);
router.delete('/:id', requireRole('ADMIN', 'STAFF'), location.deleteLocation);

module.exports = router;
