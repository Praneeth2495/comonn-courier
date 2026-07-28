const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { listClients, createClient } = require('../controllers/customsClient.controller');

router.get('/', requireAuth, requireRole('ADMIN'), listClients);
router.post('/', requireAuth, requireRole('ADMIN'), createClient);

module.exports = router;
