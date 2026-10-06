// A customer picking this means "I don't know the exact weight, somewhere
// 1-5 kg" — priced at the ceiling (5 kg) so the quote never undercharges,
// but the order is flagged (OrderItem.weightUnconfirmed) for staff to
// correct to the real weight once the parcel is actually weighed at
// pickup (see AdminDashboard.jsx's red row highlight + Quote.jsx's
// discrete 1-5 dropdown shown only to staff/admin).
export const WEIGHT_RANGE_PRESET = '1-5 kg';
export const WEIGHT_RANGE_CEILING = 5;

// Customers never see the individual 1/2/3/4/5 kg options — only staff,
// correcting an order after the parcel's been weighed, need that precision.
export const CUSTOMER_WEIGHT_OPTIONS = [WEIGHT_RANGE_PRESET, ...Array.from({ length: 20 }, (_, i) => `${i + 6} kg`)];
export const STAFF_WEIGHT_OPTIONS = Array.from({ length: 25 }, (_, i) => `${i + 1} kg`);

// Extracts the kg figure a preset string implies for pricing/sizing math —
// the ceiling for the range preset, the plain number for a discrete one.
export function parsePresetWeightKg(weightPreset) {
  if (!weightPreset) return NaN;
  if (weightPreset === WEIGHT_RANGE_PRESET) return WEIGHT_RANGE_CEILING;
  return Number(weightPreset.replace(' kg', ''));
}

// Resolves a form preset into the {actualWeightKg, weightUnconfirmed} pair
// the quote/order APIs expect — null for presets that aren't a real weight
// yet (blank, or "Not sure, book pickup").
export function resolveWeightPreset(weightPreset) {
  if (!weightPreset || weightPreset === 'NOT_SURE' || weightPreset === 'Not sure') return null;
  if (weightPreset === WEIGHT_RANGE_PRESET) return { actualWeightKg: WEIGHT_RANGE_CEILING, weightUnconfirmed: true };
  return { actualWeightKg: Number(weightPreset.replace(' kg', '')), weightUnconfirmed: false };
}
