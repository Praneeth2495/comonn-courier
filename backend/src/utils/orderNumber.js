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
 * Generates DDMM0<seq> e.g. 180701 for the 1st order created on 18 July.
 * The sequence resets to 1 at the start of each calendar month and is
 * never zero-padded, so it never repeats within a month.
 */
async function generateOrderNumber() {
  const now = new Date();
  const seq = await nextMonthlySequence('order', now);
  return `${pad2(now.getDate())}${pad2(now.getMonth() + 1)}0${seq}`;
}

/** Same DDMM0<seq> scheme, on its own monthly counter so it never collides with order numbers. */
async function generateTrackingNumber() {
  const now = new Date();
  const seq = await nextMonthlySequence('tracking', now);
  return `${pad2(now.getDate())}${pad2(now.getMonth() + 1)}0${seq}`;
}

module.exports = { generateOrderNumber, generateTrackingNumber };
