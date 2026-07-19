const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const admin = require('../controllers/admin.controller');

router.use(requireAuth, requireRole('ADMIN', 'STAFF'));

router.get('/dashboard', admin.dashboardStats);

router.get('/zones', admin.listZones);
router.post('/zones', requireRole('ADMIN'), admin.createZone);
router.post('/zones/countries', requireRole('ADMIN'), admin.upsertCountryMapping);

router.get('/staff-zones', requireRole('ADMIN'), admin.listStaffZoneAssignments);
router.put('/staff-zones/:userId', requireRole('ADMIN'), admin.setStaffZoneAssignments);

router.get('/services', admin.listServicesAdmin);
router.post('/services', requireRole('ADMIN'), admin.upsertService);

router.get('/rate-cards', admin.listRateCards);
router.post('/rate-cards', requireRole('ADMIN'), admin.upsertRateCard);
router.delete('/rate-cards/:id', requireRole('ADMIN'), admin.deleteRateCard);

router.get('/surcharges', admin.listSurcharges);
router.post('/surcharges', requireRole('ADMIN'), admin.upsertSurcharge);

router.get('/users', requireRole('ADMIN'), admin.listUsers);
router.patch('/users/:id', requireRole('ADMIN'), admin.setUserRole);

module.exports = router;
