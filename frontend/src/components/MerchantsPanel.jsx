import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';

const INVOICE_DUE_DAYS = 2; // must match backend's merchantInvoiceGenerator.js INVOICE_DUE_DAYS

function isOverdue(invoice) {
  if (invoice.status !== 'UNPAID') return false;
  const dueAt = new Date(new Date(invoice.invoiceDate).getTime() + INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000);
  return new Date() > dueAt;
}

function statusPill(invoice) {
  if (invoice.status === 'PAID') return <span className="pill pill-success">Paid</span>;
  if (isOverdue(invoice)) return <span className="pill pill-danger">Overdue</span>;
  return <span className="pill pill-warn">Unpaid</span>;
}

export default function MerchantsPanel() {
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState(null); // { merchant, apiKey } — shown once
  const [selectedId, setSelectedId] = useState(null);
  const [invoiceId, setInvoiceId] = useState(null);

  function load() {
    setLoading(true);
    client.get('/admin/merchants').then(({ data }) => { setMerchants(data.merchants); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 className="h-lg">Merchants</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add merchant</button>
      </div>

      {loading ? <LoadingLogo /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Contact</th><th>API key</th><th>Status</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {merchants.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.contactEmail}</td>
                  <td className="mono">{m.apiKeyPrefix}…</td>
                  <td>{m.isActive ? <span className="pill pill-success">Active</span> : <span className="pill pill-danger">Inactive</span>}</td>
                  <td>{new Date(m.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => setSelectedId(m.id)}>View</button></td>
                </tr>
              ))}
              {merchants.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No merchants yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateMerchantModal
          onClose={() => setShowCreate(false)}
          onCreated={(merchant, apiKey) => { setShowCreate(false); setNewKey({ merchant, apiKey }); load(); }}
        />
      )}
      {newKey && <ApiKeyRevealModal merchant={newKey.merchant} apiKey={newKey.apiKey} onClose={() => setNewKey(null)} />}
      {selectedId && <MerchantDetailModal merchantId={selectedId} onClose={() => setSelectedId(null)} onOpenInvoice={setInvoiceId} onChanged={load} />}
      {invoiceId && <InvoiceDetailModal invoiceId={invoiceId} onClose={() => setInvoiceId(null)} onChanged={load} />}
    </div>
  );
}

function CreateMerchantModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const { data } = await client.post('/admin/merchants', { name, contactEmail, contactPhone });
      onCreated(data.merchant, data.apiKey);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create this merchant.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16 }}>Add merchant</h3>
        <form onSubmit={submit} className="form-stack">
          <div className="field">
            <label>Name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Shopify Store" />
          </div>
          <div className="field">
            <label>Contact email</label>
            <input className="input" type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="ops@acme.com" />
          </div>
          <div className="field">
            <label>Contact phone (optional)</label>
            <input className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
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

function ApiKeyRevealModal({ merchant, apiKey, onClose }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>✓ {merchant.name} created</h3>
        <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 14 }}>
          This API key won't be shown again — copy it now and store it securely. You can always reissue a new one later.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--paper)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <code className="mono" style={{ flex: 1, wordBreak: 'break-all', fontSize: 12.5 }}>{apiKey}</code>
          <button type="button" className="btn btn-outline btn-sm" style={{ flex: 'none' }} onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
        </div>
        <button className="btn btn-primary block" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function MerchantDetailModal({ merchantId, onClose, onOpenInvoice, onChanged }) {
  const [merchant, setMerchant] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    client.get(`/admin/merchants/${merchantId}`).then(({ data }) => {
      setMerchant(data.merchant);
      setInvoices(data.invoices);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(load, [merchantId]);

  async function toggleActive() {
    const { data } = await client.patch(`/admin/merchants/${merchantId}`, { isActive: !merchant.isActive });
    setMerchant(data.merchant);
    onChanged();
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        {loading || !merchant ? <LoadingLogo size={40} /> : (
          <>
            <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17 }}>{merchant.name}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>{merchant.contactEmail}{merchant.contactPhone ? ` · ${merchant.contactPhone}` : ''}</p>
              </div>
              <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
            </div>

            <button type="button" className="btn btn-outline btn-sm" style={{ marginBottom: 16 }} onClick={toggleActive}>
              {merchant.isActive ? 'Deactivate' : 'Activate'} merchant
            </button>

            <h4 style={{ fontSize: 14, marginBottom: 10 }}>Invoices</h4>
            {invoices.length === 0 ? (
              <p className="lead" style={{ fontSize: 13.5 }}>No invoices yet — generated automatically once shipments are booked.</p>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Total</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>{new Date(inv.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</td>
                        <td>₹{Number(inv.totalAmount).toFixed(2)}</td>
                        <td>{statusPill(inv)}</td>
                        <td><button className="btn btn-outline btn-sm" onClick={() => onOpenInvoice(inv.id)}>View</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function InvoiceDetailModal({ invoiceId, onClose, onChanged }) {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    client.get(`/admin/merchants/invoices/${invoiceId}`).then(({ data }) => { setInvoice(data.invoice); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(load, [invoiceId]);

  function loadComments() {
    setCommentsLoading(true);
    client.get(`/admin/merchants/invoices/${invoiceId}/comments`).then(({ data }) => { setComments(data.comments); setCommentsLoading(false); }).catch(() => setCommentsLoading(false));
  }
  useEffect(loadComments, [invoiceId]);

  async function markPaid() {
    setMarking(true);
    try {
      const { data } = await client.patch(`/admin/merchants/invoices/${invoiceId}/status`, { status: 'PAID', paymentMethod: 'bank_transfer' });
      setInvoice(data.invoice);
      loadComments();
      onChanged();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update this invoice.');
    } finally {
      setMarking(false);
    }
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    setError('');
    try {
      const { data } = await client.post(`/admin/merchants/invoices/${invoiceId}/comments`, { body });
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
                <h3 style={{ fontSize: 17 }}>Invoice — {new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>{invoice.merchant?.name}</p>
              </div>
              <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
              {statusPill(invoice)}
              <span style={{ fontFamily: 'IBM Plex Mono', fontWeight: 700 }}>₹{Number(invoice.totalAmount).toFixed(2)}</span>
              {invoice.status === 'PAID' && invoice.paidAt && (
                <span style={{ fontSize: 12, color: 'var(--slate-light)' }}>Paid {new Date(invoice.paidAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} via {invoice.paymentMethod === 'bank_transfer' ? 'bank transfer' : 'payment link'}</span>
              )}
            </div>

            {invoice.status === 'UNPAID' && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                {invoice.paymentLinkUrl && (
                  <a className="btn btn-outline btn-sm" href={invoice.paymentLinkUrl} target="_blank" rel="noreferrer">🔗 Open payment link</a>
                )}
                <button type="button" className="btn btn-primary btn-sm" disabled={marking} onClick={markPaid}>
                  {marking ? 'Updating…' : 'Mark as paid — bank transfer'}
                </button>
              </div>
            )}

            <h4 style={{ fontSize: 13, marginBottom: 8 }}>Shipments in this invoice</h4>
            <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 18 }}>
              <table className="data-table">
                <thead><tr><th>Order #</th><th>Amount</th></tr></thead>
                <tbody>
                  {invoice.orders.map((o) => (
                    <tr key={o.id}><td className="mono">{o.orderNumber}</td><td>₹{Number(o.grandTotal).toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

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
                      <span>{new Date(c.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
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
