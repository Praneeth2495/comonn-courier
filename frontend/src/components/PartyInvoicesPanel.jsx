import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';

const RECURRENCE_LABELS = { NONE: '—', WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly' };

function statusPill(invoice) {
  if (invoice.status === 'PAID') return <span className="pill pill-success">Paid</span>;
  if (invoice.overdue) return <span className="pill pill-danger">Overdue</span>;
  return <span className="pill pill-warn">Unpaid</span>;
}

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

export default function PartyInvoicesPanel({ direction }) {
  const label = direction === 'PAYABLE' ? 'Payable' : 'Receivable';
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

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
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Create invoice</button>
      </div>

      <div className="dash-toolbar">
        <form className="search-box" onSubmit={search}>
          🔍<input placeholder="Search name, business, invoice #…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
      </div>

      {loading ? <LoadingLogo /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Invoice #</th><th>Party</th><th>Amount</th><th>Due date</th><th>Recurring</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} style={{ background: inv.overdue ? 'var(--danger-bg)' : undefined }}>
                  <td className="mono">{inv.invoiceNumber}</td>
                  <td>{inv.partyName}{inv.businessName ? <span style={{ color: 'var(--slate-light)' }}> · {inv.businessName}</span> : null}</td>
                  <td>₹{Number(inv.totalAmount).toFixed(2)}</td>
                  <td>{new Date(inv.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td>{RECURRENCE_LABELS[inv.recurrence] || '—'}</td>
                  <td>{statusPill(inv)}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => setSelectedId(inv.id)}>View</button></td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No {label.toLowerCase()} invoices yet.</td></tr>
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
      {selectedId && <InvoiceDetailModal invoiceId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />}
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
        <h3 style={{ marginBottom: 16 }}>Create {direction === 'PAYABLE' ? 'payable' : 'receivable'} invoice</h3>
        <form onSubmit={submit} className="form-stack">
          <div className="field">
            <label>Name</label>
            <input className="input" required value={partyName} onChange={(e) => setPartyName(e.target.value)} />
          </div>
          <div className="field">
            <label>Business name (optional)</label>
            <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea className="input" required rows={2} style={{ resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Amount (₹)</label>
              <input className="input" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>GST %</label>
              <input className="input" type="number" min="0" step="0.01" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Due date</label>
            <input className="input" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Email (optional)</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Mobile (optional)</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
              <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>Due {new Date(invoice.dueDate).toLocaleDateString('en-IN')}</span>
              {invoice.status === 'PAID' && invoice.paidAt && (
                <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>Paid {new Date(invoice.paidAt).toLocaleDateString('en-IN')}</span>
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
                      <span>{new Date(c.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
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
