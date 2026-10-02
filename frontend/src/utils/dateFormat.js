// "02 Oct 2026" in IST — the exact `{ day: '2-digit', month: 'short', year:
// 'numeric', timeZone: 'Asia/Kolkata' }` options object was repeated inline
// (or as a locally-defined fmtDate) in well over a dozen admin-panel tables.
export function formatDateShort(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
