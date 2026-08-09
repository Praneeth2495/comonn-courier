const { prisma } = require('../config/db');

function pad2(n) {
  return String(n).padStart(2, '0');
}

// The Node process's local clock may be UTC (or anything else) depending on
// the host, so day/month/year for the order number are derived explicitly
// from IST rather than from Date's local getters — this keeps the number
// tied to the Indian calendar date at booking time regardless of server or
// customer timezone.
const IST_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

function getIstDateParts(date) {
  const parts = IST_PARTS_FORMATTER.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { year: Number(lookup.year), month: Number(lookup.month), day: Number(lookup.day) };
}

/**
 * Atomically advances the named monthly counter and returns the new value.
 * Uses upsert+increment (not count()-then-+1) so concurrent requests never
 * read the same value and collide on the unique constraint.
 */
async function nextMonthlySequence(kind, year, month) {
  const key = `${kind}-${year}-${pad2(month)}`;
  const counter = await prisma.sequenceCounter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  });
  return counter.value;
}

/**
 * Generates DM<seq> e.g. 881 for the 1st order created on 8 August (IST).
 * Day and month are plain numbers, never zero-padded (8, not 08; January is
 * 1, not 01). The sequence resets to 1 at the start of each calendar month
 * (IST) and is also never zero-padded, so it never repeats within a month.
 */
async function generateOrderNumber() {
  const { year, month, day } = getIstDateParts(new Date());
  const seq = await nextMonthlySequence('order', year, month);
  return `${day}${month}${seq}`;
}

module.exports = { generateOrderNumber };
