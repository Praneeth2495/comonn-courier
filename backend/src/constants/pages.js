// Single source of truth for the admin-panel pages that ADMIN can grant to
// individual STAFF/ACCOUNTS users via User.allowedPages (see the Users
// panel in AdminDashboard.jsx). Overview/Orders*/Inventory/Profile are
// universal (not in this list — always visible to STAFF/ACCOUNTS), and
// "Users" is deliberately never toggleable (granting it is equivalent to
// granting full role-management control, so it stays ADMIN-only in code).
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
  'merchants',
  'customsclients',
  'storage',
];

const PAGE_LABELS = {
  orders: 'Orders (manage)',
  accounts: 'Accounts',
  inventory: 'Inventory',
  batchscan: 'Scan',
  printlabel: 'Print Label',
  rates: 'Zones & Rates',
  onboarding: 'Onboarding',
  merchants: 'Merchants',
  customsclients: 'Customs Client',
  storage: 'Storage',
};

// Used once, at migration time, to backfill existing STAFF/ACCOUNTS users
// so the new per-user toggle doesn't silently change anyone's access on
// the day it ships — same default breadth each role already had.
const DEFAULT_ALLOWED_PAGES_BY_ROLE = {
  STAFF: ['orders', 'inventory', 'batchscan', 'printlabel'],
  ACCOUNTS: ['orders', 'accounts', 'inventory', 'onboarding', 'storage'],
};

module.exports = { PAGE_KEYS, PAGE_LABELS, DEFAULT_ALLOWED_PAGES_BY_ROLE };
