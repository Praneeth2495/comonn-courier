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
  'customers',
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
  // Separate from the ADMIN-only "Users" tab (role/permission management)
  // — this only shows customer accounts, their orders, and wallet balance,
  // with no ability to touch staff/admin accounts or roles at all, so it's
  // safe to grant to STAFF individually.
  customers: 'Customers',
};

// Used once, at migration time, to backfill existing STAFF/ACCOUNTS users
// so the new per-user toggle doesn't silently change anyone's access on
// the day it ships — same default breadth each role already had.
const DEFAULT_ALLOWED_PAGES_BY_ROLE = {
  STAFF: ['orders', 'inventory', 'batchscan', 'printlabel'],
  ACCOUNTS: ['orders', 'accounts', 'inventory', 'onboarding', 'storage'],
};

// Sub-tabs inside the (always-visible) Orders page — separate from
// PAGE_KEYS above, which only ever gates whole pages. An empty
// User.allowedOrderTabs means "no restriction, show every tab" (the
// pre-existing behavior for every STAFF/ACCOUNTS account), not "show
// none" — unlike allowedPages, there was never a blank-slate day-one
// default to seed here, so admin opts a user INTO a restriction by
// picking specific tabs rather than opting them out of a default set.
const ORDER_TAB_KEYS = ['bookings', 'pickup', 'delivery', 'unconfirmed', 'manifest'];

module.exports = { PAGE_KEYS, PAGE_LABELS, DEFAULT_ALLOWED_PAGES_BY_ROLE, ORDER_TAB_KEYS };
