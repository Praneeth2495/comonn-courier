import { useState } from 'react';
import { getCountryName } from '../utils/countryNames';

/**
 * The "N other bookings saved this session" list + its delete-confirm
 * modal — shared by Details.jsx (where it originated) and Quote.jsx, so a
 * customer mid-"Add New Order" sees the same saved bookings, with the same
 * Edit/Delete actions, whichever of those two pages they're currently on.
 */
export default function SavedBookingsList({ savedBookings, onEdit, removeSavedBooking, loading }) {
  const [deleteTarget, setDeleteTarget] = useState(null);

  if (!savedBookings?.length) return null;

  function confirmDelete() {
    if (deleteTarget) removeSavedBooking(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <>
      <div className="card" style={{ padding: '14px 18px 6px', marginBottom: 16 }}>
        <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--slate-light)', fontWeight: 700, marginBottom: 10 }}>
          {savedBookings.length} other booking{savedBookings.length > 1 ? 's' : ''} saved this session
        </p>
        {savedBookings.map((b) => (
          <div
            key={b.id}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--line-2)', flexWrap: 'wrap' }}
          >
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', fontFamily: "'IBM Plex Mono', monospace" }}>{b.orderNumber}</div>
              <div style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.senderAddress?.city} → {b.receiverAddress?.city}, {getCountryName(b.receiverAddress?.countryCode)}
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', flex: 'none' }}>
              {b.pricingPending ? 'Priced at pickup' : `₹${Number(b.grandTotal).toFixed(2)}`}
            </div>
            <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
              <button type="button" className="btn btn-outline btn-sm" disabled={loading} onClick={() => onEdit(b)}>Edit</button>
              <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-bg)' }} disabled={loading} onClick={() => setDeleteTarget(b)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <div className="modal-overlay open" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <h3>Delete {deleteTarget.orderNumber}?</h3>
              <button onClick={() => setDeleteTarget(null)} style={{ background: 'var(--paper)', border: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 15, color: 'var(--slate)', cursor: 'pointer', flex: 'none' }}>✕</button>
            </div>
            <p className="lead" style={{ fontSize: 13.5, marginBottom: 22 }}>
              This removes it from this session's bookings and it won't be included in payment. This can't be undone.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" style={{ flex: 1, background: 'var(--danger)' }} onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
