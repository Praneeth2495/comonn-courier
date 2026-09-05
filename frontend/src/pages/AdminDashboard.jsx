import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import { useBooking } from '../api/BookingContext';
import ChangePassword from '../components/ChangePassword';
import BatchScanPanel from '../components/BatchScanPanel';
import MerchantsPanel from '../components/MerchantsPanel';
import PartyInvoicesPanel from '../components/PartyInvoicesPanel';
import CustomsClientsPanel from '../components/CustomsClientsPanel';
import AssetsPanel from '../components/AssetsPanel';
import ClockInOutPanel from '../components/ClockInOutPanel';
import AttendanceAdminPanel from '../components/AttendanceAdminPanel';
import EmployeeOnboardingPanel from '../components/EmployeeOnboardingPanel';
import StorageAdminPanel from '../components/StorageAdminPanel';
import PrintLabelPanel from '../components/PrintLabelPanel';
import ManifestPanel from '../components/ManifestPanel';
import LoadingLogo from '../components/LoadingLogo';
import { OrderDetailModal, OrderCommentsModal } from '../components/OrderDetailModal';
import logoFooter from '../assets/logo-footer.png';

export default function AdminDashboard() {
  const [tab, setTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  // ADMIN always sees every page. STAFF/ACCOUNTS see exactly the pages an
  // admin has individually granted them via User.allowedPages (Users
  // panel) — everyone starts with a role-default set the first time
  // they're promoted (see setUserRole on the backend), then admin can
  // customize per person from there. Orders/Inventory/Overview/Profile are
  // universal (not gated by allowedPages). "Users" and "Merchants" are
  // hardcoded ADMIN-only in code and never appear here regardless of
  // allowedPages — Merchants because merchant records carry live API
  // keys, Users because granting it is equivalent to granting full
  // role-management control.
  const hasPage = (key) => isAdmin || !!user?.allowedPages?.includes(key);

  const TABS = [
    ['overview', 'Overview'],
    ['orders', 'Orders'],
    ...(hasPage('accounts') ? [['accounts', 'Accounts']] : []),
    ...(hasPage('assets') ? [['assets', 'Assets']] : []),
    ['inventory', 'Inventory'],
    ...(hasPage('batchscan') ? [['batchscan', 'Scan']] : []),
    ...(hasPage('printlabel') ? [['printlabel', 'Print Label']] : []),
    ...(hasPage('rates') ? [['rates', 'Zones & Rates']] : []),
    ...(isAdmin ? [['users', 'Users']] : []),
    ...(hasPage('onboarding') ? [['onboarding', 'Onboarding']] : []),
    ...(isAdmin ? [['merchants', 'Merchants']] : []),
    ...(hasPage('customsclients') ? [['customsclients', 'Customs Client']] : []),
    ...(hasPage('storage') ? [['storage', 'Storage']] : []),
    ['attendance', 'Attendance'],
    ['account', 'Profile'],
  ];

  function selectTab(key) {
    setTab(key);
    setSidebarOpen(false);
  }

  return (
    <div className="app-shell">
      <div className="app-mobile-bar">
        <button className="app-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
        <img className="logo-img" src={logoFooter} alt="Comonn" />
      </div>
      {sidebarOpen && <div className="app-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <button className="app-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">✕</button>
        <div className="brand"><img className="logo-img lg" src={logoFooter} alt="Comonn" /><span style={{ fontSize: 12, fontWeight: 700, color: '#93A0C4', textTransform: 'uppercase', letterSpacing: '.06em' }}>Admin</span></div>
        {TABS.map(([key, label]) => (
          <button key={key} className={`app-navlink ${tab === key ? 'active' : ''}`} onClick={() => selectTab(key)}>{label}</button>
        ))}
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <Link to="/" className="app-navlink">← Back to site</Link>
          <button className="app-navlink" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="app-main">
        {tab === 'overview' && <Overview />}
        {tab === 'orders' && <OrdersPanel />}
        {tab === 'accounts' && hasPage('accounts') && <AccountsPanel />}
        {tab === 'assets' && hasPage('assets') && <AssetsPanel />}
        {tab === 'inventory' && <InventoryPanel />}
        {tab === 'batchscan' && hasPage('batchscan') && <BatchScanPanel />}
        {tab === 'printlabel' && hasPage('printlabel') && <PrintLabelPanel />}
        {tab === 'rates' && hasPage('rates') && <RatesPanel />}
        {tab === 'users' && isAdmin && <UsersPanel />}
        {tab === 'onboarding' && hasPage('onboarding') && <EmployeeOnboardingPanel />}
        {tab === 'merchants' && isAdmin && <MerchantsPanel />}
        {tab === 'customsclients' && hasPage('customsclients') && <CustomsClientsPanel />}
        {tab === 'storage' && hasPage('storage') && <StorageAdminPanel />}
        {tab === 'attendance' && <AttendancePanel isAdmin={isAdmin} />}
        {tab === 'account' && <ChangePassword />}
      </main>
    </div>
  );
}

// ADMIN gets a sub-tab to see every user's clock-in/out history alongside
// their own; STAFF/ACCOUNTS only ever see their own (ClockInOutPanel calls
// /attendance/mine, which is scoped server-side to req.user.id regardless).
function AttendancePanel({ isAdmin }) {
  const [subTab, setSubTab] = useState('mine');
  if (!isAdmin) return <ClockInOutPanel />;
  return (
    <div>
      <div className="dash-tabs" style={{ marginBottom: 16 }}>
        <button className={`dash-tab ${subTab === 'mine' ? 'active' : ''}`} onClick={() => setSubTab('mine')}>My attendance</button>
        <button className={`dash-tab ${subTab === 'all' ? 'active' : ''}`} onClick={() => setSubTab('all')}>All staff</button>
      </div>
      {subTab === 'mine' && <ClockInOutPanel />}
      {subTab === 'all' && <AttendanceAdminPanel />}
    </div>
  );
}

function Overview() {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState('summary');
  const [data, setData] = useState(null);
  const now = useState(() => new Date())[0];
  // Month-to-date by default (unlike Accounts, which defaults to the full
  // calendar month) — the stat cards are a "how's this month going so far"
  // snapshot, so defaulting toDate past today would silently include
  // future days that haven't happened yet. Still fully editable via the
  // date inputs below.
  const [fromDate, setFromDate] = useState(isoDate(monthStart(now)));
  const [toDate, setToDate] = useState(isoDate(now));
  const [detailOrder, setDetailOrder] = useState(null);
  // ADMIN always sees the breakdown tabs; a STAFF viewer only does if
  // individually granted access (Users panel) — see requireOverviewBreakdownAccess
  // in admin.controller.js, which enforces the same rule server-side.
  const canSeeBreakdown = user?.role === 'ADMIN' || user?.canViewOverviewBreakdown;

  useEffect(() => {
    function load(silent) {
      if (subTab !== 'summary') return;
      if (!silent) setData(null);
      client.get('/admin/dashboard', { params: { from: fromDate, to: toDate } }).then(({ data }) => setData(data));
    }
    load();
    const interval = setInterval(() => load(true), 30 * 1000);
    return () => clearInterval(interval);
  }, [fromDate, toDate, subTab]);

  async function openDetail(id) {
    const { data } = await client.get(`/orders/${id}`);
    setDetailOrder(data.order);
  }

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 20 }}>Overview</h1>

      {canSeeBreakdown && (
        <div className="dash-tabs" style={{ marginBottom: 16 }}>
          <button className={`dash-tab ${subTab === 'summary' ? 'active' : ''}`} onClick={() => setSubTab('summary')}>Summary</button>
          <button className={`dash-tab ${subTab === 'staff' ? 'active' : ''}`} onClick={() => setSubTab('staff')}>Staff overview</button>
          <button className={`dash-tab ${subTab === 'region' ? 'active' : ''}`} onClick={() => setSubTab('region')}>Region overview</button>
        </div>
      )}

      <div className="card date-toolbar" style={{ marginBottom: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--slate)', fontWeight: 600 }}>Showing bookings from</span>
        <input className="input" type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} />
        <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>to</span>
        <input className="input" type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} />
      </div>

      {subTab === 'summary' && (
        !data ? <LoadingLogo /> : (
          <>
            <div className="stat-grid">
              <Stat label="Total orders" value={data.totals.totalOrders} />
              <Stat label="Pending payment" value={data.totals.pendingPayment} />
              <Stat label="Paid" value={data.totals.paid} />
              <Stat label="In transit" value={data.totals.inTransit} />
              <Stat label="Delivered" value={data.totals.delivered} />
            </div>

            <h3 className="h-md" style={{ margin: '24px 0 12px' }}>Recent orders</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Order</th><th>Service</th><th>Destination</th><th>Status</th></tr></thead>
                <tbody>
                  {data.recentOrders.map((o) => (
                    <tr key={o.id}>
                      <td className="mono"><button className="t-oid" onClick={() => openDetail(o.id)}>{o.orderNumber}</button></td>
                      <td>{o.service.name}</td>
                      <td>{o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</td>
                      <td>{o.status.replace(/_/g, ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}

      {subTab === 'staff' && canSeeBreakdown && <StaffOverviewTable fromDate={fromDate} toDate={toDate} />}
      {subTab === 'region' && canSeeBreakdown && <RegionOverviewTable fromDate={fromDate} toDate={toDate} />}

      {detailOrder && <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
    </div>
  );
}

function StaffOverviewTable({ fromDate, toDate }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    function load(silent) {
      if (!silent) setRows(null);
      client.get('/admin/dashboard/staff', { params: { from: fromDate, to: toDate } }).then(({ data }) => setRows(data.rows));
    }
    load();
    const interval = setInterval(() => load(true), 30 * 1000);
    return () => clearInterval(interval);
  }, [fromDate, toDate]);

  if (!rows) return <LoadingLogo />;

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Staff</th><th>Regions</th><th>Total orders</th><th>Pending payment</th><th>Paid</th><th>In transit</th><th>Delivered</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.staff.id}>
              <td>
                {r.staff.fullName}
                <div style={{ fontSize: 11, color: 'var(--slate-light)' }}>{r.staff.email}</div>
              </td>
              <td>
                {r.regions.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>None assigned</span>
                ) : (
                  r.regions.map((rg, i) => (
                    <span key={i} className="pill pill-cobalt" style={{ fontSize: 11, marginRight: 4, marginBottom: 4, display: 'inline-block' }}>
                      {rg.region ? `${rg.state} · ${rg.region}` : `${rg.state} (all)`}
                    </span>
                  ))
                )}
              </td>
              <td>{r.totals.totalOrders}</td>
              <td>{r.totals.pendingPayment}</td>
              <td>{r.totals.paid}</td>
              <td>{r.totals.inTransit}</td>
              <td>{r.totals.delivered}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No staff accounts yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RegionOverviewTable({ fromDate, toDate }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    function load(silent) {
      if (!silent) setRows(null);
      client.get('/admin/dashboard/regions', { params: { from: fromDate, to: toDate } }).then(({ data }) => setRows(data.rows));
    }
    load();
    const interval = setInterval(() => load(true), 30 * 1000);
    return () => clearInterval(interval);
  }, [fromDate, toDate]);

  if (!rows) return <LoadingLogo />;

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Region</th><th>Total orders</th><th>Pending payment</th><th>Paid</th><th>In transit</th><th>Delivered</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.region.region ? `${r.region.state} · ${r.region.region}` : `${r.region.state} (all)`}</td>
              <td>{r.totals.totalOrders}</td>
              <td>{r.totals.pendingPayment}</td>
              <td>{r.totals.paid}</td>
              <td>{r.totals.inTransit}</td>
              <td>{r.totals.delivered}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No regions assigned to any staff yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

const ORDER_STATUSES = ['UNFINISHED', 'PENDING_PAYMENT', 'PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED', 'PICKED_UP', 'IN_TRANSIT', 'CLEARED_DESTINATION_CUSTOMS', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'EXCEPTION'];

const STATUS_PILL = {
  UNFINISHED: 'pill-warn',
  PENDING_PAYMENT: 'pill-warn',
  PICKUP_CONFIRMED: 'pill-cobalt',
  PAID: 'pill-cobalt',
  LABEL_GENERATED: 'pill-cobalt',
  PICKED_UP: 'pill-cobalt',
  IN_TRANSIT: 'pill-cobalt',
  CLEARED_DESTINATION_CUSTOMS: 'pill-cobalt',
  OUT_FOR_DELIVERY: 'pill-cobalt',
  DELIVERED: 'pill-success',
  CANCELLED: 'pill-danger',
  EXCEPTION: 'pill-danger',
};

// Third element is the status filter; fourth is the filter mode when there's
// no status list — 'hasUser' scopes to orders tied to a registered account,
// 'all' shows every booking regardless of account/status.
// UNFINISHED = a quote+details started but payment never even reached
// (leads for follow-up). PENDING_PAYMENT is now narrower — a pickup-booking
// order staff have already priced and pushed to real payment — tracked
// alongside the rest of the pickup pipeline rather than Unconfirmed.
const ORDER_TABS = [
  ['bookings', 'Bookings', null, 'all'],
  ['pickup', 'Pickup orders', ['PENDING_PAYMENT', 'PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED', 'PICKED_UP']],
  ['delivery', 'Delivery orders', ['IN_TRANSIT', 'CLEARED_DESTINATION_CUSTOMS', 'OUT_FOR_DELIVERY']],
  ['unconfirmed', 'Unconfirmed orders', ['UNFINISHED']],
  ['manifest', 'Manifest'],
];

// How many pickup orders to fetch in one request — effectively "all of
// them" for this tab, so the due-date bucket counts/filter (below) are
// accurate across every matching order, not just one server-paginated page.
const PICKUP_FETCH_ALL_SIZE = 2000;

// Reshapes a fetched order back into the same quoteInput/selectedQuote shape
// the booking flow (Quote/Details/Payment) already knows how to hydrate from,
// so "Edit order" can reuse that flow instead of a separate edit UI.
function toQuoteInput(order, destinationCountryName) {
  // Pickup postcode/suburb/state feed the Quote page's origin-zone pricing
  // and autocomplete — without these, editing an order silently reverts to
  // wildcard pricing and shows a blank pincode field.
  const origin = {
    originPostcode: order.senderAddress?.postcode || undefined,
    originSuburb: order.senderAddress?.city || undefined,
    originState: order.senderAddress?.state || undefined,
  };
  // Same for the destination postcode — without it, the Destination field
  // on the Book page shows blank (and the postcode-zone pricing resolves
  // as if nothing was entered) when editing an existing order.
  const destination = {
    destinationPostcode: order.receiverAddress?.postcode || undefined,
    destinationSuburb: order.receiverAddress?.city || undefined,
    destinationState: order.receiverAddress?.state || undefined,
  };
  if (order.pricingPending) {
    return {
      destinationCountryCode: order.receiverAddress.countryCode,
      destinationCountryName: destinationCountryName || order.receiverAddress.countryCode,
      items: order.items.map((it) => ({ itemType: it.itemType, quantity: it.quantity })),
      pricingPending: true,
      ...origin,
      ...destination,
    };
  }
  return {
    destinationCountryCode: order.receiverAddress.countryCode,
    items: order.items.map((it) => ({
      itemType: it.itemType,
      actualWeightKg: Number(it.actualWeightKg),
      lengthCm: Number(it.lengthCm),
      widthCm: Number(it.widthCm),
      heightCm: Number(it.heightCm),
      quantity: it.quantity,
    })),
    ...origin,
    ...destination,
  };
}

function toSelectedQuote(order) {
  if (order.pricingPending) return null;
  const chargeableWeightKg = Number(order.chargeableWeightKg);
  return {
    service: { code: order.service.code, name: order.service.name, transitDays: order.service.transitDays },
    zone: { code: order.zoneCode, name: order.zoneCode },
    pricing: {
      unitPrice: chargeableWeightKg > 0 ? Math.round((Number(order.baseFreight) / chargeableWeightKg) * 100) / 100 : 0,
      grandTotal: Number(order.grandTotal),
      currency: order.currency,
    },
    weight: { chargeableWeightKg },
  };
}

// pickupDate is a display string like "Wednesday, 23 July" (no year) set at
// booking time — mirrors driverAutoUnassign.js's parser: reconstruct a real
// Date against the current year, rolling forward a year if that guess would
// place it implausibly far in the past (a booking made in late December for
// an early-January pickup).
function parsePickupDateStr(str, referenceDate) {
  if (!str) return null;
  const year = referenceDate.getFullYear();
  let parsed = new Date(`${str} ${year}`);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffDays = (referenceDate - parsed) / 86400000;
  if (diffDays > 270) parsed = new Date(`${str} ${year + 1}`);
  return parsed;
}

function IndiaFlagChip() {
  return (
    <svg viewBox="0 0 60 40">
      <rect width="60" height="40" fill="#FF9933" />
      <rect y="13.3" width="60" height="13.3" fill="#fff" />
      <rect y="26.6" width="60" height="13.4" fill="#138808" />
      <circle cx="30" cy="20" r="3.2" fill="none" stroke="#000080" strokeWidth="0.6" />
    </svg>
  );
}

function OrdersPanel() {
  const [tab, setTab] = useState('pickup');
  // Pickup tab only: origin (sender) state/region.
  const [pickupStates, setPickupStates] = useState([]);
  const [pickupRegionsByState, setPickupRegionsByState] = useState({});
  const [originState, setOriginState] = useState('');
  const [originRegion, setOriginRegion] = useState('');
  // Delivery tab only: destination country/airport chips, same two-tier
  // pattern as the Manifest tab's country+airport pickers — country is
  // single-select ('' = all countries), airports within it are multi-select
  // (all pre-selected on pick = no extra narrowing, matching Manifest's UX).
  const [deliveryAirports, setDeliveryAirports] = useState([]);
  const [deliveryCountryNames, setDeliveryCountryNames] = useState([]);
  const [deliveryCountry, setDeliveryCountry] = useState('');
  const [deliverySelectedAirportCodes, setDeliverySelectedAirportCodes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailOrder, setDetailOrder] = useState(null);
  const [commentOrder, setCommentOrder] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [assigning, setAssigning] = useState(false);
  // Pickup tab only: clicking a due-date bucket chip (Overdue/Today/Future)
  // narrows the table to just that bucket; clicking the same one again
  // clears it back to showing everything.
  const [dueBucket, setDueBucket] = useState('');
  const seqRef = useRef(0);

  function toggleDueBucket(bucket) {
    setDueBucket((prev) => (prev === bucket ? '' : bucket));
    setPage(1);
  }
  const navigate = useNavigate();
  const { setBooking } = useBooking();

  useEffect(() => {
    if (tab === 'pickup' && drivers.length === 0) {
      client.get('/admin/drivers').then(({ data }) => setDrivers(data.drivers)).catch(() => {});
    }
    if (tab === 'pickup' && pickupStates.length === 0) {
      client.get('/admin/pickup-origins').then(({ data }) => {
        setPickupStates(data.states);
        setPickupRegionsByState(data.regionsByState);
      }).catch(() => {});
    }
    if (tab === 'delivery') {
      Promise.all([
        client.get('/orders/delivery-airports'),
        deliveryCountryNames.length === 0 ? client.get('/quote/countries') : Promise.resolve(null),
      ]).then(([airportsRes, countriesRes]) => {
        setDeliveryAirports(airportsRes.data.airports);
        if (countriesRes) setDeliveryCountryNames(countriesRes.data.countries);
      }).catch(() => {});
    }
    setSelectedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const deliveryCountryCodes = [...new Set(deliveryAirports.map((a) => a.countryCode))].sort();
  const deliveryAirportsForCountry = deliveryAirports.filter((a) => a.countryCode === deliveryCountry);

  // No "All Countries" option — always resolves to one destination country
  // at a time, same as the Manifest tab's country picker, defaulting to the
  // first one with orders once the data loads.
  useEffect(() => {
    if (!deliveryCountry && deliveryCountryCodes.length > 0) pickDeliveryCountry(deliveryCountryCodes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryAirports]);

  function pickDeliveryCountry(code) {
    setDeliveryCountry(code);
    setDeliverySelectedAirportCodes(code ? deliveryAirports.filter((a) => a.countryCode === code).map((a) => a.airportCode) : []);
    setPage(1);
  }

  function toggleDeliveryAirport(code) {
    setDeliverySelectedAirportCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
    setPage(1);
  }

  // Picking a different state clears any region filter from the previous
  // state's list — a region name is only meaningful within its own state.
  function selectOriginState(state) {
    setOriginState(state);
    setOriginRegion('');
    setPage(1);
  }

  function load(silent) {
    if (tab === 'manifest') { setLoading(false); return; }
    if (!silent) setLoading(true);
    const seq = ++seqRef.current;
    const tabDef = ORDER_TABS.find(([key]) => key === tab);
    const params = {
      q: q || undefined,
      // Pickup tab always fetches every order matching the current
      // state/region/search filters in one request (not just one page) —
      // the due-date bucket chips below (Overdue/Today/Future) and
      // click-to-filter need the true full set to be accurate, not just
      // whatever happens to be on the currently loaded page. `page`/
      // `pageSize` state still exists for this tab, but only to slice the
      // already-fetched full set for display (see displayOrders below).
      page: tab === 'pickup' ? 1 : page,
      pageSize: tab === 'pickup' ? PICKUP_FETCH_ALL_SIZE : pageSize,
      scope: tab === 'pickup' ? 'pickup' : undefined,
      originState: tab === 'pickup' ? originState || undefined : undefined,
      originRegion: tab === 'pickup' ? originRegion || undefined : undefined,
      destinationCountryCode: tab === 'delivery' ? deliveryCountry || undefined : undefined,
      airportCode: tab === 'delivery' && deliveryCountry && deliverySelectedAirportCodes.length > 0 ? deliverySelectedAirportCodes.join(',') : undefined,
    };
    if (tabDef[2]) params.status = tabDef[2].join(',');
    else if (tabDef[3] === 'hasUser') params.hasUser = 'true';
    else if (tabDef[3] === 'all') params.notStatus = 'UNFINISHED';
    // 'all' mode (Bookings tab): every booking except UNFINISHED (leads that
    // never even reached payment) — those only ever show under Unconfirmed.

    client.get('/orders', { params }).then(({ data }) => {
      if (seq !== seqRef.current) return; // a newer request superseded this one
      setOrders(data.orders);
      setTotal(data.total);
      setLoading(false);
    }).catch(() => { if (seq === seqRef.current) setLoading(false); });
  }
  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, pageSize, originState, originRegion, deliveryCountry, deliverySelectedAirportCodes.join(',')]);

  function changePageSize(size) {
    setPageSize(size);
    setPage(1);
  }

  function search(e) {
    e.preventDefault();
    setPage(1);
    load();
  }

  async function updateStatus(id, status) {
    const { data } = await client.patch(`/orders/${id}/status`, { status });
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: data.order.status } : o)));
  }

  async function openDetail(id) {
    const { data } = await client.get(`/orders/${id}`);
    setDetailOrder(data.order);
  }

  async function cancelBooking(id) {
    if (!confirm('Delete (cancel) this booking? This cannot be undone from here.')) return;
    const { data } = await client.post(`/orders/${id}/cancel`);
    setOrders((prev) => prev.map((o) => (o.id === id ? data.order : o)));
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Sends every selected pickup job to one driver in a single action — the
  // driver then sees these in their own portal and marks each PICKED_UP once
  // collected in person.
  async function sendToDriver() {
    if (!assignDriverId || selectedIds.length === 0) return;
    setAssigning(true);
    try {
      const { data } = await client.patch('/orders/assign-driver', { orderIds: selectedIds, driverId: assignDriverId });
      const byId = Object.fromEntries(data.orders.map((o) => [o.id, o]));
      setOrders((prev) => prev.map((o) => (byId[o.id] ? { ...o, assignedDriver: byId[o.id].assignedDriver } : o)));
      setSelectedIds([]);
      setAssignDriverId('');
    } catch (err) {
      alert(err.response?.data?.error || 'Could not send these jobs to the rider.');
    } finally {
      setAssigning(false);
    }
  }

  // Sends the existing order back through the Quote/Details/Payment flow,
  // pre-filled, so staff can edit service/items/addresses and see the
  // re-priced total (with any due/credit balance) on the Payment page.
  async function editOrder(id) {
    setEditingId(id);
    try {
      const { data } = await client.get(`/orders/${id}`);
      const order = data.order;
      let destinationCountryName;
      if (order.pricingPending) {
        try {
          const { data: cd } = await client.get('/quote/countries');
          destinationCountryName = cd.countries.find((c) => c.countryCode === order.receiverAddress.countryCode)?.countryName;
        } catch {
          // fall back to the raw country code if the lookup fails
        }
      }
      setBooking({
        quoteInput: toQuoteInput(order, destinationCountryName),
        selectedQuote: toSelectedQuote(order),
        order,
      });
      navigate('/quote');
    } catch (err) {
      alert(err.response?.data?.error || 'Could not load this order for editing.');
    } finally {
      setEditingId(null);
    }
  }

  // For every tab except pickup, the server already returns exactly one
  // page's worth (page/pageSize sent as request params), so `total`
  // describes the full server-side result set as usual. Pickup tab instead
  // fetches everything up front (see load()) and paginates client-side
  // below, so the due-date bucket chips/filter stay consistent with
  // whatever's actually shown rather than only reflecting one loaded page.
  let pagedTotal = total;
  let pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Pickup orders: today's jobs first, then tomorrow's and beyond in date
  // order; anything whose pickup day has already passed without being
  // picked up floats to the very top, flagged so the row can be
  // highlighted — that's the one a driver missed and needs chasing.
  // Orders with no parseable pickup date sort last (nothing to prioritize
  // them by).
  let displayOrders = orders;
  let dueBucketCounts = { overdue: 0, today: 0, future: 0 };
  if (tab === 'pickup') {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    let allPickup = orders
      .map((o) => {
        const parsed = parsePickupDateStr(o.pickupDate, now);
        const overdue = !!parsed && parsed < todayStart && o.status !== 'PICKED_UP';
        // Bucket is independent of the overdue/PICKED_UP distinction — this
        // just describes when the pickup is/was scheduled, for the summary
        // chips below (an order without a parseable date falls in none).
        const dueBucketValue = !parsed ? null : parsed < todayStart ? 'overdue' : parsed < todayEnd ? 'today' : 'future';
        return { ...o, __parsedPickupDate: parsed, __overdue: overdue, __dueBucket: dueBucketValue };
      })
      .sort((a, b) => {
        if (a.__overdue !== b.__overdue) return a.__overdue ? -1 : 1;
        if (!a.__parsedPickupDate && !b.__parsedPickupDate) return 0;
        if (!a.__parsedPickupDate) return 1;
        if (!b.__parsedPickupDate) return -1;
        return a.__parsedPickupDate - b.__parsedPickupDate;
      });
    dueBucketCounts = allPickup.reduce((acc, o) => {
      if (o.__dueBucket) acc[o.__dueBucket] += 1;
      return acc;
    }, { overdue: 0, today: 0, future: 0 });
    if (dueBucket) allPickup = allPickup.filter((o) => o.__dueBucket === dueBucket);

    pagedTotal = allPickup.length;
    pageCount = Math.max(1, Math.ceil(pagedTotal / pageSize));
    displayOrders = allPickup.slice((page - 1) * pageSize, page * pageSize);
  }

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Orders</h1>

      <div className="dash-tabs">
        {ORDER_TABS.map(([key, label]) => (
          <button key={key} className={`dash-tab ${tab === key ? 'active' : ''}`} onClick={() => { setTab(key); setPage(1); }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'manifest' ? <ManifestPanel /> : <>
      {tab === 'delivery' ? (
        <>
          <div className="chip-filter-row">
            {deliveryCountryCodes.map((code) => (
              <div key={code} className={`chip-filter ${deliveryCountry === code ? 'active' : ''}`} onClick={() => pickDeliveryCountry(code)}>
                {deliveryCountryNames.find((c) => c.countryCode === code)?.countryName || code}
              </div>
            ))}
          </div>
          {deliveryCountry && deliveryAirportsForCountry.length > 0 && (
            <div className="chip-filter-row">
              {deliveryAirportsForCountry.map((a) => (
                <div key={a.airportCode} className={`chip-filter ${deliverySelectedAirportCodes.includes(a.airportCode) ? 'active' : ''}`} onClick={() => toggleDeliveryAirport(a.airportCode)}>
                  {a.name === a.airportCode ? a.airportCode : `${a.name} (${a.airportCode})`} · {a.count}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="chip-filter-row">
          <div className="chip-filter active"><IndiaFlagChip /> India</div>
        </div>
      )}

      {tab === 'pickup' && pickupStates.length > 0 && (
        <div className="chip-filter-row">
          <div className={`chip-filter ${!originState ? 'active' : ''}`} onClick={() => selectOriginState('')}>All States</div>
          {pickupStates.map((s) => (
            <div key={s} className={`chip-filter ${originState === s ? 'active' : ''}`} onClick={() => selectOriginState(s)}>
              {s}
            </div>
          ))}
        </div>
      )}

      {tab === 'pickup' && originState && (pickupRegionsByState[originState] || []).length > 0 && (
        <div className="chip-filter-row">
          <div className={`chip-filter ${!originRegion ? 'active' : ''}`} onClick={() => { setOriginRegion(''); setPage(1); }}>All Regions</div>
          {pickupRegionsByState[originState].map((r) => (
            <div key={r} className={`chip-filter ${originRegion === r ? 'active' : ''}`} onClick={() => { setOriginRegion(r); setPage(1); }}>
              {r}
            </div>
          ))}
        </div>
      )}

      <div className="dash-toolbar">
        <form className="search-box" onSubmit={search}>
          🔍<input placeholder="Search order ID, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <select className="select" style={{ fontSize: 13, padding: '4px 8px', width: 'auto' }} value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))}>
            <option value={25}>25 / page</option>
            <option value={100}>100 / page</option>
            <option value={500}>500 / page</option>
          </select>
          <div className="pager">
            <span>{pagedTotal} order{pagedTotal === 1 ? '' : 's'}</span>
            <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
            <span className="mono" style={{ fontSize: 13 }}>{page} / {pageCount}</span>
            <button type="button" className="btn btn-outline btn-sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>›</button>
          </div>
        </div>
      </div>

      {tab === 'pickup' && (
        <div className="chip-filter-row">
          <div className={`chip-filter ${dueBucket === 'overdue' ? 'active' : ''}`} onClick={() => toggleDueBucket('overdue')}>
            Overdue Orders: {dueBucketCounts.overdue}
          </div>
          <div className={`chip-filter ${dueBucket === 'today' ? 'active' : ''}`} onClick={() => toggleDueBucket('today')}>
            Today's Orders: {dueBucketCounts.today}
          </div>
          <div className={`chip-filter ${dueBucket === 'future' ? 'active' : ''}`} onClick={() => toggleDueBucket('future')}>
            Future Orders: {dueBucketCounts.future}
          </div>
        </div>
      )}

      {tab === 'pickup' && selectedIds.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{selectedIds.length} selected</span>
          <select className="select" style={{ maxWidth: 220 }} value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)}>
            <option value="">Choose a rider…</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}{d.driverRegion ? ` (${d.driverRegion})` : ''}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" disabled={!assignDriverId || assigning} onClick={sendToDriver}>
            {assigning ? 'Sending…' : 'Send to rider'}
          </button>
          {drivers.length === 0 && <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>No rider accounts yet — create one from Users (set role to Rider).</span>}
        </div>
      )}

      {loading ? <LoadingLogo /> : (
        <div className="table-wrap">
          <div className={`t-row t-head orders-detailed ${tab === 'bookings' ? 'with-actions' : ''} ${tab === 'pickup' ? 'with-driver' : ''}`}>
            {tab === 'pickup' && <div></div>}
            <div>Order ID</div><div>From Address</div><div>To Address</div><div>{tab === 'pickup' || tab === 'bookings' ? 'Pickup Date' : 'Qty'}</div><div>Order Status</div><div>Comment</div>{tab === 'bookings' && <div></div>}{tab === 'pickup' && <div>Rider</div>}
          </div>
          {displayOrders.map((o) => (
            <div className={`t-row orders-detailed ${tab === 'bookings' ? 'with-actions' : ''} ${tab === 'pickup' ? 'with-driver' : ''} ${o.__overdue ? 'overdue' : o.status === 'PICKED_UP' ? 'picked-up' : ''}`} key={o.id}>
              {tab === 'pickup' && (
                <div>
                  <input type="checkbox" checked={selectedIds.includes(o.id)} onChange={() => toggleSelect(o.id)} />
                </div>
              )}
              <button className="t-oid" onClick={() => openDetail(o.id)}>{o.orderNumber}</button>
              <div>{o.senderAddress?.city}, {o.senderAddress?.countryCode}</div>
              <div>{o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</div>
              <div>{tab === 'pickup' || tab === 'bookings' ? (o.pickupDate || '—') : (o.items?.reduce((sum, it) => sum + it.quantity, 0) ?? 1)}</div>
              <div>
                <select
                  className={`status-badge status-dd ${STATUS_PILL[o.status] || 'pill-navy'}`}
                  style={{ border: 'none', cursor: 'pointer' }}
                  value={o.status}
                  onChange={(e) => updateStatus(o.id, e.target.value)}
                >
                  {!ORDER_STATUSES.includes(o.status) && <option value={o.status}>{o.status}</option>}
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div><button className="btn btn-outline btn-sm" onClick={() => setCommentOrder(o)}>View</button></div>
              {tab === 'bookings' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="row-edit-btn"
                    title="Edit order"
                    aria-label="Edit order"
                    disabled={editingId === o.id}
                    onClick={() => editOrder(o.id)}
                  >
                    {editingId === o.id ? '…' : '✏️'}
                  </button>
                  <button
                    className="row-delete-btn"
                    title="Delete booking"
                    aria-label="Delete booking"
                    disabled={['PICKED_UP', 'IN_TRANSIT', 'CLEARED_DESTINATION_CUSTOMS', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(o.status)}
                    onClick={() => cancelBooking(o.id)}
                  >
                    🗑
                  </button>
                </div>
              )}
              {tab === 'pickup' && (
                <div>
                  {o.assignedDriver ? (
                    <span className="pill pill-cobalt" style={{ fontSize: 11 }}>{o.assignedDriver.fullName}{o.assignedDriver.driverRegion ? ` (${o.assignedDriver.driverRegion})` : ''}</span>
                  ) : (
                    <span style={{ color: 'var(--slate-light)', fontSize: 12 }}>Unassigned</span>
                  )}
                </div>
              )}
            </div>
          ))}
          {orders.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--slate-light)' }}>No orders match this filter.</div>}
        </div>
      )}

      {detailOrder && <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
      {commentOrder && <OrderCommentsModal order={commentOrder} onClose={() => setCommentOrder(null)} />}
      </>}
    </div>
  );
}

function paidAndDue(o) {
  const grandTotal = Number(o.grandTotal);
  const original = o.payment?.status === 'SUCCEEDED' ? Number(o.payment.amount) : 0;
  const topUps = (o.balancePayments || [])
    .filter((p) => p.status === 'SUCCEEDED')
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const amountPaid = Math.round((original + topUps) * 100) / 100;
  const due = Math.round((grandTotal - amountPaid) * 100) / 100;
  return { amountPaid, due };
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthEnd(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

function AccountsPanel() {
  const [subTab, setSubTab] = useState('bookings');
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [commentOrder, setCommentOrder] = useState(null);
  const now = useState(() => new Date())[0];
  const [fromDate, setFromDate] = useState(isoDate(monthStart(now)));
  const [toDate, setToDate] = useState(isoDate(monthEnd(now)));
  const seqRef = useRef(0);

  async function openDetail(id) {
    const { data } = await client.get(`/orders/${id}`);
    setDetailOrder(data.order);
  }

  function load(silent) {
    if (!silent) setLoading(true);
    const seq = ++seqRef.current;
    const params = { q: q || undefined, page, pageSize, from: fromDate || undefined, to: toDate || undefined, notStatus: 'UNFINISHED' };
    Promise.all([
      client.get('/orders', { params }),
      client.get('/orders/summary', { params }),
    ]).then(([ordersRes, summaryRes]) => {
      if (seq !== seqRef.current) return;
      setOrders(ordersRes.data.orders);
      setTotal(ordersRes.data.total);
      setSummary(summaryRes.data);
      setLoading(false);
    }).catch(() => { if (seq === seqRef.current) setLoading(false); });
  }
  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, fromDate, toDate]);

  function changePageSize(size) {
    setPageSize(size);
    setPage(1);
  }

  function search(e) {
    e.preventDefault();
    setPage(1);
    load();
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Accounts</h1>

      <div className="dash-tabs" style={{ marginBottom: 16 }}>
        <button className={`dash-tab ${subTab === 'bookings' ? 'active' : ''}`} onClick={() => setSubTab('bookings')}>Bookings</button>
        <button className={`dash-tab ${subTab === 'receivable' ? 'active' : ''}`} onClick={() => setSubTab('receivable')}>Receivable</button>
        <button className={`dash-tab ${subTab === 'payable' ? 'active' : ''}`} onClick={() => setSubTab('payable')}>Payable</button>
      </div>

      {subTab === 'bookings' && (
        <>
          <div className="card date-toolbar" style={{ marginBottom: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: 'var(--slate)', fontWeight: 600 }}>Showing bookings from</span>
            <input className="input" type="date" value={fromDate} max={toDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} />
            <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>to</span>
            <input className="input" type="date" value={toDate} min={fromDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} />
          </div>

          {summary && (
            <div className="stat-grid" style={{ marginBottom: 20 }}>
              <Stat label="Total bookings" value={summary.totalBookings} />
              <Stat label="Total paid" value={`₹${Number(summary.totalPaid).toFixed(2)}`} />
              <Stat label="Total to pay" value={`₹${Number(summary.totalDue).toFixed(2)}`} />
              <Stat label="Total credit owed" value={`₹${Number(summary.totalCredit).toFixed(2)}`} />
            </div>
          )}

          <div className="dash-toolbar">
            <form className="search-box" onSubmit={search}>
              🔍<input placeholder="Search order ID, city…" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <select className="select" style={{ fontSize: 13, padding: '4px 8px', width: 'auto' }} value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))}>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
                <option value={500}>500 / page</option>
              </select>
              <div className="pager">
                <span>{total} booking{total === 1 ? '' : 's'}</span>
                <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
                <span className="mono" style={{ fontSize: 13 }}>{page} / {pageCount}</span>
                <button type="button" className="btn btn-outline btn-sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>›</button>
              </div>
            </div>
          </div>

          {loading ? <LoadingLogo /> : (
            <div className="table-wrap">
              <div className="t-row t-head accounts-row">
                <div>Order ID</div><div>Invoice #</div><div>From Address</div><div>To Address</div><div>Paid / To pay</div><div>Comment</div>
              </div>
              {orders.map((o) => {
                const { amountPaid, due } = paidAndDue(o);
                return (
                  <div className={`t-row accounts-row${o.manualPaymentMarkedAt ? ' manual-paid' : ''}`} key={o.id}>
                    <button className="t-oid" onClick={() => openDetail(o.id)}>{o.orderNumber}</button>
                    <div className="mono">{o.invoiceNumber || '—'}</div>
                    <div>{o.senderAddress?.city}, {o.senderAddress?.countryCode}</div>
                    <div>{o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</div>
                    <div>
                      <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: 13 }}>Paid ₹{amountPaid.toFixed(2)}</div>
                      {due > 0 ? (
                        <div style={{ color: 'var(--danger)', fontSize: 12 }}>To pay ₹{due.toFixed(2)}</div>
                      ) : due < 0 ? (
                        <div style={{ color: 'var(--slate)', fontSize: 12 }}>Credit ₹{Math.abs(due).toFixed(2)}</div>
                      ) : null}
                    </div>
                    <div><button className="btn btn-outline btn-sm" onClick={() => setCommentOrder(o)}>View</button></div>
                  </div>
                );
              })}
              {orders.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--slate-light)' }}>No bookings yet.</div>}
            </div>
          )}

          {detailOrder && <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
          {commentOrder && <OrderCommentsModal order={commentOrder} onClose={() => setCommentOrder(null)} />}
        </>
      )}

      {subTab === 'receivable' && <PartyInvoicesPanel direction="RECEIVABLE" />}
      {subTab === 'payable' && <PartyInvoicesPanel direction="PAYABLE" />}
    </div>
  );
}

function InventoryPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', unit: 'pcs', quantity: '', lowStockThreshold: '' });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState('');

  function load(silent) {
    if (!silent) setLoading(true);
    client.get('/inventory').then(({ data }) => { setItems(data.items); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function addItem(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setAdding(true);
    setError('');
    try {
      await client.post('/inventory', {
        name: form.name,
        unit: form.unit,
        quantity: Number(form.quantity) || 0,
        lowStockThreshold: form.lowStockThreshold || undefined,
      });
      setForm({ name: '', unit: 'pcs', quantity: '', lowStockThreshold: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add this item.');
    } finally {
      setAdding(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditQty(String(item.quantity));
  }

  async function saveQty(id) {
    const { data } = await client.patch(`/inventory/${id}`, { quantity: Number(editQty) || 0 });
    setItems((prev) => prev.map((it) => (it.id === id ? data.item : it)));
    setEditingId(null);
  }

  async function remove(id) {
    if (!confirm('Delete this inventory item? This cannot be undone.')) return;
    await client.delete(`/inventory/${id}`);
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Inventory</h1>

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h4 style={{ marginBottom: 12, color: 'var(--navy)' }}>Add an item</h4>
        <form onSubmit={addItem} style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, alignItems: 'end' }}>
          <div className="field">
            <label>Name</label>
            <input className="input" placeholder="e.g. Heavy-duty cardboard" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Unit</label>
            <input className="input" placeholder="boxes, rolls, pcs…" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </div>
          <div className="field">
            <label>Quantity</label>
            <input className="input" type="number" min="0" placeholder="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </div>
          <div className="field">
            <label>Low-stock alert below</label>
            <input className="input" type="number" min="0" placeholder="Optional" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={adding}>{adding ? 'Adding…' : 'Add item'}</button>
        </form>
        {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {loading ? <LoadingLogo /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Unit</th><th>Quantity</th><th>Last updated by</th><th></th></tr></thead>
            <tbody>
              {items.map((it) => {
                const low = it.lowStockThreshold != null && it.quantity <= it.lowStockThreshold;
                return (
                  <tr key={it.id}>
                    <td>{it.name}</td>
                    <td>{it.unit}</td>
                    <td>
                      {editingId === it.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input className="input" type="number" min="0" style={{ width: 90, padding: '6px 8px' }} value={editQty} onChange={(e) => setEditQty(e.target.value)} autoFocus />
                          <button className="btn btn-primary btn-sm" onClick={() => saveQty(it.id)}>Save</button>
                          <button className="btn btn-outline btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <span
                          style={{ cursor: 'pointer', fontWeight: 700, color: low ? 'var(--danger)' : 'var(--ink)' }}
                          onClick={() => startEdit(it)}
                          title="Click to update quantity"
                        >
                          {it.quantity} {low && '⚠️'}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>{it.updatedBy?.fullName || '—'}</td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => remove(it.id)}>Delete</button></td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No inventory items yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const EMPTY_RATE_FORM = { id: null, serviceId: '', fromZoneId: '', zoneId: '', weightFromKg: '', weightToKg: '', basePrice: '', perKgOverage: '', currency: 'INR', transitDaysMin: '', transitDaysMax: '' };

// Document Express and Pickup Booking aren't priced via weight/zone rate
// brackets (Document is retired, Pickup is priced by staff at collection) —
// hidden from "Add a rate bracket", but kept selectable if a bracket for one
// of them is already being edited so its service isn't silently reassigned.
const RATE_BRACKET_EXCLUDED_SERVICE_CODES = ['DOCUMENTS', 'PICKUP'];

function RatesPanel() {
  const [zones, setZones] = useState([]);
  const [originZones, setOriginZones] = useState([]);
  const [services, setServices] = useState([]);
  const [rateCards, setRateCards] = useState([]);
  const [form, setForm] = useState(EMPTY_RATE_FORM);

  function load() {
    client.get('/admin/zones').then(({ data }) => setZones(data.zones));
    client.get('/admin/zones', { params: { kind: 'origin' } }).then(({ data }) => setOriginZones(data.zones));
    client.get('/admin/services').then(({ data }) => setServices(data.services));
    client.get('/admin/rate-cards').then(({ data }) => setRateCards(data.rateCards));
  }
  useEffect(() => {
    load();
    const interval = setInterval(load, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function submit(e) {
    e.preventDefault();
    await client.post('/admin/rate-cards', { ...form, fromZoneId: form.fromZoneId || null });
    setForm(EMPTY_RATE_FORM);
    load();
  }

  function startEdit(r) {
    setForm({
      id: r.id,
      serviceId: r.serviceId,
      fromZoneId: r.fromZoneId || '',
      zoneId: r.zoneId,
      weightFromKg: String(r.weightFromKg),
      weightToKg: String(r.weightToKg),
      basePrice: String(r.basePrice),
      perKgOverage: String(r.perKgOverage),
      currency: r.currency,
      transitDaysMin: r.transitDaysMin === null || r.transitDaysMin === undefined ? '' : String(r.transitDaysMin),
      transitDaysMax: r.transitDaysMax === null || r.transitDaysMax === undefined ? '' : String(r.transitDaysMax),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setForm(EMPTY_RATE_FORM);
  }

  async function remove(id) {
    if (!confirm('Delete this rate bracket?')) return;
    await client.delete(`/admin/rate-cards/${id}`);
    if (form.id === id) setForm(EMPTY_RATE_FORM);
    load();
  }

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Zones &amp; Rate Cards</h1>

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h4 style={{ marginBottom: 12, color: 'var(--navy)' }}>{form.id ? 'Edit rate bracket' : 'Add a rate bracket'}</h4>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, alignItems: 'end' }}>
          <div className="field">
            <label>Service</label>
            <select className="select" required value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
              <option value="">—</option>
              {services
                .filter((s) => !RATE_BRACKET_EXCLUDED_SERVICE_CODES.includes(s.code) || s.id === form.serviceId)
                .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>From zone (optional)</label>
            <select className="select" value={form.fromZoneId} onChange={(e) => setForm({ ...form, fromZoneId: e.target.value })}>
              <option value="">Any</option>
              {originZones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>To zone</label>
            <select className="select" required value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
              <option value="">—</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.code}</option>)}
            </select>
          </div>
          <div className="field"><label>From kg</label><input className="input" type="number" step="0.01" required value={form.weightFromKg} onChange={(e) => setForm({ ...form, weightFromKg: e.target.value })} /></div>
          <div className="field"><label>To kg</label><input className="input" type="number" step="0.01" required value={form.weightToKg} onChange={(e) => setForm({ ...form, weightToKg: e.target.value })} /></div>
          <div className="field"><label>Base price (optional)</label><input className="input" type="number" step="0.01" placeholder="0" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} /></div>
          <div className="field"><label>₹/kg overage</label><input className="input" type="number" step="0.01" required value={form.perKgOverage} onChange={(e) => setForm({ ...form, perKgOverage: e.target.value })} /></div>
          <div className="field"><label>Delivery days from (optional)</label><input className="input" type="number" step="1" min="0" placeholder="Service default" value={form.transitDaysMin} onChange={(e) => setForm({ ...form, transitDaysMin: e.target.value })} /></div>
          <div className="field"><label>Delivery days to (optional)</label><input className="input" type="number" step="1" min="0" placeholder="Service default" value={form.transitDaysMax} onChange={(e) => setForm({ ...form, transitDaysMax: e.target.value })} /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
            <button className="btn btn-primary btn-sm">{form.id ? 'Update bracket' : 'Add bracket'}</button>
            {form.id && <button type="button" className="btn btn-outline btn-sm" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Service</th><th>From zone</th><th>To zone</th><th>Weight range</th><th>Base price</th><th>Overage ₹/kg</th><th>Delivery days</th><th></th></tr></thead>
          <tbody>
            {rateCards.map((r) => (
              <tr key={r.id}>
                <td>{r.service.name}</td>
                <td>{r.fromZone ? r.fromZone.name : <span style={{ color: 'var(--slate-light)' }}>Any</span>}</td>
                <td>{r.zone.code}</td>
                <td>{r.weightFromKg} – {r.weightToKg} kg</td>
                <td>₹{Number(r.basePrice).toFixed(2)}</td>
                <td>₹{Number(r.perKgOverage).toFixed(2)}</td>
                <td>{r.transitDaysMin != null && r.transitDaysMax != null ? `${r.transitDaysMin}-${r.transitDaysMax}` : <span style={{ color: 'var(--slate-light)' }}>Service default</span>}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => startEdit(r)}>Edit</button>
                  <button className="btn btn-outline btn-sm" onClick={() => remove(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Mirrors backend/src/constants/pages.js — kept in sync manually since the
// frontend and backend are separately deployed apps with no shared import.
// "Users" and "Merchants" are deliberately absent (hardcoded ADMIN-only).
const PAGE_KEYS = ['orders', 'accounts', 'inventory', 'batchscan', 'printlabel', 'rates', 'onboarding', 'customsclients', 'storage', 'assets'];
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

function UsersPanel() {
  const [subTab, setSubTab] = useState('internal');
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  const [zones, setZones] = useState([]);
  const [staffZones, setStaffZones] = useState({}); // userId -> [zone,...]
  const [editingStaffZones, setEditingStaffZones] = useState(null); // { id, fullName }
  const [pickupStates, setPickupStates] = useState([]);
  const [pickupRegionsByState, setPickupRegionsByState] = useState({});
  const [staffRegions, setStaffRegions] = useState({}); // userId -> [{id,state,region},...]
  const [editingStaffRegions, setEditingStaffRegions] = useState(null); // { id, fullName }
  const [editingPageAccess, setEditingPageAccess] = useState(null); // { id, fullName, allowedPages }

  function load() {
    client.get('/admin/users').then(({ data }) => setUsers(data.users));
    client.get('/admin/zones').then(({ data }) => setZones(data.zones));
    client.get('/admin/staff-zones').then(({ data }) => {
      const map = {};
      data.staff.forEach((s) => { map[s.id] = s.zones; });
      setStaffZones(map);
    });
    client.get('/admin/pickup-origins').then(({ data }) => {
      setPickupStates(data.states);
      setPickupRegionsByState(data.regionsByState);
    });
    client.get('/admin/staff-regions').then(({ data }) => {
      const map = {};
      data.staff.forEach((s) => { map[s.id] = s.regions; });
      setStaffRegions(map);
    });
  }
  useEffect(() => {
    load();
    const interval = setInterval(load, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function setRole(id, role) {
    const { data } = await client.patch(`/admin/users/${id}`, { role });
    setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
  }

  // Free-text home-region label for a driver (e.g. "HYD") — shown next to
  // their name in the pickup "send to driver" picker so staff can tell two
  // same-named drivers apart.
  async function setDriverRegion(id, driverRegion) {
    const { data } = await client.patch(`/admin/users/${id}`, { driverRegion });
    setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
  }

  // Grants a STAFF account access to the Overview page's "Staff overview" /
  // "Region overview" tabs — off by default, since those show every
  // region/staff member, not just the ones this staff member is assigned.
  async function setOverviewAccess(id, canViewOverviewBreakdown) {
    const { data } = await client.patch(`/admin/users/${id}`, { canViewOverviewBreakdown });
    setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
  }

  async function savePageAccess(userId, allowedPages) {
    const { data } = await client.patch(`/admin/users/${userId}`, { allowedPages });
    setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
    setEditingPageAccess(null);
  }

  async function saveZones(userId, zoneIds) {
    const { data } = await client.put(`/admin/staff-zones/${userId}`, { zoneIds });
    setStaffZones((prev) => ({ ...prev, [userId]: data.zones }));
    setEditingStaffZones(null);
  }

  async function saveRegions(userId, assignments) {
    const { data } = await client.put(`/admin/staff-regions/${userId}`, { assignments });
    setStaffRegions((prev) => ({ ...prev, [userId]: data.regions }));
    setEditingStaffRegions(null);
  }

  // A region row means "just that region"; a state with no per-region rows
  // (or a dedicated whole-state row) reads as "the whole state".
  function regionPillLabel(r) {
    return r.region ? `${r.state} · ${r.region}` : `${r.state} (all)`;
  }

  function matchesQuery(u) {
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return [u.fullName, u.email, u.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
  }
  const internalUsers = users.filter((u) => u.role !== 'CUSTOMER' && matchesQuery(u));
  const customerUsers = users.filter((u) => u.role === 'CUSTOMER' && matchesQuery(u));

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Users</h1>

      <div className="dash-tabs" style={{ marginBottom: 16 }}>
        <button className={`dash-tab ${subTab === 'internal' ? 'active' : ''}`} onClick={() => setSubTab('internal')}>Admin / Staff / Accounts / Rider</button>
        <button className={`dash-tab ${subTab === 'customers' ? 'active' : ''}`} onClick={() => setSubTab('customers')}>Customers</button>
      </div>

      <form className="search-box" style={{ marginBottom: 16, maxWidth: 360 }} onSubmit={(e) => e.preventDefault()}>
        🔍<input placeholder="Search name, email, mobile…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      {subTab === 'internal' && (
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Joined</th><th>Role</th><th>Rider region</th><th>Delivery zones</th><th>Pickup states/regions</th><th>Overview access</th><th>Page access</th></tr></thead>
          <tbody>
            {internalUsers.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{u.email}</td>
                <td>{u.phone || '—'}</td>
                <td>{new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</td>
                <td>
                  <select className="select" style={{ padding: '6px 8px', fontSize: 12.5 }} value={u.role} onChange={(e) => setRole(u.id, e.target.value)}>
                    <option value="CUSTOMER">Customer</option>
                    <option value="STAFF">Staff</option>
                    <option value="ACCOUNTS">Accounts</option>
                    <option value="ADMIN">Admin</option>
                    <option value="DRIVER">Rider</option>
                  </select>
                </td>
                <td>
                  {u.role === 'DRIVER' ? (
                    <input
                      key={u.id}
                      className="input"
                      style={{ padding: '6px 8px', fontSize: 12.5, maxWidth: 100 }}
                      placeholder="e.g. HYD"
                      defaultValue={u.driverRegion || ''}
                      onBlur={(e) => { if (e.target.value.trim() !== (u.driverRegion || '')) setDriverRegion(u.id, e.target.value.trim()); }}
                    />
                  ) : (
                    <span style={{ color: 'var(--slate-light)' }}>—</span>
                  )}
                </td>
                <td>
                  {u.role === 'STAFF' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {(staffZones[u.id] || []).length === 0 ? (
                        <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>None assigned</span>
                      ) : (
                        (staffZones[u.id] || []).map((z) => <span key={z.id} className="pill pill-navy" style={{ fontSize: 11 }}>{z.code}</span>)
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => setEditingStaffZones({ id: u.id, fullName: u.fullName })}>Edit</button>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--slate-light)' }}>—</span>
                  )}
                </td>
                <td>
                  {u.role === 'STAFF' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {(staffRegions[u.id] || []).length === 0 ? (
                        <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>None assigned</span>
                      ) : (
                        (staffRegions[u.id] || []).map((r) => <span key={r.id} className="pill pill-cobalt" style={{ fontSize: 11 }}>{regionPillLabel(r)}</span>)
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => setEditingStaffRegions({ id: u.id, fullName: u.fullName })}>Edit</button>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--slate-light)' }}>—</span>
                  )}
                </td>
                <td>
                  {u.role === 'STAFF' ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!u.canViewOverviewBreakdown}
                        onChange={(e) => setOverviewAccess(u.id, e.target.checked)}
                      />
                      Staff &amp; Region tabs
                    </label>
                  ) : (
                    <span style={{ color: 'var(--slate-light)' }}>—</span>
                  )}
                </td>
                <td>
                  {u.role === 'STAFF' || u.role === 'ACCOUNTS' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {(u.allowedPages || []).length === 0 ? (
                        <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>No extra pages</span>
                      ) : (
                        (u.allowedPages || []).map((key) => <span key={key} className="pill pill-navy" style={{ fontSize: 11 }}>{PAGE_LABELS[key] || key}</span>)
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => setEditingPageAccess({ id: u.id, fullName: u.fullName, allowedPages: u.allowedPages || [] })}>Edit</button>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--slate-light)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {internalUsers.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>{q.trim() ? 'No accounts match your search.' : 'No accounts yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {subTab === 'customers' && (
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Joined</th><th>Role</th></tr></thead>
          <tbody>
            {customerUsers.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{u.email}</td>
                <td>{u.phone || '—'}</td>
                <td>{new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</td>
                <td>
                  <select className="select" style={{ padding: '6px 8px', fontSize: 12.5 }} value={u.role} onChange={(e) => setRole(u.id, e.target.value)}>
                    <option value="CUSTOMER">Customer</option>
                    <option value="STAFF">Staff</option>
                    <option value="ACCOUNTS">Accounts</option>
                    <option value="ADMIN">Admin</option>
                    <option value="DRIVER">Rider</option>
                  </select>
                </td>
              </tr>
            ))}
            {customerUsers.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No customers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {editingStaffZones && (
        <StaffZoneModal
          staff={editingStaffZones}
          zones={zones}
          currentZoneIds={(staffZones[editingStaffZones.id] || []).map((z) => z.id)}
          onSave={(zoneIds) => saveZones(editingStaffZones.id, zoneIds)}
          onClose={() => setEditingStaffZones(null)}
        />
      )}

      {editingStaffRegions && (
        <StaffRegionModal
          staff={editingStaffRegions}
          states={pickupStates}
          regionsByState={pickupRegionsByState}
          currentAssignments={(staffRegions[editingStaffRegions.id] || []).map((r) => ({ state: r.state, region: r.region }))}
          onSave={(assignments) => saveRegions(editingStaffRegions.id, assignments)}
          onClose={() => setEditingStaffRegions(null)}
        />
      )}

      {editingPageAccess && (
        <PageAccessModal
          staff={editingPageAccess}
          currentAllowedPages={editingPageAccess.allowedPages}
          onSave={(allowedPages) => savePageAccess(editingPageAccess.id, allowedPages)}
          onClose={() => setEditingPageAccess(null)}
        />
      )}
    </div>
  );
}

function PageAccessModal({ staff, currentAllowedPages, onSave, onClose }) {
  const [selected, setSelected] = useState(currentAllowedPages);
  const [saving, setSaving] = useState(false);

  function toggle(pageKey) {
    setSelected((prev) => (prev.includes(pageKey) ? prev.filter((k) => k !== pageKey) : [...prev, pageKey]));
  }

  async function save() {
    setSaving(true);
    await onSave(selected);
    setSaving(false);
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17 }}>Page access for {staff.fullName}</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer' }}>✕</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--slate)', marginBottom: 16 }}>
          Overview, Orders (view), Inventory and Profile are always visible. Check any extra pages this account should also see and use.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
          {PAGE_KEYS.map((key) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(key)} />
              {PAGE_LABELS[key]}
            </label>
          ))}
        </div>
        <button className="btn btn-primary block" style={{ marginTop: 20, padding: 12 }} disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save page access'}
        </button>
      </div>
    </div>
  );
}

function StaffZoneModal({ staff, zones, currentZoneIds, onSave, onClose }) {
  const [selected, setSelected] = useState(currentZoneIds);
  const [saving, setSaving] = useState(false);

  function toggle(zoneId) {
    setSelected((prev) => (prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]));
  }

  async function save() {
    setSaving(true);
    await onSave(selected);
    setSaving(false);
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17 }}>Delivery zones for {staff.fullName}</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer' }}>✕</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--slate)', marginBottom: 16 }}>
          This staff account will only see and filter Delivery orders in the zones checked below.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
          {zones.map((z) => (
            <label key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.includes(z.id)} onChange={() => toggle(z.id)} />
              {z.name}
            </label>
          ))}
        </div>
        <button className="btn btn-primary block" style={{ marginTop: 20, padding: 12 }} disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save zones'}
        </button>
      </div>
    </div>
  );
}

// Pickup-order scoping by origin state/region — a checkbox tree grouped by
// state (collapsible, since some states have many regions), each with its
// own "whole state" checkbox plus one checkbox per region within it.
// Checking the whole state supersedes/disables its individual regions
// rather than storing both (avoids redundant, conflicting assignment rows).
function StaffRegionModal({ staff, states, regionsByState, currentAssignments, onSave, onClose }) {
  const [selected, setSelected] = useState(currentAssignments);
  const [expanded, setExpanded] = useState({});
  const [saving, setSaving] = useState(false);

  function isWholeState(state) {
    return selected.some((a) => a.state === state && !a.region);
  }
  function isRegionSelected(state, region) {
    return selected.some((a) => a.state === state && a.region === region);
  }
  function toggleWholeState(state) {
    setSelected((prev) =>
      isWholeState(state) ? prev.filter((a) => a.state !== state) : [...prev.filter((a) => a.state !== state), { state, region: null }]
    );
  }
  function toggleRegion(state, region) {
    setSelected((prev) =>
      isRegionSelected(state, region) ? prev.filter((a) => !(a.state === state && a.region === region)) : [...prev, { state, region }]
    );
  }
  function toggleExpand(state) {
    setExpanded((prev) => ({ ...prev, [state]: !prev[state] }));
  }

  async function save() {
    setSaving(true);
    await onSave(selected);
    setSaving(false);
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17 }}>Pickup states/regions for {staff.fullName}</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer' }}>✕</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--slate)', marginBottom: 16 }}>
          This staff account will only see and filter Pickup orders from the origin states/regions checked below. Check a state for every pickup in it, or expand it (▸) to pick specific regions instead.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
          {states.map((state) => {
            const regions = regionsByState[state] || [];
            const wholeState = isWholeState(state);
            const isOpen = !!expanded[state];
            return (
              <div key={state} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {regions.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggleExpand(state)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--slate)', width: 18, padding: 0 }}
                    >
                      {isOpen ? '▾' : '▸'}
                    </button>
                  ) : (
                    <span style={{ width: 18 }} />
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, cursor: 'pointer', flex: 1, padding: '6px 0' }}>
                    <input type="checkbox" checked={wholeState} onChange={() => toggleWholeState(state)} />
                    {state} <span style={{ color: 'var(--slate-light)', fontSize: 11.5 }}>(all regions)</span>
                  </label>
                </div>
                {isOpen && regions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 26, marginTop: 4 }}>
                    {regions.map((region) => (
                      <label
                        key={region}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: wholeState ? 'not-allowed' : 'pointer', color: wholeState ? 'var(--slate-light)' : 'inherit' }}
                      >
                        <input type="checkbox" disabled={wholeState} checked={wholeState || isRegionSelected(state, region)} onChange={() => toggleRegion(state, region)} />
                        {region}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {states.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>No pickup states available yet.</span>}
        </div>
        <button className="btn btn-primary block" style={{ marginTop: 20, padding: 12 }} disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save states/regions'}
        </button>
      </div>
    </div>
  );
}
