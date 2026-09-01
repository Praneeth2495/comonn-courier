const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { clockIn, clockOut, listMine, listAll } = require('../controllers/attendance.controller');

// Every internal role clocks in/out and sees their own history — CUSTOMER
// never reaches this router at all.
router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS', 'DRIVER'));
router.post('/clock-in', clockIn);
router.post('/clock-out', clockOut);
router.get('/mine', listMine);
// Seeing every user's history is ADMIN-only — layered on top of the
// requireRole(...) above, same pattern as admin.routes.js's rate-cards
// delete route.
router.get('/admin', requireRole('ADMIN'), listAll);

module.exports = router;
