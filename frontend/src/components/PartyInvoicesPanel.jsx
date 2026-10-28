import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';
import { downloadBlob } from '../utils/downloadBlob';
import { formatDateShort, formatDateTime } from '../utils/dateFormat';

const RECURRENCE_LABELS = { NONE: '—', WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly' };
// Mirrors backend/src/constants/partyInvoiceCategories.js — the 8
// manifest-cost categories plus SALARY (set via the "+ Pay salary" quick
// form below, never through this dropdown directly).
const CATEGORY_LABELS = {
  ORIGIN_CUSTOMS: 'Origin Customs',
  DEST_CUSTOMS: 'Destination Customs',
  AIRLINE: 'Airline Fare',
  HUB: 'Hub',
  DELIVERY: 'Delivery Charges',
  STATIONERY: 'Stationery',
  COMPANY: 'Company',
  MISC: 'Miscellaneous',
  SALARY: 'Salary',
};
const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS).filter((k) => k !== 'SALARY');

function statusPill(invoice) {
  if (invoice.status === 'PAID') return <span className="pill pill-success">Paid</span>;
  if (invoice.overdue) return <span className="pill pill-danger">Overdue</span>;
  return <span className="pill pill-warn">Unpaid</span>;
}

export default function PartyInvoicesPanel({ direction }) {
  const label = direction === 'PAYABLE' ? 'Payable' : 'Receivable';
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);

  function load() {
    setLoading(true);
    client.get('/admin/party-invoices', { params: { direction, q: q || undefined } })
      .then(({ data }) => { setInvoices(data.invoices); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(load, [direction]);

  function search(e) {
    e.preventDefault();
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 className="h-lg">{label}</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Create invoice</button>
        </div>
      </div>

      <div className="dash-toolbar">
        <form className="search-box" onSubmit={search}>
          🔍<input placeholder="Search name, business, invoice #…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
      </div>

      {loading ? <LoadingLogo /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Invoice #</th><th>Party</th>{direction === 'PAYABLE' && <th>Category</th>}<th>Amount</th><th>Due date</th><th>Recurring</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} style={{ background: inv.overdue ? 'var(--danger-bg)' : undefined }}>
                  <td className="mono">{inv.invoiceNumber}</td>
                  <td>{inv.partyName}{inv.businessName ? <span style={{ color: 'var(--slate-light)' }}> · {inv.businessName}</span> : null}</td>
                  {direction === 'PAYABLE' && (
                    <td>
                      {inv.category ? <span className="pill pill-cobalt" style={{ fontSize: 11 }}>{CATEGORY_LABELS[inv.category]}</span> : <span style={{ color: 'var(--slate-light)' }}>—</span>}
                    </td>
                  )}
                  <td>₹{Number(inv.totalAmount).toFixed(2)}</td>
                  <td>{formatDateShort(inv.dueDate)}</td>
                  <td>{RECURRENCE_LABELS[inv.recurrence] || '—'}</td>
                  <td>{statusPill(inv)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setSelectedId(inv.id)}>View</button>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditingId(inv.id)}>Edit</button>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={direction === 'PAYABLE' ? 8 : 7} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No {label.toLowerCase()} invoices yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateInvoiceModal
          direction={direction}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
      {editingId && (
        <EditInvoiceModal
          invoiceId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); load(); }}
        />
      )}
      {selectedId && <InvoiceDetailModal invoiceId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />}
    </div>
  );
}

