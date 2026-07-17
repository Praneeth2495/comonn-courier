const { prisma } = require('../config/db');

/** Generates CMN-<year>-<sequential 6-digit> e.g. CMN-2026-000123 */
async function generateOrderNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.order.count({
    where: { orderNumber: { startsWith: `CMN-${year}-` } },
  });
  const seq = String(count + 1).padStart(6, '0');
  return `CMN-${year}-${seq}`;
}

/** Generates a trackable consignment number, e.g. CN + 10 digits */
function generateTrackingNumber() {
  const digits = Math.floor(1000000000 + Math.random() * 8999999999);
  return `CN${digits}`;
}

module.exports = { generateOrderNumber, generateTrackingNumber };
