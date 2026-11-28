const router = require('express').Router();
const { optionalAuth, requireAuth, requireRole, requirePage } = require('../middleware/auth');
const {
  listConversations,
  getConversation,
  sendReply,
  getUnreadCount,
  downloadReplyAttachment,
} = require('../controllers/whatsappConversation.controller');

// Registered ahead of the blanket requireAuth below, same reasoning as the
// label/invoice download routes (label.routes.js): a plain <a href>/<img
// src> can't carry the Authorization bearer header the rest of this app
// uses, so this one route relies on the reply id being an unguessable UUID
// instead of a session check — same trust model, not a new one.
router.get('/conversations/:phone/replies/:replyId/attachment', optionalAuth, downloadReplyAttachment);

router.use(requireAuth, requireRole('ADMIN', 'STAFF', 'ACCOUNTS'), requirePage('whatsapp'));

router.get('/unread-count', getUnreadCount);
router.get('/conversations', listConversations);
router.get('/conversations/:phone', getConversation);
router.post('/conversations/:phone/replies', sendReply);

module.exports = router;
