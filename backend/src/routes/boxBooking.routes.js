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

router.get('/admin/sizes', requireAuth, requireRole('ADMIN', 'STAFF'), listBoxSizesAdmin);
router.post('/admin/sizes', requireAuth, requireRole('ADMIN', 'STAFF'), createBoxSize);
router.patch('/admin/sizes/:id', requireAuth, requireRole('ADMIN', 'STAFF'), updateBoxSize);
router.get('/admin/boxes', requireAuth, requireRole('ADMIN', 'STAFF'), listBoxes);
router.post('/admin/boxes', requireAuth, requireRole('ADMIN', 'STAFF'), createBox);
router.patch('/admin/boxes/:id/retire', requireAuth, requireRole('ADMIN', 'STAFF'), retireBox);
router.patch('/admin/boxes/:id/release', requireAuth, requireRole('ADMIN', 'STAFF'), releaseBox);
router.get('/admin/customers', requireAuth, requireRole('ADMIN', 'STAFF'), searchCustomers);
router.get('/admin/bookings', requireAuth, requireRole('ADMIN', 'STAFF'), listAllBookings);
router.post('/admin/bookings', requireAuth, requireRole('ADMIN', 'STAFF'), createBookingForCustomer);
router.patch('/admin/bookings/:id', requireAuth, requireRole('ADMIN', 'STAFF'), updateBookingDates);
router.patch('/admin/bookings/:id/status', requireAuth, requireRole('ADMIN', 'STAFF'), updateBookingStatus);
router.get('/admin/bookings/:id/comments', requireAuth, requireRole('ADMIN', 'STAFF'), listBookingComments);
router.post('/admin/bookings/:id/comments', requireAuth, requireRole('ADMIN', 'STAFF'), addBookingComment);

module.exports = router;
