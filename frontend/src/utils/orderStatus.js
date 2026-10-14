// Badge color per order status — shared by every page that lists orders
// (customer dashboard, public tracking) so a status always reads the same
// color everywhere.
export const STATUS_PILL = {
  DRAFT: 'pill-warn',
  UNFINISHED: 'pill-warn',
  PENDING_PAYMENT: 'pill-warn',
  PICKUP_CONFIRMED: 'pill-cobalt',
  PAID: 'pill-cobalt',
  LABEL_GENERATED: 'pill-cobalt',
  PICKED_UP: 'pill-cobalt',
  ORIGIN_CUSTOMS_CLEARED: 'pill-cobalt',
  IN_TRANSIT: 'pill-cobalt',
  CLEARED_DESTINATION_CUSTOMS: 'pill-cobalt',
  OUT_FOR_DELIVERY: 'pill-cobalt',
  DELIVERED: 'pill-success',
  CANCELLED: 'pill-danger',
};

// Human-readable text for a status wherever the raw value's own casing
// wouldn't read right as-is (word order differs, or extra context like "by
// customer") — the raw stored value is never changed, only how it's shown;
// this keeps every existing order's data/filters/webhooks untouched. Keyed
// in ALL CAPS to match the admin dropdown/pill's own all-caps convention
// (driverJobs.js and Track.jsx keep their own separate, differently-cased
// label maps for their own Title Case / Sentence case displays).
export const STATUS_LABEL = {
  CLEARED_DESTINATION_CUSTOMS: 'DESTINATION CUSTOMS CLEARED',
  CANCELLED: 'CANCELLED BY CUSTOMER',
};

export function statusLabel(status) {
  return STATUS_LABEL[status] || status.replace(/_/g, ' ');
}
