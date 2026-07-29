const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  listBoxSizes,
  createBooking,
  confirmBookingPayment,
  listMyBookings,
  renewBooking,
  listBoxSizesAdmin,
  createBoxSize,
  updateBoxSize,
  listBoxes,
  createBox,
  retireBox,
  releaseBox,
  listAllBookings,
} = require('../controllers/boxBooking.controller');

router.get('/sizes', listBoxSizes);

router.post('/', requireAuth, createBooking);
router.post('/:id/confirm', requireAuth, confirmBookingPayment);
router.get('/mine', requireAuth, listMyBookings);
router.post('/:id/renew', requireAuth, renewBooking);

router.get('/admin/sizes', requireAuth, requireRole('ADMIN', 'STAFF'), listBoxSizesAdmin);
router.post('/admin/sizes', requireAuth, requireRole('ADMIN', 'STAFF'), createBoxSize);
router.patch('/admin/sizes/:id', requireAuth, requireRole('ADMIN', 'STAFF'), updateBoxSize);
router.get('/admin/boxes', requireAuth, requireRole('ADMIN', 'STAFF'), listBoxes);
router.post('/admin/boxes', requireAuth, requireRole('ADMIN', 'STAFF'), createBox);
router.patch('/admin/boxes/:id/retire', requireAuth, requireRole('ADMIN', 'STAFF'), retireBox);
router.patch('/admin/boxes/:id/release', requireAuth, requireRole('ADMIN', 'STAFF'), releaseBox);
router.get('/admin/bookings', requireAuth, requireRole('ADMIN', 'STAFF'), listAllBookings);

module.exports = router;
