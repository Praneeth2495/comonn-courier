// Canada/US postcode-suggestion data (see Total Zones - Suggestion List)
// stores the province/state as a 2-letter code (e.g. "ON", "VA") — these
// maps expand that to the full name for display/storage, since customers
// and staff expect to see/print the full name, not the abbreviation.
export const CA_PROVINCES = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

export const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

// India's own postcode-suggestion data uses the same informal 2-letter
// vehicle-registration-style codes (e.g. "TG", "AP") — the sender address
// is always India, so this only ever needs normalizing for display, never
// a dropdown (unlike CA/US below, whose fuller REGION_OPTIONS_BY_COUNTRY
// map also drives the State/Province field being a <select> at all).
const IN_STATES = {
  AN: 'Andaman and Nicobar Islands', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam',
  BR: 'Bihar', CH: 'Chandigarh', CG: 'Chhattisgarh', DN: 'Dadra and Nagar Haveli and Daman and Diu',
  DL: 'Delhi', GA: 'Goa', GJ: 'Gujarat', HR: 'Haryana', HP: 'Himachal Pradesh',
  JK: 'Jammu and Kashmir', JH: 'Jharkhand', KA: 'Karnataka', KL: 'Kerala', LA: 'Ladakh',
  LD: 'Lakshadweep', MP: 'Madhya Pradesh', MH: 'Maharashtra', MN: 'Manipur', ML: 'Meghalaya',
  MZ: 'Mizoram', NL: 'Nagaland', OD: 'Odisha', PY: 'Puducherry', PB: 'Punjab', RJ: 'Rajasthan',
  SK: 'Sikkim', TN: 'Tamil Nadu', TG: 'Telangana', TR: 'Tripura', UP: 'Uttar Pradesh',
  UK: 'Uttarakhand', WB: 'West Bengal',
};

const REGION_OPTIONS_BY_COUNTRY = { CA: CA_PROVINCES, US: US_STATES };
// Superset used only for value normalization (display/storage) — includes
// India on top of the dropdown-driving countries above.
const REGION_ABBREVIATIONS_BY_COUNTRY = { ...REGION_OPTIONS_BY_COUNTRY, IN: IN_STATES };

// Expands a stored 2-letter code to its full name for the given country —
// a no-op for any value that isn't a recognized code (already a full name,
// or a country with no such map), so this is safe to call unconditionally.
export function normalizeRegionValue(countryCode, value) {
  const options = REGION_ABBREVIATIONS_BY_COUNTRY[countryCode];
  if (!options || !value) return value;
  return options[value.trim().toUpperCase()] || value;
}

// Per-country config for the receiver/sender address form's "State" field —
// hidden entirely for countries with no meaningful equivalent, a dropdown
// of full names for CA/US, a plain free-text field for GB labeled "County"
// (no source data to auto-fill it from, so staff/customers type it in),
// and the same plain free-text field (the original behavior) for anything
// else.
export function getRegionFieldConfig(countryCode) {
  if (countryCode === 'DE' || countryCode === 'SG') return { hidden: true };
  // alwaysEditable: postcode suggestions never carry a county for GB, so
  // there's nothing to have auto-filled this from — it must stay editable
  // even where the receiver's other fields (postcode/city) are locked to
  // whatever was quoted.
  if (countryCode === 'GB') return { label: 'County', alwaysEditable: true };
  if (REGION_OPTIONS_BY_COUNTRY[countryCode]) {
    return { label: countryCode === 'CA' ? 'Province/Territory' : 'State', options: REGION_OPTIONS_BY_COUNTRY[countryCode] };
  }
  return { label: 'State' };
}
