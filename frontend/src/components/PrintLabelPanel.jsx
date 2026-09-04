import { lazy, Suspense, useState } from 'react';
import client from '../api/client';
import { COUNTRY_NAMES } from '../utils/countryNames';

// Lazy-loaded: pulls in @zxing — no reason to ship that to every visitor of
// the (mostly public) app bundle when only staff/admin ever open it.
const BarcodeCameraScanner = lazy(() => import('./BarcodeCameraScanner'));

// Staff enter or scan a label's printed barcode (physical scanner, camera,
// or typed) to reprint it directly — no need to hunt down the order first.
// Opens the label PDF inline (same ?inline=1 pattern as the "View label"
// button elsewhere), letting the browser's own print dialog handle it.
export default function PrintLabelPanel() {
  const [code, setCode] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]); // recently printed, most recent first
  const [showCreate, setShowCreate] = useState(false);
  const [createdLabels, setCreatedLabels] = useState(null); // { referenceNumber, labels } after a successful Create

  function printByCode(raw) {
    const barcodeValue = (raw || '').trim();
    if (!barcodeValue) return;
    setError('');
    const base = import.meta.env.VITE_API_BASE_URL || '/api';
    window.open(`${base}/labels/download/barcode/${encodeURIComponent(barcodeValue)}?inline=1`, '_blank');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="h-lg">Print Label</h1>
          <p className="lead" style={{ marginTop: 4, fontSize: 13.5 }}>
            Scan (physical scanner or camera) or type a label's barcode to open and print it again.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Create Label</button>
      </div>

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
        {error && <div className="error-text" style={{ marginTop: 12 }}>{error}</div>}
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

      {showCreate && (
        <CreateLabelModal
          onClose={() => setShowCreate(false)}
          onCreated={(result) => { setShowCreate(false); setCreatedLabels(result); }}
        />
      )}

      {createdLabels && (
        <div className="modal-overlay open" onClick={() => setCreatedLabels(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>Labels created</h3>
            <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 16 }}>Reference <span className="mono">{createdLabels.referenceNumber}</span></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {createdLabels.labels.map((l) => (
                <a
                  key={l.id}
                  className="btn btn-outline btn-sm"
                  href={`${import.meta.env.VITE_API_BASE_URL || '/api'}/labels/download/${l.id}?inline=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View &amp; print label {createdLabels.labels.length > 1 ? `${l.packageIndex} of ${createdLabels.labels.length}` : ''}
                </a>
              ))}
            </div>
            <button type="button" className="btn btn-primary block" style={{ marginTop: 16, padding: 12 }} onClick={() => setCreatedLabels(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function emptyAddress() {
  return { street: '', suburb: '', city: '', state: '', countryCode: '' };
}

function AddressFields({ label, value, onChange }) {
  function set(field, v) {
    onChange({ ...value, [field]: v });
  }
  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <h4 style={{ fontSize: 13.5, marginBottom: 10 }}>{label} address</h4>
      <div className="field">
        <label>Street</label>
        <input className="input" required value={value.street} onChange={(e) => set('street', e.target.value)} />
      </div>
      <div className="field">
        <label>Sub-urb</label>
        <input className="input" required value={value.suburb} onChange={(e) => set('suburb', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>City</label>
          <input className="input" required value={value.city} onChange={(e) => set('city', e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>State</label>
          <input className="input" required value={value.state} onChange={(e) => set('state', e.target.value)} />
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
        fromAddress, toAddress, quantity, itemType, actualWeightKg, lengthCm, widthCm, heightCm, instructions,
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
        <h3 style={{ marginBottom: 4 }}>Create Label</h3>
        <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 16 }}>For a shipment with no order behind it — e.g. an internal transfer.</p>
        <form onSubmit={submit} className="form-stack">
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
