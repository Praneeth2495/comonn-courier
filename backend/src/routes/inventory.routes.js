const router = require('express').Router();
const { requireAuth, requireRole, requirePage } = require('../middleware/auth');
const inventory = require('../controllers/inventory.controller');

router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), requirePage('inventory'));

router.get('/', inventory.listInventory);
router.post('/', inventory.createInventoryItem);
router.patch('/:id', inventory.updateInventoryItem);
router.delete('/:id', inventory.deleteInventoryItem);

module.exports = router;
