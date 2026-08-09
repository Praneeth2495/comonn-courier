const router = require('express').Router();
const { requireAuth, requireRole, requirePage } = require('../middleware/auth');
const { listClients, createClient } = require('../controllers/customsClient.controller');

router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), requirePage('customsclients'));
router.get('/', listClients);
router.post('/', createClient);

module.exports = router;
