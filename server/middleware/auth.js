// server/middleware/auth.js
const crypto = require('crypto');
const { fail } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Timing-safe string comparison. Prevents timing attacks.
 */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify a JWT without requiring jsonwebtoken at module load time.
 * If jsonwebtoken isn't installed, returns null and falls through to API key.
 */
function verifyJWT(token) {
  try {
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

/**
 * Admin auth middleware. Accepts either:
 *   1. Authorization: Bearer <jwt>   (username/password login)
 *   2. X-Admin-Key: <api-key>        (legacy API key from .env)
 */
function requireAdmin(req, res, next) {
  if (process.env.ENABLE_ADMIN !== 'true') {
    return fail(res, 404, 'Admin API is disabled', 'ADMIN_DISABLED');
  }

  // ---- Path 1: JWT in Authorization header ----
  const authHeader = req.header('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (!token) {
      return fail(res, 401, 'No token provided', 'UNAUTHORIZED');
    }
    const payload = verifyJWT(token);
    if (!payload) {
      logger.warn(`Admin JWT rejected from ${req.ip}`);
      return fail(res, 401, 'Invalid or expired token', 'INVALID_TOKEN');
    }
    req.admin = payload;
    req.authMethod = 'jwt';
    return next();
  }

  // ---- Path 2: Legacy API key ----
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey || configuredKey.length < 16) {
    logger.error('ADMIN_API_KEY missing or too short. Refusing admin requests.');
    return fail(res, 503, 'Admin API misconfigured', 'ADMIN_MISCONFIGURED');
  }

  const suppliedKey = req.header('X-Admin-Key') || '';
  if (!suppliedKey || !timingSafeEqual(suppliedKey, configuredKey)) {
    logger.warn(`Admin access denied from ${req.ip}`);
    return fail(res, 401, 'Unauthorized', 'UNAUTHORIZED');
  }

  req.authMethod = 'api-key';
  next();
}

module.exports = { requireAdmin };