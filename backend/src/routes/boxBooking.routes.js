const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  listBoxSizes,
  createBooking,
  confirmBookingPayment,
  listMyBookings,
  downloadInvoice,
  renewBooking,
  listBoxSizesAdmin,
  createBoxSize,
  updateBoxSize,
  listBoxes,
  createBox,
  retireBox,
  releaseBox,
  listAllBookings,
  updateBookingDates,
  updateBookingStatus,
  searchCustomers,
  createBookingForCustomer,
  listBookingComments,
  addBookingComment,
} = require('../controllers/boxBooking.controller');

router.get('/sizes', listBoxSizes);

router.post('/', requireAuth, createBooking);
router.post('/:id/confirm', requireAuth, confirmBookingPayment);
router.get('/mine', requireAuth, listMyBookings);
router.get('/:id/invoice', requireAuth, downloadInvoice);
router.post('/:id/renew', requireAuth, renewBooking);

router.get('/admin/sizes', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), listBoxSizesAdmin);
router.post('/admin/sizes', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), createBoxSize);
router.patch('/admin/sizes/:id', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), updateBoxSize);
router.get('/admin/boxes', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), listBoxes);
router.post('/admin/boxes', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), createBox);
router.patch('/admin/boxes/:id/retire', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), retireBox);
router.patch('/admin/boxes/:id/release', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), releaseBox);
router.get('/admin/customers', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), searchCustomers);
router.get('/admin/bookings', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), listAllBookings);
router.post('/admin/bookings', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), createBookingForCustomer);
router.patch('/admin/bookings/:id', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), updateBookingDates);
router.patch('/admin/bookings/:id/status', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), updateBookingStatus);
router.get('/admin/bookings/:id/comments', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), listBookingComments);
router.post('/admin/bookings/:id/comments', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), addBookingComment);

module.exports = router;
