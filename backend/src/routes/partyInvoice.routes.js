const router = require('express').Router();
const { requireAuth, requireRole, requirePage } = require('../middleware/auth');
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

// Receivable/Payable invoices are part of the Accounts tab — ADMIN always,
// STAFF/ACCOUNTS only if individually granted the 'accounts' page.
router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), requirePage('accounts'));
router.get('/', listInvoices);
router.post('/', createInvoice);
router.get('/:id', getInvoice);
router.patch('/:id/status', updateInvoiceStatus);
router.post('/:id/send', sendInvoiceEmail);
router.get('/:id/download', downloadInvoicePdf);
router.get('/:id/attachment', downloadInvoiceAttachment);
router.get('/:id/comments', listInvoiceComments);
router.post('/:id/comments', addInvoiceComment);

module.exports = router;
