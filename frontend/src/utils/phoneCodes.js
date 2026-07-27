// Dial code, flag, and expected national mobile number length (digits
// only, excluding the dial code) for the six countries the app ever books
// to/from. `code` here is the phone's own country — used to default the
// dial code from the address's shipping country, but kept independently
// selectable since a receiver's phone isn't always in the same country as
// their shipping address (e.g. a foreign SIM). Lengths are the common-case
// mobile subscriber number length for each country.
export const PHONE_OPTIONS = [
  { code: 'IN', dial: '+91', flag: '🇮🇳', digits: 10 },
  { code: 'AU', dial: '+61', flag: '🇦🇺', digits: 9 },
  { code: 'CA', dial: '+1', flag: '🇨🇦', digits: 10 },
  { code: 'NZ', dial: '+64', flag: '🇳🇿', digits: 9 },
  { code: 'GB', dial: '+44', flag: '🇬🇧', digits: 10 },
  { code: 'US', dial: '+1', flag: '🇺🇸', digits: 10 },
];

export function getPhoneMeta(countryCode) {
  return PHONE_OPTIONS.find((p) => p.code === countryCode) || PHONE_OPTIONS[0];
}
