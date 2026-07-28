const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  listInvoices,
  createInvoice,
  getInvoice,
  updateInvoiceStatus,
  sendInvoiceEmail,
  downloadInvoicePdf,
  downloadInvoiceAttachment,
  listInvoiceComments,
  addInvoiceComment,
} = require('../controllers/partyInvoice.controller');

// Receivable/Payable invoices are admin-only, same as the existing
// Accounts tab this money-visibility feature sits alongside.
router.get('/', requireAuth, requireRole('ADMIN'), listInvoices);
router.post('/', requireAuth, requireRole('ADMIN'), createInvoice);
router.get('/:id', requireAuth, requireRole('ADMIN'), getInvoice);
router.patch('/:id/status', requireAuth, requireRole('ADMIN'), updateInvoiceStatus);
router.post('/:id/send', requireAuth, requireRole('ADMIN'), sendInvoiceEmail);
router.get('/:id/download', requireAuth, requireRole('ADMIN'), downloadInvoicePdf);
router.get('/:id/attachment', requireAuth, requireRole('ADMIN'), downloadInvoiceAttachment);
router.get('/:id/comments', requireAuth, requireRole('ADMIN'), listInvoiceComments);
router.post('/:id/comments', requireAuth, requireRole('ADMIN'), addInvoiceComment);

module.exports = router;
