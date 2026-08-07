const { prisma } = require('../config/db');

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Atomically advances the named monthly counter and returns the new value.
 * Uses upsert+increment (not count()-then-+1) so concurrent requests never
 * read the same value and collide on the unique constraint.
 */
async function nextMonthlySequence(kind, now) {
  const key = `${kind}-${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const counter = await prisma.sequenceCounter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  });
  return counter.value;
}

/**
 * Generates DM<seq> e.g. 881 for the 1st order created on 8 August. Day and
 * month are plain numbers, never zero-padded (8, not 08; January is 1, not
 * 01). The sequence resets to 1 at the start of each calendar month and is
 * also never zero-padded, so it never repeats within a month.
 */
async function generateOrderNumber() {
  const now = new Date();
  const seq = await nextMonthlySequence('order', now);
  return `${now.getDate()}${now.getMonth() + 1}${seq}`;
}

module.exports = { generateOrderNumber };
