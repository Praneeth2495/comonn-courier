// "02 Oct 2026" in IST — the exact `{ day: '2-digit', month: 'short', year:
// 'numeric', timeZone: 'Asia/Kolkata' }` options object was repeated inline
// (or as a locally-defined fmtDate) in well over a dozen admin-panel tables.
export function formatDateShort(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

// "02 Oct 2026, 03:45 pm" in IST — same options plus hour/minute, repeated
// identically across every admin-panel comment thread and the manual-label
// history table.
export function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}
