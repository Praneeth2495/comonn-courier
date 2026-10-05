// Countries that can be freely combined into ONE manifest regardless of
// destination country — every other country still requires all selected
// orders to share exactly one destination country (see
// manifest.controller.js). Matches the "Europe" grouping used elsewhere
// (WorldOpsMap's continent dropdown).
const EUROPE_COUNTRY_CODES = ['GB', 'DE', 'IE', 'NL', 'SE', 'FR', 'PT', 'ES', 'IT'];

module.exports = { EUROPE_COUNTRY_CODES };
