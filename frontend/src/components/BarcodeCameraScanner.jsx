import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

/**
 * Modal that opens the device camera and continuously decodes barcodes from
 * the video stream, calling onScan(text) for each new code — stays open so
 * multiple labels can be scanned in a row, same as a physical scanner.
 */
export default function BarcodeCameraScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const lastRef = useRef({ text: '', at: 0 });
  const [error, setError] = useState('');
  const [lastCaptured, setLastCaptured] = useState('');

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        videoRef.current,
        (result) => {
          if (cancelled || !result) return;
          const text = result.getText();
          const now = Date.now();
          // The video stream is decoded continuously — ignore the same code
          // re-firing while it's still in frame.
          if (text === lastRef.current.text && now - lastRef.current.at < 2000) return;
          lastRef.current = { text, at: now };
          setLastCaptured(text);
          onScan(text);
        }
      )
      .then((controls) => {
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      })
      .catch((err) => setError(err?.message || 'Could not access the camera.'));

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 17 }}>Scan with camera</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer' }}>✕</button>
        </div>
        {error ? (
          <p className="error-text">{error}</p>
        ) : (
          <>
            <video ref={videoRef} style={{ width: '100%', borderRadius: 10, background: '#000', display: 'block' }} muted playsInline />
            <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 10 }}>
              Point the camera at a barcode — it keeps scanning, so you can do several in a row. Close this when done.
            </p>
            {lastCaptured && (
              <p style={{ fontSize: 13, color: 'var(--success)', marginTop: 8 }}>✓ Captured: <b className="mono">{lastCaptured}</b></p>
            )}
          </>
        )}
        <button className="btn btn-primary block" style={{ marginTop: 16, padding: 12 }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
