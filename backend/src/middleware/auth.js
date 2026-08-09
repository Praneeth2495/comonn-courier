const jwt = require('jsonwebtoken');
const { prisma } = require('../config/db');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, role, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Usage: requireRole('ADMIN') or requireRole('ADMIN', 'STAFF') */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Usage: requirePage('inventory') — layer this AFTER requireRole(...) on a
 * route, never standalone. It only narrows STAFF/ACCOUNTS down to their
 * individually-granted User.allowedPages (see constants/pages.js); every
 * other role that already passed the preceding requireRole(...) (ADMIN,
 * DRIVER) is waved through unchanged, since the per-user page toggle only
 * applies to STAFF/ACCOUNTS. Reads allowedPages fresh from the DB (not the
 * JWT) so an admin's toggle takes effect immediately, without the affected
 * user needing to log out and back in.
 */
function requirePage(pageKey) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== 'STAFF' && req.user.role !== 'ACCOUNTS') return next();
    try {
      const dbUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { allowedPages: true } });
      if (!dbUser || !dbUser.allowedPages.includes(pageKey)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Populates req.user if a valid token is present, but does not reject if absent. */
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_err) {
    // ignore invalid token in optional mode
  }
  next();
}

module.exports = { requireAuth, requireRole, optionalAuth };
