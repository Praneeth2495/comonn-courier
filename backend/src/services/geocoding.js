// Resolves a lat/lng pair into a human-readable area (suburb/neighbourhood
// + city) for the clock-in/out attendance log — see attendance.controller.js.
// Uses OpenStreetMap's free Nominatim reverse-geocoding endpoint (no API
// key/billing needed, unlike Google's geocoder), which is why this is a
// server-side call rather than client-side: Nominatim's usage policy
// requires a descriptive User-Agent and caps request rate, both easier to
// guarantee from one backend than from every staff member's browser.
// Fire-and-forget by design — a geocoding failure must never block the
// clock-in/out itself from being recorded, so this never throws.
async function reverseGeocodeArea(lat, lng) {
  if (lat === undefined || lat === null || lng === undefined || lng === null) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ComonnCourier/1.0 (staff attendance; support@comonn.in)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const area = addr.suburb || addr.neighbourhood || addr.town || addr.village || addr.city_district;
    const city = addr.city || addr.town || addr.state_district;
    if (area && city && area !== city) return `${area}, ${city}`;
    return area || city || data.display_name || null;
  } catch (err) {
    console.error('reverseGeocodeArea failed:', err.message);
    return null;
  }
}

module.exports = { reverseGeocodeArea };
