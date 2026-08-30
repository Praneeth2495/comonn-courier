// In-memory SSE broadcast for the homepage's "Booking confirmed" popup (see
// frontend Home.jsx) — a live event fires here the instant any order
// reaches PAID or PICKUP_CONFIRMED (see orderNotifications.js), pushed to
// every browser currently on the homepage. Single-process only, no Redis/
// pub-sub broker: this app runs on one Railway web instance, so every
// connected client is always on the same process that receives the event.
// If that ever changes to multiple instances, a visitor connected to a
// different instance than the one that processed the webhook simply won't
// see that particular popup — an acceptable gap for a purely cosmetic
// feature, not worth the complexity of a shared broker.
const clients = new Set();

function subscribe(res) {
  clients.add(res);
}

function unsubscribe(res) {
  clients.delete(res);
}

function broadcastBookingConfirmed({ city, countryCode }) {
  if (!city || !countryCode) return; // nothing meaningful to show — skip silently
  const payload = JSON.stringify({ city, countryCode });
  for (const res of clients) {
    res.write(`data: ${payload}\n\n`);
  }
}

module.exports = { subscribe, unsubscribe, broadcastBookingConfirmed };
