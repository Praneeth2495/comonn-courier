import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';

const STATUS_PILL = {
  UNFINISHED: 'pill-warn',
  PENDING_PAYMENT: 'pill-warn',
  PICKUP_CONFIRMED: 'pill-cobalt',
  PAID: 'pill-cobalt',
  LABEL_GENERATED: 'pill-cobalt',
  PICKED_UP: 'pill-cobalt',
  IN_TRANSIT: 'pill-cobalt',
  OUT_FOR_DELIVERY: 'pill-cobalt',
  DELIVERED: 'pill-success',
  CANCELLED: 'pill-danger',
  EXCEPTION: 'pill-danger',
};

async function downloadBlob(url, filename) {
  const { data } = await client.get(url, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ManifestPanel() {
  const [subTab, setSubTab] = useState('build');

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Manifest</h1>
      <div className="acct-tabs" style={{ marginBottom: 20 }}>
        {[['build', 'Build manifest'], ['history', 'Manifests'], ['setup', 'Airports & hubs']].map(([key, label]) => (
          <button key={key} className={`acct-tab ${subTab === key ? 'active' : ''}`} onClick={() => setSubTab(key)}>{label}</button>
        ))}
      </div>
      {subTab === 'build' && <BuildManifest />}
      {subTab === 'history' && <ManifestHistory />}
      {subTab === 'setup' && <ManifestSetup />}
    </div>
  );
}

// Sub-regions are destination airports, resolved per-order from the
// receiver's postcode (Order.airportCode) — not hand-assigned per zone,
// since a single pricing zone can genuinely span several real airports.
// A manifest may combine orders bound for several different airports, as
// long as they're all in the same destination country — the airport chips
// below are multi-select (all start selected for the chosen country) for
// exactly that reason.
function BuildManifest() {
  const [airports, setAirports] = useState([]);
  const [countries, setCountries] = useState([]);
  const [loadingAirports, setLoadingAirports] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedAirportCodes, setSelectedAirportCodes] = useState([]);
  const [eligibleOrders, setEligibleOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [selectedOriginStates, setSelectedOriginStates] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [justCreated, setJustCreated] = useState(null);

  function loadAirports() {
    setLoadingAirports(true);
    Promise.all([
      client.get('/admin/manifests/available-airports'),
      client.get('/quote/countries'),
    ]).then(([airportsRes, countriesRes]) => {
      setAirports(airportsRes.data.airports);
      setCountries(countriesRes.data.countries);
      setLoadingAirports(false);
    }).catch(() => setLoadingAirports(false));
  }
  useEffect(loadAirports, []);

  const countryCodes = [...new Set(airports.map((a) => a.countryCode))].sort();

  useEffect(() => {
    if (!selectedCountry && countryCodes.length > 0) pickCountry(countryCodes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airports]);

  const airportsForCountry = airports.filter((a) => a.countryCode === selectedCountry);

  function pickCountry(code) {
    setSelectedCountry(code);
    setSelectedAirportCodes(airports.filter((a) => a.countryCode === code).map((a) => a.airportCode));
    setJustCreated(null);
  }

  function toggleAirport(code) {
    setSelectedAirportCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
    setJustCreated(null);
  }

  function loadEligibleOrders() {
    if (!selectedCountry || selectedAirportCodes.length === 0) { setEligibleOrders([]); return; }
    setLoadingOrders(true);
    client.get('/admin/manifests/eligible-orders', { params: { countryCode: selectedCountry, airportCode: selectedAirportCodes.join(',') } })
      .then(({ data }) => { setEligibleOrders(data.orders); setSelectedOrderIds([]); setLoadingOrders(false); })
      .catch(() => setLoadingOrders(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadEligibleOrders, [selectedCountry, selectedAirportCodes.join(',')]);

  // Origin (sender) state — only shown once real eligible orders exist, and
  // only the states actually present among them (not every pickup state in
  // the system). Multi-select, same as the destination airport chips —
  // defaults to every state selected whenever the eligible-orders pool
  // changes. A handful of addresses have no state on file at all; those
  // group under one "Unspecified" chip rather than silently vanishing from
  // the list.
  const UNSPECIFIED_STATE = '__unspecified__';
  const originStates = [...new Set(eligibleOrders.map((o) => o.senderAddress?.state || UNSPECIFIED_STATE))].sort((a, b) => {
    if (a === UNSPECIFIED_STATE) return 1;
    if (b === UNSPECIFIED_STATE) return -1;
    return a.localeCompare(b);
  });

  useEffect(() => {
    setSelectedOriginStates(originStates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleOrders]);

  function toggleOriginState(state) {
    setSelectedOriginStates((prev) => (prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]));
  }

  const visibleOrders = eligibleOrders.filter((o) => selectedOriginStates.includes(o.senderAddress?.state || UNSPECIFIED_STATE));

  function toggleOrder(id) {
    setSelectedOrderIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    const visibleIds = visibleOrders.map((o) => o.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedOrderIds.includes(id));
    setSelectedOrderIds((prev) => (allVisibleSelected ? prev.filter((id) => !visibleIds.includes(id)) : [...new Set([...prev, ...visibleIds])]));
  }

  function onCreated(manifest) {
    setShowCreateModal(false);
    setJustCreated(manifest);
    loadEligibleOrders();
    loadAirports();
  }

  const selectedOrderAirportCodes = [...new Set(eligibleOrders.filter((o) => selectedOrderIds.includes(o.id)).map((o) => o.airportCode))];
  const selectedAirportObjs = airports.filter((a) => selectedOrderAirportCodes.includes(a.airportCode));

  if (loadingAirports) return <LoadingLogo />;

  return (
    <div>
      {countryCodes.length === 0 ? (
        <p className="lead" style={{ fontSize: 13.5 }}>No orders with a resolved destination airport are waiting to be manifested right now.</p>
      ) : (
        <>
          <div className="chip-filter-row">
            {countryCodes.map((code) => (
              <div key={code} className={`chip-filter ${selectedCountry === code ? 'active' : ''}`} onClick={() => pickCountry(code)}>
                {countries.find((c) => c.countryCode === code)?.countryName || code}
              </div>
            ))}
          </div>

          <div className="chip-filter-row">
            {airportsForCountry.map((a) => (
              <div key={a.airportCode} className={`chip-filter ${selectedAirportCodes.includes(a.airportCode) ? 'active' : ''}`} onClick={() => toggleAirport(a.airportCode)}>
                {a.name === a.airportCode ? a.airportCode : `${a.name} (${a.airportCode})`} · {a.count}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--slate-light)', marginTop: -6, marginBottom: 14 }}>Multiple airports can be selected together — orders for all of them can share one manifest as long as it's the same country.</p>

          {originStates.length > 0 && (
            <>
              <div className="chip-filter-row">
                <div className="chip-filter active">🇮🇳 India</div>
                {originStates.map((s) => (
                  <div key={s} className={`chip-filter ${selectedOriginStates.includes(s) ? 'active' : ''}`} onClick={() => toggleOriginState(s)}>
                    {s === UNSPECIFIED_STATE ? 'Unspecified' : s}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--slate-light)', marginTop: -6, marginBottom: 14 }}>Multiple origin states can be selected together too.</p>
            </>
          )}

          {justCreated && (
            <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: 'var(--paper)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Manifest {justCreated.manifestNumber} created — {justCreated.orderCount} orders, {justCreated.totalQty} qty, {Number(justCreated.totalWeightKg).toFixed(2)} kg</span>
              <button className="btn btn-outline btn-sm" onClick={() => downloadBlob(`/admin/manifests/${justCreated.id}/download`, `${justCreated.manifestNumber}.pdf`)}>Download sheet</button>
            </div>
          )}

          {selectedAirportCodes.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: visibleOrders.length > 0 ? 'pointer' : 'default' }}>
                  {visibleOrders.length > 0 && (
                    <input type="checkbox" checked={visibleOrders.every((o) => selectedOrderIds.includes(o.id))} onChange={toggleSelectAll} />
                  )}
                  {selectedOrderIds.length} selected · {visibleOrders.length} shown
                </label>
                <button className="btn btn-primary btn-sm" disabled={selectedOrderIds.length === 0} onClick={() => setShowCreateModal(true)}>
                  Create Manifest
                </button>
              </div>

              {loadingOrders ? <LoadingLogo /> : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th></th><th>Order #</th><th>Receiver</th><th>Destination</th><th>Airport</th><th>Qty</th><th>Weight</th><th>Status</th></tr></thead>
                    <tbody>
                      {visibleOrders.map((o) => (
                        <tr key={o.id}>
                          <td><input type="checkbox" checked={selectedOrderIds.includes(o.id)} onChange={() => toggleOrder(o.id)} /></td>
                          <td className="mono">{o.orderNumber}</td>
                          <td>{o.receiverAddress?.contactName || '—'}</td>
                          <td>{o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</td>
                          <td className="mono">{o.airportCode}</td>
                          <td>{o.qty}</td>
                          <td>{Number(o.chargeableWeightKg).toFixed(2)} kg</td>
                          <td><span className={`pill ${STATUS_PILL[o.status] || 'pill-navy'}`}>{o.status.replace(/_/g, ' ')}</span></td>
                        </tr>
                      ))}
                      {visibleOrders.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No eligible orders match these filters right now.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {showCreateModal && (
        <CreateManifestModal
          airports={selectedAirportObjs}
          orderIds={selectedOrderIds}
          onClose={() => setShowCreateModal(false)}
          onCreated={onCreated}
        />
      )}
    </div>
  );
}

function CreateManifestModal({ airports, orderIds, onClose, onCreated }) {
  const [hubs, setHubs] = useState([]);
  const [hubId, setHubId] = useState('');
  const [toAddress, setToAddress] = useState(airports.length === 1 ? (airports[0].airportAddress || '') : '');
  const [manifestDate, setManifestDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/admin/hubs').then(({ data }) => {
      const active = data.hubs.filter((h) => h.isActive);
      setHubs(active);
      if (active.length === 1) setHubId(active[0].id);
    });
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!hubId || !toAddress.trim() || !manifestDate) return;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await client.post('/admin/manifests', {
        orderIds,
        hubId,
        toAddress: toAddress.trim(),
        manifestDate,
      });
      onCreated(data.manifest);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create this manifest.');
      setSubmitting(false);
    }
  }

  const codes = airports.map((a) => a.airportCode);

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 17 }}>Create manifest</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 16 }}>{orderIds.length} order{orderIds.length === 1 ? '' : 's'} selected{codes.length ? `, routing via ${codes.join(', ')}` : ''}.</p>
        <form onSubmit={submit} className="form-stack">
          <div className="field">
            <label>From (airport)</label>
            <select className="select" required value={hubId} onChange={(e) => setHubId(e.target.value)}>
              <option value="">Choose an airport…</option>
              {hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>To (airport address)</label>
            <textarea className="input" rows={2} style={{ resize: 'vertical' }} required value={toAddress} onChange={(e) => setToAddress(e.target.value)} />
          </div>
          <div className="field">
            <label>Manifest date</label>
            <input className="input" type="date" required value={manifestDate} onChange={(e) => setManifestDate(e.target.value)} />
          </div>
          {error && <div className="error-text">{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>{submitting ? 'Creating…' : 'Create manifest'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ManifestHistory() {
  const [manifests, setManifests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingId, setViewingId] = useState(null);

  function load() {
    setLoading(true);
    client.get('/admin/manifests').then(({ data }) => { setManifests(data.manifests); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(load, []);

  if (loading) return <LoadingLogo />;

  return (
    <div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Manifest #</th><th>From (airport)</th><th>Sub-region</th><th>Date</th><th>Orders</th><th>Qty</th><th>Weight</th><th>Created by</th><th></th></tr></thead>
          <tbody>
            {manifests.map((m) => (
              <tr key={m.id}>
                <td className="mono">{m.manifestNumber}</td>
                <td>{m.hub?.name || '—'}</td>
                <td>{m.region?.name || m.countryCode}</td>
                <td>{new Date(m.manifestDate).toLocaleDateString('en-IN')}</td>
                <td>{m._count?.orders ?? m.orderCount}</td>
                <td>{m.totalQty}</td>
                <td>{Number(m.totalWeightKg).toFixed(2)} kg</td>
                <td style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>{m.createdBy?.fullName || '—'}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setViewingId(m.id)}>Manage</button>
                  <button className="btn btn-outline btn-sm" onClick={() => downloadBlob(`/admin/manifests/${m.id}/download`, `${m.manifestNumber}.pdf`)}>Download</button>
                </td>
              </tr>
            ))}
            {manifests.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No manifests created yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {viewingId && <ManifestDetailModal manifestId={viewingId} onClose={() => setViewingId(null)} onChanged={load} />}
    </div>
  );
}

function ManifestDetailModal({ manifestId, onClose, onChanged }) {
  const [manifest, setManifest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);
  const [showAddOrders, setShowAddOrders] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    client.get(`/admin/manifests/${manifestId}`).then(({ data }) => { setManifest(data.manifest); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(load, [manifestId]);

  async function removeOrder(orderId) {
    setRemovingId(orderId);
    setError('');
    try {
      const { data } = await client.delete(`/admin/manifests/${manifestId}/orders/${orderId}`);
      setManifest(data.manifest);
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove this order.');
    } finally {
      setRemovingId(null);
    }
  }

  function onOrdersAdded(updated) {
    setManifest(updated);
    setShowAddOrders(false);
    onChanged();
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 17 }}>{manifest ? manifest.manifestNumber : 'Manifest'}</h3>
            {manifest && <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>{manifest.hub?.name} → {manifest.region?.name || manifest.toAddress}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>

        {loading || !manifest ? <LoadingLogo size={40} /> : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>{manifest.orders.length} orders · {manifest.totalQty} qty · {Number(manifest.totalWeightKg).toFixed(2)} kg</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => downloadBlob(`/admin/manifests/${manifest.id}/download`, `${manifest.manifestNumber}.pdf`)}>Download sheet</button>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddOrders(true)}>+ Add orders</button>
              </div>
            </div>
            {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Order #</th><th>Receiver</th><th>Destination</th><th>Airport</th><th>Qty</th><th>Weight</th><th></th></tr></thead>
                  <tbody>
                    {manifest.orders.map((o) => (
                      <tr key={o.id}>
                        <td className="mono">{o.orderNumber}</td>
                        <td>{o.receiverAddress?.contactName || '—'}</td>
                        <td>{o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</td>
                        <td className="mono">{o.airportCode}</td>
                        <td>{o.qty}</td>
                        <td>{Number(o.chargeableWeightKg).toFixed(2)} kg</td>
                        <td>
                          <button className="btn btn-outline btn-sm" disabled={removingId === o.id} onClick={() => removeOrder(o.id)}>
                            {removingId === o.id ? '…' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {manifest.orders.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '20px 0' }}>No orders left in this manifest.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {showAddOrders && manifest && (
        <AddOrdersModal manifest={manifest} onClose={() => setShowAddOrders(false)} onAdded={onOrdersAdded} />
      )}
    </div>
  );
}

function AddOrdersModal({ manifest, onClose, onAdded }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/admin/manifests/eligible-orders', { params: { countryCode: manifest.countryCode } })
      .then(({ data }) => { setOrders(data.orders); setLoading(false); })
      .catch(() => setLoading(false));
  }, [manifest.countryCode]);

  function toggle(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await client.post(`/admin/manifests/${manifest.id}/orders`, { orderIds: selectedIds });
      onAdded(data.manifest);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add these orders.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 17 }}>Add orders to {manifest.manifestNumber}</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>
        {loading ? <LoadingLogo size={40} /> : (
          <div style={{ maxHeight: 340, overflowY: 'auto', marginBottom: 14 }}>
            {orders.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>No further eligible orders for {manifest.countryCode}.</p>}
            {orders.map((o) => (
              <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--line-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedIds.includes(o.id)} onChange={() => toggle(o.id)} />
                <span className="mono">{o.orderNumber}</span>
                <span className="mono" style={{ fontSize: 11.5, color: 'var(--slate)' }}>{o.airportCode}</span>
                <span style={{ color: 'var(--slate-light)' }}>{o.receiverAddress?.contactName} — {o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</span>
              </label>
            ))}
          </div>
        )}
        {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
        <button className="btn btn-primary block" disabled={selectedIds.length === 0 || submitting} onClick={submit}>
          {submitting ? 'Adding…' : `Add ${selectedIds.length || ''} order${selectedIds.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

function ManifestSetup() {
  const [hubs, setHubs] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hubForm, setHubForm] = useState({ name: '', address: '' });
  const [regionForm, setRegionForm] = useState({ code: '', name: '', countryCode: '', airportAddress: '' });
  const [addingHub, setAddingHub] = useState(false);
  const [addingRegion, setAddingRegion] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    Promise.all([
      client.get('/admin/hubs'),
      client.get('/admin/manifest-regions'),
    ]).then(([hubsRes, regionsRes]) => {
      setHubs(hubsRes.data.hubs);
      setRegions(regionsRes.data.regions);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(load, []);

  async function addHub(e) {
    e.preventDefault();
    if (!hubForm.name.trim() || !hubForm.address.trim()) return;
    setAddingHub(true);
    setError('');
    try {
      await client.post('/admin/hubs', hubForm);
      setHubForm({ name: '', address: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add this origin airport.');
    } finally {
      setAddingHub(false);
    }
  }

  async function toggleHubActive(hub) {
    await client.patch(`/admin/hubs/${hub.id}`, { isActive: !hub.isActive });
    load();
  }

  async function addRegion(e) {
    e.preventDefault();
    if (!regionForm.code.trim() || !regionForm.name.trim() || !regionForm.countryCode.trim() || !regionForm.airportAddress.trim()) return;
    setAddingRegion(true);
    setError('');
    try {
      await client.post('/admin/manifest-regions', regionForm);
      setRegionForm({ code: '', name: '', countryCode: '', airportAddress: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add this sub-region.');
    } finally {
      setAddingRegion(false);
    }
  }

  async function toggleRegionActive(region) {
    await client.patch(`/admin/manifest-regions/${region.id}`, { isActive: !region.isActive });
    load();
  }

  if (loading) return <LoadingLogo />;

  return (
    <div>
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h4 style={{ marginBottom: 4, color: 'var(--navy)' }}>Add an origin airport</h4>
        <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 12 }}>The "From" side of a manifest — where shipments leave from in India.</p>
        <form onSubmit={addHub} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 10, alignItems: 'end' }}>
          <div className="field">
            <label>Name</label>
            <input className="input" placeholder="MAA Airport" required value={hubForm.name} onChange={(e) => setHubForm({ ...hubForm, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Address</label>
            <input className="input" placeholder="Full airport/cargo address" required value={hubForm.address} onChange={(e) => setHubForm({ ...hubForm, address: e.target.value })} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={addingHub}>{addingHub ? 'Adding…' : 'Add'}</button>
        </form>
      </div>

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Address</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {hubs.map((h) => (
              <tr key={h.id}>
                <td>{h.name}</td>
                <td style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>{h.address}</td>
                <td>{h.isActive ? <span className="pill pill-success">Active</span> : <span className="pill pill-danger">Inactive</span>}</td>
                <td><button className="btn btn-outline btn-sm" onClick={() => toggleHubActive(h)}>{h.isActive ? 'Deactivate' : 'Activate'}</button></td>
              </tr>
            ))}
            {hubs.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No origin airports yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h4 style={{ marginBottom: 12, color: 'var(--navy)' }}>Pre-provision a destination airport</h4>
        <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 12 }}>
          Airports show up automatically in the Build Manifest tab once an order's destination postcode resolves to one — this is only needed to set the real cargo address ahead of time, or to rename an auto-created entry (it otherwise defaults to just the airport code).
        </p>
        <form onSubmit={addRegion} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 2fr auto', gap: 10, alignItems: 'end' }}>
          <div className="field">
            <label>Code</label>
            <input className="input" placeholder="MEL" maxLength={4} required value={regionForm.code} onChange={(e) => setRegionForm({ ...regionForm, code: e.target.value.toUpperCase() })} />
          </div>
          <div className="field">
            <label>Name</label>
            <input className="input" placeholder="Melbourne Airport" required value={regionForm.name} onChange={(e) => setRegionForm({ ...regionForm, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Country code</label>
            <input className="input" placeholder="AU" maxLength={2} required value={regionForm.countryCode} onChange={(e) => setRegionForm({ ...regionForm, countryCode: e.target.value.toUpperCase() })} />
          </div>
          <div className="field">
            <label>Airport cargo address</label>
            <input className="input" placeholder="Full airport gateway address" required value={regionForm.airportAddress} onChange={(e) => setRegionForm({ ...regionForm, airportAddress: e.target.value })} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={addingRegion}>{addingRegion ? 'Adding…' : 'Add'}</button>
        </form>
        {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Code</th><th>Name</th><th>Country</th><th>Airport address</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {regions.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.code}</td>
                <td>{r.name}</td>
                <td className="mono">{r.countryCode}</td>
                <td style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>{r.airportAddress || <span style={{ color: 'var(--slate-light)' }}>Not set</span>}</td>
                <td>{r.isActive ? <span className="pill pill-success">Active</span> : <span className="pill pill-danger">Inactive</span>}</td>
                <td><button className="btn btn-outline btn-sm" onClick={() => toggleRegionActive(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</button></td>
              </tr>
            ))}
            {regions.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No airports seen yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
