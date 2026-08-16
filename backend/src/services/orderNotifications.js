const { prisma } = require('../config/db');
const { sendTemplateMessage } = require('./whatsappService');

// PAID/PICKUP_CONFIRMED are the "your order is booked" moment — this one
// always sends, regardless of the customer's WhatsApp opt-in choice (see
// Order.whatsappOptIn, set on the Payment page). Deliberately narrow set
// of follow-up statuses (just these two, not every tracking transition) —
// only sends if they opted in. All templates must be pre-approved in
// Meta's WhatsApp Manager before use.
const CONFIRMATION_STATUSES = new Set(['PAID', 'PICKUP_CONFIRMED']);
const CONFIRMATION_TEMPLATE = 'order_confirmed';

const UPDATE_TEMPLATES = {
  PICKED_UP: 'order_picked_up',
  OUT_FOR_DELIVERY: 'order_out_for_delivery',
};

// All three approved templates (order_confirmed, order_picked_up,
// order_out_for_delivery) take exactly 2 body params — name and order
// number — see their approved bodies in WhatsApp Manager. None use a
// dynamic URL; the "Track Order" button on each is a static Quick Reply.
async function notifyRecipient(templateName, contactName, phone, trackingNumber) {
  if (!phone) return;
  const to = phone.replace(/\D/g, '');
  if (!to) return;
  try {
    await sendTemplateMessage({
      to,
      templateName,
      params: [contactName || 'there', trackingNumber],
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

    await Promise.all([
      notifyRecipient(templateName, order.senderAddress?.contactName, order.senderAddress?.phone, trackingNumber),
      notifyRecipient(templateName, order.receiverAddress?.contactName, order.receiverAddress?.phone, trackingNumber),
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
