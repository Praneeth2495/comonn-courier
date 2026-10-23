const { prisma } = require('../config/db');

const WARRANTY_TIERS = [
  { coverage: 10000, price: 0 },
  { coverage: 25000, price: 300 },
  { coverage: 50000, price: 550 },
  { coverage: 75000, price: 800 },
  { coverage: 100000, price: 1050 },
  { coverage: 125000, price: 1300 },
  { coverage: 150000, price: 1500 },
];

// Live, admin-editable fees (apps.gupshup... no — AdminDashboard.jsx's
// Overview page > Service fees) for the three flat add-ons — see
// AddonPricing in schema.prisma. Shaped back into the same
// { CODE: { label, unitPrice, perBox } } map updateAddons already expects,
// so that caller didn't need to change beyond awaiting this instead of
// reading a static constant.
async function getFlatAddons() {
  const rows = await prisma.addonPricing.findMany();
  const map = {};
  for (const r of rows) map[r.code] = { label: r.label, unitPrice: Number(r.unitPrice), perBox: r.perBox };
  return map;
}

function warrantyLabel(coverage) {
  return `Transit warranty — ₹${coverage.toLocaleString('en-IN')} cover`;
}

module.exports = { WARRANTY_TIERS, getFlatAddons, warrantyLabel };
