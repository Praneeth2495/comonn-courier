import { useEffect, lazy, Suspense, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';

// Lazy-loaded: pulls in @zxing — no reason to ship that to every visitor of
// the (mostly public) app bundle when only staff/admin/driver ever open it.
const BarcodeCameraScanner = lazy(() => import('./BarcodeCameraScanner'));

const ORDER_STATUSES = ['PENDING_PAYMENT', 'PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'EXCEPTION'];

export default function BatchScanPanel() {
  const { user } = useAuth();
  const canManageLocations = user?.role === 'ADMIN' || user?.role === 'STAFF';

  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [mode, setMode] = useState(null); // 'CREATE' | 'STATUS'
  const [phase, setPhase] = useState('IDLE'); // IDLE | NAME | SCANNING | FINISH | DONE
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
  const [showLocations, setShowLocations] = useState(false);
  const [locForm, setLocForm] = useState({ name: '', barcodeValue: '', status: '' });
  const [addingLoc, setAddingLoc] = useState(false);
  const [locError, setLocError] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [showLocCamera, setShowLocCamera] = useState(false);

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
    if (!locForm.name.trim() || !locForm.barcodeValue.trim() || !locForm.status) return;
    setAddingLoc(true);
    setLocError('');
    try {
      await client.post('/locations', locForm);
      setLocForm({ name: '', barcodeValue: '', status: '' });
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

  function reset() {
    setMode(null);
    setPhase('IDLE');
    setBatchName('');
    setCodes([]);
    setScanInput('');
    setChosenStatus('');
    setResult(null);
    setError('');
    setLastLocationScanned(null);
  }

  function startCreateBatch() {
    reset();
    setMode('CREATE');
    setPhase('NAME');
  }

  function startUpdateStatus() {
    reset();
    setMode('STATUS');
    setPhase('SCANNING');
  }

  function confirmName(e) {
    e.preventDefault();
    if (!batchName.trim()) return;
    setPhase('SCANNING');
  }

  // Shared by both the keyboard/physical-scanner input and the camera
  // scanner — scanning a known location's barcode picks the status it
  // represents instead of adding a label to the batch (still overridable at
  // the status step below).
  function handleScannedCode(code) {
    if (!code) return;
    const loc = locations.find((l) => l.barcodeValue === code);
    if (loc) {
      setChosenStatus(loc.status);
      setLastLocationScanned(loc);
      return;
    }
    setCodes((prev) => [...prev, code]);
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
    setSubmitting(true);
    setError('');
    try {
      if (mode === 'CREATE') {
        const { data } = await client.post('/batches', { name: batchName, barcodeValues: codes, status: chosenStatus });
        setResult({ updatedCount: data.updatedCount, items: data.batch.items });
        loadBatches();
      } else {
        const { data } = await client.post('/batches/apply-status', { barcodeValues: codes, status: chosenStatus });
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

      {phase === 'IDLE' && (
        <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" style={{ padding: '14px 24px' }} onClick={startCreateBatch}>📦 Create batch &amp; update</button>
          <button className="btn btn-outline" style={{ padding: '14px 24px' }} onClick={startUpdateStatus}>🔄 Update status</button>
          {canManageLocations && (
            <button className="btn btn-outline" style={{ padding: '14px 24px' }} onClick={() => setShowLocations(true)}>📍 Barcode locations</button>
          )}
        </div>
      )}

      {phase === 'NAME' && (
        <div className="card" style={{ padding: 24, maxWidth: 420, marginBottom: 24 }}>
          <h4 style={{ marginBottom: 12 }}>Name this batch</h4>
          <form onSubmit={confirmName}>
            <input className="input" placeholder="e.g. Evening pickup run" autoFocus required value={batchName} onChange={(e) => setBatchName(e.target.value)} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" className="btn btn-outline" onClick={reset}>Cancel</button>
              <button className="btn btn-primary">Start scanning →</button>
            </div>
          </form>
        </div>
      )}

      {phase === 'SCANNING' && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          {mode === 'CREATE' && <h4 style={{ marginBottom: 4 }}>Batch: {batchName}</h4>}
          <p className="lead" style={{ fontSize: 13, marginBottom: 12 }}>Scan each label's barcode (physical scanner, camera, or type the code and press Enter).</p>
          <div style={{ display: 'flex', gap: 8 }}>
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
              📍 Location scanned: <b>{lastLocationScanned.name}</b> — status will be set to <b>{lastLocationScanned.status.replace(/_/g, ' ')}</b>
            </p>
          )}
          <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 10 }}>{codes.length} scanned</p>
          {codes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
              {codes.map((c, i) => (
                <span key={i} className="pill pill-navy" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {c}
                  <button type="button" onClick={() => removeCode(i)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, padding: 0 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          {error && <div className="error-text" style={{ marginTop: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="button" className="btn btn-outline" onClick={reset}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={finishScanning}>Finish scanning →</button>
          </div>
        </div>
      )}

      {phase === 'FINISH' && (
        <div className="card" style={{ padding: 24, maxWidth: 420, marginBottom: 24 }}>
          <h4 style={{ marginBottom: 4 }}>{mode === 'CREATE' ? `Batch: ${batchName}` : 'Update status'}</h4>
          <p className="lead" style={{ fontSize: 13, marginBottom: 12 }}>{codes.length} label{codes.length === 1 ? '' : 's'} scanned.</p>
          <div className="field">
            <label>New status</label>
            <select className="select" value={chosenStatus} onChange={(e) => setChosenStatus(e.target.value)}>
              <option value="">Select status…</option>
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          {error && <div className="error-text" style={{ marginTop: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" className="btn btn-outline" onClick={() => setPhase('SCANNING')}>← Back</button>
            <button type="button" className="btn btn-primary" disabled={!chosenStatus || submitting} onClick={applyBatch}>
              {submitting ? 'Applying…' : mode === 'CREATE' ? 'Apply & save batch' : 'Apply status'}
            </button>
          </div>
        </div>
      )}

      {phase === 'DONE' && result && (
        <div className="card" style={{ padding: 24, maxWidth: 480, marginBottom: 24 }}>
          <h4 style={{ marginBottom: 8, color: 'var(--success)' }}>✓ Done</h4>
          <p style={{ fontSize: 13.5, marginBottom: 10 }}>
            {result.updatedCount} order{result.updatedCount === 1 ? '' : 's'} updated to <b>{chosenStatus.replace(/_/g, ' ')}</b>.
          </p>
          {notMatched.length > 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--danger)' }}>
              {notMatched.length} code{notMatched.length === 1 ? '' : 's'} didn't match any label: {notMatched.map((i) => i.barcodeValue).join(', ')}
            </p>
          )}
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={reset}>Done</button>
        </div>
      )}

      <h3 className="h-md" style={{ marginBottom: 12 }}>Saved batches</h3>
      {loadingBatches ? <p className="lead">Loading…</p> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Status applied</th><th>Items</th><th>Created by</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>
                    <select
                      className="select"
                      style={{ padding: '6px 8px', fontSize: 12.5 }}
                      value={b.status}
                      disabled={changingId === b.id}
                      onChange={(e) => changeBatchStatus(b.id, e.target.value)}
                    >
                      {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </td>
                  <td>{b._count.items}</td>
                  <td>{b.createdBy?.fullName || '—'}</td>
                  <td>{new Date(b.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
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
      )}

      <div className={`modal-overlay ${viewingBatch ? 'open' : ''}`} onClick={() => setViewingBatch(null)}>
        {viewingBatch && (
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17 }}>{viewingBatch.name}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>
                  {viewingBatch.items.length} label{viewingBatch.items.length === 1 ? '' : 's'} scanned · status applied: {viewingBatch.status.replace(/_/g, ' ')}
                </p>
              </div>
              <button onClick={() => setViewingBatch(null)} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
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

      <div className={`modal-overlay ${showLocations ? 'open' : ''}`} onClick={() => setShowLocations(false)}>
        {showLocations && (
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17 }}>Barcode locations</h3>
                <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>
                  Scanning one of these during Batch Scan auto-selects the status it represents.
                </p>
              </div>
              <button onClick={() => setShowLocations(false)} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
            </div>

            <form onSubmit={addLocation} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr auto', gap: 8, alignItems: 'end', marginBottom: 16 }}>
              <div className="field">
                <label>Name</label>
                <input className="input" placeholder="e.g. Van 3" required value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Barcode (scan or type)</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input" placeholder="Scan or type…" required style={{ flex: 1 }} value={locForm.barcodeValue} onChange={(e) => setLocForm({ ...locForm, barcodeValue: e.target.value })} />
                  <button type="button" className="btn btn-outline btn-sm" style={{ flex: 'none' }} onClick={() => setShowLocCamera(true)}>📷</button>
                </div>
              </div>
              <div className="field">
                <label>Status</label>
                <select className="select" required value={locForm.status} onChange={(e) => setLocForm({ ...locForm, status: e.target.value })}>
                  <option value="">Select…</option>
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <button className="btn btn-primary btn-sm" disabled={addingLoc}>{addingLoc ? 'Adding…' : 'Add'}</button>
            </form>
            {locError && <div className="error-text" style={{ marginBottom: 12 }}>{locError}</div>}

            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Name</th><th>Barcode</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {locations.map((l) => (
                    <tr key={l.id}>
                      <td>{l.name}</td>
                      <td className="mono">{l.barcodeValue}</td>
                      <td>{l.status.replace(/_/g, ' ')}</td>
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
      </div>

      <Suspense fallback={null}>
        {showCamera && (
          <BarcodeCameraScanner onScan={handleScannedCode} onClose={() => setShowCamera(false)} />
        )}
        {showLocCamera && (
          <BarcodeCameraScanner
            onScan={(text) => setLocForm((prev) => ({ ...prev, barcodeValue: text }))}
            onClose={() => setShowLocCamera(false)}
          />
        )}
      </Suspense>
    </div>
  );
}
