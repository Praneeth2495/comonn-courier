const router = require('express').Router();
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');
const {
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
  cancelOrder,
} = require('../controllers/order.controller');

// Guest checkout allowed — optionalAuth attaches req.user if logged in
router.post('/', optionalAuth, createOrder);

router.get('/', requireAuth, listOrders);
router.get('/:id', requireAuth, getOrder);
router.post('/:id/cancel', requireAuth, cancelOrder);
router.patch('/:id/status', requireAuth, requireRole('ADMIN', 'STAFF'), updateOrderStatus);

module.exports = router;
