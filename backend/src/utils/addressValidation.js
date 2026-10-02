const REQUIRED_ADDRESS_FIELDS = ['contactName', 'phone', 'line1', 'city', 'postcode', 'countryCode'];

/**
 * Returns the first missing-field error message for one address, or null if
 * it has everything required. `label` (e.g. "sender") prefixes the message
 * as `${label}.${field} is required`; omit it for a bare `${field} is required`.
 */
function findMissingAddressField(addr, label) {
  for (const f of REQUIRED_ADDRESS_FIELDS) {
    if (!addr[f]) return label ? `${label}.${f} is required` : `${f} is required`;
  }
  return null;
}

module.exports = { REQUIRED_ADDRESS_FIELDS, findMissingAddressField };
