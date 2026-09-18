import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';

const WALLET_TXN_LABEL = {
  REFERRAL_REWARD: 'Referral reward',
  ADMIN_CREDIT: 'Added by staff',
  ADMIN_DEBIT: 'Deducted by staff',
  ORDER_PAYMENT: 'Order payment',
};

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/**
 * Deliberately separate from the ADMIN-only Users tab (role/permission
 * management) — this only ever shows CUSTOMER accounts, their orders, and
 * wallet, gated by its own 'customers' page key so it's safe to grant to
 * STAFF individually without widening what they can do to other staff/
 * admin accounts.
 */
export default function CustomersPanel() {
  const [customers, setCustomers] = useState(null);
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  function load() {
    setCustomers(null);
    client.get('/admin/customers', { params: { q: q || undefined } }).then(({ data }) => setCustomers(data.customers)).catch(() => setCustomers([]));
  }
  useEffect(load, []);

  function search(e) {
    e.preventDefault();
    load();
  }

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Customers</h1>

      <form className="search-box" style={{ marginBottom: 16, maxWidth: 360 }} onSubmit={search}>
        🔍<input placeholder="Search name, email, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      {customers === null ? (
        <LoadingLogo />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Orders</th><th>Wallet</th><th>Joined</th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>{c.fullName}</td>
                  <td><button className="t-oid" onClick={() => setSelectedId(c.id)}>{c.email}</button></td>
                  <td className="mono">{c.phone || '—'}</td>
                  <td>{c._count.orders}</td>
                  <td className="mono">₹{Number(c.walletBalance).toFixed(2)}</td>
                  <td>{fmtDate(c.createdAt)}</td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No customers match this search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <CustomerDetailModal
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
          onWalletChanged={load}
        />
      )}
    </div>
  );
}

function CustomerDetailModal({ customerId, onClose, onWalletChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setData(null);
    client.get(`/admin/customers/${customerId}`).then(({ data }) => setData(data)).catch(() => setError('Could not load this customer.'));
  }
  useEffect(load, [customerId]);

  async function adjustWallet(sign) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError('Enter a positive amount.');
      return;
    }
    if (!note.trim()) {
      setError('A note is required for this adjustment.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await client.post(`/admin/customers/${customerId}/wallet-adjust`, { amount: numeric * sign, note: note.trim() });
      setAmount('');
      setNote('');
      load();
      onWalletChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not adjust this wallet.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 680, maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h3>{data ? data.customer.fullName : 'Customer'}</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>

        {!data ? <LoadingLogo size={40} /> : (
          <>
            <div className="detail-grid" style={{ marginBottom: 20 }}>
              <div className="detail-row"><span className="k">Email</span><span className="v">{data.customer.email}</span></div>
              <div className="detail-row"><span className="k">Phone</span><span className="v">{data.customer.phone || '—'}</span></div>
              <div className="detail-row"><span className="k">Joined</span><span className="v">{fmtDate(data.customer.createdAt)}</span></div>
              <div className="detail-row"><span className="k">Referred by</span><span className="v">{data.customer.referredBy?.fullName || '—'}</span></div>
              <div className="detail-row"><span className="k">Referral code</span><span className="v mono">{data.customer.referralCode || '—'}</span></div>
              <div className="detail-row"><span className="k">People referred</span><span className="v">{data.customer.referralCount}</span></div>
            </div>

            <div className="card" style={{ padding: 18, marginBottom: 20, background: 'var(--paper)' }}>
              <span className="lbl" style={{ display: 'block', marginBottom: 6 }}>Wallet balance</span>
              <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--navy)', marginBottom: 14 }}>₹{Number(data.customer.walletBalance).toFixed(2)}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="field" style={{ maxWidth: 140, marginBottom: 0 }}>
                  <label>Amount (₹)</label>
                  <input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
                  <label>Note (required)</label>
                  <input className="input" placeholder="Reason for this adjustment" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <button type="button" className="btn btn-primary btn-sm" disabled={submitting} onClick={() => adjustWallet(1)}>+ Add</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={submitting} onClick={() => adjustWallet(-1)}>− Deduct</button>
              </div>
              {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
            </div>

            <h4 style={{ marginBottom: 10 }}>Orders</h4>
            <div className="table-wrap" style={{ marginBottom: 20 }}>
              <table className="data-table">
                <thead><tr><th>Order #</th><th>Destination</th><th>Status</th><th>Total</th><th>Wallet used</th><th>Date</th></tr></thead>
                <tbody>
                  {data.orders.map((o) => (
                    <tr key={o.id}>
                      <td className="mono">{o.orderNumber}</td>
                      <td>{o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</td>
                      <td><span className="pill pill-navy">{o.status.replace(/_/g, ' ')}</span></td>
                      <td>₹{Number(o.grandTotal).toFixed(2)}</td>
                      <td>{Number(o.walletAmountUsed) > 0 ? `₹${Number(o.walletAmountUsed).toFixed(2)}` : '—'}</td>
                      <td>{fmtDate(o.createdAt)}</td>
                    </tr>
                  ))}
                  {data.orders.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '18px 0' }}>No orders yet.</td></tr>}
                </tbody>
              </table>
            </div>

            <h4 style={{ marginBottom: 10 }}>Wallet history</h4>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Type</th><th>Note</th><th>By</th><th>Amount</th></tr></thead>
                <tbody>
                  {data.walletTransactions.map((t) => (
                    <tr key={t.id}>
                      <td>{fmtDate(t.createdAt)}</td>
                      <td>{WALLET_TXN_LABEL[t.type] || t.type}</td>
                      <td style={{ color: 'var(--slate-light)', fontSize: 12.5 }}>{t.note || '—'}</td>
                      <td style={{ fontSize: 12.5 }}>{t.createdBy?.fullName || 'System'}</td>
                      <td className="mono" style={{ color: Number(t.amount) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                        {Number(t.amount) >= 0 ? '+' : ''}₹{Number(t.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {data.walletTransactions.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '18px 0' }}>No wallet activity yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
