import { useEffect, useState } from 'react';
import client from '../api/client';
import LoadingLogo from './LoadingLogo';
import { OrderDetailModal } from './OrderDetailModal';
import { downloadBlob } from '../utils/downloadBlob';
import { formatDateTime } from '../utils/dateFormat';
import { parsePickupDateStr } from '../utils/pickupDate';
import { STATUS_PILL, statusLabel } from '../utils/orderStatus';

// Same status set the Pickup orders tab fetches with scope=pickup — a load
// sheet is built from exactly that pool (not already on another load
// sheet), same "what still needs moving" definition as Pickup orders.
const PICKUP_STATUSES = 'PENDING_PAYMENT,PICKUP_CONFIRMED,PAID,LABEL_GENERATED,PICKED_UP';

/**
 * Loadsheet tab — mirrors Manifest's own "Build manifest" / "Manifests"
 * split: Build loadsheet is where staff pick orders and create one,
 * Loadsheets is the stored history (edit/delete/comments/add-remove
 * orders). Creation used to live in the Pickup orders tab's checklist
 * (next to "Send to rider") — moved here so it has its own dedicated space
 * instead of competing with rider assignment for the same checkboxes.
 */
export default function LoadSheetPanel() {
  const [subTab, setSubTab] = useState('build');

  return (
    <div>
      <h1 className="h-lg" style={{ marginBottom: 16 }}>Load Sheet</h1>
      <div className="acct-tabs" style={{ marginBottom: 20 }}>
        {[['build', 'Build loadsheet'], ['loadsheets', 'Loadsheets']].map(([key, label]) => (
          <button key={key} className={`acct-tab ${subTab === key ? 'active' : ''}`} onClick={() => setSubTab(key)}>{label}</button>
        ))}
      </div>
      {subTab === 'build' && <BuildLoadSheet />}
      {subTab === 'loadsheets' && <LoadSheetHistory />}
    </div>
  );
}

// Today in local time, used to bucket Order.pickupDate ("e.g. 02 Nov", no
// year) into "active" (overdue + today — needs attention now) vs "future"
// (scheduled later, nothing to do yet). An order with no parseable date at
// all defaults into "active" too, same reasoning the old 3-chip Pickup
// orders filter used — better surfaced than silently lost.
function dueBucketOf(pickupDate, now, todayEnd) {
  const parsed = parsePickupDateStr(pickupDate, now);
  if (!parsed) return 'active';
  return parsed < todayEnd ? 'active' : 'future';
}

