const cron = require('node-cron');
const { prisma } = require('../config/db');
const { sendEmail } = require('./emailService');
const { issuePasswordSetToken, passwordSetUrl } = require('./accountProvisioning');

// How long a guest-checkout account is given to set its own password (via
// the print-labels page's "Set up my password" button) before we follow up
// with a dedicated account-creation email instead of bundling it into the
// labels/invoice or booking-confirmation email.
const FOLLOWUP_DELAY_MS = 60 * 60 * 1000;

function renderAccountSetupEmailHtml(user, rawToken) {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#171C2C;background:#F7F5F0;padding:22px;">
      <div style="background:#fff;border-radius:14px;padding:22px;border:1px solid #E7E3DA;">
        <h2 style="color:#0E1B3D;margin:0 0 8px;font-size:19px;">We've created an account for you!</h2>
        <p style="font-size:13.5px;color:#5B6478;line-height:1.6;margin:0 0 14px;">
          To make managing your international shipments easier, we've set up a private customer portal for you. Use it to track packages live, download labels and invoices, and manage your saved addresses.
        </p>
        <div style="background:#F7F5F0;border-radius:12px;padding:14px 16px;">
          <p style="margin:0 0 4px;font-size:13px;"><b>Username:</b> ${user.email}</p>
          <p style="margin:0;font-size:13px;"><b>Password:</b> Not set yet — for your security</p>
        </div>
        <a href="${passwordSetUrl(rawToken)}" style="display:block;text-align:center;margin-top:18px;background:#FF5A36;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:10px;font-size:15px;">Set your password →</a>
        <p style="font-size:11.5px;color:#8A93A6;text-align:center;margin-top:14px;">This secure link expires in 24 hours. If it expires, just visit our login page and click &quot;Forgot password?&quot; to receive a new one.</p>
      </div>
    </div>
  `;
}

/**
 * Finds guest-checkout accounts (see accountProvisioning.js's
 * ensureCustomerAccount) whose password is still the unusable random one
 * from creation — i.e. the customer never used the print-labels page's
 * "Set up my password" button — and, once an hour has passed since
 * creation, sends them a standalone account-setup email. Self-registered
 * accounts always have passwordSetAt set at creation, so they never
 * qualify. accountSetupEmailSentAt guards against sending this more than
 * once per account.
 */
async function sendPendingAccountSetupEmails() {
  const cutoff = new Date(Date.now() - FOLLOWUP_DELAY_MS);
  const users = await prisma.user.findMany({
    where: {
      role: 'CUSTOMER',
      passwordSetAt: null,
      accountSetupEmailSentAt: null,
      createdAt: { lte: cutoff },
    },
  });

  let sent = 0;
  for (const user of users) {
    try {
      const rawToken = await issuePasswordSetToken(user.id);
      await sendEmail({
        to: user.email,
        from: process.env.EMAIL_FROM_NOREPLY || 'Comonn <noreply@comonn.in>',
        subject: 'Set up your Comonn account',
        html: renderAccountSetupEmailHtml(user, rawToken),
      });
      await prisma.user.update({ where: { id: user.id }, data: { accountSetupEmailSentAt: new Date() } });
      sent += 1;
    } catch (err) {
      console.error(`accountSetupFollowup: failed for user ${user.id}:`, err.message);
    }
  }
  return sent;
}

function startAccountSetupFollowupJob() {
  // Checks every 10 minutes — frequent enough that the 1-hour delay is
  // reasonably precise without needing a dedicated per-account scheduler.
  cron.schedule('*/10 * * * *', () => {
    sendPendingAccountSetupEmails().catch((err) => console.error('accountSetupFollowup job failed:', err.message));
  });
}

module.exports = { startAccountSetupFollowupJob, sendPendingAccountSetupEmails };
