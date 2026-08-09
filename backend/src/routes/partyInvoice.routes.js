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

// Receivable/Payable invoices are restricted to ADMIN and ACCOUNTS, same as
// the existing Accounts tab this money-visibility feature sits alongside.
router.get('/', requireAuth, requireRole('ADMIN', 'ACCOUNTS'), listInvoices);
router.post('/', requireAuth, requireRole('ADMIN', 'ACCOUNTS'), createInvoice);
router.get('/:id', requireAuth, requireRole('ADMIN', 'ACCOUNTS'), getInvoice);
router.patch('/:id/status', requireAuth, requireRole('ADMIN', 'ACCOUNTS'), updateInvoiceStatus);
router.post('/:id/send', requireAuth, requireRole('ADMIN', 'ACCOUNTS'), sendInvoiceEmail);
router.get('/:id/download', requireAuth, requireRole('ADMIN', 'ACCOUNTS'), downloadInvoicePdf);
router.get('/:id/attachment', requireAuth, requireRole('ADMIN', 'ACCOUNTS'), downloadInvoiceAttachment);
router.get('/:id/comments', requireAuth, requireRole('ADMIN', 'ACCOUNTS'), listInvoiceComments);
router.post('/:id/comments', requireAuth, requireRole('ADMIN', 'ACCOUNTS'), addInvoiceComment);

module.exports = router;
