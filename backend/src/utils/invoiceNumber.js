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

/**
 * Generates RIN<seq>/PIN<seq> for Receivable/Payable invoices — same
 * yearly-resetting counter mechanism as generateInvoiceNumber, just keyed
 * separately per direction so the two sequences don't interleave.
 */
async function generatePartyInvoiceNumber(direction) {
  const kind = direction === 'PAYABLE' ? 'payable' : 'receivable';
  const prefix = direction === 'PAYABLE' ? 'PIN' : 'RIN';
  const seq = await nextYearlySequence(kind, new Date());
  return `${prefix}${seq}`;
}

module.exports = { generateInvoiceNumber, generatePartyInvoiceNumber };
