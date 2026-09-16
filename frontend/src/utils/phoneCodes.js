// Dial code, flag, and expected national mobile number length (digits
// only, excluding the dial code) for every country the app currently
// books to/from. `code` here is the phone's own country — used to default
// the dial code from the address's shipping country, but kept
// independently selectable since a receiver's phone isn't always in the
// same country as their shipping address (e.g. a foreign SIM). Lengths
// are the common-case mobile subscriber number length for each country.
export const PHONE_OPTIONS = [
  { code: 'IN', dial: '+91', flag: '🇮🇳', digits: 10 },
  { code: 'AU', dial: '+61', flag: '🇦🇺', digits: 9 },
  { code: 'CA', dial: '+1', flag: '🇨🇦', digits: 10 },
  { code: 'NZ', dial: '+64', flag: '🇳🇿', digits: 9 },
  { code: 'GB', dial: '+44', flag: '🇬🇧', digits: 10 },
  { code: 'US', dial: '+1', flag: '🇺🇸', digits: 10 },
  { code: 'DE', dial: '+49', flag: '🇩🇪', digits: 11 },
  { code: 'MY', dial: '+60', flag: '🇲🇾', digits: 9 },
  { code: 'SG', dial: '+65', flag: '🇸🇬', digits: 8 },
  { code: 'ZA', dial: '+27', flag: '🇿🇦', digits: 9 },
];

export function getPhoneMeta(countryCode) {
  return PHONE_OPTIONS.find((p) => p.code === countryCode) || PHONE_OPTIONS[0];
}
