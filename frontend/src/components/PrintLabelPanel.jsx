import { lazy, Suspense, useState } from 'react';

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
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Print Label</h1>
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
    </div>
  );
}
