import { lazy, Suspense, useEffect, useState } from 'react';
import client from '../api/client';
import { COUNTRY_NAMES } from '../utils/countryNames';
import LoadingLogo from './LoadingLogo';

// Lazy-loaded: pulls in @zxing — no reason to ship that to every visitor of
// the (mostly public) app bundle when only staff/admin ever open it.
const BarcodeCameraScanner = lazy(() => import('./BarcodeCameraScanner'));

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export default function PrintLabelPanel() {
  const [subTab, setSubTab] = useState('scan');

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Print Label</h1>

      <div className="dash-tabs" style={{ marginBottom: 16 }}>
        <button className={`dash-tab ${subTab === 'scan' ? 'active' : ''}`} onClick={() => setSubTab('scan')}>Scan &amp; Print</button>
        <button className={`dash-tab ${subTab === 'manual' ? 'active' : ''}`} onClick={() => setSubTab('manual')}>Manual Label</button>
      </div>

      {subTab === 'scan' && <ScanAndPrintTab />}
      {subTab === 'manual' && <ManualLabelTab />}
    </div>
  );
}

// Staff enter or scan a label's printed barcode (physical scanner, camera,
// or typed) to reprint it directly — no need to hunt down the order first.
// Opens the label PDF inline (same ?inline=1 pattern as the "View label"
// button elsewhere), letting the browser's own print dialog handle it.
function ScanAndPrintTab() {
  const [code, setCode] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [history, setHistory] = useState([]); // recently printed, most recent first

  function printByCode(raw) {
    const barcodeValue = (raw || '').trim();
    if (!barcodeValue) return;
    window.open(`${API_BASE}/labels/download/barcode/${encodeURIComponent(barcodeValue)}?inline=1`, '_blank');
    setHistory((prev) => [barcodeValue, ...prev.filter((c) => c !== barcodeValue)].slice(0, 10));
    setCode('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      printByCode(code);
    }
  }

  return (
    <div>
      <p className="lead" style={{ marginBottom: 16, fontSize: 13.5 }}>
        Scan (physical scanner or camera) or type a label's barcode to open and print it again.
      </p>

      <div className="card" style={{ padding: 24, maxWidth: 480 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="Scan or type barcode…"
            autoFocus
            style={{ flex: 1 }}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button type="button" className="btn btn-outline" style={{ flex: 'none' }} onClick={() => setShowCamera(true)}>📷 Camera</button>
        </div>
        <button
          type="button"
          className="btn btn-primary block"
          style={{ marginTop: 14, padding: 12 }}
          disabled={!code.trim()}
          onClick={() => printByCode(code)}
        >
          🖨️ Print label
        </button>
      </div>

      {history.length > 0 && (
        <div className="card" style={{ padding: 20, maxWidth: 480, marginTop: 20 }}>
          <h4 style={{ marginBottom: 10, fontSize: 14 }}>Recently printed</h4>
          {history.map((c, i) => (
            <div
              key={c}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '8px 0',
                borderBottom: i < history.length - 1 ? '1px solid var(--line)' : 'none',
              }}
            >
              <span className="mono">{c}</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => printByCode(c)}>Reprint</button>
            </div>
          ))}
        </div>
      )}

      {showCamera && (
        <Suspense fallback={null}>
          <BarcodeCameraScanner onScan={printByCode} onClose={() => setShowCamera(false)} />
        </Suspense>
      )}
    </div>
  );
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

function addressSummary(addr) {
  return [addr.city, addr.suburb, addr.countryCode].filter(Boolean).join(', ') || '—';
}

