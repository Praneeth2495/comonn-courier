import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';

const emptyAddressForm = { contactName: '', phone: '', email: '', instructions: '', line1: '', line2: '', city: '', state: '', postcode: '', countryCode: '', isDefault: false };

export default function SavedAddresses() {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = not editing, 'new' = adding, or an address object
  const [form, setForm] = useState(emptyAddressForm);

  function load() {
    setLoading(true);
    client.get('/addresses').then(({ data }) => setAddresses(data.addresses)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  function startAdd() {
    setForm(emptyAddressForm);
    setEditing('new');
  }

  function startEdit(addr) {
    setForm({ ...emptyAddressForm, ...addr });
    setEditing(addr);
  }

  async function save(e) {
    e.preventDefault();
    if (editing === 'new') await client.post('/addresses', form);
    else await client.patch(`/addresses/${editing.id}`, form);
    setEditing(null);
    load();
  }

  async function remove(id) {
    if (!confirm('Delete this saved address?')) return;
    try {
      await client.delete(`/addresses/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete this address — it may still be linked to an existing order.');
    }
  }

  if (loading) return <LoadingLogo label="Loading addresses…" />;

  return (
    <div>
      <h3 className="h-md" style={{ marginBottom: 14 }}>Saved addresses</h3>

      {editing === null && <button className="btn btn-primary btn-sm" style={{ marginBottom: 16 }} onClick={startAdd}>+ Add address</button>}

      {editing !== null && (
        <form className="card" style={{ padding: 22, marginBottom: 16 }} onSubmit={save}>
          <h4 style={{ marginBottom: 14, color: 'var(--navy)' }}>{editing === 'new' ? 'Add address' : 'Edit address'}</h4>
          <div className="grid-2">
            <div className="field"><label>Full name</label><input className="input" required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
            <div className="field"><label>Phone</label><input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="field"><label>Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label>Address line 1</label><input className="input" required value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} /></div>
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="field"><label>Address line 2</label><input className="input" value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} /></div>
            <div className="field"><label>City</label><input className="input" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="field"><label>State</label><input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
            <div className="field"><label>Postcode</label><input className="input" required value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} /></div>
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="field"><label>Country code</label><input className="input" required maxLength={2} value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })} /></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13 }}>
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Set as default
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary">Save address</button>
          </div>
        </form>
      )}

      {addresses.map((a) => (
        <div className="card addr-card" key={a.id}>
          <div>
            {a.isDefault && <div className="tag">Default</div>}
            <p style={{ fontWeight: 600, fontSize: 14 }}>{a.contactName}</p>
            <p style={{ fontSize: 13, color: 'var(--slate)' }}>
              {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}{a.state ? `, ${a.state}` : ''} {a.postcode}, {a.countryCode}
            </p>
            <p style={{ fontSize: 13, color: 'var(--slate)' }}>{a.phone}{a.email ? ` · ${a.email}` : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => startEdit(a)}>Edit</button>
            <button className="btn btn-outline btn-sm" onClick={() => remove(a.id)}>Delete</button>
          </div>
        </div>
      ))}

      {addresses.length === 0 && editing === null && (
        <div className="empty-state card" style={{ marginBottom: 16 }}><p>No saved addresses yet.</p></div>
      )}
    </div>
  );
}
