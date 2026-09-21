// Some postcode-suggestion rows have suburb and state as the exact same
// name (e.g. Sweden's "Stockholm" postcodes, where the city and the county
// are both called Stockholm) — appending state unconditionally then shows
// "Stockholm, Stockholm". Only append it when it actually adds information.
export function suburbStateSuffix(suburb, state) {
  return state && state !== suburb ? `, ${state}` : '';
}

// UAE has no real postcode system — its PostcodeSuggestion rows use the
// Emirate name as both postcode and suburb (e.g. postcode="Dubai",
// suburb="Dubai"), which would otherwise display as "Dubai, Dubai". Skip
// the suburb segment whenever it's identical to the postcode.
export function formatPostcodeSuggestion(postcode, suburb, state) {
  const suffix = suburbStateSuffix(suburb, state);
  if (suburb === postcode) return `${postcode}${suffix}`;
  return `${postcode}, ${suburb}${suffix}`;
}
