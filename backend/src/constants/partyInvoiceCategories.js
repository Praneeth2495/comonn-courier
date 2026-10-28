// Shared between manifest.controller.js (bulk cost-sheet upsert),
// partyInvoice.controller.js (manual category tagging + salary quick-add),
// and admin.controller.js (Accounts Overview's cost-by-category grouping)
// — single source of truth for PartyInvoiceCategory's labels so all three
// stay in sync with the Prisma enum.

const PARTY_INVOICE_CATEGORY_LABELS = {
  ORIGIN_CUSTOMS: 'Origin Customs',
  DEST_CUSTOMS: 'Destination Customs',
  AIRLINE: 'Airline Fare',
  HUB: 'Hub',
  DELIVERY: 'Delivery Charges',
  STATIONERY: 'Stationery',
  COMPANY: 'Company',
  MISC: 'Miscellaneous',
  SALARY: 'Salary',
};

// The 7 categories the manifest cost-sheet form (Accounts Overview →
// "Where the cost goes" → click a manifest) fills in bulk. SALARY is
// deliberately excluded — it's never manifest-linked, only ever set via
// the Payable tab's salary quick-add form.
const MANIFEST_COST_CATEGORIES = ['ORIGIN_CUSTOMS', 'DEST_CUSTOMS', 'AIRLINE', 'HUB', 'DELIVERY', 'STATIONERY', 'COMPANY', 'MISC'];

module.exports = { PARTY_INVOICE_CATEGORY_LABELS, MANIFEST_COST_CATEGORIES };
