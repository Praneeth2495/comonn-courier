const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const inventory = require('../controllers/inventory.controller');

router.use(requireAuth, requireRole('ADMIN', 'STAFF'));

router.get('/', inventory.listInventory);
router.post('/', inventory.createInventoryItem);
router.patch('/:id', inventory.updateInventoryItem);
router.delete('/:id', inventory.deleteInventoryItem);

module.exports = router;
