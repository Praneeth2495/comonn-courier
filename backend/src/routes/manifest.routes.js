const router = require('express').Router();
const { requireAuth, requireRole, requirePage } = require('../middleware/auth');
const {
  listEligibleOrders,
  listAvailableAirports,
  createManifest,
  listManifests,
  getManifest,
  addOrdersToManifest,
  removeOrderFromManifest,
  downloadManifest,
  saveManifestCosts,
} = require('../controllers/manifest.controller');

// ACCOUNTS added alongside the original ADMIN/STAFF so the Accounts
// Overview page's manifest list/detail/cost-sheet (below) are reachable —
// it couldn't see manifests at all before. The other operational routes
// (create, add/remove orders) stay reachable by ACCOUNTS too rather than
// adding a second role tier per-route; nothing there is sensitive beyond
// what Accounts already sees on the Bookings tab.
router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'));

router.get('/eligible-orders', listEligibleOrders);
router.get('/available-airports', listAvailableAirports);
router.get('/', listManifests);
router.post('/', createManifest);
router.get('/:id', getManifest);
router.post('/:id/orders', addOrdersToManifest);
router.delete('/:id/orders/:orderId', removeOrderFromManifest);
router.get('/:id/download', downloadManifest);
router.post('/:id/costs', requirePage('accounts'), saveManifestCosts);

module.exports = router;
