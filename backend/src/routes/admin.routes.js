const router = require('express').Router();
const { requireAuth, requireRole, requirePage } = require('../middleware/auth');
const admin = require('../controllers/admin.controller');
const employee = require('../controllers/employee.controller');

router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'));

router.get('/dashboard', admin.dashboardStats);
router.get('/dashboard/staff', admin.staffOverview);
router.get('/dashboard/regions', admin.regionOverview);

// Used by the Orders page's pickup-assignment picker (ADMIN bypasses
// requirePage; a STAFF/ACCOUNTS user without 'orders' toggled never sees
// the Orders tab to call this from, but the route enforces it either way).
router.get('/pickup-origins', requirePage('orders'), admin.listPickupOrigins);

router.get('/zones', requirePage('rates'), admin.listZones);
router.post('/zones', requireRole('ADMIN'), admin.createZone);
router.post('/zones/countries', requireRole('ADMIN'), admin.upsertCountryMapping);

router.get('/staff-zones', requireRole('ADMIN'), admin.listStaffZoneAssignments);
router.put('/staff-zones/:userId', requireRole('ADMIN'), admin.setStaffZoneAssignments);

router.get('/staff-regions', requireRole('ADMIN'), admin.listStaffRegionAssignments);
router.put('/staff-regions/:userId', requireRole('ADMIN'), admin.setStaffRegionAssignments);

router.get('/services', requirePage('rates'), admin.listServicesAdmin);
router.post('/services', requireRole('ADMIN'), admin.upsertService);

router.get('/rate-cards', requirePage('rates'), admin.listRateCards);
router.post('/rate-cards', requireRole('ADMIN'), admin.upsertRateCard);
router.delete('/rate-cards/:id', requireRole('ADMIN'), admin.deleteRateCard);

router.get('/surcharges', requirePage('rates'), admin.listSurcharges);
router.post('/surcharges', requireRole('ADMIN'), admin.upsertSurcharge);

router.get('/users', requireRole('ADMIN'), admin.listUsers);
router.patch('/users/:id', requireRole('ADMIN'), admin.setUserRole);

router.get('/employees', requirePage('onboarding'), employee.listEmployees);
router.post('/employees', requirePage('onboarding'), employee.createEmployee);
router.get('/employees/:id', requirePage('onboarding'), employee.getEmployee);
router.patch('/employees/:id', requirePage('onboarding'), employee.updateEmployee);
router.get('/employees/:id/id-proof', requirePage('onboarding'), employee.downloadIdProof);

// Available to ADMIN & STAFF (both can dispatch pickup jobs to drivers)
router.get('/drivers', requirePage('orders'), admin.listDrivers);

module.exports = router;
