const { prisma } = require('../config/db');
const { sendTemplateMessage } = require('./whatsappService');

function siteUrl(pathname) {
  const base = (process.env.CLIENT_ORIGIN || 'https://www.comonn.in').split(',')[0].trim();
  return `${base}${pathname}`;
}

// PAID/PICKUP_CONFIRMED are the "your order is booked" moment — this one
// always sends, regardless of the customer's WhatsApp opt-in choice (see
// Order.whatsappOptIn, set on the Payment page). Deliberately narrow set
// of follow-up statuses (just these two, not every tracking transition) —
// only sends if they opted in. All templates must be pre-approved in
// Meta's WhatsApp Manager before use — these are the proposed names,
// adjust here once the real approved names are known.
const CONFIRMATION_STATUSES = new Set(['PAID', 'PICKUP_CONFIRMED']);
const CONFIRMATION_TEMPLATE = 'order_confirmation';

const UPDATE_TEMPLATES = {
  PICKED_UP: 'order_picked_up',
  OUT_FOR_DELIVERY: 'order_out_for_delivery',
};

async function notifyRecipient(templateName, contactName, phone, trackingNumber, trackUrl) {
  if (!phone) return;
  const to = phone.replace(/\D/g, '');
  if (!to) return;
  try {
    await sendTemplateMessage({
      to,
      templateName,
      params: [contactName || 'there', trackingNumber, trackUrl],
    });
  } catch (err) {
    console.error(`WhatsApp notify failed (template=${templateName}, to=${to}):`, err.message);
  }
}

/**
 * Fire-and-forget WhatsApp status notification to both sender and
 * receiver — never throws, mirrors sendReceiverBookingNotification's
 * resilience pattern (label.controller.js) exactly, so a WhatsApp failure
 * (unapproved template, bad number, API outage) can never block or fail
 * the order-status update itself. Takes just the order id so every call
 * site can use it identically regardless of what's already loaded.
 */
async function notifyOrderStatusChange(orderId, status) {
  try {
    const isConfirmation = CONFIRMATION_STATUSES.has(status);
    const updateTemplate = UPDATE_TEMPLATES[status];
    if (!isConfirmation && !updateTemplate) return;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        trackingNumber: true,
        whatsappOptIn: true,
        senderAddress: { select: { contactName: true, phone: true } },
        receiverAddress: { select: { contactName: true, phone: true } },
      },
    });
    if (!order) return;

    const templateName = isConfirmation ? CONFIRMATION_TEMPLATE : (order.whatsappOptIn ? updateTemplate : null);
    if (!templateName) return;

    const trackingNumber = order.trackingNumber || order.orderNumber;
    const trackUrl = siteUrl(`/track?id=${encodeURIComponent(trackingNumber)}`);

    await Promise.all([
      notifyRecipient(templateName, order.senderAddress?.contactName, order.senderAddress?.phone, trackingNumber, trackUrl),
      notifyRecipient(templateName, order.receiverAddress?.contactName, order.receiverAddress?.phone, trackingNumber, trackUrl),
    ]);
  } catch (err) {
    // Genuinely fire-and-forget — callers never await this, so a failure
    // here (e.g. a DB hiccup looking up the order) must never surface as
    // an unhandled rejection. Same resilience contract notifyRecipient
    // already has for the WhatsApp call itself.
    console.error(`notifyOrderStatusChange failed (order=${orderId}, status=${status}):`, err.message);
  }
}

module.exports = { notifyOrderStatusChange };
