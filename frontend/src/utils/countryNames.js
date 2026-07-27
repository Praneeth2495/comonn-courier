// Covers the only countries the app ever books: India (fixed origin) plus
// the five destination countries returned by GET /api/quote/countries.
export const COUNTRY_NAMES = {
  IN: 'India',
  AU: 'Australia',
  NZ: 'New Zealand',
  CA: 'Canada',
  GB: 'United Kingdom',
  US: 'United States',
};

export function getCountryName(code) {
  return COUNTRY_NAMES[code] || code;
}