// Free-text input with a filtered dropdown of manifest numbers — fetches
// the (small) full manifest list once and filters client-side, rather
// than a server-side search endpoint, since the volume doesn't warrant
// one. Shared by the create and edit Payable forms.
function ManifestAutosuggest({ value, onChange }) {
  const [manifests, setManifests] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    client.get('/admin/manifests').then(({ data }) => setManifests(data.manifests)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!value) { setQuery(''); return; }
    const m = manifests.find((x) => x.id === value);
    if (m) setQuery(m.manifestNumber);
  }, [value, manifests]);

  const matches = query.trim()
    ? manifests.filter((m) => m.manifestNumber.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : manifests.slice(0, 8);

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input"
        placeholder="Optional — e.g. MAN42"
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(''); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, marginTop: 4, maxHeight: 180, overflowY: 'auto', boxShadow: '0 14px 34px -12px rgba(0,0,0,.25)' }}>
          {matches.map((m) => (
            <div
              key={m.id}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}
              onMouseDown={() => { onChange(m.id); setQuery(m.manifestNumber); setOpen(false); }}
            >
              <b className="mono">{m.manifestNumber}</b> <span style={{ color: 'var(--slate-light)' }}>· {m.hub?.name} → {m.countryCode}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateInvoiceModal({ direction, onClose, onCreated }) {
  const [partyName, setPartyName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [gstPercent, setGstPercent] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [recurrence, setRecurrence] = useState('NONE');
  const [status, setStatus] = useState('UNPAID');
  const [category, setCategory] = useState('');
  const [manifestId, setManifestId] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('direction', direction);
      formData.append('partyName', partyName);
      if (businessName) formData.append('businessName', businessName);
      formData.append('description', description);
      formData.append('amount', amount);
      if (gstPercent) formData.append('gstPercent', gstPercent);
      formData.append('dueDate', dueDate);
      if (email) formData.append('email', email);
      if (phone) formData.append('phone', phone);
      formData.append('recurrence', recurrence);
      formData.append('status', status);
      if (direction === 'PAYABLE' && category) formData.append('category', category);
      if (direction === 'PAYABLE' && manifestId) formData.append('manifestId', manifestId);
      if (attachment) formData.append('attachment', attachment);

      await client.post('/admin/party-invoices', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create this invoice.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h3>Create {direction === 'PAYABLE' ? 'payable' : 'receivable'} invoice</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>
        <form onSubmit={submit} className="form-stack">
          <div className="field">
            <label>Name <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <input className="input" required value={partyName} onChange={(e) => setPartyName(e.target.value)} />
          </div>
          <div className="field">
            <label>Business name</label>
            <input className="input" placeholder="Optional" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div className="field">
            <label>Description <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <textarea className="input" required rows={2} style={{ resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Amount (₹) <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
              <input className="input" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>GST %</label>
              <input className="input" type="number" min="0" step="0.01" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Due date <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <input className="input" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          {direction === 'PAYABLE' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Category</label>
                <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">— None —</option>
                  {CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Manifest #</label>
                <ManifestAutosuggest value={manifestId} onChange={setManifestId} />
              </div>
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" placeholder="Optional" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Mobile</label>
            <input className="input" placeholder="Optional" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Recurring</label>
              <select className="select" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                <option value="NONE">None</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Status</label>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="UNPAID">Unpaid</option>
                <option value="PAID">Paid</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Attach invoice (optional)</label>
            <input className="input" type="file" onChange={(e) => setAttachment(e.target.files?.[0] || null)} />
          </div>
          {error && <div className="error-text">{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>{submitting ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InvoiceDetailModal({ invoiceId, onClose, onChanged }) {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    client.get(`/admin/party-invoices/${invoiceId}`).then(({ data }) => { setInvoice(data.invoice); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(load, [invoiceId]);

  function loadComments() {
    setCommentsLoading(true);
    client.get(`/admin/party-invoices/${invoiceId}/comments`).then(({ data }) => { setComments(data.comments); setCommentsLoading(false); }).catch(() => setCommentsLoading(false));
  }
  useEffect(loadComments, [invoiceId]);

  async function setInvoiceStatus(status) {
    setUpdating(true);
    try {
      const { data } = await client.patch(`/admin/party-invoices/${invoiceId}/status`, { status });
      setInvoice(data.invoice);
      loadComments();
      onChanged();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update this invoice.');
    } finally {
      setUpdating(false);
    }
  }

  async function sendEmail() {
    setSending(true);
    setSendMsg('');
    try {
      await client.post(`/admin/party-invoices/${invoiceId}/send`);
      setSendMsg('Sent!');
    } catch (err) {
      setSendMsg(err.response?.data?.error || 'Could not send this invoice.');
    } finally {
      setSending(false);
    }
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    setError('');
    try {
      const { data } = await client.post(`/admin/party-invoices/${invoiceId}/comments`, { body });
      setComments((prev) => [...prev, data.comment]);
      setBody('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add comment.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        {loading || !invoice ? <LoadingLogo size={40} /> : (
          <>
            <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <h3 style={{ fontSize: 17 }}>{invoice.invoiceNumber}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>{invoice.partyName}{invoice.businessName ? ` · ${invoice.businessName}` : ''}</p>
              </div>
              <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0', flexWrap: 'wrap' }}>
              {statusPill(invoice)}
              <span style={{ fontFamily: 'IBM Plex Mono', fontWeight: 700 }}>₹{Number(invoice.totalAmount).toFixed(2)}</span>
              <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>Due {new Date(invoice.dueDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
              {invoice.status === 'PAID' && invoice.paidAt && (
                <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>Paid {new Date(invoice.paidAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
              )}
            </div>

            <p style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 14 }}>{invoice.description}</p>
            <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 14 }}>
              Amount ₹{Number(invoice.amount).toFixed(2)} + GST {Number(invoice.gstPercent).toFixed(2)}%
              {invoice.recurrence !== 'NONE' ? ` · Recurs ${RECURRENCE_LABELS[invoice.recurrence].toLowerCase()}` : ''}
            </p>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              {invoice.status === 'UNPAID' ? (
                <button type="button" className="btn btn-primary btn-sm" disabled={updating} onClick={() => setInvoiceStatus('PAID')}>
                  {updating ? 'Updating…' : 'Mark as paid'}
                </button>
              ) : (
                <button type="button" className="btn btn-outline btn-sm" disabled={updating} onClick={() => setInvoiceStatus('UNPAID')}>
                  {updating ? 'Updating…' : 'Mark as unpaid'}
                </button>
              )}
              <button type="button" className="btn btn-outline btn-sm" disabled={!invoice.email || sending} onClick={sendEmail} title={!invoice.email ? 'No email on file' : ''}>
                {sending ? 'Sending…' : '✉️ Send to email'}
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadBlob(`/admin/party-invoices/${invoiceId}/download`, `${invoice.invoiceNumber}.pdf`)}>
                ⬇ Download invoice
              </button>
              {invoice.hasAttachment && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadBlob(`/admin/party-invoices/${invoiceId}/attachment`, invoice.attachmentName || 'attachment')}>
                  ⬇ Download attachment
                </button>
              )}
            </div>
            {sendMsg && <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: -8, marginBottom: 14 }}>{sendMsg}</p>}

            <h4 style={{ fontSize: 13, marginBottom: 8, borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>Comments</h4>
            {commentsLoading ? (
              <LoadingLogo size={30} />
            ) : comments.length === 0 ? (
              <p className="lead" style={{ fontSize: 13 }}>No comments yet.</p>
            ) : (
              <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
                {comments.map((c) => (
                  <div className="comment-item" key={c.id}>
                    <div className="meta">
                      <span className="author">{c.author?.fullName || c.author?.email || 'Unknown'}</span>
                      <span>{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p className="body">{c.body}</p>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={submitComment} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
              <textarea
                className="input"
                placeholder="Add a comment…"
                rows={2}
                style={{ resize: 'vertical', flex: 1 }}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" disabled={!body.trim() || posting} style={{ flex: 'none' }}>
                {posting ? '…' : 'Add comment'}
              </button>
            </form>
            {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function toDateInputValue(iso) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '';
}

function EditInvoiceModal({ invoiceId, onClose, onSaved }) {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get(`/admin/party-invoices/${invoiceId}`).then(({ data }) => {
      const inv = data.invoice;
      setInvoice(inv);
      setForm({
        partyName: inv.partyName,
        businessName: inv.businessName || '',
        description: inv.description,
        amount: String(inv.amount),
        gstPercent: String(inv.gstPercent),
        dueDate: toDateInputValue(inv.dueDate),
        email: inv.email || '',
        phone: inv.phone || '',
        recurrence: inv.recurrence,
        category: inv.category || '',
        manifestId: inv.manifestId || '',
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [invoiceId]);

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = { ...form };
      if (invoice.direction !== 'PAYABLE') { delete payload.category; delete payload.manifestId; }
      await client.patch(`/admin/party-invoices/${invoiceId}`, payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save changes.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !form || !invoice) {
    return (
      <div className="modal-overlay open" onClick={onClose}>
        <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}><LoadingLogo size={40} /></div>
      </div>
    );
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h3>Edit {invoice.invoiceNumber}</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>
        <form onSubmit={submit} className="form-stack">
          <div className="field">
            <label>Name <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <input className="input" required value={form.partyName} onChange={(e) => set('partyName', e.target.value)} />
          </div>
          <div className="field">
            <label>Business name</label>
            <input className="input" placeholder="Optional" value={form.businessName} onChange={(e) => set('businessName', e.target.value)} />
          </div>
          <div className="field">
            <label>Description <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <textarea className="input" required rows={2} style={{ resize: 'vertical' }} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Amount (₹) <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
              <input className="input" type="number" min="0" step="0.01" required value={form.amount} onChange={(e) => set('amount', e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>GST %</label>
              <input className="input" type="number" min="0" step="0.01" value={form.gstPercent} onChange={(e) => set('gstPercent', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Due date <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <input className="input" type="date" required value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </div>
          {invoice.direction === 'PAYABLE' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Category</label>
                <select className="select" value={form.category} onChange={(e) => set('category', e.target.value)}>
                  <option value="">— None —</option>
                  {CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Manifest #</label>
                <ManifestAutosuggest value={form.manifestId} onChange={(v) => set('manifestId', v)} />
              </div>
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" placeholder="Optional" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="field">
            <label>Mobile</label>
            <input className="input" placeholder="Optional" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="field">
            <label>Recurring</label>
            <select className="select" value={form.recurrence} onChange={(e) => set('recurrence', e.target.value)}>
              <option value="NONE">None</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </div>
          {error && <div className="error-text">{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>{submitting ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Also doubles as the edit form when `invoice` is passed — the
// employee/month fields are create-only (an existing invoice's partyName
// etc. don't change), but hub/amount/due date are editable either way.
function SalaryPaymentModal({ invoice, onClose, onCreated }) {
  const [staff, setStaff] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [employeeUserId, setEmployeeUserId] = useState('');
  const [hubId, setHubId] = useState(invoice?.hubId || '');
  const [amount, setAmount] = useState(invoice ? String(invoice.amount) : '');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [dueDate, setDueDate] = useState(() => (invoice ? toDateInputValue(invoice.dueDate) : new Date().toISOString().slice(0, 10)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      client.get('/admin/party-invoices/staff'),
      client.get('/admin/hubs'),
    ]).then(([staffRes, hubsRes]) => {
      setStaff(staffRes.data.staff);
      setHubs(hubsRes.data.hubs.filter((h) => h.isActive));
      setLoadingOptions(false);
    }).catch(() => setLoadingOptions(false));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (invoice) {
        await client.patch(`/admin/party-invoices/${invoice.id}`, { amount, dueDate, hubId: hubId || null });
      } else {
        await client.post('/admin/party-invoices/salary', { employeeUserId, amount, month, dueDate, hubId: hubId || null });
      }
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save this salary payment.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h3>{invoice ? `Edit salary — ${invoice.partyName}` : 'Pay salary'}</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>
        {loadingOptions ? <LoadingLogo size={40} /> : (
          <form onSubmit={submit} className="form-stack">
            {!invoice && (
              <div className="field">
                <label>Staff member <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
                <select className="select" required value={employeeUserId} onChange={(e) => setEmployeeUserId(e.target.value)}>
                  <option value="">Select…</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName} · {s.role}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label>Hub <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
              <select className="select" required value={hubId} onChange={(e) => setHubId(e.target.value)}>
                <option value="">Which hub is this salary for?</option>
                {hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Amount (₹) <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
              <input className="input" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {!invoice && (
                <div className="field" style={{ flex: 1 }}>
                  <label>Month</label>
                  <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                </div>
              )}
              <div className="field" style={{ flex: 1 }}>
                <label>Due date <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
                <input className="input" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            {error && <div className="error-text">{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>{submitting ? 'Saving…' : invoice ? 'Save changes' : 'Record payment'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Dedicated Accounts → Salary tab: lists every SALARY-category payable
// (client-side filtered off the normal party-invoices list — simpler than
// a server-side category filter for this data volume) and the "+ Pay
// salary" entry point, which used to live on the Payable tab itself.
export function SalaryPanel() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  function load() {
    setLoading(true);
    client.get('/admin/party-invoices', { params: { direction: 'PAYABLE' } })
      .then(({ data }) => { setInvoices(data.invoices.filter((inv) => inv.category === 'SALARY')); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 className="h-lg">Salary</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Pay salary</button>
      </div>

      {loading ? <LoadingLogo /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Invoice #</th><th>Staff member</th><th>Description</th><th>Amount</th><th>Due date</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} style={{ background: inv.overdue ? 'var(--danger-bg)' : undefined }}>
                  <td className="mono">{inv.invoiceNumber}</td>
                  <td>{inv.partyName}{inv.businessName ? <span style={{ color: 'var(--slate-light)' }}> · {inv.businessName}</span> : null}</td>
                  <td>{inv.description}</td>
                  <td>₹{Number(inv.totalAmount).toFixed(2)}</td>
                  <td>{formatDateShort(inv.dueDate)}</td>
                  <td>{statusPill(inv)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => setSelectedId(inv.id)}>View</button>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditingInvoice(inv)}>Edit</button>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No salary payments yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <SalaryPaymentModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
      {editingInvoice && (
        <SalaryPaymentModal
          invoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onCreated={() => { setEditingInvoice(null); load(); }}
        />
      )}
      {selectedId && <InvoiceDetailModal invoiceId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />}
    </div>
  );
}
