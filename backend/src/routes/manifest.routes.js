const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  listEligibleOrders,
  createManifest,
  listManifests,
  getManifest,
  addOrdersToManifest,
  removeOrderFromManifest,
  downloadManifest,
} = require('../controllers/manifest.controller');

router.use(requireAuth, requireRole('ADMIN', 'STAFF'));

router.get('/eligible-orders', listEligibleOrders);
router.get('/', listManifests);
router.post('/', createManifest);
router.get('/:id', getManifest);
router.post('/:id/orders', addOrdersToManifest);
router.delete('/:id/orders/:orderId', removeOrderFromManifest);
router.get('/:id/download', downloadManifest);

module.exports = router;
