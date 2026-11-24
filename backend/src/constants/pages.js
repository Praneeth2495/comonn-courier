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
// Ordered to match the admin sidebar's own top-to-bottom order (see TABS
// in AdminDashboard.jsx), with each sub-feature permission (assets,
// onboarding) placed right after the full page it belongs to (Accounts,
// Staff) — kept in sync with the frontend's own PAGE_KEYS, which is what
// actually controls the Page-access checkbox order admins see.
const PAGE_KEYS = [
  'orders',
  'accounts',
  'assets',
  'inventory',
  'batchscan',
  'printlabel',
  'rates',
  'customsclients',
  'subcontractors',
  'storage',
  'customers',
  'whatsapp',
  'onboarding',
];

const PAGE_LABELS = {
  orders: 'Orders (manage)',
  accounts: 'Accounts',
  inventory: 'Inventory',
  batchscan: 'Scan',
  printlabel: 'Print Label',
  rates: 'Pricing',
  onboarding: 'Onboarding',
  customsclients: 'Customs Client',
  storage: 'Storage',
  assets: 'Assets',
  // Separate from the ADMIN-only "Users" tab (role/permission management)
  // — this only shows customer accounts, their orders, and wallet balance,
  // with no ability to touch staff/admin accounts or roles at all, so it's
  // safe to grant to STAFF individually.
  customers: 'Customers',
  // Inbound WhatsApp replies + the ability to send freeform replies back —
  // its own key rather than folded into 'orders' since reading customer
  // conversations is a distinct, more sensitive capability than order
  // dispatch/status management.
  whatsapp: 'WhatsApp',
};

// Sub-tabs inside the (always-visible) Orders page — separate from
// PAGE_KEYS above, which only ever gates whole pages. An empty
// User.allowedOrderTabs means "no restriction, show every tab" (the
// pre-existing behavior for every STAFF/ACCOUNTS account), not "show
// none" — unlike allowedPages, there was never a blank-slate day-one
// default to seed here, so admin opts a user INTO a restriction by
// picking specific tabs rather than opting them out of a default set.
const ORDER_TAB_KEYS = ['bookings', 'pickup', 'delivery', 'unconfirmed', 'manifest', 'loadsheet'];

// Sub-tabs inside the Accounts page — same "empty = no restriction" rule
// as ORDER_TAB_KEYS. Does NOT include the Accounts page's "Assets" tab,
// which keeps using the separate `assets` entry in PAGE_KEYS above.
const ACCOUNTS_TAB_KEYS = ['overview', 'bookings', 'receivable', 'payable', 'salary'];
const ACCOUNTS_TAB_LABELS = {
  overview: 'Overview',
  bookings: 'Bookings',
  receivable: 'Receivable',
  payable: 'Payable',
  salary: 'Salary',
};

// Sub-tabs inside the (always-visible) Overview page, PLUS three of the
// always-visible Summary tab's own KPI tiles — staffActivity/riderActivity/
// accountsActivity each show every staff/rider/accounts user's name and
// individual order-activity counts (not just the viewer's own), so they're
// gated the same way as the deeper Staff/Region overview tabs rather than
// being unconditionally visible to every STAFF account. dayOfWeek/airports
// stay always-visible — they show aggregate operational numbers already
// scoped to the viewer's own assigned regions, not other people's
// individual activity, so there's nothing to scope further. Unlike
// ORDER_TAB_KEYS/ACCOUNTS_TAB_KEYS, empty means CLOSED — none of these six
// visible — since this replaces the old canViewOverviewBreakdown boolean,
// which was also closed-by-default.
const OVERVIEW_TAB_KEYS = ['staff', 'region', 'staffActivity', 'riderActivity', 'accountsActivity'];
const OVERVIEW_TAB_LABELS = {
  staff: 'Staff overview',
  region: 'Hub overview',
  staffActivity: 'Summary: Staff activity tile',
  riderActivity: 'Summary: Rider activity tile',
  accountsActivity: 'Summary: Accounts activity tile',
};

// Sub-tabs inside the Print Label page — same "empty = no restriction"
// rule as ORDER_TAB_KEYS.
const PRINTLABEL_TAB_KEYS = ['scan', 'manual'];
const PRINTLABEL_TAB_LABELS = {
  scan: 'Scan & Print',
  manual: 'Manual Label',
};

// Sub-tabs inside the Scan page — same "empty = no restriction" rule as
// ORDER_TAB_KEYS. "locations" additionally requires ADMIN/STAFF role (see
// BatchScanPanel.jsx's canManageLocations) even when granted here.
const BATCHSCAN_TAB_KEYS = ['scan', 'batches', 'locations'];
const BATCHSCAN_TAB_LABELS = {
  scan: 'Scan',
  batches: 'Saved batches',
  locations: 'Barcode locations',
};

module.exports = {
  PAGE_KEYS,
  PAGE_LABELS,
  ORDER_TAB_KEYS,
  ACCOUNTS_TAB_KEYS,
  ACCOUNTS_TAB_LABELS,
  OVERVIEW_TAB_KEYS,
  OVERVIEW_TAB_LABELS,
  PRINTLABEL_TAB_KEYS,
  PRINTLABEL_TAB_LABELS,
  BATCHSCAN_TAB_KEYS,
  BATCHSCAN_TAB_LABELS,
};
