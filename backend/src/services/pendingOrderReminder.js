const cron = require('node-cron');
const { prisma } = require('../config/db');
const { sendEmail } = require('./emailService');
const { sendTemplateMessage } = require('./whatsappService');

// How long an order sits UNFINISHED (quote + details saved, "Book now"
// clicked, payment never completed) before we nudge the customer to
// finish. Guests never get this — no verified contact on an UNFINISHED
// order to safely message (see the "guest" note on REMINDER_DELAY_MS's
// query below) — only signed-up customers (Order.userId set), who have a
// real account email on file.
const REMINDER_DELAY_MS = 12 * 60 * 60 * 1000;

function continueOrderUrl(orderId) {
  const base = (process.env.CLIENT_ORIGIN || 'https://www.comonn.in').split(',')[0].trim();
  return `${base}/pay/${orderId}`;
}

function renderReminderEmailHtml(order) {
  const url = continueOrderUrl(order.id);
  const name = order.user?.fullName || order.receiverAddress?.contactName || 'there';
  const route = `${order.senderAddress?.city || 'India'} → ${order.receiverAddress?.city || ''}, ${order.receiverAddress?.countryCode || ''}`;
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#171C2C;background:#F7F5F0;padding:22px;">
      <div style="background:#fff;border-radius:14px;padding:22px;border:1px solid #E7E3DA;">
        <h2 style="color:#0E1B3D;margin:0 0 8px;font-size:19px;">You have a pending order</h2>
        <p style="font-size:13.5px;color:#5B6478;line-height:1.6;margin:0 0 14px;">
          Hi ${name}, your shipment ${route} (order <b>${order.orderNumber}</b>) is all set up — it just needs payment to go out for pickup.
        </p>
        <a href="${url}" style="display:block;text-align:center;margin-top:4px;background:#FF5A36;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:10px;font-size:15px;">Continue order →</a>
        <p style="font-size:11.5px;color:#8A93A6;text-align:center;margin-top:14px;">If you've already paid or no longer need this shipment, you can safely ignore this email.</p>
      </div>
    </div>
  `;
}

/**
 * Finds signed-up customers' UNFINISHED orders older than 12h that haven't
 * already been reminded, and sends one email + one WhatsApp "continue your
 * order" nudge each (WhatsApp only once pending_order_reminder has a real,
 * approved Gupshup template id — see whatsappService.js). Every order is
 * re-checked live right before sending (not just filtered in the initial
 * query) so one already paid in another browser/session between the query
 * and the send never gets a stale "you still owe this" nudge.
 * pendingOrderReminderSentAt guards against sending more than once.
 */
async function sendPendingOrderReminders() {
  const cutoff = new Date(Date.now() - REMINDER_DELAY_MS);
  const orders = await prisma.order.findMany({
    where: {
      status: 'UNFINISHED',
      userId: { not: null },
      pendingOrderReminderSentAt: null,
      createdAt: { lte: cutoff },
    },
    include: { user: true, senderAddress: true, receiverAddress: true },
  });

  let sent = 0;
  for (const order of orders) {
    try {
      // Live re-check — the query above already filters on status, but
      // that was potentially several seconds (or, under load, longer) ago;
      // this is the actual guarantee that nothing gets reminded after
      // having been paid in the meantime.
      const fresh = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true, pendingOrderReminderSentAt: true } });
      if (!fresh || fresh.status !== 'UNFINISHED' || fresh.pendingOrderReminderSentAt) continue;

      if (order.user?.email) {
        await sendEmail({
          to: order.user.email,
          from: process.env.EMAIL_FROM_NOREPLY || 'Comonn <noreply@comonn.in>',
          subject: `Pending order ${order.orderNumber} — continue whenever you're ready`,
          html: renderReminderEmailHtml(order),
        });
      }

      const phone = (order.user?.phone || order.senderAddress?.phone || '').replace(/\D/g, '');
      if (phone) {
        try {
          await sendTemplateMessage({
            to: phone,
            templateName: 'pending_order_reminder',
            // Body {{1}}, {{2}}, then the button's own restarted {{1}} —
            // the button URL itself (https://comonn.in/pay/{{1}}) is baked
            // into the approved template, so this is just the bare order
            // id, not a full URL. See whatsappService.js's TEMPLATE_IDS
            // comment for the same convention on other button templates.
            params: [order.user?.fullName || 'there', order.orderNumber, order.id],
          });
        } catch (waErr) {
          // Not configured yet (empty template id) is expected until the
          // template is approved — log once, don't fail the whole
          // reminder over it; the email above still went out.
          console.warn(`pendingOrderReminder: WhatsApp skipped for order ${order.orderNumber}:`, waErr.message);
        }
      }

      await prisma.order.update({ where: { id: order.id }, data: { pendingOrderReminderSentAt: new Date() } });
      sent += 1;
    } catch (err) {
      console.error(`pendingOrderReminder: failed for order ${order.orderNumber}:`, err.message);
    }
  }
  return sent;
}

function startPendingOrderReminderJob() {
  // Every 15 minutes — frequent enough that the 12h mark is hit reasonably
  // close to on time, same reasoning as accountSetupFollowup.js's 10-minute
  // cadence for its own 1h delay.
  cron.schedule('*/15 * * * *', () => {
    sendPendingOrderReminders().catch((err) => console.error('pendingOrderReminder job failed:', err.message));
  });
}

module.exports = { startPendingOrderReminderJob, sendPendingOrderReminders };
