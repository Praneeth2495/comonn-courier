const { prisma } = require('../config/db');

/**
 * Generates CMN-<year>-<sequential 6-digit> e.g. CMN-2026-000123.
 * Uses an atomic upsert+increment on a per-year counter row rather than
 * count()-then-+1, which races under concurrent order creation (two
 * requests can read the same count and both try to create the same
 * orderNumber, hitting the unique constraint).
 */
async function generateOrderNumber() {
  const year = new Date().getFullYear();
  const counter = await prisma.orderNumberCounter.upsert({
    where: { year },
    update: { value: { increment: 1 } },
    create: { year, value: 1 },
  });
  const seq = String(counter.value).padStart(6, '0');
  return `CMN-${year}-${seq}`;
}

/** Generates a trackable consignment number, e.g. CN + 10 digits */
function generateTrackingNumber() {
  const digits = Math.floor(1000000000 + Math.random() * 8999999999);
  return `CN${digits}`;
}

module.exports = { generateOrderNumber, generateTrackingNumber };
