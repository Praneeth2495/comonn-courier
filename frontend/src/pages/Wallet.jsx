import { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import LoadingLogo from '../components/LoadingLogo';

const WALLET_TXN_LABEL = {
  REFERRAL_REWARD: 'Referral reward',
  ADMIN_CREDIT: 'Added by staff',
  ADMIN_DEBIT: 'Deducted by staff',
  ORDER_PAYMENT: 'Order payment',
};

// Its own page (not a tab on the Orders dashboard) — reached via the
// header's "Wallet" link (see Layout.jsx's dashboardLinks).
export default function Wallet() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    client.get('/wallet/transactions').then(({ data }) => setTransactions(data.transactions)).catch(() => setTransactions([]));
  }, []);

  const referralLink = user?.referralCode ? `${window.location.origin}/?ref=${user.referralCode}` : '';

  function copyLink() {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="wrap section">
      <div>
        <h1 className="h-lg" style={{ marginBottom: 4 }}>Wallet &amp; Referrals</h1>
        <p className="lead" style={{ marginBottom: 24 }}>Your balance, referral link, and wallet history.</p>
      </div>

      <div className="card" style={{ padding: 22, marginBottom: 20 }}>
        <span className="lbl" style={{ display: 'block', marginBottom: 6 }}>Wallet balance</span>
        <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: 'var(--navy)' }}>₹{Number(user?.walletBalance || 0).toFixed(2)}</div>
        <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 6 }}>You can choose to apply this toward any future order at checkout.</p>
      </div>

      <div className="card" style={{ padding: 22, marginBottom: 20 }}>
        <h4 style={{ marginBottom: 6 }}>Refer a friend, earn ₹300</h4>
        <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 14 }}>
          Share your link — once someone you refer completes their first paid order, ₹300 lands in your wallet.
        </p>
        {user?.referralCode && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="input" readOnly value={referralLink} style={{ flex: '1 1 260px', fontSize: 12.5 }} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-primary btn-sm" onClick={copyLink}>{copied ? 'Copied!' : 'Copy link'}</button>
          </div>
        )}
      </div>

      <h3 className="h-md" style={{ marginBottom: 12 }}>Wallet history</h3>
      {transactions === null ? (
        <LoadingLogo />
      ) : transactions.length === 0 ? (
        <div className="empty-state card"><p>No wallet activity yet.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Type</th><th>Note</th><th>Amount</th></tr></thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</td>
                  <td>{WALLET_TXN_LABEL[t.type] || t.type}</td>
                  <td style={{ color: 'var(--slate-light)', fontSize: 12.5 }}>{t.note || '—'}</td>
                  <td className="mono" style={{ color: Number(t.amount) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                    {Number(t.amount) >= 0 ? '+' : ''}₹{Number(t.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
