// Per-country dial code, flag, and expected national mobile number length
// (digits only, excluding the dial code) — covers the same six countries
// as countryNames.js (the only ones the app ever books to/from). Lengths
// are the common-case mobile subscriber number length for each country;
// used to auto-set the phone country code from the address's own country
// and to enforce a sensible digit count.
export const PHONE_BY_COUNTRY = {
  IN: { dial: '+91', flag: '🇮🇳', digits: 10 },
  AU: { dial: '+61', flag: '🇦🇺', digits: 9 },
  CA: { dial: '+1', flag: '🇨🇦', digits: 10 },
  NZ: { dial: '+64', flag: '🇳🇿', digits: 9 },
  GB: { dial: '+44', flag: '🇬🇧', digits: 10 },
  US: { dial: '+1', flag: '🇺🇸', digits: 10 },
};

export function getPhoneMeta(countryCode) {
  return PHONE_BY_COUNTRY[countryCode] || PHONE_BY_COUNTRY.IN;
}
