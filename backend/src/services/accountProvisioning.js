const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/db');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A guest checkout order carries the customer's OTP-verified email
 * (order.otpEmail) — more trustworthy than the free-text address email
 * field, since it was actually proven deliverable during checkout.
 *
 * If no account exists for that email yet, creates one with an unusable
 * random password (the customer sets a real one via the emailed link),
 * links the order to it, and pulls the order's sender/receiver addresses
 * into the account's saved address book. Returns null if the order
 * already belongs to a logged-in customer or has no verified email.
 */
async function ensureCustomerAccount(order) {
  if (order.userId) return null;
  const email = (order.otpEmail || '').toLowerCase().trim();
  if (!email) return null;

  let user = await prisma.user.findUnique({ where: { email } });
  let isNewAccount = false;
  let rawToken = null;

  if (!user) {
    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: order.senderAddress?.contactName || email,
        phone: order.senderAddress?.phone || null,
        role: 'CUSTOMER',
      },
    });
    isNewAccount = true;
  }

  await prisma.order.update({ where: { id: order.id }, data: { userId: user.id } });

  // Clone into new rows rather than flipping isSaved on the order's own
  // address rows — those stay permanently referenced by the order
  // (senderAddressId/receiverAddressId is a RESTRICT foreign key), so
  // reusing them here would make the resulting "saved" entry impossible
  // to ever delete from the account's address book.
  const addressIds = [order.senderAddressId, order.receiverAddressId].filter(Boolean);
  if (addressIds.length) {
    const addresses = await prisma.address.findMany({ where: { id: { in: addressIds } } });
    for (const addr of addresses) {
      await prisma.address.create({
        data: {
          userId: user.id,
          isSaved: true,
          label: addr.label,
          contactName: addr.contactName,
          phone: addr.phone,
          email: addr.email,
          instructions: addr.instructions,
          line1: addr.line1,
          line2: addr.line2,
          city: addr.city,
          state: addr.state,
          postcode: addr.postcode,
          countryCode: addr.countryCode,
        },
      });
    }
  }

  if (isNewAccount) {
    rawToken = await issuePasswordSetToken(user.id);
  }

  return { user, isNewAccount, rawToken };
}

async function issuePasswordSetToken(userId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await prisma.passwordSetToken.create({
    data: { userId, tokenHash, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });
  return rawToken;
}

function passwordSetUrl(rawToken) {
  const base = (process.env.CLIENT_ORIGIN || 'https://www.comonn.in').split(',')[0].trim();
  return `${base}/set-password?token=${rawToken}`;
}

module.exports = { ensureCustomerAccount, issuePasswordSetToken, passwordSetUrl };
