const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { subscribe, unsubscribe } = require('../services/bookingFeed');

// Public, unauthenticated — the homepage popup shows for every visitor,
// logged in or not. Rate-limited per IP like contact.routes.js; generous
// enough to allow normal reconnects after a network blip without capping
// a real visitor mid-browse.
const connectLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

router.get('/', connectLimiter, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');

  subscribe(res);

  // Proxies (Railway included) silently drop a connection that looks idle —
  // a periodic comment line keeps it alive. EventSource ignores lines
  // starting with ":", so the client never sees this.
  const keepAlive = setInterval(() => res.write(':ping\n\n'), 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe(res);
  });
});

module.exports = router;
