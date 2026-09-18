const crypto = require('crypto');
const { prisma } = require('../config/db');

const REFERRAL_REWARD_AMOUNT = 300;
// Excludes 0/O/1/I — easy to misread/mistype when a customer reads a code
// out loud or copies it by hand.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length = 7) {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Returns the user's existing referral code, generating and persisting one if they don't have it yet. */
async function ensureReferralCode(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (user?.referralCode) return user.referralCode;

  // Collisions are astronomically unlikely at this alphabet/length, but
  // retry on the unique-constraint violation rather than assume.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
      return code;
    } catch (err) {
      if (err.code !== 'P2002') throw err;
    }
  }
  throw new Error('Could not generate a unique referral code — please try again.');
}

/**
 * Called once, at the moment a brand-new account is created (self-registration
 * or the guest-checkout auto-provisioned account — see accountProvisioning.js)
 * — never afterward, since User.referredById is a one-time, permanent link.
 * Silently no-ops on an invalid code or a self-referral attempt rather than
 * failing account creation over it.
 */
async function applyReferralToNewUser(newUserId, rawReferralCode) {
  const code = rawReferralCode?.trim().toUpperCase();
  if (!code) return;
  const referrer = await prisma.user.findUnique({ where: { referralCode: code } });
  if (!referrer || referrer.id === newUserId) return;
  await prisma.user.update({ where: { id: newUserId }, data: { referredById: referrer.id } });
}

/**
 * The referral payout chokepoint — called from every place an Order
 * actually transitions INTO 'PAID' (see payment.controller.js's
 * markOrdersPaidForProviderOrder and order.controller.js's
 * updateOrderStatus's isManualPaidMark branch). Awards the referrer's ₹300
 * only once per referred user (their first paid order), guarded by
 * referralRewardGranted so a second/third order never pays out again.
 */
async function awardReferralRewardIfEligible(order) {
  if (!order.userId) return;
  const referredUser = await prisma.user.findUnique({ where: { id: order.userId } });
  if (!referredUser || !referredUser.referredById || referredUser.referralRewardGranted) return;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: referredUser.referredById },
      data: { walletBalance: { increment: REFERRAL_REWARD_AMOUNT } },
    }),
    prisma.walletTransaction.create({
      data: {
        userId: referredUser.referredById,
        amount: REFERRAL_REWARD_AMOUNT,
        type: 'REFERRAL_REWARD',
        note: `Referral reward — ${referredUser.fullName}'s first paid order (${order.orderNumber})`,
        orderId: order.id,
      },
    }),
    prisma.user.update({
      where: { id: referredUser.id },
      data: { referralRewardGranted: true },
    }),
  ]);
}

module.exports = { REFERRAL_REWARD_AMOUNT, ensureReferralCode, applyReferralToNewUser, awardReferralRewardIfEligible };
