import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';
import { fmtTime, fmtDuration } from '../utils/attendanceFormat';

const ROLE_LABEL = { ADMIN: 'Admin', STAFF: 'Staff', ACCOUNTS: 'Accounts', DRIVER: 'Rider' };

export default function AttendanceAdminPanel() {
  const [logs, setLogs] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  function load() {
    setLogs(null);
    client.get('/attendance/admin', { params: { from: fromDate || undefined, to: toDate || undefined } })
      .then(({ data }) => setLogs(data.logs))
      .catch(() => setLogs([]));
  }
  useEffect(load, [fromDate, toDate]);

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Staff attendance</h1>

      <div className="card date-toolbar" style={{ marginBottom: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--slate)', fontWeight: 600 }}>Filter by clock-in date</span>
        <input className="input" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
        <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>to</span>
        <input className="input" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
        {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate(''); }}>Clear</button>}
      </div>

      {logs === null ? <LoadingLogo /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Role</th><th>Clock in</th><th>Area</th><th>Clock out</th><th>Area</th><th>Duration</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.user?.fullName}
                    <div style={{ fontSize: 11, color: 'var(--slate-light)' }}>{l.user?.email}</div>
                  </td>
                  <td>{ROLE_LABEL[l.user?.role] || l.user?.role}</td>
                  <td>{fmtTime(l.clockInAt)}</td>
                  <td>{l.clockInArea || '—'}</td>
                  <td>{l.clockOutAt ? fmtTime(l.clockOutAt) : <span className="pill pill-cobalt">Ongoing</span>}</td>
                  <td>{l.clockOutArea || '—'}</td>
                  <td>{fmtDuration(l.clockInAt, l.clockOutAt)}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No shifts recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
