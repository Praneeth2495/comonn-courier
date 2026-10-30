// Countries that can be freely combined into ONE manifest regardless of
// destination country — every other country still requires all selected
// orders to share exactly one destination country (see
// manifest.controller.js). Matches the "Europe" grouping used elsewhere
// (WorldOpsMap's continent dropdown).
const EUROPE_COUNTRY_CODES = ['GB', 'DE', 'IE', 'NL', 'SE', 'FR', 'PT', 'ES', 'IT'];

// India's postcode-suggestion data (PostcodeSuggestion.state, and anything
// derived from it — StaffRegionAssignment.state, the Pickup-origins filter)
// stores state as a 2-letter code (e.g. "TG"). A booked order's actual
// sender address (Address.state) stores the FULL expanded name instead
// (e.g. "Telangana") — every address-entry path runs it through the
// frontend's normalizeRegionValue/IN_STATES (utils/regionNames.js) before
// saving. Mirrored here so backend code comparing against Address.state can
// expand a code to the same full name first — see expandInState below.
const IN_STATE_NAMES = {
  AN: 'Andaman and Nicobar Islands', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam',
  BR: 'Bihar', CH: 'Chandigarh', CG: 'Chhattisgarh', DN: 'Dadra and Nagar Haveli and Daman and Diu',
  DL: 'Delhi', GA: 'Goa', GJ: 'Gujarat', HR: 'Haryana', HP: 'Himachal Pradesh',
  JK: 'Jammu and Kashmir', JH: 'Jharkhand', KA: 'Karnataka', KL: 'Kerala', LA: 'Ladakh',
  LD: 'Lakshadweep', MP: 'Madhya Pradesh', MH: 'Maharashtra', MN: 'Manipur', ML: 'Meghalaya',
  MZ: 'Mizoram', NL: 'Nagaland', OD: 'Odisha', PY: 'Puducherry', PB: 'Punjab', RJ: 'Rajasthan',
  SK: 'Sikkim', TN: 'Tamil Nadu', TG: 'Telangana', TR: 'Tripura', UP: 'Uttar Pradesh',
  UK: 'Uttarakhand', WB: 'West Bengal',
};
// Passes an already-expanded full name (or anything unrecognized) through
// unchanged — safe to call on either an old raw-code value or a new
// already-correct one, no data migration required.
function expandInState(value) {
  return IN_STATE_NAMES[value] || value;
}

module.exports = { EUROPE_COUNTRY_CODES, IN_STATE_NAMES, expandInState };
