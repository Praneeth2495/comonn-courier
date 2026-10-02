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
 * Same idea as nextMonthlySequence but scoped to the whole year — the
 * counter only resets on 1 January, not at the start of every month.
 */
async function nextYearlySequence(kind, year) {
  const key = `${kind}-${year}`;
  const counter = await prisma.sequenceCounter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  });
  return counter.value;
}

module.exports = { nextMonthlySequence, nextYearlySequence, getIstDateParts };