function ManualLabelTab() {
  const [batches, setBatches] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState(null); // { referenceNumber, batchId, hasMaster, labels }

  function load() {
    client.get('/labels/manual/history').then(({ data }) => setBatches(data.batches)).catch(() => setBatches([]));
  }
  useEffect(load, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p className="lead" style={{ fontSize: 13.5, maxWidth: 480 }}>For a shipment with no order behind it — e.g. an internal transfer.</p>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Create Label</button>
      </div>

      <h3 className="h-md" style={{ marginBottom: 12 }}>History</h3>
      {batches === null ? <LoadingLogo /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Reference (Order ID)</th><th>From</th><th>To</th><th>Qty</th><th>Created by</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="mono">{b.orderId || b.referenceNumber}</td>
                  <td>{addressSummary(b.fromAddress)}</td>
                  <td>{addressSummary(b.toAddress)}</td>
                  <td>{b.quantity}</td>
                  <td>{b.createdBy?.fullName || '—'}</td>
                  <td>{fmtDate(b.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setViewing({ referenceNumber: b.orderId || b.referenceNumber, batchId: b.id, hasMaster: b.hasMaster, labels: b.labels })}
                      >
                        Labels
                      </button>
                      {b.hasMaster && (
                        <a className="btn btn-outline btn-sm" href={`${API_BASE}/labels/manual/${b.id}/master?inline=1`} target="_blank" rel="noreferrer">
                          Master
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No manual labels created yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateLabelModal
          onClose={() => setShowCreate(false)}
          onCreated={(result) => {
            setShowCreate(false);
            load();
            setViewing({ referenceNumber: result.batch.orderId || result.batch.referenceNumber, batchId: result.batch.id, hasMaster: result.batch.hasMaster, labels: result.labels });
          }}
        />
      )}

      {viewing && (
        <div className="modal-overlay open" onClick={() => setViewing(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <h3>Labels</h3>
              <button onClick={() => setViewing(null)} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 16 }}>Reference <span className="mono">{viewing.referenceNumber}</span></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {viewing.hasMaster && (
                <a
                  className="btn btn-primary btn-sm"
                  href={`${API_BASE}/labels/manual/${viewing.batchId}/master?inline=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View &amp; print master label (all {viewing.labels.length} pages)
                </a>
              )}
              {viewing.labels.map((l) => (
                <a
                  key={l.id}
                  className="btn btn-outline btn-sm"
                  href={`${API_BASE}/labels/download/${l.id}?inline=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View &amp; print label {viewing.labels.length > 1 ? `${l.packageIndex} of ${viewing.labels.length}` : ''}
                </a>
              ))}
            </div>
            <button type="button" className="btn btn-primary block" style={{ marginTop: 16, padding: 12 }} onClick={() => setViewing(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function emptyAddress() {
  return { businessName: '', street: '', suburb: '', city: '', state: '', pin: '', countryCode: '' };
}

function AddressFields({ label, value, onChange }) {
  function set(field, v) {
    onChange({ ...value, [field]: v });
  }
  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <h4 style={{ fontSize: 13.5, marginBottom: 10 }}>{label} address</h4>
      <div className="field">
        <label>Business name (optional)</label>
        <input className="input" value={value.businessName} onChange={(e) => set('businessName', e.target.value)} />
      </div>
      <div className="field">
        <label>Street</label>
        <input className="input" required value={value.street} onChange={(e) => set('street', e.target.value)} />
      </div>
      <div className="field">
        <label>Sub-urb (optional)</label>
        <input className="input" value={value.suburb} onChange={(e) => set('suburb', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>City (optional)</label>
          <input className="input" value={value.city} onChange={(e) => set('city', e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>State</label>
          <input className="input" required value={value.state} onChange={(e) => set('state', e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Pin (optional)</label>
          <input className="input" value={value.pin} onChange={(e) => set('pin', e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Country</label>
        <select className="input" required value={value.countryCode} onChange={(e) => set('countryCode', e.target.value)}>
          <option value="" disabled>Select country</option>
          {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function CreateLabelModal({ onClose, onCreated }) {
  const [orderId, setOrderId] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [service, setService] = useState('');
  const [fromAddress, setFromAddress] = useState(emptyAddress());
  const [toAddress, setToAddress] = useState(emptyAddress());
  const [quantity, setQuantity] = useState('1');
  const [itemType, setItemType] = useState('Box');
  const [actualWeightKg, setActualWeightKg] = useState('');
  const [lengthCm, setLengthCm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const { data } = await client.post('/labels/manual', {
        orderId, refNumber, service, fromAddress, toAddress, quantity, itemType, actualWeightKg, lengthCm, widthCm, heightCm, instructions,
      });
      onCreated(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create the label(s).');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 520, maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <h3>Create Label</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 16 }}>
          {Number(quantity) > 1 ? 'Generates one label per unit, plus a combined master label with every page.' : 'For a shipment with no order behind it — e.g. an internal transfer.'}
        </p>
        <form onSubmit={submit} className="form-stack">
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Order ID</label>
              <input className="input" required value={orderId} onChange={(e) => setOrderId(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Reference number (optional)</label>
              <input className="input" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Service</label>
            <select className="input" required value={service} onChange={(e) => setService(e.target.value)}>
              <option value="" disabled>Select service</option>
              <option value="Express">Express</option>
              <option value="Economy">Economy</option>
            </select>
          </div>

          <AddressFields label="From" value={fromAddress} onChange={setFromAddress} />
          <AddressFields label="To" value={toAddress} onChange={setToAddress} />

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Quantity</label>
              <input className="input" type="number" min="1" max="100" step="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Item type</label>
              <select className="input" value={itemType} onChange={(e) => setItemType(e.target.value)}>
                <option value="Box">Box</option>
                <option value="Pallet">Pallet</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Weight (kg)</label>
              <input className="input" type="number" min="0.01" step="0.01" required value={actualWeightKg} onChange={(e) => setActualWeightKg(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Length (cm)</label>
              <input className="input" type="number" min="0" step="0.1" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Width (cm)</label>
              <input className="input" type="number" min="0" step="0.1" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Height (cm)</label>
              <input className="input" type="number" min="0" step="0.1" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Instructions (optional)</label>
            <textarea className="input" rows={2} style={{ resize: 'vertical' }} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>

          {error && <div className="error-text">{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>{submitting ? 'Generating…' : 'Generate'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
