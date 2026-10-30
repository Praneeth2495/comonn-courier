import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';
import { formatDateShort as fmtDate } from '../utils/dateFormat';
import EmployeeOnboardingPanel from './EmployeeOnboardingPanel';
import ClockInOutPanel from './ClockInOutPanel';
import AttendanceAdminPanel from './AttendanceAdminPanel';

const ROLE_LABEL = { STAFF: 'Staff', DRIVER: 'Rider' };
const STATUS_LABEL = { INVITED: 'Invited', SUBMITTED: 'Pending approval', APPROVED: 'Approved' };
const STATUS_PILL = { INVITED: 'pill-navy', SUBMITTED: 'pill-cobalt', APPROVED: 'pill-success' };
const LEAVE_TYPE_LABEL = { SICK: 'Sick', CASUAL: 'Casual', EARNED: 'Earned', UNPAID: 'Unpaid', OTHER: 'Other' };

function leaveDays(start, end) {
  return Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
}

/**
 * Staff page: "Directory" (read-focused list + detail, with the leave/
 * sick-call log — the one thing neither Onboarding nor Users has),
 * "Onboarding" (where profiles actually get created/edited), and
 * "Attendance" (clock-in/out — moved in from its own former top-level
 * tab) as sub-tabs of the same page. Directory/Onboarding are each gated
 * by their own permission; Attendance is always available (every internal
 * user needs to clock in/out regardless of Staff/Onboarding access, same
 * as when it was standalone) — the sub-tab bar only renders once more
 * than one of the three is actually visible, so a user with none of the
 * Staff/Onboarding permissions still lands straight on Attendance with no
 * empty tab bar, exactly like before.
 */
export default function StaffPanel({ canViewDirectory, canViewOnboarding, isAdmin }) {
  const [subTab, setSubTab] = useState(canViewDirectory ? 'directory' : canViewOnboarding ? 'onboarding' : 'attendance');
  const visibleCount = (canViewDirectory ? 1 : 0) + (canViewOnboarding ? 1 : 0) + 1;

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Staff</h1>

      {visibleCount > 1 && (
        <div className="dash-tabs" style={{ marginBottom: 16 }}>
          {canViewDirectory && <button className={`dash-tab ${subTab === 'directory' ? 'active' : ''}`} onClick={() => setSubTab('directory')}>Directory</button>}
          {canViewOnboarding && <button className={`dash-tab ${subTab === 'onboarding' ? 'active' : ''}`} onClick={() => setSubTab('onboarding')}>Onboarding</button>}
          <button className={`dash-tab ${subTab === 'attendance' ? 'active' : ''}`} onClick={() => setSubTab('attendance')}>Attendance</button>
        </div>
      )}

      {subTab === 'directory' && canViewDirectory && <StaffDirectory />}
      {subTab === 'onboarding' && canViewOnboarding && <EmployeeOnboardingPanel />}
      {subTab === 'attendance' && <AttendanceTab isAdmin={isAdmin} />}
    </div>
  );
}

// ADMIN gets a sub-tab to see every user's clock-in/out history alongside
// their own; STAFF/ACCOUNTS only ever see their own (ClockInOutPanel calls
// /attendance/mine, which is scoped server-side to req.user.id regardless).
function AttendanceTab({ isAdmin }) {
  const [subTab, setSubTab] = useState('mine');
  if (!isAdmin) return <ClockInOutPanel />;
  return (
    <div>
      <div className="dash-tabs" style={{ marginBottom: 16 }}>
        <button className={`dash-tab ${subTab === 'mine' ? 'active' : ''}`} onClick={() => setSubTab('mine')}>My attendance</button>
        <button className={`dash-tab ${subTab === 'all' ? 'active' : ''}`} onClick={() => setSubTab('all')}>All staff</button>
      </div>
      {subTab === 'mine' && <ClockInOutPanel />}
      {subTab === 'all' && <AttendanceAdminPanel />}
    </div>
  );
}

