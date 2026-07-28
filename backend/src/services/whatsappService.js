// Meta WhatsApp Cloud API client — structured like emailService.js (native
// fetch, no new dependency). Sends pre-approved Message Templates only:
// WhatsApp doesn't allow free-form business-initiated messages outside a
// 24h post-customer-reply window, so every proactive status update has to
// go through a template Meta has already reviewed and approved.
async function sendTemplateMessage({ to, templateName, params = [] }) {
  const version = process.env.WHATSAPP_API_VERSION || 'v20.0';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to, // digits only, country code, no "+" — e.g. "919876543210"
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components: params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }] : [],
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`WhatsApp API error (${res.status}): ${body}`);
    err.status = 502;
    throw err;
  }
  return res.json();
}

module.exports = { sendTemplateMessage };
