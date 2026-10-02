// Shared by DriverDashboard (a rider's own job list) and RidersPanel (the
// admin/staff read-only view into a rider's jobs) — both describe the exact
// same pickup-job lifecycle, so the labels/logic must stay identical
// between the two views.
export const STATUS_LABEL = {
  PICKUP_CONFIRMED: 'Pickup Confirmed',
  PAID: 'Paid',
  LABEL_GENERATED: 'Label Generated',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  CLEARED_DESTINATION_CUSTOMS: 'Cleared Destination Customs',
  OUT_FOR_DELIVERY: 'Out For Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

// Jobs still awaiting physical pickup — a job in any other status has
// already been picked up (or cancelled) and belongs in history, not the
// active list.
export const ACTIVE_STATUSES = ['PICKUP_CONFIRMED', 'PAID', 'LABEL_GENERATED'];

export function formatAddress(a) {
  if (!a) return '—';
  return `${a.line1}${a.line2 ? `, ${a.line2}` : ''}, ${a.city}${a.state ? `, ${a.state}` : ''} ${a.postcode}, ${a.countryCode}`;
}

// Couriers operate in IST — comparing dates in UTC (toISOString()) would
// misfile any pickup between midnight and 5:30am IST under the previous
// calendar day. en-CA locale formats as YYYY-MM-DD.
export function isoDate(d) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// The date a completed job is pinned to — pickedUpAt if the rider marked it
// via their app, else the earliest tracking event that took it past the
// active statuses (covers jobs whose status was advanced by staff instead,
// which never sets pickedUpAt). Deliberately NOT updatedAt alone: that gets
// touched by any later edit (e.g. staff pushing the status further along
// after pickup), which would wrongly move an already-completed job to
// whatever day that unrelated edit happened.
export function completionDate(job) {
  if (job.pickedUpAt) return job.pickedUpAt;
  const firstTerminalEvent = (job.trackingEvents || []).find((t) => !ACTIVE_STATUSES.includes(t.status));
  if (firstTerminalEvent) return firstTerminalEvent.occurredAt;
  return job.updatedAt;
}
