const crypto = require('crypto');

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
function handleWebhookEvent(req, res) {
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
    // Meta's payload groups events under entry[].changes[].value — status
    // updates (sent/delivered/read/failed) and incoming messages both land
    // here. Not acted on yet, just logged for visibility — add real
    // handling (e.g. persisting delivery failures) once there's a concrete
    // need for it.
    console.log('WhatsApp webhook event:', JSON.stringify(event));
  } catch (err) {
    console.error('WhatsApp webhook: failed to process event:', err.message);
  }
  // Always 200 — Meta disables the webhook after repeated non-200
  // responses, and there's nothing to retry on this side regardless.
  res.sendStatus(200);
}

module.exports = { verifyWebhook, handleWebhookEvent };
