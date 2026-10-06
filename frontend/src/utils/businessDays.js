const WEEKEND_DAYS = [0, 6]; // Sunday, Saturday

function addBusinessDays(start, days) {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (!WEEKEND_DAYS.includes(d.getDay())) added += 1;
  }
  return d;
}

// The booking flow's own earliest pickup option (see Payment.jsx's
// nextPickupDates, which also starts at tomorrow) — used so the quote step
// can show a real estimated delivery date before a pickup date is chosen.
export function earliestPickupDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

const DATE_FMT = { weekday: 'short', day: 'numeric', month: 'short' };

// Transit days only count business (Mon–Fri) days, so a 3-5 day window
// starting on a Friday pickup lands later on the calendar than one starting
// on a Monday. pickupDate itself is not counted as a transit day.
export function estimatedDeliveryRange(transitDaysMin, transitDaysMax, pickupDate = earliestPickupDate()) {
  const from = addBusinessDays(pickupDate, transitDaysMin);
  const to = addBusinessDays(pickupDate, transitDaysMax);
  const fmt = (d) => d.toLocaleDateString('en-US', DATE_FMT);
  return transitDaysMin === transitDaysMax ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}
