const WARRANTY_TIERS = [
  { coverage: 10000, price: 0 },
  { coverage: 25000, price: 300 },
  { coverage: 50000, price: 550 },
  { coverage: 75000, price: 800 },
  { coverage: 100000, price: 1050 },
  { coverage: 125000, price: 1300 },
  { coverage: 150000, price: 1500 },
];

const FLAT_ADDONS = {
  CARDBOARD: { label: 'Heavy-duty cardboard', unitPrice: 100, perBox: true },
  PACKING: { label: 'Packing service', unitPrice: 300, perBox: false },
  WRAPPING: { label: 'Wrapping service', unitPrice: 100, perBox: true },
};

function warrantyLabel(coverage) {
  return `Transit warranty — ₹${coverage.toLocaleString('en-IN')} cover`;
}

module.exports = { WARRANTY_TIERS, FLAT_ADDONS, warrantyLabel };
