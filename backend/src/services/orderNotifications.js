const { prisma } = require('../config/db');
const { sendTemplateMessage } = require('./whatsappService');
const { broadcastBookingConfirmed } = require('./bookingFeed');

// PAID/PICKUP_CONFIRMED are the "your order is booked" moment — this one
// always sends, regardless of the customer's WhatsApp opt-in choice (see
// Order.whatsappOptIn, set on the Payment page). Deliberately narrow set
// of follow-up statuses (just these two, not every tracking transition) —
// only sends if they opted in. All templates are pre-approved WhatsApp
// utility templates registered in the Gupshup console (apps.gupshup.io >
// WhatsApp > COMONN app > Templates), carried over from Meta's pre-approved
// template library rather than custom-submitted ones.
const CONFIRMATION_STATUSES = new Set(['PAID', 'PICKUP_CONFIRMED']);
const CONFIRMATION_TEMPLATE = 'order_confirmed';

// Admin's own WhatsApp number (not a customer's) — gets a ping on every
// order placed by anyone, staff or customer, same PAID/PICKUP_CONFIRMED
// moment as the customer's own confirmation. Unconditional (no opt-in
// check) since this is an internal ops alert, not a customer preference.
const ADMIN_WHATSAPP_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER;
const ADMIN_ALERT_TEMPLATE = 'admin_order_alert';

const UPDATE_TEMPLATES = {
  PICKED_UP: 'order_picked_up',
  OUT_FOR_DELIVERY: 'order_out_for_delivery',
};

// Each template has a different body/button shape, so params aren't
// interchangeable — see each template's "Parameters" preview in the Gupshup
// console for the exact wording:
//  - order_confirmed: "Hi {1}, your order {2} has been successfully placed
//    with {3} and is being processed." + a dynamic "View order" button URL
//    (tracking link suffix as a 4th, trailing param).
//  - order_picked_up: "Hi {1}, your order {2} has been shipped and is on
//    the way." No button.
//  - order_out_for_delivery: "Your order {1} is out for delivery! It should
//    arrive by {2}." + a dynamic "Track order" button URL (tracking link
//    suffix as a 3rd, trailing param). No name placeholder — we don't yet
//    track a real delivery ETA, so {2} gets a generic string rather than a
//    fabricated date.
function buildParams(templateName, { contactName, trackingNumber }) {
  const name = contactName || 'there';
  switch (templateName) {
    case CONFIRMATION_TEMPLATE:
      return [name, trackingNumber, 'Comonn', trackingNumber];
    case UPDATE_TEMPLATES.OUT_FOR_DELIVERY:
      return [trackingNumber, 'within 24 hours', trackingNumber];
    case UPDATE_TEMPLATES.PICKED_UP:
    default:
      return [name, trackingNumber];
  }
}

// Every attempt (success or failure) is logged to WhatsappMessage so staff
// can see it on the order detail modal — the webhook (whatsapp.controller.js)
// later updates `status` on the success rows as delivered/read/failed come in.
// `customParams`, when given, is sent as-is instead of going through
// buildParams — for templates (like the admin alert) whose params don't
// fit the {contactName, trackingNumber} shape every customer template uses.
async function notifyRecipient(orderId, templateName, contactName, phone, trackingNumber, customParams) {
  if (!phone) return;
  const to = phone.replace(/\D/g, '');
  if (!to) return;
  try {
    const result = await sendTemplateMessage({
      to,
      templateName,
      params: customParams || buildParams(templateName, { contactName, trackingNumber }),
    });
    await prisma.whatsappMessage.create({
      data: {
        orderId,
        templateName,
        recipientPhone: to,
        recipientName: contactName || null,
        providerMessageId: result.messages?.[0]?.id || null,
        status: result.messages?.[0]?.message_status || 'accepted',
      },
    });
  } catch (err) {
    console.error(`WhatsApp notify failed (template=${templateName}, to=${to}):`, err.message);
    await prisma.whatsappMessage.create({
      data: {
        orderId,
        templateName,
        recipientPhone: to,
        recipientName: contactName || null,
        status: 'failed',
        errorMessage: err.message.slice(0, 500),
      },
    }).catch(() => {}); // never let the audit-log write itself throw
  }
}

/**
 * Fire-and-forget WhatsApp status notification — never throws, mirrors
 * sendReceiverBookingNotification's resilience pattern (label.controller.js)
 * exactly, so a WhatsApp failure (unapproved template, bad number, API
 * outage) can never block or fail the order-status update itself. Takes
 * just the order id so every call site can use it identically regardless
 * of what's already loaded.
 *
 * Confirmation (PAID/PICKUP_CONFIRMED) goes to the sender only — nothing
 * has actually happened on the receiver's end yet at booking time, so
 * notifying them here would be premature. The receiver's first message is
 * order_picked_up, once the parcel has actually moved; from there on,
 * update statuses go to both sender and receiver.
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
        grandTotal: true,
        senderAddress: { select: { contactName: true, phone: true, city: true, countryCode: true } },
        receiverAddress: { select: { contactName: true, phone: true, city: true, countryCode: true } },
      },
    });
    if (!order) return;

    // Public homepage "Booking confirmed" popup (see bookingFeed.js /
    // Home.jsx) — unrelated to WhatsApp opt-in, so this fires unconditionally
    // on the same PAID/PICKUP_CONFIRMED moment, independent of anything below.
    if (isConfirmation) {
      broadcastBookingConfirmed({ city: order.receiverAddress?.city, countryCode: order.receiverAddress?.countryCode });
      notifyRecipient(
        orderId,
        ADMIN_ALERT_TEMPLATE,
        'Admin',
        ADMIN_WHATSAPP_NUMBER,
        order.orderNumber,
        [order.orderNumber, Number(order.grandTotal).toFixed(2), order.senderAddress?.city || '—', order.receiverAddress?.city || '—']
      );
    }

    const templateName = isConfirmation ? CONFIRMATION_TEMPLATE : (order.whatsappOptIn ? updateTemplate : null);
    if (!templateName) return;

    const trackingNumber = order.trackingNumber || order.orderNumber;

    const recipients = [notifyRecipient(orderId, templateName, order.senderAddress?.contactName, order.senderAddress?.phone, trackingNumber)];
    if (!isConfirmation) {
      recipients.push(notifyRecipient(orderId, templateName, order.receiverAddress?.contactName, order.receiverAddress?.phone, trackingNumber));
    }
    await Promise.all(recipients);
  } catch (err) {
    // Genuinely fire-and-forget — callers never await this, so a failure
    // here (e.g. a DB hiccup looking up the order) must never surface as
    // an unhandled rejection. Same resilience contract notifyRecipient
    // already has for the WhatsApp call itself.
    console.error(`notifyOrderStatusChange failed (order=${orderId}, status=${status}):`, err.message);
  }
}

module.exports = { notifyOrderStatusChange };