function BuildLoadSheet() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bucket, setBucket] = useState('active');
  const [selectedIds, setSelectedIds] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [detailOrder, setDetailOrder] = useState(null);

  function load() {
    setLoading(true);
    client.get('/orders', { params: { scope: 'pickup', status: PICKUP_STATUSES, page: 1, pageSize: 2000 } })
      .then(({ data }) => { setOrders(data.orders); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(load, []);
  useEffect(() => {
    client.get('/admin/hubs').then(({ data }) => setHubs(data.hubs)).catch(() => {});
  }, []);

  async function openDetail(id) {
    const { data } = await client.get(`/orders/${id}`);
    setDetailOrder(data.order);
  }

  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  // Already-load-sheeted orders are excluded outright (same as Manifest's
  // eligible-orders, which excludes anything with manifestId already set)
  // rather than shown disabled — there's nothing left to do with them here.
  const eligible = orders
    .filter((o) => !o.loadSheetId)
    .map((o) => ({ ...o, __dueBucket: dueBucketOf(o.pickupDate, now, todayEnd) }));
  const activeCount = eligible.filter((o) => o.__dueBucket === 'active').length;
  const futureCount = eligible.filter((o) => o.__dueBucket === 'future').length;
  const visible = eligible.filter((o) => o.__dueBucket === bucket);

  function toggle(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    const ids = visible.map((o) => o.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => (allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
  }

  return (
    <div>
      <div className="chip-filter-row">
        <div className={`chip-filter loc ${bucket === 'active' ? 'active' : ''}`} onClick={() => setBucket('active')}>Active orders: {activeCount}</div>
        <div className={`chip-filter loc ${bucket === 'future' ? 'active' : ''}`} onClick={() => setBucket('future')}>Future orders: {futureCount}</div>
      </div>

      {selectedIds.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{selectedIds.length} selected</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>Create Load Sheet</button>
        </div>
      )}

      {loading ? <LoadingLogo /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={visible.length > 0 && visible.every((o) => selectedIds.includes(o.id))} onChange={toggleSelectAll} /></th>
                <th>Order #</th><th>From Address</th><th>To Address</th><th>Pickup Date</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.id}>
                  <td><input type="checkbox" checked={selectedIds.includes(o.id)} onChange={() => toggle(o.id)} /></td>
                  <td className="mono"><button className="t-oid" onClick={() => openDetail(o.id)}>{o.orderNumber}</button></td>
                  <td>{o.senderAddress?.city}, {o.senderAddress?.countryCode}</td>
                  <td>{o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</td>
                  <td>{o.pickupDate || '—'}</td>
                  <td><span className={`pill ${STATUS_PILL[o.status] || 'pill-navy'}`}>{statusLabel(o.status)}</span></td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => openDetail(o.id)}>View</button></td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No {bucket} orders right now.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateLoadSheetModal
          orderIds={selectedIds}
          hubs={hubs}
          onClose={() => setShowCreate(false)}
          onCreated={(loadSheet) => {
            setShowCreate(false);
            setSelectedIds([]);
            load();
            alert(`Load sheet ${loadSheet.loadSheetNumber} created with ${loadSheet.orderCount} order(s).`);
          }}
        />
      )}
      {detailOrder && <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
    </div>
  );
}

// Same create form as before, just relocated from the Pickup orders tab —
// From Hub, To Hub, and Transfer by are required; Reference/Name/Mobile
// stay optional.
function CreateLoadSheetModal({ orderIds, hubs, onClose, onCreated }) {
  const [fromHubId, setFromHubId] = useState('');
  const [toHubId, setToHubId] = useState('');
  const [transferBy, setTransferBy] = useState('');
  const [reference, setReference] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactMobile, setContactMobile] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!fromHubId || !toHubId || !transferBy.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await client.post('/admin/loadsheets', {
        orderIds,
        fromHubId,
        toHubId,
        transferBy: transferBy.trim(),
        reference: reference.trim() || undefined,
        contactName: contactName.trim() || undefined,
        contactMobile: contactMobile.trim() || undefined,
      });
      onCreated(data.loadSheet);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create this load sheet.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 17 }}>Create Load Sheet</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginBottom: 16 }}>{orderIds.length} order{orderIds.length === 1 ? '' : 's'} selected.</p>
        <form onSubmit={submit} className="form-stack">
          <div className="field">
            <label>From Hub <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <select className="select" required value={fromHubId} onChange={(e) => setFromHubId(e.target.value)}>
              <option value="">Choose from hub…</option>
              {hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>To Hub <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <select className="select" required value={toHubId} onChange={(e) => setToHubId(e.target.value)}>
              <option value="">Choose to hub…</option>
              {hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Transfer by <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
            <input className="input" required placeholder="Rider name, vehicle, or transport mode" value={transferBy} onChange={(e) => setTransferBy(e.target.value)} />
          </div>
          <div className="field">
            <label>Reference</label>
            <input className="input" placeholder="Optional" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="field">
            <label>Name</label>
            <input className="input" placeholder="Optional" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div className="field">
            <label>Mobile</label>
            <input className="input" placeholder="Optional" value={contactMobile} onChange={(e) => setContactMobile(e.target.value)} />
          </div>
          {error && <div className="error-text">{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!fromHubId || !toHubId || !transferBy.trim() || submitting}>
              {submitting ? 'Creating…' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Stored hub-to-hub load sheets. STAFF only ever see load sheets touching
 * their own assigned hub; the backend (staffHubScope in
 * loadSheet.controller.js) enforces that, this panel just renders whatever
 * it's given.
 */
function LoadSheetHistory() {
  const [loadSheets, setLoadSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingId, setViewingId] = useState(null);

  function load() {
    setLoading(true);
    client.get('/admin/loadsheets').then(({ data }) => { setLoadSheets(data.loadSheets); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(load, []);

  async function deleteLoadSheet(id) {
    if (!confirm('Delete this load sheet? Every order on it goes back to unassigned — their status is not changed.')) return;
    try {
      await client.delete(`/admin/loadsheets/${id}`);
      setLoadSheets((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete this load sheet.');
    }
  }

  if (loading) return <LoadingLogo />;

  return (
    <div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>LS #</th><th>From Hub</th><th>To Hub</th><th>Transfer by</th><th>Created</th><th>Orders</th><th>Qty</th><th>Weight</th><th>Created by</th><th></th></tr></thead>
          <tbody>
            {loadSheets.map((l) => (
              <tr key={l.id}>
                <td className="mono"><button className="t-oid" onClick={() => setViewingId(l.id)}>{l.loadSheetNumber}</button></td>
                <td>{l.fromHub?.name || '—'}</td>
                <td>{l.toHub?.name || '—'}</td>
                <td>{l.transferBy}</td>
                <td>{formatDateTime(l.createdAt)}</td>
                <td>{l._count?.orders ?? l.orderCount}</td>
                <td>{l.totalQty}</td>
                <td>{Number(l.totalWeightKg).toFixed(2)} kg</td>
                <td style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>{l.createdBy?.fullName || '—'}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setViewingId(l.id)}>Edit</button>
                  <button className="btn btn-outline btn-sm" onClick={() => downloadBlob(`/admin/loadsheets/${l.id}/download`, `${l.loadSheetNumber}.pdf`)}>Download</button>
                  <button className="btn btn-outline btn-sm" onClick={() => deleteLoadSheet(l.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {loadSheets.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '24px 0' }}>No load sheets yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {viewingId && <LoadSheetDetailModal loadSheetId={viewingId} onClose={() => setViewingId(null)} onChanged={load} />}
    </div>
  );
}

function LoadSheetDetailModal({ loadSheetId, onClose, onChanged }) {
  const [loadSheet, setLoadSheet] = useState(null);
  const [hubs, setHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingDetails, setEditingDetails] = useState(false);
  const [showAddOrders, setShowAddOrders] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [error, setError] = useState('');
  const [detailOrder, setDetailOrder] = useState(null);

  const [comments, setComments] = useState([]);
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([
      client.get(`/admin/loadsheets/${loadSheetId}`),
      client.get(`/admin/loadsheets/${loadSheetId}/comments`),
      client.get('/admin/hubs'),
    ]).then(([lsRes, commentsRes, hubsRes]) => {
      setLoadSheet(lsRes.data.loadSheet);
      setComments(commentsRes.data.comments);
      setHubs(hubsRes.data.hubs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(load, [loadSheetId]);

  async function openDetail(id) {
    const { data } = await client.get(`/orders/${id}`);
    setDetailOrder(data.order);
  }

  async function removeOrder(orderId) {
    setRemovingId(orderId);
    setError('');
    try {
      const { data } = await client.delete(`/admin/loadsheets/${loadSheetId}/orders/${orderId}`);
      setLoadSheet(data.loadSheet);
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove this order.');
    } finally {
      setRemovingId(null);
    }
  }

  function onOrdersAdded(updated) {
    setLoadSheet(updated);
    setShowAddOrders(false);
    onChanged();
  }

  function onDetailsSaved(updated) {
    setLoadSheet(updated);
    setEditingDetails(false);
    onChanged();
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setPostingComment(true);
    try {
      const { data } = await client.post(`/admin/loadsheets/${loadSheetId}/comments`, { body: commentBody });
      setComments((prev) => [...prev, data.comment]);
      setCommentBody('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add comment.');
    } finally {
      setPostingComment(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 17 }}>{loadSheet ? loadSheet.loadSheetNumber : 'Load sheet'}</h3>
            {loadSheet && <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 4 }}>{loadSheet.fromHub?.name} → {loadSheet.toHub?.name}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>

        {loading || !loadSheet ? <LoadingLogo size={40} /> : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>
                {loadSheet.orders.length} orders · {loadSheet.totalQty} qty · {Number(loadSheet.totalWeightKg).toFixed(2)} kg
                {' · '}Transfer by {loadSheet.transferBy}
                {loadSheet.reference && <> · Ref: {loadSheet.reference}</>}
                {(loadSheet.contactName || loadSheet.contactMobile) && <> · {[loadSheet.contactName, loadSheet.contactMobile].filter(Boolean).join(' ')}</>}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setEditingDetails((v) => !v)}>{editingDetails ? 'Cancel edit' : 'Edit'}</button>
                <button className="btn btn-outline btn-sm" onClick={() => downloadBlob(`/admin/loadsheets/${loadSheet.id}/download`, `${loadSheet.loadSheetNumber}.pdf`)}>Download sheet</button>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddOrders(true)}>+ Add orders</button>
              </div>
            </div>
            {editingDetails && (
              <EditLoadSheetDetailsForm loadSheet={loadSheet} hubs={hubs} onSaved={onDetailsSaved} onCancel={() => setEditingDetails(false)} />
            )}
            {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
            <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Order #</th><th>Receiver</th><th>Destination</th><th>Qty</th><th>Weight</th><th></th></tr></thead>
                  <tbody>
                    {loadSheet.orders.map((o) => (
                      <tr key={o.id}>
                        <td className="mono"><button className="t-oid" onClick={() => openDetail(o.id)}>{o.orderNumber}</button></td>
                        <td>{o.receiverAddress?.contactName || '—'}</td>
                        <td>{o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</td>
                        <td>{o.qty}</td>
                        <td>{Number(o.chargeableWeightKg).toFixed(2)} kg</td>
                        <td>
                          <button className="btn btn-outline btn-sm" disabled={removingId === o.id} onClick={() => removeOrder(o.id)}>
                            {removingId === o.id ? '…' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {loadSheet.orders.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate-light)', padding: '20px 0' }}>No orders left on this load sheet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <h4 style={{ fontSize: 14, marginBottom: 8 }}>Comments</h4>
            {comments.length === 0 ? (
              <p className="lead" style={{ fontSize: 13 }}>No comments yet.</p>
            ) : (
              <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 12 }}>
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
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" disabled={!commentBody.trim() || postingComment} style={{ flex: 'none' }}>
                {postingComment ? '…' : 'Add comment'}
              </button>
            </form>
          </>
        )}
      </div>

      {showAddOrders && loadSheet && (
        <AddOrdersToLoadSheetModal loadSheet={loadSheet} onClose={() => setShowAddOrders(false)} onAdded={onOrdersAdded} />
      )}
      {detailOrder && <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
    </div>
  );
}

function EditLoadSheetDetailsForm({ loadSheet, hubs, onSaved, onCancel }) {
  const [fromHubId, setFromHubId] = useState(loadSheet.fromHubId);
  const [toHubId, setToHubId] = useState(loadSheet.toHubId);
  const [transferBy, setTransferBy] = useState(loadSheet.transferBy);
  const [reference, setReference] = useState(loadSheet.reference || '');
  const [contactName, setContactName] = useState(loadSheet.contactName || '');
  const [contactMobile, setContactMobile] = useState(loadSheet.contactMobile || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!fromHubId || !toHubId || !transferBy.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await client.patch(`/admin/loadsheets/${loadSheet.id}`, {
        fromHubId,
        toHubId,
        transferBy: transferBy.trim(),
        reference: reference.trim(),
        contactName: contactName.trim(),
        contactMobile: contactMobile.trim(),
      });
      onSaved(data.loadSheet);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save these details.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 14, marginBottom: 14, background: 'var(--paper)', display: 'grid', gap: 10 }}>
      <div className="grid-2">
        <div className="field">
          <label>From Hub <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
          <select className="select" required value={fromHubId} onChange={(e) => setFromHubId(e.target.value)}>
            {hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>To Hub <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
          <select className="select" required value={toHubId} onChange={(e) => setToHubId(e.target.value)}>
            {hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Transfer by <span style={{ color: 'var(--danger)', fontSize: 12 }}>*</span></label>
        <input className="input" required value={transferBy} onChange={(e) => setTransferBy(e.target.value)} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Reference</label>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="field">
          <label>Name</label>
          <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Mobile</label>
        <input className="input" value={contactMobile} onChange={(e) => setContactMobile(e.target.value)} />
      </div>
      {error && <div className="error-text">{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={submitting}>{submitting ? 'Saving…' : 'Save details'}</button>
      </div>
    </form>
  );
}

function AddOrdersToLoadSheetModal({ loadSheet, onClose, onAdded }) {
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function search() {
    setLoading(true);
    client.get('/admin/loadsheets/eligible-orders', { params: { q: q || undefined } })
      .then(({ data }) => { setOrders(data.orders); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(search, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await client.post(`/admin/loadsheets/${loadSheet.id}/orders`, { orderIds: selectedIds });
      onAdded(data.loadSheet);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add these orders.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 17 }}>Add orders to {loadSheet.loadSheetNumber}</h3>
          <button onClick={onClose} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
        </div>
        <form className="search-box" style={{ marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); search(); }}>
          🔍<input placeholder="Search order #, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        {loading ? <LoadingLogo size={40} /> : (
          <div style={{ maxHeight: 340, overflowY: 'auto', marginBottom: 14 }}>
            {orders.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--slate-light)' }}>No unassigned orders match this search.</p>}
            {orders.map((o) => (
              <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--line-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedIds.includes(o.id)} onChange={() => toggle(o.id)} />
                <span className="mono">{o.orderNumber}</span>
                <span style={{ color: 'var(--slate-light)' }}>{o.senderAddress?.city} → {o.receiverAddress?.city}, {o.receiverAddress?.countryCode}</span>
              </label>
            ))}
          </div>
        )}
        {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
        <button className="btn btn-primary block" disabled={selectedIds.length === 0 || submitting} onClick={submit}>
          {submitting ? 'Adding…' : `Add ${selectedIds.length || ''} order${selectedIds.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
