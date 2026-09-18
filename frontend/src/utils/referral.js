// Whoever referred this visitor, captured from a shared link's ?ref=CODE
// and kept for the rest of the browser tab's session (cleared when the tab
// closes) — long enough to cover the whole booking flow (Home/Quote ->
// Details -> order creation) or a fresh registration, without needing to
// carry it through every page's own state.
const STORAGE_KEY = 'comonn_referral_code';

export function captureReferralCodeFromUrl() {
  const code = new URLSearchParams(window.location.search).get('ref');
  if (code) sessionStorage.setItem(STORAGE_KEY, code.trim().toUpperCase());
}

export function getStoredReferralCode() {
  return sessionStorage.getItem(STORAGE_KEY) || '';
}
