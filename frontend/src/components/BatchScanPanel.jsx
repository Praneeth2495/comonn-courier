import { useEffect, Suspense, useState } from 'react';
import { lazyWithReload as lazy } from '../utils/lazyWithReload';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import LoadingLogo from './LoadingLogo';
import { formatDateShort } from '../utils/dateFormat';
import { statusLabel } from '../utils/orderStatus';

// Lazy-loaded: pulls in @zxing — no reason to ship that to every visitor of
// the (mostly public) app bundle when only staff/admin/driver ever open it.
const BarcodeCameraScanner = lazy(() => import('./BarcodeCameraScanner'));

const ORDER_STATUSES = ['UNFINISHED', 'PENDING_PAYMENT', 'PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED', 'PICKED_UP', 'ORIGIN_CUSTOMS_CLEARED', 'IN_TRANSIT', 'CLEARED_DESTINATION_CUSTOMS', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

// Mirrors backend/src/constants/pages.js's BATCHSCAN_TAB_KEYS. Empty
// allowedBatchScanTabs = no restriction (every tab visible), same
// "open by default" convention as allowedOrderTabs/allowedPrintLabelTabs.
const BATCHSCAN_TAB_KEYS = ['scan', 'batches', 'locations'];

/**
 * Redesigned from the original IDLE screen that forced a choice between
 * "Scan" / "Create batch" / "Barcode locations" before you could even start
 * scanning — scanning is now always the first thing on screen (no mode
 * picker), and "save this as a reusable named batch" is just an optional
 * checkbox at the status step instead of a whole separate upfront flow.
 * Saved batches moved to their own tab, out of the way of someone who just
 * wants to scan and apply a status.
 */
export default function BatchScanPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canManageLocations = user?.role === 'ADMIN' || user?.role === 'STAFF';
  const allowedBatchScanTabs = user?.allowedBatchScanTabs || [];
  const canSeeTab = (key) => isAdmin || allowedBatchScanTabs.length === 0 || allowedBatchScanTabs.includes(key);
  const canSeeLocationsTab = canManageLocations && canSeeTab('locations');

  const [subTab, setSubTab] = useState(() => { // 'scan' | 'batches' | 'locations'
    if (canSeeTab('scan')) return 'scan';
    if (canSeeTab('batches')) return 'batches';
    return canSeeLocationsTab ? 'locations' : 'scan';
  });

  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [phase, setPhase] = useState('SCANNING'); // SCANNING | FINISH | DONE
  const [saveAsBatch, setSaveAsBatch] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [codes, setCodes] = useState([]);
  const [scanInput, setScanInput] = useState('');
  const [chosenStatus, setChosenStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [changingId, setChangingId] = useState(null);
  const [viewingBatch, setViewingBatch] = useState(null);
  const [loadingView, setLoadingView] = useState(false);

  const [locations, setLocations] = useState([]);
  const [lastLocationScanned, setLastLocationScanned] = useState(null);
  const [locationNotes, setLocationNotes] = useState([]);
  const [locForm, setLocForm] = useState({ name: '', label: '' });
  const [addingLoc, setAddingLoc] = useState(false);
  const [locError, setLocError] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [preview, setPreview] = useState({}); // barcodeValue -> { matched, orderNumber, destination }

  // One unified scan box handles both: an ordinary shipment label just
  // accumulates into the flat `codes` list below, while a Load Sheet's own
  // barcode (always "LS<seq>" — see generateLoadSheetNumber, same string
  // used as both loadSheetNumber and barcodeValue) is detected in
  // handleScannedCode and switches into this checklist mode instead —
  // `loadSheet` truthy is the one flag that drives which UI/submit path is
  // active, rather than a separate mode the user has to pick via a tab.
  // Loads the full order list shown grey/pending, then individually
  // scanning each order's own label confirms it — once done, the same
  // FINISH/status-select step applies, just submitted against
  // /admin/loadsheets/:id/apply-status instead of /batches.
  const [lsLoading, setLsLoading] = useState(false);
  const [lsError, setLsError] = useState('');
  const [loadSheet, setLoadSheet] = useState(null); // { id, loadSheetNumber, fromHub, toHub, orders: [{ id, orderNumber, receiver, matchCodes, qty }] }
  const [lsConfirmedIds, setLsConfirmedIds] = useState([]);
  const [lsOrderInput, setLsOrderInput] = useState('');
  const [showLsCamera, setShowLsCamera] = useState(false);

  // Camera option on the FINISH ("Apply status") step itself — lets staff
  // scan a barcode location's own barcode to pick the status right there,
  // without having to back up to the scanning step first.
  const [showFinishCamera, setShowFinishCamera] = useState(false);

  // Scanning a location's barcode from the saved-batches table to
  // re-apply that location's status, without going through the full
  // scan flow above.
  const [scanningBatchId, setScanningBatchId] = useState(null);
  const [batchScanLastCode, setBatchScanLastCode] = useState(null);

  // Live-resolves scanned codes to their orders as they're typed/scanned, so
  // a typo that happens to collide with a different real order is visible
  // immediately (before Apply), not just reported as an "updated" count.
  useEffect(() => {
    if (codes.length === 0) {
      setPreview({});
      return;
    }
    const timer = setTimeout(() => {
      client.post('/batches/preview', { barcodeValues: codes })
        .then(({ data }) => {
          const map = {};
          data.items.forEach((i) => { map[i.barcodeValue] = i; });
          setPreview(map);
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [codes]);

  function loadBatches() {
    setLoadingBatches(true);
    client.get('/batches').then(({ data }) => { setBatches(data.batches); setLoadingBatches(false); }).catch(() => setLoadingBatches(false));
  }
  useEffect(loadBatches, []);

  function loadLocations() {
    client.get('/locations').then(({ data }) => setLocations(data.locations)).catch(() => {});
  }
  useEffect(loadLocations, []);

  async function addLocation(e) {
    e.preventDefault();
    if (!locForm.name.trim() || !locForm.label.trim()) return;
    setAddingLoc(true);
    setLocError('');
    try {
      await client.post('/locations', { name: locForm.name, label: locForm.label.trim() });
      setLocForm({ name: '', label: '' });
      loadLocations();
    } catch (err) {
      setLocError(err.response?.data?.error || 'Could not add this location.');
    } finally {
      setAddingLoc(false);
    }
  }

  async function deleteLocation(id) {
    if (!confirm('Delete this barcode location?')) return;
    await client.delete(`/locations/${id}`);
    setLocations((prev) => prev.filter((l) => l.id !== id));
  }

  // Opens a printable 4x3in PDF sticker with this location's Code128
  // barcode (same rendering used for real shipping labels) in a new tab.
  async function printLocation(id, name) {
    try {
      const { data } = await client.get(`/locations/${id}/barcode.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `location-${name.replace(/\s+/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert('Could not generate the barcode PDF.');
    }
  }

  // Back to a blank scan box, ready to go again — never back to a mode
  // picker, scanning is always the default state of this tab.
  function reset() {
    setPhase('SCANNING');
    setSaveAsBatch(false);
    setBatchName('');
    setCodes([]);
    setScanInput('');
    setChosenStatus('');
    setResult(null);
    setError('');
    setLastLocationScanned(null);
    setLocationNotes([]);
    setPreview({});
    setLoadSheet(null);
    setLsConfirmedIds([]);
    setLsOrderInput('');
    setLsError('');
  }

  // Triggered from handleScannedCode once a scanned code matches the
  // "LS<seq>" pattern — loads that Load Sheet's order checklist in place of
  // the flat label list. A non-existent "LSxx" surfaces as lsError but
  // otherwise leaves the normal label-scanning view untouched (the code is
  // not added to `codes` either way — see handleScannedCode's early return).
  async function loadLoadSheetByBarcode(code) {
    if (!code) return;
    setLsLoading(true);
    setLsError('');
    try {
      const { data } = await client.get(`/admin/loadsheets/by-barcode/${encodeURIComponent(code)}`);
      setLoadSheet(data.loadSheet);
      setLsConfirmedIds([]);
    } catch (err) {
      setLsError(err.response?.data?.error || "That barcode doesn't match any load sheet.");
    } finally {
      setLsLoading(false);
    }
  }

  // Confirms one of the loaded load sheet's orders — flips it from
  // grey/pending to black + a green tick. Matches against each order's own
  // label barcode, tracking number, or order number (matchCodes, from the
  // by-barcode response), not the load sheet's own barcode again.
  function handleLsOrderScan(code) {
    if (!loadSheet || !code) return;
    const order = loadSheet.orders.find((o) => o.matchCodes.includes(code));
    if (!order) {
      setLsError(`"${code}" doesn't match any order on this load sheet.`);
      return;
    }
    setLsError('');
    setLsConfirmedIds((prev) => (prev.includes(order.id) ? prev : [...prev, order.id]));
  }

  function handleLsOrderKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = lsOrderInput.trim();
      setLsOrderInput('');
      handleLsOrderScan(code);
    }
  }

  function finishLoadSheetScanning() {
    if (lsConfirmedIds.length === 0) {
      setLsError('Scan at least one order first.');
      return;
    }
    setLsError('');
    setError('');
    setPhase('FINISH');
  }

  // Shared by both the keyboard/physical-scanner input and the camera
  // scanner — scanning a known location's barcode picks its label as the
  // status to apply (still overridable at the status step below) and
  // queues the same text to be logged as a comment.
  function handleScannedCode(code) {
    if (!code) return;
    const loc = locations.find((l) => l.barcodeValue === code);
    if (loc) {
      setChosenStatus(loc.label);
      setLocationNotes((prev) => [...prev, { name: loc.name, label: loc.label }]);
      setLastLocationScanned(loc);
      return;
    }
    setCodes((prev) => [...prev, code]);
  }

  // Scoped to the FINISH step — only a location barcode makes sense here
  // (same reasoning as handleBatchStatusScan for a saved batch's status),
  // since the shipment labels were already scanned on the step before.
  function handleFinishLocationScan(code) {
    if (!code) return;
    const loc = locations.find((l) => l.barcodeValue === code);
    if (!loc) {
      setError(`"${code}" doesn't match any saved location. Scan a location's barcode (see Barcode locations).`);
      return;
    }
    setError('');
    setChosenStatus(loc.label);
    setLocationNotes((prev) => [...prev, { name: loc.name, label: loc.label }]);
    setLastLocationScanned(loc);
  }

  function handleScanKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = scanInput.trim();
      setScanInput('');
      handleScannedCode(code);
    }
  }

  function removeCode(idx) {
    setCodes((prev) => prev.filter((_, i) => i !== idx));
  }

  function finishScanning() {
    if (codes.length === 0) {
      setError('Scan at least one label first.');
      return;
    }
    setError('');
    setPhase('FINISH');
  }

  async function applyBatch() {
    if (!chosenStatus) return;
    if (scanMode === 'loadsheet') {
      setSubmitting(true);
      setError('');
      try {
        const { data } = await client.post(`/admin/loadsheets/${loadSheet.id}/apply-status`, { status: chosenStatus, orderIds: lsConfirmedIds });
        setResult({ updatedCount: data.updatedCount, items: [] });
        setPhase('DONE');
      } catch (err) {
        setError(err.response?.data?.error || 'Could not apply this update.');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (saveAsBatch && !batchName.trim()) {
      setError('Name this batch first.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (saveAsBatch) {
        const { data } = await client.post('/batches', { name: batchName, barcodeValues: codes, status: chosenStatus, locationNotes });
        setResult({ updatedCount: data.updatedCount, items: data.batch.items });
        loadBatches();
      } else {
        const { data } = await client.post('/batches/apply-status', { barcodeValues: codes, status: chosenStatus, locationNotes });
        setResult({ updatedCount: data.updatedCount, items: data.items });
      }
      setPhase('DONE');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not apply this update.');
    } finally {
      setSubmitting(false);
    }
  }

  // Re-applies a (possibly different) status to every order already in a
  // saved batch — can be done repeatedly as the real-world status changes.
  async function changeBatchStatus(id, status) {
    if (!status) return;
    setChangingId(id);
    try {
      const { data } = await client.patch(`/batches/${id}/status`, { status });
      setBatches((prev) => prev.map((b) => (b.id === id ? { ...b, status: data.batch.status } : b)));
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update this batch\'s status.');
    } finally {
      setChangingId(null);
    }
  }

  function openBatchStatusScan(id) {
    setBatchScanLastCode(null);
    setScanningBatchId(id);
  }

  // Only location barcodes make sense here — a saved batch's status is one
  // string applied to every item in it, unlike the scan flow which resolves
  // individual shipment barcodes into batch items. Guards against
  // re-alerting on the same unmatched code while the camera keeps scanning.
  function handleBatchStatusScan(code) {
    if (!scanningBatchId || !code || code === batchScanLastCode) return;
    setBatchScanLastCode(code);
    const loc = locations.find((l) => l.barcodeValue === code);
    if (!loc) {
      alert("That barcode doesn't match any saved location. Scan a location's barcode (see Barcode locations) to update status this way.");
      return;
    }
    const id = scanningBatchId;
    setScanningBatchId(null);
    setBatchScanLastCode(null);
    changeBatchStatus(id, loc.label);
  }

  async function viewBatch(id) {
    setLoadingView(true);
    try {
      const { data } = await client.get(`/batches/${id}`);
      setViewingBatch(data.batch);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not load this batch.');
    } finally {
      setLoadingView(false);
    }
  }

  async function deleteBatch(id) {
    if (!confirm("Delete this saved batch record? This only removes it from this list — it won't change any order's current status.")) return;
    await client.delete(`/batches/${id}`);
    setBatches((prev) => prev.filter((b) => b.id !== id));
  }

  const notMatched = result?.items?.filter((i) => !i.matched) || [];

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Batch Scan</h1>

      <div className="dash-tabs" style={{ marginBottom: 16 }}>
        {canSeeTab('scan') && <button className={`dash-tab ${subTab === 'scan' ? 'active' : ''}`} onClick={() => setSubTab('scan')}>Scan</button>}
        {canSeeTab('batches') && <button className={`dash-tab ${subTab === 'batches' ? 'active' : ''}`} onClick={() => setSubTab('batches')}>Saved batches</button>}
        {canSeeLocationsTab && (
          <button className={`dash-tab ${subTab === 'locations' ? 'active' : ''}`} onClick={() => setSubTab('locations')}>Barcode locations</button>
        )}
      </div>

      {subTab === 'scan' && canSeeTab('scan') && (
        <>
          {phase === 'SCANNING' && (
            <div className="dash-tabs" style={{ marginBottom: 16, maxWidth: 360 }}>
              <button className={`dash-tab ${scanMode === 'labels' ? 'active' : ''}`} onClick={() => { reset(); setScanMode('labels'); }}>Scan labels</button>
              <button className={`dash-tab ${scanMode === 'loadsheet' ? 'active' : ''}`} onClick={() => { reset(); setScanMode('loadsheet'); }}>Scan a Load Sheet</button>
            </div>
          )}

          {phase === 'SCANNING' && scanMode === 'loadsheet' && (
            <div className="card" style={{ padding: 24, marginBottom: 24 }}>
              {!loadSheet ? (
                <>
                  <p className="lead" style={{ fontSize: 13, margin: 0 }}>Scan the Load Sheet's own barcode to load its order list.</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input
                      className="input"
                      placeholder="Scan or type the Load Sheet barcode…"
                      autoFocus
                      style={{ flex: 1 }}
                      value={lsInput}
                      onChange={(e) => setLsInput(e.target.value)}
                      onKeyDown={handleLsBarcodeKeyDown}
                      disabled={lsLoading}
                    />
                    <button type="button" className="btn btn-outline" style={{ flex: 'none' }} onClick={() => setShowLsCamera(true)}>📷 Camera</button>
                  </div>
                  {lsLoading && <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 10 }}>Loading…</p>}
                  {lsError && <div className="error-text" style={{ marginTop: 12 }}>{lsError}</div>}
                </>
              ) : (
                <>
                  <p className="lead" style={{ fontSize: 13, margin: 0 }}>
                    <b>{loadSheet.loadSheetNumber}</b> — {loadSheet.fromHub?.name} → {loadSheet.toHub?.name}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input
                      className="input"
                      placeholder="Scan or type each order's own label…"
                      autoFocus
                      style={{ flex: 1 }}
                      value={lsOrderInput}
                      onChange={(e) => setLsOrderInput(e.target.value)}
                      onKeyDown={handleLsOrderKeyDown}
                    />
                    <button type="button" className="btn btn-outline" style={{ flex: 'none' }} onClick={() => setShowLsCamera(true)}>📷 Camera</button>
                  </div>
                  {lsError && <div className="error-text" style={{ marginTop: 10 }}>{lsError}</div>}
                  <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 10 }}>{lsConfirmedIds.length} of {loadSheet.orders.length} confirmed</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, maxHeight: 280, overflowY: 'auto' }}>
                    {loadSheet.orders.map((o) => {
                      const confirmed = lsConfirmedIds.includes(o.id);
                      return (
                        <div
                          key={o.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
                            background: confirmed ? 'var(--paper)' : 'transparent',
                            color: confirmed ? 'var(--ink)' : 'var(--slate-light)',
                            border: '1px solid var(--line-2)', fontSize: 13,
                          }}
                        >
                          <span style={{ color: confirmed ? 'var(--success)' : 'transparent', fontWeight: 700 }}>✓</span>
                          <span className="mono">{o.orderNumber}</span>
                          <span style={{ fontSize: 12 }}>{o.receiver}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button type="button" className="btn btn-outline" onClick={() => { setLoadSheet(null); setLsConfirmedIds([]); }}>← Scan a different Load Sheet</button>
                    <button type="button" className="btn btn-primary" disabled={lsConfirmedIds.length === 0} onClick={finishLoadSheetScanning}>Next →</button>
                  </div>
                </>
              )}
            </div>
          )}

          {phase === 'SCANNING' && scanMode === 'labels' && (
            <div className="card" style={{ padding: 24, marginBottom: 24 }}>
              <p className="lead" style={{ fontSize: 13, margin: 0 }}>Scan each label's barcode (physical scanner, camera, or type the code and press Enter).</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input
                  className="input"
                  placeholder="Scan or type barcode…"
                  autoFocus
                  style={{ flex: 1 }}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={handleScanKeyDown}
                />
                <button type="button" className="btn btn-outline" style={{ flex: 'none' }} onClick={() => setShowCamera(true)}>📷 Camera</button>
              </div>
              {lastLocationScanned && (
                <p style={{ fontSize: 12.5, color: 'var(--cobalt)', marginTop: 10 }}>
                  📍 Location scanned: <b>{lastLocationScanned.name}</b> — status will be set to <b>{lastLocationScanned.label}</b>
                </p>
              )}
              {locationNotes.length > 0 && (
                <p style={{ fontSize: 12, color: 'var(--slate)', marginTop: 6 }}>
                  Will also be logged as a comment on each order below: {locationNotes.map((l) => `${l.name} (${l.label})`).join('; ')}
                </p>
              )}
              <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 10 }}>{codes.length} scanned</p>
              {codes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
                  {codes.map((c, i) => {
                    const p = preview[c];
                    const checked = p !== undefined;
                    const pillClass = !checked ? 'pill-navy' : p.matched ? 'pill-success' : 'pill-danger';
                    return (
                      <span key={i} className={`pill ${pillClass}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span>
                          {c}
                          {checked && (p.matched
                            ? <> → {p.orderNumber}{p.destination ? ` · ${p.destination}` : ''}</>
                            : <> — not matched</>)}
                        </span>
                        <button type="button" onClick={() => removeCode(i)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, padding: 0 }}>✕</button>
                      </span>
                    );
                  })}
                </div>
              )}
              {error && <div className="error-text" style={{ marginTop: 12 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" className="btn btn-primary" onClick={finishScanning}>Finish scanning →</button>
              </div>
            </div>
          )}

          {phase === 'FINISH' && (
            <div className="card" style={{ padding: 24, maxWidth: 440, marginBottom: 24 }}>
              <h4 style={{ marginBottom: 4 }}>Apply status</h4>
              <p className="lead" style={{ fontSize: 13, marginBottom: 12 }}>
                {scanMode === 'loadsheet'
                  ? <>{lsConfirmedIds.length} order{lsConfirmedIds.length === 1 ? '' : 's'} confirmed off {loadSheet?.loadSheetNumber}.</>
                  : <>{codes.length} label{codes.length === 1 ? '' : 's'} scanned.</>}
              </p>
              <div className="field">
                <label>New status</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="select" style={{ flex: 1 }} value={chosenStatus} onChange={(e) => setChosenStatus(e.target.value)}>
                    <option value="">Select status…</option>
                    {chosenStatus && !ORDER_STATUSES.includes(chosenStatus) && <option value={chosenStatus}>{chosenStatus} (from scanned location)</option>}
                    {ORDER_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                  <button type="button" className="btn btn-outline" style={{ flex: 'none' }} title="Scan a barcode location to set the status" onClick={() => setShowFinishCamera(true)}>📷</button>
                </div>
              </div>
              {lastLocationScanned && (
                <p style={{ fontSize: 12.5, color: 'var(--cobalt)', marginTop: 8 }}>
                  📍 Location scanned: <b>{lastLocationScanned.name}</b> — status set to <b>{lastLocationScanned.label}</b>
                </p>
              )}
              {scanMode !== 'loadsheet' && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 14, cursor: 'pointer' }}>
                    <input type="checkbox" checked={saveAsBatch} onChange={(e) => setSaveAsBatch(e.target.checked)} />
                    Save this as a reusable named batch
                  </label>
                  <p style={{ fontSize: 11.5, color: 'var(--slate-light)', marginTop: 2, marginLeft: 24 }}>
                    Lets you come back later and re-apply a new status to the same group of orders without re-scanning — see the Saved batches tab.
                  </p>
                  {saveAsBatch && (
                    <div className="field" style={{ marginTop: 10 }}>
                      <label>Batch name</label>
                      <input className="input" placeholder="e.g. Evening pickup run" autoFocus value={batchName} onChange={(e) => setBatchName(e.target.value)} />
                    </div>
                  )}
                </>
              )}
              {scanMode === 'loadsheet' && (
                <p style={{ fontSize: 11.5, color: 'var(--slate-light)', marginTop: 10 }}>
                  {loadSheet?.loadSheetNumber} is already in Saved batches — its status can be changed again from there without re-scanning.
                </p>
              )}
              {error && <div className="error-text" style={{ marginTop: 12 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="button" className="btn btn-outline" onClick={() => setPhase('SCANNING')}>← Back</button>
                <button type="button" className="btn btn-primary" disabled={!chosenStatus || submitting} onClick={applyBatch}>
                  {submitting ? 'Applying…' : saveAsBatch && scanMode !== 'loadsheet' ? 'Apply & save batch' : 'Apply status'}
                </button>
              </div>
            </div>
          )}

          {phase === 'DONE' && result && (
            <div className="card" style={{ padding: 24, maxWidth: 480, marginBottom: 24 }}>
              <h4 style={{ marginBottom: 8, color: 'var(--success)' }}>✓ Done</h4>
              <p style={{ fontSize: 13.5, marginBottom: 10 }}>
                {result.updatedCount} order{result.updatedCount === 1 ? '' : 's'} updated to <b>{statusLabel(chosenStatus)}</b>.
              </p>
              {locationNotes.length > 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--slate)', marginBottom: 10 }}>
                  Also logged as a comment on each order — view it via that order's Comments in the Orders tab.
                </p>
              )}
              {notMatched.length > 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--danger)' }}>
                  {notMatched.length} code{notMatched.length === 1 ? '' : 's'} didn't match any label: {notMatched.map((i) => i.barcodeValue).join(', ')}
                </p>
              )}
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={reset}>Scan more</button>
            </div>
          )}
        </>
      )}

      {subTab === 'batches' && canSeeTab('batches') && (
        loadingBatches ? <LoadingLogo /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Status applied</th><th>Items</th><th>Created by</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select
                          className="select"
                          style={{ padding: '6px 32px 6px 8px', fontSize: 12.5 }}
                          value={b.status}
                          disabled={changingId === b.id}
                          onChange={(e) => changeBatchStatus(b.id, e.target.value)}
                        >
                          {!ORDER_STATUSES.includes(b.status) && <option value={b.status}>{b.status}</option>}
                          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                        </select>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          title="Scan a barcode location to set its status"
                          disabled={changingId === b.id}
                          onClick={() => openBatchStatusScan(b.id)}
                        >
                          📷
                        </button>
                      </div>
                    </td>
                    <td>{b._count.items}</td>
                    <td>{b.createdBy?.fullName || '—'}</td>
                    <td>{formatDateShort(b.createdAt)}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-outline btn-sm" disabled={loadingView} onClick={() => viewBatch(b.id)}>View</button>
                      <button className="btn btn-outline btn-sm" onClick={() => deleteBatch(b.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {batches.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No saved batches yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      <div className={`modal-overlay ${viewingBatch ? 'open' : ''}`} onClick={() => setViewingBatch(null)}>
        {viewingBatch && (
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17 }}>{viewingBatch.name}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>
                  {viewingBatch.items.length} label{viewingBatch.items.length === 1 ? '' : 's'} scanned · status applied: {statusLabel(viewingBatch.status)}
                </p>
              </div>
              <button onClick={() => setViewingBatch(null)} style={{ background: 'var(--paper)', border: 'none', width: 36, height: 36, borderRadius: '50%', fontSize: 13, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Barcode</th><th>Order</th></tr></thead>
                <tbody>
                  {viewingBatch.items.map((it) => (
                    <tr key={it.id}>
                      <td className="mono">{it.barcodeValue}</td>
                      <td>
                        {it.matched
                          ? <span className="mono">{it.orderNumber}</span>
                          : <span style={{ color: 'var(--danger)' }}>Not matched</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {subTab === 'locations' && canSeeLocationsTab && (
        <div className="card" style={{ padding: 24 }}>
          <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 16 }}>
            Scanning a location during Batch Scan sets its label as the new status on every matched order, and
            logs the same text as a comment (with who scanned it and when).
          </p>

          <form onSubmit={addLocation} style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <div className="field">
                <label>Name <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
                <input className="input" placeholder="e.g. Van 3" required value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Label <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
                <input className="input" placeholder="e.g. Sorted at Hub A" required value={locForm.label} onChange={(e) => setLocForm({ ...locForm, label: e.target.value })} />
              </div>
              <button className="btn btn-primary btn-sm" disabled={addingLoc}>{addingLoc ? 'Adding…' : 'Add'}</button>
            </div>
          </form>
          {locError && <div className="error-text" style={{ marginBottom: 12 }}>{locError}</div>}

          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Barcode</th><th>Label / Status</th><th></th></tr></thead>
              <tbody>
                {locations.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td className="mono">{l.barcodeValue}</td>
                    <td><i>{l.label}</i></td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => printLocation(l.id, l.name)}>🖨️ Print label</button>
                      <button className="btn btn-outline btn-sm" onClick={() => deleteLocation(l.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {locations.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No barcode locations yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        {showCamera && (
          <BarcodeCameraScanner onScan={handleScannedCode} onClose={() => setShowCamera(false)} />
        )}
        {scanningBatchId && (
          <BarcodeCameraScanner onScan={handleBatchStatusScan} onClose={() => setScanningBatchId(null)} />
        )}
        {showLsCamera && (
          <BarcodeCameraScanner
            onScan={(code) => (loadSheet ? handleLsOrderScan(code) : loadLoadSheetByBarcode(code))}
            onClose={() => setShowLsCamera(false)}
          />
        )}
        {showFinishCamera && (
          <BarcodeCameraScanner onScan={handleFinishLocationScan} onClose={() => setShowFinishCamera(false)} />
        )}
      </Suspense>
    </div>
  );
}
