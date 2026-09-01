import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

function fmtDuration(startIso, endIso) {
  if (!startIso || !endIso) return '—';
  const ms = new Date(endIso) - new Date(startIso);
  const totalMins = Math.round(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Wraps the browser Geolocation API in a promise that resolves to
// {lat, lng} or {lat: null, lng: null} — a denied permission, timeout, or
// unsupported browser must never block clock-in/out itself, only the area
// label that comes from it (resolved server-side, see backend
// services/geocoding.js).
function getCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ lat: null, lng: null });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

export default function ClockInOutPanel() {
  const [logs, setLogs] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [locationNote, setLocationNote] = useState(false);

  function load() {
    client.get('/attendance/mine').then(({ data }) => setLogs(data.logs)).catch(() => setLogs([]));
  }
  useEffect(load, []);

  const openShift = logs?.find((l) => !l.clockOutAt) || null;

  async function clockIn() {
    setWorking(true);
    setError('');
    setLocationNote(false);
    try {
      const { lat, lng } = await getCoords();
      if (lat === null) setLocationNote(true);
      await client.post('/attendance/clock-in', { lat, lng });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not clock in.');
    } finally {
      setWorking(false);
    }
  }

  async function clockOut() {
    setWorking(true);
    setError('');
    setLocationNote(false);
    try {
      const { lat, lng } = await getCoords();
      if (lat === null) setLocationNote(true);
      await client.post('/attendance/clock-out', { lat, lng });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not clock out.');
    } finally {
      setWorking(false);
    }
  }

  if (logs === null) return <LoadingLogo />;

  return (
    <div>
      <div className="card" style={{ padding: 20, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          {openShift ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--slate)' }}>Clocked in since</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{fmtTime(openShift.clockInAt)}</div>
              {openShift.clockInArea && <div style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 2 }}>📍 {openShift.clockInArea}</div>}
            </>
          ) : (
            <div style={{ fontSize: 14, color: 'var(--slate)' }}>Not clocked in</div>
          )}
        </div>
        <button
          type="button"
          className={`btn ${openShift ? 'btn-outline' : 'btn-primary'}`}
          disabled={working}
          onClick={openShift ? clockOut : clockIn}
        >
          {working ? 'Working…' : openShift ? 'Clock out' : 'Clock in'}
        </button>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}
      {locationNote && <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 14 }}>Location wasn't available (permission denied or unsupported) — recorded without it.</p>}

      <h3 className="h-md" style={{ marginBottom: 12 }}>My shift history</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Clock in</th><th>Area</th><th>Clock out</th><th>Area</th><th>Duration</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{fmtTime(l.clockInAt)}</td>
                <td>{l.clockInArea || '—'}</td>
                <td>{l.clockOutAt ? fmtTime(l.clockOutAt) : <span className="pill pill-cobalt">Ongoing</span>}</td>
                <td>{l.clockOutArea || '—'}</td>
                <td>{fmtDuration(l.clockInAt, l.clockOutAt)}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No shifts recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
