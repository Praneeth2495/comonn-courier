// Expected postcode format per country — covers the same six countries as
// countryNames.js. India/Australia/New Zealand/US postcodes are pure
// digits, so those are capped and stripped of non-digit input as the
// customer types. Canada and the UK mix letters and numbers (e.g.
// "K1A 0B1", "SW1A 1AA"), so those are just length-capped, not
// digit-restricted.
export const POSTCODE_RULES = {
  IN: { maxLength: 6, digitsOnly: true, hint: 'India postcodes are 6 digits' },
  AU: { maxLength: 4, digitsOnly: true, hint: 'Australia postcodes are 4 digits' },
  NZ: { maxLength: 4, digitsOnly: true, hint: 'New Zealand postcodes are 4 digits' },
  US: { maxLength: 5, digitsOnly: true, hint: 'US ZIP codes are 5 digits' },
  CA: { maxLength: 7, digitsOnly: false, hint: 'Canada postal codes look like K1A 0B1' },
  GB: { maxLength: 8, digitsOnly: false, hint: 'UK postcodes look like SW1A 1AA' },
};

export function getPostcodeRule(countryCode) {
  return POSTCODE_RULES[countryCode] || POSTCODE_RULES.IN;
}

// Sanitizes a raw postcode input against a country's rule — strips
// non-digits for digit-only countries, and caps length for all of them.
export function sanitizePostcode(v, countryCode) {
  const rule = getPostcodeRule(countryCode);
  const cleaned = rule.digitsOnly ? v.replace(/\D/g, '') : v;
  return cleaned.slice(0, rule.maxLength);
}
