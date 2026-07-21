import { useEffect, useState } from 'react';
import client from '../api/client';

const ORDER_STATUSES = ['PENDING_PAYMENT', 'PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'EXCEPTION'];

export default function BatchScanPanel() {
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

  function loadBatches() {
    setLoadingBatches(true);
    client.get('/batches').then(({ data }) => { setBatches(data.batches); setLoadingBatches(false); }).catch(() => setLoadingBatches(false));
  }
  useEffect(loadBatches, []);

  function reset() {
    setMode(null);
    setPhase('IDLE');
    setBatchName('');
    setCodes([]);
    setScanInput('');
    setChosenStatus('');
    setResult(null);
    setError('');
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

  function handleScanKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = scanInput.trim();
      if (code) setCodes((prev) => [...prev, code]);
      setScanInput('');
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
          <p className="lead" style={{ fontSize: 13, marginBottom: 12 }}>Scan each label's barcode (or type the code and press Enter).</p>
          <input
            className="input"
            placeholder="Scan or type barcode…"
            autoFocus
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={handleScanKeyDown}
          />
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
                  <td><button className="btn btn-outline btn-sm" onClick={() => deleteBatch(b.id)}>Delete</button></td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No saved batches yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
