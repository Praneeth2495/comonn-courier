const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  listMerchants,
  createMerchant,
  getMerchant,
  updateMerchant,
  getInvoice,
  updateInvoiceStatus,
  listInvoiceComments,
  addInvoiceComment,
} = require('../controllers/merchant.controller');

// Merchant records hold API keys — admin-only, not staff.
router.get('/', requireAuth, requireRole('ADMIN'), listMerchants);
router.post('/', requireAuth, requireRole('ADMIN'), createMerchant);
router.get('/:id', requireAuth, requireRole('ADMIN'), getMerchant);
router.patch('/:id', requireAuth, requireRole('ADMIN'), updateMerchant);

// Day-to-day invoice/billing actions — both admin and staff.
router.get('/invoices/:id', requireAuth, requireRole('ADMIN', 'STAFF'), getInvoice);
router.patch('/invoices/:id/status', requireAuth, requireRole('ADMIN', 'STAFF'), updateInvoiceStatus);
router.get('/invoices/:id/comments', requireAuth, requireRole('ADMIN', 'STAFF'), listInvoiceComments);
router.post('/invoices/:id/comments', requireAuth, requireRole('ADMIN', 'STAFF'), addInvoiceComment);

module.exports = router;
