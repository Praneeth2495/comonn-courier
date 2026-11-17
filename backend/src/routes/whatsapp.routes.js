const router = require('express').Router();
const { requireAuth, requireRole, requirePage } = require('../middleware/auth');
const { listConversations, getConversation, sendReply, getUnreadCount } = require('../controllers/whatsappConversation.controller');

router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), requirePage('whatsapp'));

router.get('/unread-count', getUnreadCount);
router.get('/conversations', listConversations);
router.get('/conversations/:phone', getConversation);
router.post('/conversations/:phone/replies', sendReply);

module.exports = router;
