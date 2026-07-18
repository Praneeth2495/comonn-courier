const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { listAddresses, createAddress, updateAddress, deleteAddress } = require('../controllers/address.controller');

router.use(requireAuth);

router.get('/', listAddresses);
router.post('/', createAddress);
router.patch('/:id', updateAddress);
router.delete('/:id', deleteAddress);

module.exports = router;
