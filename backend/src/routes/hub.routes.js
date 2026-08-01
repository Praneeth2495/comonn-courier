const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { listHubs, createHub, updateHub } = require('../controllers/hub.controller');

router.get('/', requireAuth, requireRole('ADMIN', 'STAFF'), listHubs);
router.post('/', requireAuth, requireRole('ADMIN'), createHub);
router.patch('/:id', requireAuth, requireRole('ADMIN'), updateHub);

module.exports = router;
