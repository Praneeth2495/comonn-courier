// Gupshup BSP client — replaced the direct Meta Cloud API integration after
// Meta Business Manager blocked adding a payment method on the WABA
// directly. Gupshup fronts the same underlying Meta infrastructure (our
// number/templates migrated over with their verified status intact), so
// messages still have to go through pre-approved templates — these ids are
// Gupshup's own template ids (apps.gupshup.io > WhatsApp > COMONN app >
// Templates), not Meta's.
const TEMPLATE_IDS = {
  order_confirmed: '66ba59dd-9108-4923-96ba-5733be5af2ac',
  order_picked_up: 'efad0fb4-d569-4577-be01-95a1efb7e749',
  order_out_for_delivery: '5217a858-1e44-4035-886b-6ddf9c2f91d9',
  // Awaiting Gupshup template approval — submit these in the Gupshup
  // console (apps.gupshup.io > WhatsApp > COMONN app > Templates), then
  // paste the real template id in here once approved. Until then, sends
  // using these keys fail gracefully (logged to WhatsappMessage as
  // "failed", never throws past the fire-and-forget callers) — see
  // adminOrderAlert.js / dailyOrderSummary.js.
  //
  // Suggested template text:
  //   admin_new_order: "New order {{1}} placed — ₹{{2}}, {{3}} to {{4}}."
  //     params: [orderNumber, grandTotal, originCity, destinationCity]
  //   daily_order_summary: "Daily summary for {{1}}:\nTotal orders: {{2}}\nCollected today: {{3}}\nOverdue: {{4}}"
  //     params: [dateLabel, totalToday, collectedToday, overdueToday]
  admin_new_order: '',
  daily_order_summary: '',
};

// params must already be in the template's flat left-to-right order — body
// placeholders first ({{1}}, {{2}}, ...), then the button's dynamic-URL
// suffix (if any) appended last. See the "Use Template" setup for each
// template in the Gupshup console for exact ordering.
async function sendTemplateMessage({ to, templateName, params = [] }) {
  const templateId = TEMPLATE_IDS[templateName];
  if (!templateId) {
    const err = new Error(`No Gupshup template id configured for "${templateName}"`);
    err.status = 500;
    throw err;
  }

  const body = new URLSearchParams({
    channel: 'whatsapp',
    source: process.env.GUPSHUP_SOURCE_NUMBER,
    destination: to,
    'src.name': 'COMONN',
    template: JSON.stringify({ id: templateId, params: params.map(String) }),
  });

  const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
    method: 'POST',
    headers: {
      apikey: process.env.GUPSHUP_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 'error') {
    const err = new Error(`Gupshup API error (${res.status}): ${JSON.stringify(data)}`);
    err.status = 502;
    throw err;
  }
  // Normalized to look like the old Meta response shape so callers (and the
  // WhatsappMessage audit log) don't need to change: messages[0].id.
  return { messages: [{ id: data.messageId }], status: data.status };
}

module.exports = { sendTemplateMessage };
