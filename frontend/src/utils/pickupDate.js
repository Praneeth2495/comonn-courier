// Shared by the Pickup orders tab (AdminDashboard.jsx) and the Build
// Loadsheet tab (LoadSheetPanel.jsx) — both need to turn Order.pickupDate
// ("e.g. 02 Nov", no year) into a real Date relative to "today" to bucket
// orders as overdue/today/future. Extracted here rather than imported
// cross-file since the two live in separate lazy-loaded chunks.
export function parsePickupDateStr(str, referenceDate) {
  if (!str) return null;
  const year = referenceDate.getFullYear();
  let parsed = new Date(`${str} ${year}`);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffDays = (referenceDate - parsed) / 86400000;
  if (diffDays > 270) parsed = new Date(`${str} ${year + 1}`);
  return parsed;
}
