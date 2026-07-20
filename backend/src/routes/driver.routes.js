const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const driver = require('../controllers/driver.controller');

router.use(requireAuth, requireRole('DRIVER'));

router.get('/jobs', driver.listMyJobs);
router.patch('/jobs/:id/picked-up', driver.markPickedUp);

module.exports = router;
