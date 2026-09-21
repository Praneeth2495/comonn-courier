// Some postcode-suggestion rows have suburb and state as the exact same
// name (e.g. Sweden's "Stockholm" postcodes, where the city and the county
// are both called Stockholm) — appending state unconditionally then shows
// "Stockholm, Stockholm". Only append it when it actually adds information.
export function suburbStateSuffix(suburb, state) {
  return state && state !== suburb ? `, ${state}` : '';
}
