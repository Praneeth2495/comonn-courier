const crypto = require('crypto');
const { prisma } = require('../config/db');

/**
 * GET /api/whatsapp/webhook — Meta's one-time verification handshake, run
 * whenever the Callback URL is (re)saved in WhatsApp Manager. Meta sends
 * hub.mode=subscribe, hub.verify_token (must match WHATSAPP_VERIFY_TOKEN),
 * and hub.challenge (echoed back as plain text to prove ownership).
 */
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Forbidden');
}

/**
 * POST /api/whatsapp/webhook — delivery/read receipts and incoming
 * messages from Meta. Verifies the X-Hub-Signature-256 header (HMAC-SHA256
 * of the raw body using WHATSAPP_APP_SECRET, Meta's App Secret — not the
 * access token) whenever that secret is configured; otherwise accepts
 * unverified (logs a warning) so the endpoint still works during initial
 * setup before the secret is added.
 */
// Meta's payload groups events under entry[].changes[].value.statuses[] —
// each is one message's lifecycle update (sent -> delivered -> read, or
// failed with an errors[] array). Matched back to the WhatsappMessage row
// created at send time via providerMessageId (Meta's wamid). A status
// update for a wamid we don't have (e.g. arrived before the create() above
// finished, or a message sent before this table existed) is silently
// skipped — nothing to attach it to.
async function applyStatusUpdate(status) {
  if (!status?.id) return;
  const data = { status: status.status };
  if (status.status === 'failed' && status.errors?.length) {
    data.errorMessage = status.errors.map((e) => e.title || e.message).join('; ').slice(0, 500);
  }
  await prisma.whatsappMessage.updateMany({ where: { providerMessageId: status.id }, data });
}

async function handleWebhookEvent(req, res) {
  try {
    const secret = process.env.WHATSAPP_APP_SECRET;
    const signatureHeader = req.headers['x-hub-signature-256'];
    if (secret) {
      const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.body).digest('hex')}`;
      if (signatureHeader !== expected) {
        console.error('WhatsApp webhook: signature mismatch, rejecting');
        return res.status(400).send('Invalid signature');
      }
    } else if (signatureHeader) {
      console.warn('WhatsApp webhook: WHATSAPP_APP_SECRET not set, skipping signature verification');
    }

    const event = JSON.parse(req.body);
    const statuses = (event.entry || [])
      .flatMap((e) => e.changes || [])
      .flatMap((c) => c.value?.statuses || []);
    await Promise.all(statuses.map(applyStatusUpdate));
    if (statuses.length === 0) console.log('WhatsApp webhook event (no statuses):', JSON.stringify(event));
  } catch (err) {
    console.error('WhatsApp webhook: failed to process event:', err.message);
  }
  // Always 200 — Meta disables the webhook after repeated non-200
  // responses, and there's nothing to retry on this side regardless.
  res.sendStatus(200);
}

module.exports = { verifyWebhook, handleWebhookEvent };
