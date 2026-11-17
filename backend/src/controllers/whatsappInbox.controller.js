const crypto = require('crypto');
const { prisma } = require('../config/db');

// Gupshup doesn't sign payloads with an HMAC the way Meta did (no
// X-Hub-Signature-256 equivalent) — its documented way to secure a webhook
// is HTTP Basic Auth, configured as a username/password on the callback
// URL in the Gupshup dashboard (WhatsApp > COMONN app > settings > Callback
// URL > Basic Auth). GUPSHUP_WEBHOOK_USERNAME/PASSWORD here must match
// whatever's entered there, or every request gets rejected with 401.
function verifyBasicAuth(req) {
  const user = process.env.GUPSHUP_WEBHOOK_USERNAME;
  const pass = process.env.GUPSHUP_WEBHOOK_PASSWORD;
  if (!user || !pass) {
    console.warn('Gupshup webhook: GUPSHUP_WEBHOOK_USERNAME/PASSWORD not set, skipping auth check');
    return true;
  }
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const [reqUser, reqPass] = decoded.split(':');
  const expected = `${user}:${pass}`;
  const got = `${reqUser || ''}:${reqPass || ''}`;
  // Lengths must match before timingSafeEqual (it throws on mismatched
  // buffer sizes) — padding both to the same fixed length first keeps the
  // comparison itself still constant-time regardless of the real lengths.
  const a = Buffer.from(expected.padEnd(128, '\0'));
  const b = Buffer.from(got.padEnd(128, '\0'));
  return crypto.timingSafeEqual(a, b) && got === expected;
}

// Gupshup's own webhook shape (NOT Meta's — see whatsapp.controller.js for
// that one, kept untouched in case anything still points at it). Apps have
// exactly one callback URL in the Gupshup console, so this single endpoint
// has to handle everything Gupshup sends: inbound customer messages and
// delivery/read/failed status for everything we've sent (both pre-approved
// template sends, logged in WhatsappMessage, and freeform replies, logged
// in WhatsappReply).
//
// Payload shapes (per Gupshup's docs — confirm against a real delivered
// event once this is live, since BSP payloads sometimes drift from their
// own docs):
//   inbound text:  { type: "message", payload: { id, type: "text", payload: { text }, sender: { phone, name } } }
//   status event:  { type: "message-event", payload: { id, type: "enqueued"|"sent"|"delivered"|"read"|"failed", destination, ... } }
function normalizePhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

// Matches an inbound message to the most likely Order by phone, comparing
// on the last 10 digits (the local number, country-code-agnostic) since
// Address.phone is stored however the customer typed it at checkout
// ("+91 86860 30346", "8686030346", ...) while Gupshup's `sender.phone` is
// always digits-only with country code. Best-effort only — a genuinely
// unmatched reply still gets stored, just without an orderId, and shows up
// in the admin inbox grouped by phone instead of by order.
async function matchOrder(phone) {
  const last10 = phone.slice(-10);
  if (!last10) return null;
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { senderAddress: { phone: { contains: last10 } } },
        { receiverAddress: { phone: { contains: last10 } } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return order?.id || null;
}

async function handleInboundMessage(payload) {
  const text = payload?.payload?.text;
  const senderPhone = normalizePhone(payload?.sender?.phone || payload?.source);
  if (!senderPhone || !text) return;

  const orderId = await matchOrder(senderPhone);
  await prisma.whatsappReply.create({
    data: {
      orderId,
      phone: senderPhone,
      direction: 'IN',
      body: String(text).slice(0, 4000),
      providerMessageId: payload?.id || null,
      status: 'received',
    },
  });
}

async function handleStatusEvent(payload) {
  const providerMessageId = payload?.id;
  const status = payload?.type; // enqueued | sent | delivered | read | failed
  if (!providerMessageId || !status) return;

  // A freeform reply we sent (WhatsappReply rows with direction "OUT") is
  // checked first since that's what this webhook was actually built for;
  // falling back to WhatsappMessage keeps template-send status updates
  // working the same way they did via the old Meta-shape webhook, in case
  // Gupshup's dashboard ends up with only this one callback URL configured
  // for everything.
  const reply = await prisma.whatsappReply.updateMany({ where: { providerMessageId }, data: { status } });
  if (reply.count > 0) return;
  await prisma.whatsappMessage.updateMany({ where: { providerMessageId }, data: { status } });
}

async function handleGupshupWebhook(req, res) {
  try {
    const event = req.body;
    if (event?.type === 'message') {
      await handleInboundMessage(event.payload);
    } else if (event?.type === 'message-event') {
      await handleStatusEvent(event.payload);
    } else {
      console.log('Gupshup webhook: unrecognized event:', JSON.stringify(event));
    }
  } catch (err) {
    console.error('Gupshup webhook: failed to process event:', err.message);
  }
  // Always 200 — same reasoning as the Meta webhook: Gupshup disables a
  // callback URL after repeated non-200 responses, and there's nothing to
  // retry on this side regardless.
  res.sendStatus(200);
}

module.exports = { handleGupshupWebhook };
