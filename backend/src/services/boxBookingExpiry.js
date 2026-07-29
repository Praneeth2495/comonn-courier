const cron = require('node-cron');
const { prisma } = require('../config/db');
const { sendEmail } = require('./emailService');

// How far ahead of endDate the "expiring soon" warning goes out.
const REMINDER_DAYS = 3;

const BOX_STORAGE_ADDRESS = process.env.BOX_STORAGE_ADDRESS || '<office address not configured — set BOX_STORAGE_ADDRESS>';

function boxAddress(box) {
  return `${BOX_STORAGE_ADDRESS}, Box ${box.number}`;
}

/**
 * Warns both the renting customer AND every admin/staff user a few days
 * before a booking's endDate — confirmed with the user this isn't
 * customer-only, since staff need to know to expect the box to free up.
 * expiryReminderSentAt guards against sending this more than once per
 * booking (cleared on renewal, so the cycle restarts against the new
 * endDate — see boxBooking.controller.js's markBoxBookingPaid).
 */
async function sendExpiryReminders() {
  const cutoff = new Date(Date.now() + REMINDER_DAYS * 24 * 60 * 60 * 1000);
  const bookings = await prisma.boxBooking.findMany({
    where: { status: 'ACTIVE', expiryReminderSentAt: null, endDate: { lte: cutoff } },
    include: { box: true, boxSize: true, customer: true },
  });
  if (!bookings.length) return 0;

  const staff = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'STAFF'] }, isActive: true } });

  let sent = 0;
  for (const booking of bookings) {
    try {
      const daysLeft = Math.max(0, Math.ceil((new Date(booking.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
      await sendEmail({
        to: booking.customer.email,
        from: process.env.EMAIL_FROM_NOREPLY || 'Comonn <noreply@comonn.in>',
        subject: `Your Comonn storage box expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#171C2C;">
            <h2 style="color:#0E1B3D;margin-bottom:8px;">Your storage box is expiring soon</h2>
            <p style="font-size:13.5px;color:#5B6478;line-height:1.6;">Hi ${booking.customer.fullName || ''},</p>
            <p style="font-size:13.5px;color:#5B6478;line-height:1.6;">Your ${booking.boxSize.name} box (<b>${boxAddress(booking.box)}</b>) expires on ${new Date(booking.endDate).toLocaleDateString('en-IN')}. Renew from your dashboard to keep this box, or arrange to collect anything inside it before then.</p>
          </div>
        `,
      });
      for (const member of staff) {
        await sendEmail({
          to: member.email,
          from: process.env.EMAIL_FROM_NOREPLY || 'Comonn <noreply@comonn.in>',
          subject: `Storage box ${boxAddress(booking.box)} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
          html: `<p style="font-family:sans-serif;font-size:13.5px;color:#171C2C;">${booking.customer.fullName || booking.customer.email} — ${boxAddress(booking.box)} — expires ${new Date(booking.endDate).toLocaleDateString('en-IN')}. Check whether it needs to be cleared once expired.</p>`,
        });
      }
      await prisma.boxBooking.update({ where: { id: booking.id }, data: { expiryReminderSentAt: new Date() } });
      sent += 1;
    } catch (err) {
      console.error(`boxBookingExpiry reminder failed for booking ${booking.id}:`, err.message);
    }
  }
  return sent;
}

/**
 * Flips a booking to EXPIRED once its endDate has passed. Deliberately
 * does NOT touch Box.status — confirmed with the user that a box never
 * auto-returns to the pool; staff/admin release it manually (see
 * releaseBox in boxBooking.controller.js) once it's been physically
 * cleared out.
 */
async function expireOverdueBookings() {
  const { count } = await prisma.boxBooking.updateMany({
    where: { status: 'ACTIVE', endDate: { lte: new Date() } },
    data: { status: 'EXPIRED' },
  });
  return count;
}

function startBoxBookingExpiryJob() {
  // A free slot alongside the other daily jobs (see merchantInvoiceGenerator.js at 00:05, partyInvoiceRecurrence.js at 00:10).
  cron.schedule('15 0 * * *', () => {
    sendExpiryReminders().catch((err) => console.error('boxBookingExpiry reminders failed:', err.message));
    expireOverdueBookings().catch((err) => console.error('boxBookingExpiry expiry pass failed:', err.message));
  }, { timezone: 'Asia/Kolkata' });
}

module.exports = { startBoxBookingExpiryJob, sendExpiryReminders, expireOverdueBookings, REMINDER_DAYS, boxAddress, BOX_STORAGE_ADDRESS };
