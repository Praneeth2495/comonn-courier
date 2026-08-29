// Single source of truth for the admin-panel pages that ADMIN can grant to
// individual STAFF/ACCOUNTS users via User.allowedPages (see the Users
// panel in AdminDashboard.jsx). Overview/Orders*/Inventory/Profile are
// universal (not in this list — always visible to STAFF/ACCOUNTS). Two
// pages are deliberately excluded and stay hard ADMIN-only in code, never
// toggleable: "Users" (granting it is equivalent to granting full
// role-management control) and "Merchants" (merchant records carry live
// API keys — see the "admin-only, not staff" comment in
// routes/merchant.routes.js).
// *Orders is universal for viewing, but the management actions gated by
// requirePage('orders') (status/assign-driver/comments/payment-link email)
// do respect this list.
const PAGE_KEYS = [
  'orders',
  'accounts',
  'inventory',
  'batchscan',
  'printlabel',
  'rates',
  'onboarding',
  'customsclients',
  'storage',
  'assets',
];

const PAGE_LABELS = {
  orders: 'Orders (manage)',
  accounts: 'Accounts',
  inventory: 'Inventory',
  batchscan: 'Scan',
  printlabel: 'Print Label',
  rates: 'Zones & Rates',
  onboarding: 'Onboarding',
  customsclients: 'Customs Client',
  storage: 'Storage',
  assets: 'Assets',
};

// Used once, at migration time, to backfill existing STAFF/ACCOUNTS users
// so the new per-user toggle doesn't silently change anyone's access on
// the day it ships — same default breadth each role already had.
const DEFAULT_ALLOWED_PAGES_BY_ROLE = {
  STAFF: ['orders', 'inventory', 'batchscan', 'printlabel'],
  ACCOUNTS: ['orders', 'accounts', 'inventory', 'onboarding', 'storage'],
};

module.exports = { PAGE_KEYS, PAGE_LABELS, DEFAULT_ALLOWED_PAGES_BY_ROLE };
