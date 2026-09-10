const router = require('express').Router();
const employee = require('../controllers/employee.controller');

// Public — no requireAuth. The invited employee has no usable password yet
// (see employee.controller.js's approveEmployee); the unguessable token
// itself is the only gate, same trust model as /api/auth/set-password.
router.get('/:token', employee.getOnboardingInvite);
router.post('/:token', employee.submitOnboardingInvite);

module.exports = router;
