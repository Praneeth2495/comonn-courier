import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';

const STATUS_PILL = {
  DRAFT: 'pill-warn',
  UNFINISHED: 'pill-warn',
  PENDING_PAYMENT: 'pill-warn',
  PICKUP_CONFIRMED: 'pill-cobalt',
  PAID: 'pill-cobalt',
  LABEL_GENERATED: 'pill-cobalt',
  PICKED_UP: 'pill-cobalt',
  IN_TRANSIT: 'pill-cobalt',
  OUT_FOR_DELIVERY: 'pill-cobalt',
  DELIVERED: 'pill-success',
  CANCELLED: 'pill-danger',
  EXCEPTION: 'pill-danger',
};

const LABEL_ELIGIBLE_STATUSES = ['PAID', 'LABEL_GENERATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];

function paidAndDue(o) {
  const grandTotal = Number(o.grandTotal);
  const amountPaid = o.payment?.status === 'SUCCEEDED' ? Number(o.payment.amount) : 0;
  const due = Math.round((grandTotal - amountPaid) * 100) / 100;
  return { amountPaid, due };
}

/**
 * Shared order-detail view — used by the admin/staff Overview, Orders and
 * Accounts tabs, and by the customer dashboard's "View details" (same
 * information, same layout, so a customer sees exactly what staff sees
 * when helping them). `canManageLabels` hides the "Generate label &
 * invoice" action for customers (their labels generate automatically —
 * see ensureLabelsForPaidOrders in UserDashboard.jsx). `canViewComments`
 * hides the internal admin/staff notes thread entirely from customers.
 */
export function OrderDetailModal({ order, onClose, canManageLabels = true, canViewComments = true }) {
  const itemsSummary = order.items?.map((it) => `${it.itemType} · ${it.actualWeightKg} kg · Qty ${String(it.quantity).padStart(2, '0')}`).join(', ');
  const [labels, setLabels] = useState(order.labels || []);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [showComments, setShowComments] = useState(false);

  async function generateLabel() {
    setGenerating(true);
    setGenerateError('');
    try {
      const { data } = await client.post(`/labels/${order.id}/generate`);
      setLabels(data.labels || []);
    } catch (err) {
      setGenerateError(err.response?.data?.error || 'Could not generate the label — please try again.');
    } finally {
      setGenerating(false);
    }
  }

  const canGenerate = canManageLabels && labels.length === 0 && !order.pricingPending && LABEL_ELIGIBLE_STATUSES.includes(order.status);
  const { amountPaid, due } = paidAndDue(order);
  const hasDocuments = labels.length > 0 || canGenerate;

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <h3 style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              Order <span className="mono">{order.orderNumber}</span>
              <span className={`status-badge ${STATUS_PILL[order.status] || 'pill-navy'}`}>{order.status.replace(/_/g, ' ')}</span>
            </h3>
            <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>Everything the customer entered at booking</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>

        <div className="oda-summary">
          <div className="item total">
            <span className="lbl">Total</span>
            <span className="val">₹{Number(order.grandTotal).toFixed(2)}</span>
          </div>
          <div className="item">
            <span className="lbl">{due > 0 ? 'To pay' : due < 0 ? 'Credit' : 'Paid'}</span>
            <span className="val" style={{ color: due > 0 ? 'var(--danger)' : due < 0 ? 'var(--slate)' : 'var(--success)' }}>
              {due > 0 ? `₹${due.toFixed(2)}` : due < 0 ? `₹${Math.abs(due).toFixed(2)}` : `₹${amountPaid.toFixed(2)}`}
            </span>
          </div>
          <div className="item">
            <span className="lbl">Service</span>
            <span className="val">{order.service?.name || '—'}</span>
          </div>
          <div className="item">
            <span className="lbl">Booked</span>
            <span className="val">{new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>
          </div>
        </div>

        <div className="detail-section">
          <div className="oda-section-head"><span className="icon">📍</span><h4>Route</h4></div>
          <div className="oda-route">
            <div className="oda-route-block"><div className="lbl">Origin</div><p>{order.senderAddress?.city}, {order.senderAddress?.countryCode}</p></div>
            <div className="oda-route-arrow">→</div>
            <div className="oda-route-block"><div className="lbl">Destination</div><p>{order.receiverAddress?.city}, {order.receiverAddress?.countryCode}</p></div>
          </div>
        </div>

        <div className="detail-section">
          <div className="oda-section-head"><span className="icon">📦</span><h4>Shipment</h4></div>
          <div className="detail-grid">
            <div className="detail-row" style={{ gridColumn: '1/-1' }}><span className="k">Items</span><span className="v">{itemsSummary || '—'}</span></div>
            <div className="detail-row"><span className="k">Service</span><span className="v">{order.service?.name}</span></div>
            <div className="detail-row oda-highlight"><span className="k">Total</span><span className="v">₹{Number(order.grandTotal).toFixed(2)} {order.currency}</span></div>
            <div className="detail-row" style={{ gridColumn: '1/-1' }}><span className="k">Goods description</span><span className="v">{order.contentsDescription || '—'}</span></div>
            <div className="detail-row"><span className="k">Value of goods</span><span className="v">₹{Number(order.declaredValue).toFixed(2)}</span></div>
            <div className="detail-row"><span className="k">Pickup date</span><span className="v">{order.pickupDate || '—'}</span></div>
          </div>
        </div>

        {order.addons?.length > 0 && (
          <div className="detail-section">
            <div className="oda-section-head"><span className="icon">🎁</span><h4>Add-on services</h4></div>
            <div className="detail-grid">
              {order.addons.map((a) => (
                <div className="detail-row" key={a.id}>
                  <span className="k">{a.label}{a.quantity > 1 ? ` × ${a.quantity}` : ''}</span>
                  <span className="v">₹{Number(a.amount).toFixed(2)}</span>
                </div>
              ))}
              <div className="detail-row oda-highlight"><span className="k">Add-ons total</span><span className="v">₹{Number(order.addonsTotal).toFixed(2)}</span></div>
            </div>
          </div>
        )}

        <div className="detail-section">
          <div className="oda-section-head"><span className="icon">📥</span><h4>Receiver details</h4></div>
          <div className="detail-grid">
            <div className="detail-row"><span className="k">Name</span><span className="v">{order.receiverAddress?.contactName}</span></div>
            <div className="detail-row"><span className="k">Phone</span><span className="v">{order.receiverAddress?.phone}</span></div>
            <div className="detail-row"><span className="k">Email</span><span className="v">{order.receiverAddress?.email || '—'}</span></div>
            <div className="detail-row"><span className="k">Delivery instructions</span><span className="v">{order.receiverAddress?.instructions || '—'}</span></div>
            <div className="detail-row" style={{ gridColumn: '1/-1' }}>
              <span className="k">Address</span>
              <span className="v">{order.receiverAddress?.line1}{order.receiverAddress?.line2 ? `, ${order.receiverAddress.line2}` : ''}, {order.receiverAddress?.city}{order.receiverAddress?.state ? `, ${order.receiverAddress.state}` : ''} {order.receiverAddress?.postcode}, {order.receiverAddress?.countryCode}</span>
            </div>
          </div>
        </div>

        <div className="detail-section" style={{ marginBottom: (hasDocuments || canViewComments) ? 20 : 0 }}>
          <div className="oda-section-head"><span className="icon">📤</span><h4>Sender details</h4></div>
          <div className="detail-grid">
            <div className="detail-row"><span className="k">Name</span><span className="v">{order.senderAddress?.contactName}</span></div>
            <div className="detail-row"><span className="k">Phone</span><span className="v">{order.senderAddress?.phone}</span></div>
            <div className="detail-row"><span className="k">Email</span><span className="v">{order.senderAddress?.email || '—'}</span></div>
            <div className="detail-row" style={{ gridColumn: '1/-1' }}>
              <span className="k">Address</span>
              <span className="v">{order.senderAddress?.line1}{order.senderAddress?.line2 ? `, ${order.senderAddress.line2}` : ''}, {order.senderAddress?.city}{order.senderAddress?.state ? `, ${order.senderAddress.state}` : ''} {order.senderAddress?.postcode}, {order.senderAddress?.countryCode}</span>
            </div>
          </div>
        </div>

        {hasDocuments && (
          <div className="detail-section" style={{ marginBottom: canViewComments ? 20 : 0 }}>
            <div className="oda-section-head"><span className="icon">🏷️</span><h4>Documents</h4></div>
            {labels.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {labels.map((l) => (
                  <a key={l.id} className="btn btn-outline btn-sm" href={`${import.meta.env.VITE_API_BASE_URL || '/api'}/labels/download/${l.id}?inline=1`} target="_blank" rel="noreferrer">
                    View label{labels.length > 1 ? ` (${l.packageIndex})` : ''}
                  </a>
                ))}
                <a className="btn btn-outline btn-sm" href={`${import.meta.env.VITE_API_BASE_URL || '/api'}/labels/invoice/download/${order.id}?inline=1`} target="_blank" rel="noreferrer">
                  View invoice
                </a>
              </div>
            )}
            {canGenerate && (
              <div style={{ marginTop: labels.length > 0 ? 10 : 0 }}>
                <button className="btn btn-outline btn-sm" disabled={generating} onClick={generateLabel}>
                  {generating ? 'Generating…' : 'Generate label & invoice'}
                </button>
                {generateError && <div className="error-text" style={{ marginTop: 8 }}>{generateError}</div>}
              </div>
            )}
          </div>
        )}

        {canViewComments && (
          <div className="detail-section" style={{ marginBottom: 0 }}>
            <div className="oda-section-head"><span className="icon">💬</span><h4>Internal notes</h4></div>
            <button className="btn btn-outline btn-sm" onClick={() => setShowComments(true)}>View comments</button>
          </div>
        )}
      </div>

      {showComments && <OrderCommentsModal order={order} onClose={() => setShowComments(false)} />}
    </div>
  );
}

export function OrderCommentsModal({ order, onClose }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    client.get(`/orders/${order.id}/comments`).then(({ data }) => {
      setComments(data.comments);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(load, [order.id]);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    setError('');
    try {
      const { data } = await client.post(`/orders/${order.id}/comments`, { body });
      setComments((prev) => [...prev, data.comment]);
      setBody('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add comment.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.stopPropagation()} style={{ display: 'flex' }}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 17 }}>Comments — <span className="mono">{order.orderNumber}</span></h3>
            <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>Internal notes, visible only to admin &amp; staff</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>

        {loading ? (
          <LoadingLogo size={40} />
        ) : comments.length === 0 ? (
          <p className="lead" style={{ fontSize: 13.5 }}>No comments yet.</p>
        ) : (
          <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 16 }}>
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

        <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
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
      </div>
    </div>
  );
}
