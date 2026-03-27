/**
 * NOIRE — Authentication Middleware
 * Verifies JWT tokens and attaches user info to request.
 */

const jwt = require('jsonwebtoken');
const { UserModel } = require('../models/db');

const JWT_SECRET = process.env.JWT_SECRET || 'noire_fallback_secret';

/* ── Token verification helper ──────────────────────────────── */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/* ── Extract bearer token from header ──────────────────────── */
function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  // Also allow token in cookie (if you extend to httpOnly cookies)
  return req.cookies?.token || null;
}

/* ═══════════════════════════════════════
   requireAuth — must be logged in
═══════════════════════════════════════ */
function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }

  // Attach decoded payload to request
  req.user = decoded;
  next();
}

/* ═══════════════════════════════════════
   requireAdmin — must be admin role
═══════════════════════════════════════ */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    next();
  });
}

/* ═══════════════════════════════════════
   optionalAuth — attaches user if token present
═══════════════════════════════════════ */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) req.user = decoded;
  }
  next();
}

/* ── Sign a new JWT ────────────────────────────────────────── */
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = { requireAuth, requireAdmin, optionalAuth, signToken };
