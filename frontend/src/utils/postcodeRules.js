// Expected postcode format per country — covers the same countries as
// countryNames.js. India/Australia/New Zealand/US/Germany/Malaysia/
// Singapore/South Africa postcodes are pure digits, so those are capped and
// stripped of non-digit input as the customer types. Canada and the UK mix
// letters and numbers (e.g. "K1A 0B1", "SW1A 1AA"), so those are just
// length-capped, not digit-restricted.
export const POSTCODE_RULES = {
  IN: { maxLength: 6, digitsOnly: true, hint: 'India postcodes are 6 digits' },
  AU: { maxLength: 4, digitsOnly: true, hint: 'Australia postcodes are 4 digits' },
  NZ: { maxLength: 4, digitsOnly: true, hint: 'New Zealand postcodes are 4 digits' },
  US: { maxLength: 5, digitsOnly: true, hint: 'US ZIP codes are 5 digits' },
  CA: { maxLength: 7, digitsOnly: false, hint: 'Canada postal codes look like K1A 0B1' },
  GB: { maxLength: 8, digitsOnly: false, hint: 'UK postcodes look like SW1A 1AA' },
  DE: { maxLength: 5, digitsOnly: true, hint: 'Germany postcodes are 5 digits' },
  MY: { maxLength: 5, digitsOnly: true, hint: 'Malaysia postcodes are 5 digits' },
  SG: { maxLength: 6, digitsOnly: true, hint: 'Singapore postcodes are 6 digits' },
  ZA: { maxLength: 4, digitsOnly: true, hint: 'South Africa postcodes are 4 digits' },
  // Ireland's suggestion data is keyed by the 3-character Eircode routing
  // key (e.g. "D02", "D6W", "T12") rather than a full 7-character Eircode —
  // letters are part of the code itself, so this can't be digits-only.
  IE: { maxLength: 3, digitsOnly: false, hint: 'Ireland postcodes use a 3-character routing key, e.g. D02' },
  NL: { maxLength: 4, digitsOnly: true, hint: 'Netherlands postcodes are 4 digits' },
  SE: { maxLength: 5, digitsOnly: true, hint: 'Sweden postcodes are 5 digits' },
  // UAE has no real postal code system — this field is repurposed as an
  // Emirate picker instead (see the 7 PostcodeSuggestion rows seeded for
  // AE), so it must accept letters, not just digits.
  AE: { maxLength: 20, digitsOnly: false, hint: 'Select your destination Emirate' },
  // Saudi Arabia/Kuwait do have real per-district postal codes, but no
  // reliable public dataset exists for either (unofficial sources gave
  // conflicting numeric codes for the same city) — so, like AE, this field
  // is repurposed as a city/area picker instead of a real numeric postcode.
  SA: { maxLength: 40, digitsOnly: false, hint: 'Select your destination city' },
  KW: { maxLength: 40, digitsOnly: false, hint: 'Select your destination area' },
};

export function getPostcodeRule(countryCode) {
  return POSTCODE_RULES[countryCode] || POSTCODE_RULES.IN;
}

// Label for the destination field itself — most countries call it a
// postcode, but AE/SA/KW have no usable numeric postcode data, so their
// suggestion lists are keyed by place name instead (Emirate/city/area).
const DESTINATION_FIELD_LABEL = { AE: 'Destination Emirate', SA: 'Destination city', KW: 'Destination area' };
export function getDestinationFieldLabel(countryCode) {
  return DESTINATION_FIELD_LABEL[countryCode] || 'Destination postcode';
}

// Sanitizes a raw postcode input against a country's rule — strips
// non-digits for digit-only countries, and caps length for all of them.
export function sanitizePostcode(v, countryCode) {
  const rule = getPostcodeRule(countryCode);
  const cleaned = rule.digitsOnly ? v.replace(/\D/g, '') : v;
  return cleaned.slice(0, rule.maxLength);
}
