const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { listHubs, createHub, updateHub, deleteHub } = require('../controllers/hub.controller');

router.get('/', requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), listHubs);
router.post('/', requireAuth, requireRole('ADMIN'), createHub);
router.patch('/:id', requireAuth, requireRole('ADMIN'), updateHub);
router.delete('/:id', requireAuth, requireRole('ADMIN'), deleteHub);

module.exports = router;
