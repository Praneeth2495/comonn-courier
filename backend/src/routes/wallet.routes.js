const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { listMyTransactions } = require('../controllers/wallet.controller');

router.use(requireAuth);
router.get('/transactions', listMyTransactions);

module.exports = router;
