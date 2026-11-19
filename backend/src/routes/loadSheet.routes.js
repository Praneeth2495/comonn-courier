const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createLoadSheet,
  listLoadSheets,
  getLoadSheet,
  getLoadSheetByBarcode,
  updateLoadSheet,
  deleteLoadSheet,
  addOrdersToLoadSheet,
  removeOrderFromLoadSheet,
  listEligibleOrdersForLoadSheet,
  downloadLoadSheet,
  listLoadSheetComments,
  addLoadSheetComment,
  applyLoadSheetScanStatus,
} = require('../controllers/loadSheet.controller');

// Same role tier as manifest.routes.js — tab-level visibility (the
// Loadsheet tab itself) is gated client-side via User.allowedOrderTabs,
// consistent with how the other Orders sub-tabs work; hub-level visibility
// for STAFF is enforced inside the controller (staffHubScope).
router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'));

router.get('/eligible-orders', listEligibleOrdersForLoadSheet);
router.get('/by-barcode/:code', getLoadSheetByBarcode);
router.get('/', listLoadSheets);
router.post('/', createLoadSheet);
router.get('/:id', getLoadSheet);
router.patch('/:id', updateLoadSheet);
router.delete('/:id', deleteLoadSheet);
router.post('/:id/orders', addOrdersToLoadSheet);
router.delete('/:id/orders/:orderId', removeOrderFromLoadSheet);
router.get('/:id/download', downloadLoadSheet);
router.get('/:id/comments', listLoadSheetComments);
router.post('/:id/comments', addLoadSheetComment);
router.post('/:id/apply-status', applyLoadSheetScanStatus);

module.exports = router;
