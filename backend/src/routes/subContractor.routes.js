const router = require('express').Router();
const { requireAuth, requireRole, requirePage } = require('../middleware/auth');
const { listSubContractors, createSubContractor } = require('../controllers/subContractor.controller');

router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), requirePage('subcontractors'));
router.get('/', listSubContractors);
router.post('/', createSubContractor);

module.exports = router;
