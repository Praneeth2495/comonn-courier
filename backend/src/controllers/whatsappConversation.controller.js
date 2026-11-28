const { prisma } = require('../config/db');
const { sendSessionMessage } = require('../services/whatsappService');

function last10(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

// WhatsApp only allows a business-initiated freeform (non-template) reply
// within 24h of the customer's own last message — outside that window
// Gupshup rejects the send outright. Checked here (not just left to
// Gupshup's error) so the UI can proactively disable the reply box with an
// explanation instead of only finding out after a failed attempt.
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

async function getSessionState(phone) {
  const lastInbound = await prisma.whatsappReply.findFirst({
    where: { phone, direction: 'IN' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!lastInbound) return { lastInboundAt: null, sessionExpiresAt: null, canReply: false };
  const sessionExpiresAt = new Date(lastInbound.createdAt.getTime() + SESSION_WINDOW_MS);
  return { lastInboundAt: lastInbound.createdAt, sessionExpiresAt, canReply: sessionExpiresAt > new Date() };
}

// Picks whichever address on the matched order actually corresponds to
// this phone number, for display in the inbox — the match itself (see
// whatsappInbox.controller.js) doesn't record which side matched.
function displayName(order, phone) {
  if (!order) return null;
  const target = last10(phone);
  if (target && last10(order.senderAddress?.phone) === target) return order.senderAddress.contactName;
  if (target && last10(order.receiverAddress?.phone) === target) return order.receiverAddress.contactName;
  return order.senderAddress?.contactName || order.receiverAddress?.contactName || null;
}

/**
 * GET /api/admin/whatsapp/conversations — one row per phone number that
 * has ever sent or received a freeform WhatsApp message, newest first.
 * There's no separate read-tracking field on WhatsappReply (would be
 * overkill for a single-admin-team inbox), so "needsReply" is just
 * "the most recent message in this thread is inbound" — good enough to
 * surface which conversations are waiting on a human.
 */
async function listConversations(req, res, next) {
  try {
    const latestPerPhone = await prisma.whatsappReply.groupBy({
      by: ['phone'],
      _max: { createdAt: true },
    });

    const conversations = await Promise.all(
      latestPerPhone.map(async ({ phone, _max }) => {
        const latest = await prisma.whatsappReply.findFirst({
          where: { phone, createdAt: _max.createdAt },
          include: {
            order: { select: { id: true, orderNumber: true, senderAddress: true, receiverAddress: true } },
          },
        });
        if (!latest) return null;
        return {
          phone,
          lastMessage: { body: latest.body, direction: latest.direction, createdAt: latest.createdAt },
          needsReply: latest.direction === 'IN',
          order: latest.order ? { id: latest.order.id, orderNumber: latest.order.orderNumber } : null,
          customerName: displayName(latest.order, phone),
        };
      })
    );

    conversations.sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));
    res.json({ conversations: conversations.filter(Boolean) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/whatsapp/unread-count — how many conversations currently
 * "need a reply" (same definition as listConversations' needsReply: the
 * most recent message in that thread is inbound). Deliberately its own
 * lightweight endpoint rather than reusing listConversations — this gets
 * polled continuously from the sidebar badge regardless of which admin
 * tab is open, so it skips the order/display-name lookups that endpoint
 * does for every conversation.
 */
async function getUnreadCount(req, res, next) {
  try {
    const latestPerPhone = await prisma.whatsappReply.groupBy({
      by: ['phone'],
      _max: { createdAt: true },
    });
    const directions = await Promise.all(
      latestPerPhone.map(({ phone, _max }) =>
        prisma.whatsappReply.findFirst({ where: { phone, createdAt: _max.createdAt }, select: { direction: true } })
      )
    );
    const count = directions.filter((d) => d?.direction === 'IN').length;
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

// attachmentData is a raw Bytes blob — strip it from any JSON response (it's
// fetched separately via downloadReplyAttachment) and expose a boolean flag
// instead, same convention as asset.controller.js's toAssetResponse.
function toReplyResponse(reply) {
  const { attachmentData, ...rest } = reply;
  return { ...rest, hasAttachment: Boolean(attachmentData) };
}

/** GET /api/admin/whatsapp/conversations/:phone — full thread, oldest first. */
async function getConversation(req, res, next) {
  try {
    const { phone } = req.params;
    const rows = await prisma.whatsappReply.findMany({
      where: { phone },
      orderBy: { createdAt: 'asc' },
      include: { sentBy: { select: { id: true, fullName: true } } },
    });
    const messages = rows.map(toReplyResponse);
    const latestOrder = await prisma.whatsappReply.findFirst({
      where: { phone, orderId: { not: null } },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { id: true, orderNumber: true, senderAddress: true, receiverAddress: true } } },
    });
    const session = await getSessionState(phone);
    res.json({
      phone,
      messages,
      order: latestOrder?.order ? { id: latestOrder.order.id, orderNumber: latestOrder.order.orderNumber } : null,
      customerName: latestOrder?.order ? displayName(latestOrder.order, phone) : null,
      ...session,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/whatsapp/conversations/:phone/replies — sends a freeform
 * WhatsApp message and logs it as an OUT row regardless of send outcome,
 * same audit-everything convention as notifyRecipient in
 * orderNotifications.js, so a failed send still shows up in the thread
 * with the real Gupshup error instead of silently vanishing.
 */
async function sendReply(req, res, next) {
  try {
    const { phone } = req.params;
    const { body, orderId } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'body is required' });

    const session = await getSessionState(phone);
    if (!session.canReply) {
      return res.status(403).json({
        error: session.lastInboundAt
          ? 'This conversation\'s 24-hour reply window has closed. The customer needs to message again before you can reply.'
          : 'No message has been received from this number yet — a freeform reply can only be sent within 24 hours of the customer\'s own message.',
      });
    }

    try {
      const result = await sendSessionMessage({ to: phone, body: body.trim() });
      const reply = await prisma.whatsappReply.create({
        data: {
          orderId: orderId || null,
          phone,
          direction: 'OUT',
          body: body.trim(),
          providerMessageId: result.messages?.[0]?.id || null,
          status: result.status || 'accepted',
          sentById: req.user.id,
        },
      });
      res.status(201).json({ reply });
    } catch (sendErr) {
      const reply = await prisma.whatsappReply.create({
        data: {
          orderId: orderId || null,
          phone,
          direction: 'OUT',
          body: body.trim(),
          status: 'failed',
          sentById: req.user.id,
        },
      });
      res.status(502).json({ error: sendErr.message, reply });
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { listConversations, getConversation, sendReply, getUnreadCount };
