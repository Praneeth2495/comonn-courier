import { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import ChangePassword from '../components/ChangePassword';

const STATUS_PILL = {
  DRAFT: 'pill-warn',
  PENDING_PAYMENT: 'pill-warn',
  PAID: 'pill-cobalt',
  LABEL_GENERATED: 'pill-cobalt',
  PICKED_UP: 'pill-cobalt',
  IN_TRANSIT: 'pill-cobalt',
  OUT_FOR_DELIVERY: 'pill-cobalt',
  DELIVERED: 'pill-success',
  CANCELLED: 'pill-danger',
  EXCEPTION: 'pill-danger',
};

export default function UserDashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showAccount, setShowAccount] = useState(false);

  useEffect(() => {
    client.get('/orders').then(({ data }) => setOrders(data.orders)).finally(() => setLoading(false));
  }, []);

  async function cancel(id) {
    if (!confirm('Cancel this order?')) return;
    const { data } = await client.post(`/orders/${id}/cancel`);
    setOrders((prev) => prev.map((o) => (o.id === id ? data.order : o)));
  }

  return (
    <div className="wrap section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="h-lg">Welcome back, {user?.fullName?.split(' ')[0]}</h1>
          <p className="lead" style={{ marginBottom: 24 }}>Here's everything you've shipped with Comonn.</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => setShowAccount((v) => !v)}>
          {showAccount ? 'Hide account settings' : 'Account settings'}
        </button>
      </div>

      {showAccount && <div style={{ marginBottom: 24 }}><ChangePassword /></div>}

      {loading && <p className="lead">Loading orders…</p>}
      {!loading && orders.length === 0 && (
        <div className="empty-state card">
          <p>No orders yet.</p>
        </div>
      )}

      {orders.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Service</th>
              <th>Destination</th>
              <th>Status</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="mono">{o.orderNumber}</td>
                <td>{o.service.name}</td>
                <td>{o.receiverAddress.city}, {o.receiverAddress.countryCode}</td>
                <td><span className={`pill ${STATUS_PILL[o.status] || 'pill-navy'}`}>{o.status.replace(/_/g, ' ')}</span></td>
                <td>₹{Number(o.grandTotal).toFixed(2)} {o.currency}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setSelected(o)}>View</button>
                  {['DRAFT', 'PENDING_PAYMENT', 'PAID'].includes(o.status) && (
                    <button className="btn btn-outline btn-sm" onClick={() => cancel(o.id)}>Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && <OrderDetailModal order={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function OrderDetailModal({ order, onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(14,27,61,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
      onClick={onClose}
    >
      <div className="card" style={{ padding: 28, width: 460, maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="h-md" style={{ marginBottom: 4 }}>{order.orderNumber}</h3>
        <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 16 }}>{order.trackingNumber || 'Tracking number pending payment'}</p>

        <Row label="Service" value={order.service.name} />
        <Row label="Chargeable weight" value={`${order.chargeableWeightKg} kg`} />
        <Row label="Zone" value={order.zoneCode} />
        <Row label="Base freight" value={`₹${Number(order.baseFreight).toFixed(2)}`} />
        <Row label="Surcharges" value={`₹${Number(order.surchargesTotal).toFixed(2)}`} />
        <Row label="Tax" value={`₹${Number(order.taxTotal).toFixed(2)}`} />
        <Row label="Grand total" value={`₹${Number(order.grandTotal).toFixed(2)} ${order.currency}`} bold />

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line-2)' }}>
          <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Sender</p>
          <p style={{ fontSize: 13, color: 'var(--slate)' }}>{order.senderAddress.contactName}, {order.senderAddress.city}, {order.senderAddress.countryCode}</p>
          <p style={{ fontWeight: 600, fontSize: 13, margin: '10px 0 4px' }}>Receiver</p>
          <p style={{ fontSize: 13, color: 'var(--slate)' }}>{order.receiverAddress.contactName}, {order.receiverAddress.city}, {order.receiverAddress.countryCode}</p>
        </div>

        <button className="btn btn-outline block" style={{ marginTop: 20 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '4px 0', fontWeight: bold ? 700 : 400, color: bold ? 'var(--navy)' : 'var(--ink)' }}>
      <span style={{ color: 'var(--slate)' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
