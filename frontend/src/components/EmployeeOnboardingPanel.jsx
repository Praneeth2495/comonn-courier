import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';

async function downloadBlob(url, filename) {
  const { data } = await client.get(url, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

const ID_PROOF_TYPES = ['Aadhaar', 'PAN', 'Passport', 'Driving Licence', 'Voter ID', 'Other'];

export default function EmployeeOnboardingPanel() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  function load() {
    setLoading(true);
    client.get('/admin/employees')
      .then(({ data }) => { setEmployees(data.employees); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 className="h-lg">Onboarding</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add employee</button>
      </div>

      {loading ? <LoadingLogo /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Role</th><th>Designation</th><th>Department</th><th>Joined</th><th>Mobile</th><th></th></tr></thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.fullName}
                    <div style={{ fontSize: 11, color: 'var(--slate-light)' }}>{e.email}</div>
                  </td>
                  <td>{e.role === 'DRIVER' ? 'Driver' : 'Staff'}</td>
                  <td>{e.profile?.designation || '—'}</td>
                  <td>{e.profile?.department || '—'}</td>
                  <td>{e.profile?.dateOfJoining ? new Date(e.profile.dateOfJoining).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td className="mono">{e.phone || '—'}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => setSelectedId(e.id)}>View / Edit</button></td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No employees onboarded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <EmployeeFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      )}
      {selectedId && (
        <EmployeeFormModal
          mode="edit"
          employeeId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={() => { setSelectedId(null); load(); }}
        />
      )}
    </div>
  );
}

const EMPTY_FORM = {
  fullName: '', email: '', phone: '', role: 'STAFF',
  designation: '', department: '', dateOfJoining: '',
  addressLine1: '', addressLine2: '', city: '', state: '', postcode: '',
  emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: '',
  idProofType: '', idProofNumber: '',
  bankAccountName: '', bankAccountNumber: '', bankIfsc: '', bankName: '',
};

function EmployeeFormModal({ mode, employeeId, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [idProofFile, setIdProofFile] = useState(null);
  const [existingIdProof, setExistingIdProof] = useState(false);
  const [loading, setLoading] = useState(mode === 'edit');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'edit') return;
    client.get(`/admin/employees/${employeeId}`).then(({ data }) => {
      const e = data.employee;
      const p = e.profile || {};
      setForm({
        fullName: e.fullName || '', email: e.email || '', phone: e.phone || '', role: e.role,
        designation: p.designation || '', department: p.department || '',
        dateOfJoining: p.dateOfJoining ? p.dateOfJoining.slice(0, 10) : '',
        addressLine1: p.addressLine1 || '', addressLine2: p.addressLine2 || '',
        city: p.city || '', state: p.state || '', postcode: p.postcode || '',
        emergencyContactName: p.emergencyContactName || '', emergencyContactRelation: p.emergencyContactRelation || '',
        emergencyContactPhone: p.emergencyContactPhone || '',
        idProofType: p.idProofType || '', idProofNumber: p.idProofNumber || '',
        bankAccountName: p.bankAccountName || '', bankAccountNumber: p.bankAccountNumber || '',
        bankIfsc: p.bankIfsc || '', bankName: p.bankName || '',
      });
      setExistingIdProof(Boolean(p.hasIdProofFile));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [mode, employeeId]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (mode === 'edit' && key === 'email') return; // email is fixed after account creation, same as self-registered accounts
        formData.append(key, value ?? '');
      });
      if (idProofFile) formData.append('idProofFile', idProofFile);

      if (mode === 'create') {
        await client.post('/admin/employees', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await client.patch(`/admin/employees/${employeeId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save this employee.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16 }}>{mode === 'create' ? 'Add employee' : 'Employee details'}</h3>

        {loading ? <LoadingLogo /> : (
          <form onSubmit={submit} className="form-stack">
            <div className="detail-section">
              <h4>Basic details</h4>
              <div className="grid-2">
                <div className="field"><label>Full name</label><input className="input" required value={form.fullName} onChange={(e) => update('fullName', e.target.value)} /></div>
                <div className="field">
                  <label>Email {mode === 'edit' && <span style={{ fontWeight: 400, color: 'var(--slate-light)' }}>(fixed after creation)</span>}</label>
                  <input className="input" type="email" required disabled={mode === 'edit'} value={form.email} onChange={(e) => update('email', e.target.value)} />
                </div>
                <div className="field"><label>Mobile</label><input className="input" value={form.phone} onChange={(e) => update('phone', e.target.value)} /></div>
                <div className="field">
                  <label>Role</label>
                  <select className="select" disabled={mode === 'edit'} value={form.role} onChange={(e) => update('role', e.target.value)}>
                    <option value="STAFF">Staff</option>
                    <option value="DRIVER">Driver</option>
                  </select>
                </div>
                <div className="field"><label>Designation</label><input className="input" value={form.designation} onChange={(e) => update('designation', e.target.value)} /></div>
                <div className="field"><label>Department</label><input className="input" value={form.department} onChange={(e) => update('department', e.target.value)} /></div>
                <div className="field"><label>Date of joining</label><input className="input" type="date" value={form.dateOfJoining} onChange={(e) => update('dateOfJoining', e.target.value)} /></div>
              </div>
            </div>

            <div className="detail-section">
              <h4>Address</h4>
              <div className="grid-2">
                <div className="field" style={{ gridColumn: '1 / -1' }}><label>Address line 1</label><input className="input" value={form.addressLine1} onChange={(e) => update('addressLine1', e.target.value)} /></div>
                <div className="field" style={{ gridColumn: '1 / -1' }}><label>Address line 2 (optional)</label><input className="input" value={form.addressLine2} onChange={(e) => update('addressLine2', e.target.value)} /></div>
                <div className="field"><label>City</label><input className="input" value={form.city} onChange={(e) => update('city', e.target.value)} /></div>
                <div className="field"><label>State</label><input className="input" value={form.state} onChange={(e) => update('state', e.target.value)} /></div>
                <div className="field"><label>Pincode</label><input className="input" value={form.postcode} onChange={(e) => update('postcode', e.target.value)} /></div>
              </div>
            </div>

            <div className="detail-section">
              <h4>Emergency contact</h4>
              <div className="grid-2">
                <div className="field"><label>Name</label><input className="input" value={form.emergencyContactName} onChange={(e) => update('emergencyContactName', e.target.value)} /></div>
                <div className="field"><label>Relationship</label><input className="input" value={form.emergencyContactRelation} onChange={(e) => update('emergencyContactRelation', e.target.value)} /></div>
                <div className="field"><label>Phone</label><input className="input" value={form.emergencyContactPhone} onChange={(e) => update('emergencyContactPhone', e.target.value)} /></div>
              </div>
            </div>

            <div className="detail-section">
              <h4>Government ID proof</h4>
              <div className="grid-2">
                <div className="field">
                  <label>ID type</label>
                  <select className="select" value={form.idProofType} onChange={(e) => update('idProofType', e.target.value)}>
                    <option value="">—</option>
                    {ID_PROOF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field"><label>ID number</label><input className="input" value={form.idProofNumber} onChange={(e) => update('idProofNumber', e.target.value)} /></div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Attach ID document (optional)</label>
                  <input className="input" type="file" accept="image/*,.pdf" onChange={(e) => setIdProofFile(e.target.files?.[0] || null)} />
                  {existingIdProof && !idProofFile && (
                    <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => downloadBlob(`/admin/employees/${employeeId}/id-proof`, 'id-proof')}>
                      ⬇ Download attached document
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="detail-section">
              <h4>Bank details (for payroll)</h4>
              <div className="grid-2">
                <div className="field"><label>Account holder name</label><input className="input" value={form.bankAccountName} onChange={(e) => update('bankAccountName', e.target.value)} /></div>
                <div className="field"><label>Account number</label><input className="input" value={form.bankAccountNumber} onChange={(e) => update('bankAccountNumber', e.target.value)} /></div>
                <div className="field"><label>IFSC</label><input className="input" value={form.bankIfsc} onChange={(e) => update('bankIfsc', e.target.value)} /></div>
                <div className="field"><label>Bank name</label><input className="input" value={form.bankName} onChange={(e) => update('bankName', e.target.value)} /></div>
              </div>
            </div>

            {mode === 'create' && (
              <p style={{ fontSize: 12.5, color: 'var(--slate)' }}>
                A login will be created and a "set your password" link emailed to this address — you don't choose their password here.
              </p>
            )}
            {error && <div className="error-text">{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                {submitting ? 'Saving…' : mode === 'create' ? 'Create employee' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
