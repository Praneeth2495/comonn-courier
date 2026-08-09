const router = require('express').Router();
const { requireAuth, requireRole, requirePage } = require('../middleware/auth');
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

router.use('/admin', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), requirePage('storage'));
router.get('/admin/sizes', listBoxSizesAdmin);
router.post('/admin/sizes', createBoxSize);
router.patch('/admin/sizes/:id', updateBoxSize);
router.get('/admin/boxes', listBoxes);
router.post('/admin/boxes', createBox);
router.patch('/admin/boxes/:id/retire', retireBox);
router.patch('/admin/boxes/:id/release', releaseBox);
router.get('/admin/customers', searchCustomers);
router.get('/admin/bookings', listAllBookings);
router.post('/admin/bookings', createBookingForCustomer);
router.patch('/admin/bookings/:id', updateBookingDates);
router.patch('/admin/bookings/:id/status', updateBookingStatus);
router.get('/admin/bookings/:id/comments', listBookingComments);
router.post('/admin/bookings/:id/comments', addBookingComment);

module.exports = router;
