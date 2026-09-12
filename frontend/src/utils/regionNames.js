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

const REGION_OPTIONS_BY_COUNTRY = { CA: CA_PROVINCES, US: US_STATES };

// Expands a stored 2-letter code to its full name for the given country —
// a no-op for any value that isn't a recognized code (already a full name,
// or a country with no such map), so this is safe to call unconditionally.
export function normalizeRegionValue(countryCode, value) {
  const options = REGION_OPTIONS_BY_COUNTRY[countryCode];
  if (!options || !value) return value;
  return options[value.trim().toUpperCase()] || value;
}

// Per-country config for the receiver/sender address form's "State" field —
// hidden entirely for countries with no meaningful equivalent, a dropdown
// of full names for CA/US, a required free-text field for GB (no source
// data for county, so staff/customers type it), and a plain optional
// free-text field (the original behavior) for anything else.
export function getRegionFieldConfig(countryCode) {
  if (countryCode === 'DE' || countryCode === 'SG') return { hidden: true };
  if (countryCode === 'GB') return { label: 'County', required: true };
  if (REGION_OPTIONS_BY_COUNTRY[countryCode]) {
    return { label: countryCode === 'CA' ? 'Province/Territory' : 'State', options: REGION_OPTIONS_BY_COUNTRY[countryCode] };
  }
  return { label: 'State' };
}