function StaffDirectory() {
  const [staff, setStaff] = useState(null);
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  function load() {
    setStaff(null);
    client.get('/admin/employees', { params: { q: q || undefined } }).then(({ data }) => setStaff(data.employees)).catch(() => setStaff([]));
  }
  useEffect(load, []);

  function search(e) {
    e.preventDefault();
    load();
  }

  return (
    <div>
      <form className="search-box" style={{ marginBottom: 16, maxWidth: 360 }} onSubmit={search}>
        🔍<input placeholder="Search name, email, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      {staff === null ? (
        <LoadingLogo />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Role</th><th>Designation</th><th>Hub</th><th>Phone</th><th>Status</th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td><button className="t-oid" onClick={() => setSelectedId(s.id)}>{s.fullName}</button></td>
                  <td>{ROLE_LABEL[s.role] || s.role}</td>
                  <td>{s.profile?.designation || '—'}</td>
                  <td>{s.profile?.hub?.name || '—'}</td>
                  <td className="mono">{s.phone || '—'}</td>
                  <td>
                    {!s.isActive ? <span className="pill pill-danger">Inactive</span>
                      : s.profile?.status ? <span className={`pill ${STATUS_PILL[s.profile.status]}`}>{STATUS_LABEL[s.profile.status]}</span>
                      : <span className="pill pill-navy">—</span>}
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No staff match this search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && <StaffDetailModal employeeId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function StaffDetailModal({ employeeId, onClose }) {
  const [employee, setEmployee] = useState(null);
  const [leaves, setLeaves] = useState(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveType, setLeaveType] = useState('SICK');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function loadEmployee() {
    client.get(`/admin/employees/${employeeId}`).then(({ data }) => setEmployee(data.employee)).catch(() => {});
  }
  function loadLeaves() {
    setLeaves(null);
    client.get(`/admin/employees/${employeeId}/leaves`).then(({ data }) => setLeaves(data.leaves)).catch(() => setLeaves([]));
  }
  useEffect(() => { loadEmployee(); loadLeaves(); }, [employeeId]);

  async function submitLeave(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await client.post(`/admin/employees/${employeeId}/leaves`, { type: leaveType, startDate, endDate, note: note.trim() || undefined });
      setNote('');
      setShowLeaveForm(false);
      loadLeaves();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not log this leave.');
    } finally {
      setSubmitting(false);
    }
  }

  const p = employee?.profile || {};

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 680, maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3>{employee ? employee.fullName : 'Staff'}</h3>
            {employee && <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>{ROLE_LABEL[employee.role] || employee.role}{p.designation ? ` · ${p.designation}` : ''}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>

        {!employee ? <LoadingLogo size={40} /> : (
          <>
            <div className="detail-grid" style={{ marginBottom: 20 }}>
              <div className="detail-row"><span className="k">Email</span><span className="v">{employee.email}</span></div>
              <div className="detail-row"><span className="k">Phone</span><span className="v">{employee.phone || '—'}</span></div>
              <div className="detail-row"><span className="k">Department</span><span className="v">{p.department || '—'}</span></div>
              <div className="detail-row"><span className="k">Hub</span><span className="v">{p.hub?.name || '—'}</span></div>
              <div className="detail-row"><span className="k">Date of joining</span><span className="v">{p.dateOfJoining ? fmtDate(p.dateOfJoining) : '—'}</span></div>
              <div className="detail-row"><span className="k">Salary</span><span className="v">{p.salaryAmount != null ? `₹${Number(p.salaryAmount).toFixed(2)}` : '—'}</span></div>
              <div className="detail-row"><span className="k">Address</span><span className="v">{[p.addressLine1, p.city, p.state, p.postcode].filter(Boolean).join(', ') || '—'}</span></div>
              <div className="detail-row"><span className="k">Emergency contact</span><span className="v">{p.emergencyContactName ? `${p.emergencyContactName} (${p.emergencyContactRelation || '—'}) · ${p.emergencyContactPhone || '—'}` : '—'}</span></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4>Leaves &amp; sick calls</h4>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowLeaveForm((v) => !v)}>{showLeaveForm ? 'Cancel' : '+ Log leave'}</button>
            </div>

            {showLeaveForm && (
              <form onSubmit={submitLeave} className="card" style={{ padding: 14, marginBottom: 16, background: 'var(--paper)' }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Type</label>
                    <select className="select" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                      {Object.entries(LEAVE_TYPE_LABEL).map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Start date</label>
                    <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>End date</label>
                    <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Note (optional)</label>
                  <input className="input" placeholder="e.g. Fever, called in this morning" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
                <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
              </form>
            )}

            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Note</th><th>Logged by</th></tr></thead>
                <tbody>
                  {leaves === null ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '18px 0' }}><LoadingLogo size={24} /></td></tr>
                  ) : leaves.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '18px 0' }}>No leaves logged yet.</td></tr>
                  ) : leaves.map((l) => (
                    <tr key={l.id}>
                      <td><span className="pill pill-navy">{LEAVE_TYPE_LABEL[l.type] || l.type}</span></td>
                      <td>{fmtDate(l.startDate)}</td>
                      <td>{fmtDate(l.endDate)}</td>
                      <td>{leaveDays(l.startDate, l.endDate)}</td>
                      <td style={{ color: 'var(--slate-light)', fontSize: 12.5 }}>{l.note || '—'}</td>
                      <td style={{ fontSize: 12.5 }}>{l.createdBy?.fullName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
