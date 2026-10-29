const router = require('express').Router();
const { requireAuth, requireRole, requirePage } = require('../middleware/auth');
const {
  listInvoices,
  createInvoice,
  getInvoice,
  updateInvoice,
  updateInvoiceStatus,
  sendInvoiceEmail,
  downloadInvoicePdf,
  downloadInvoiceAttachment,
  listInvoiceComments,
  addInvoiceComment,
  listStaffForSalary,
  listEmployeesForSalaryRoster,
  createSalaryPayment,
} = require('../controllers/partyInvoice.controller');

// Receivable/Payable invoices are part of the Accounts tab — ADMIN always,
// STAFF/ACCOUNTS only if individually granted the 'accounts' page.
router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), requirePage('accounts'));
router.get('/', listInvoices);
router.post('/', createInvoice);
// Declared before the generic '/:id' routes below — otherwise Express
// would match "/staff" and "/salary" as an :id param and these would
// never be reached.
router.get('/staff', listStaffForSalary);
router.post('/salary', createSalaryPayment);
router.get('/:id', getInvoice);
router.patch('/:id', updateInvoice);
router.patch('/:id/status', updateInvoiceStatus);
router.post('/:id/send', sendInvoiceEmail);
router.get('/:id/download', downloadInvoicePdf);
router.get('/:id/attachment', downloadInvoiceAttachment);
router.get('/:id/comments', listInvoiceComments);
router.post('/:id/comments', addInvoiceComment);

module.exports = router;
