// Covers the only countries the app ever books: India (fixed origin) plus
// the five destination countries returned by GET /api/quote/countries.
const COUNTRY_NAMES = {
  IN: 'India',
  AU: 'Australia',
  NZ: 'New Zealand',
  CA: 'Canada',
  GB: 'United Kingdom',
  US: 'United States',
};

function getCountryName(code) {
  return COUNTRY_NAMES[code] || code;
}

module.exports = { COUNTRY_NAMES, getCountryName };
