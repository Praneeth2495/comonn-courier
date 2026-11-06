const { prisma } = require('../config/db');

// Live, admin-editable coverage brackets (Overview page > Service fees) —
// see WarrantyTier in schema.prisma. Was a hardcoded array here before;
// now DB-backed so admin edits apply immediately without a deploy.
async function getWarrantyTiers() {
  const rows = await prisma.warrantyTier.findMany({ orderBy: { coverage: 'asc' } });
  return rows.map((r) => ({ coverage: r.coverage, price: Number(r.price) }));
}

// Live, admin-editable fees (Overview page > Service fees) for the three
// flat add-ons — see AddonPricing in schema.prisma. Shaped back into the
// same { CODE: { label, unitPrice, perBox } } map updateAddons already
// expects, so that caller didn't need to change beyond awaiting this
// instead of reading a static constant.
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
