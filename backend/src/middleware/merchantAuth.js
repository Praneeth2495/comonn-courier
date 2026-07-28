const crypto = require('crypto');
const { prisma } = require('../config/db');

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

// Same shape as requireAuth (auth.js), but for API-key-authenticated
// merchant requests (POST /v1/...) instead of customer/staff JWTs.
async function requireMerchantAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const rawKey = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!rawKey) return res.status(401).json({ error: 'Missing API key' });

  try {
    const merchant = await prisma.merchant.findUnique({ where: { apiKeyHash: hashApiKey(rawKey) } });
    if (!merchant || !merchant.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive API key' });
    }
    req.merchant = merchant;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireMerchantAuth, hashApiKey };
