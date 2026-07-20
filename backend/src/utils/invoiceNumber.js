const { prisma } = require('../config/db');

/**
 * Atomically advances the named yearly counter and returns the new value.
 * Same upsert+increment pattern as the monthly order-number sequence, just
 * keyed per calendar year instead of per month.
 */
async function nextYearlySequence(kind, now) {
  const key = `${kind}-${now.getFullYear()}`;
  const counter = await prisma.sequenceCounter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  });
  return counter.value;
}

/**
 * Generates IN<seq> e.g. IN1, IN2, IN3... The sequence only resets when the
 * calendar year changes — unlike order numbers, it does not reset monthly.
 */
async function generateInvoiceNumber() {
  const seq = await nextYearlySequence('invoice', new Date());
  return `IN${seq}`;
}

module.exports = { generateInvoiceNumber };
