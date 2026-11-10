// server/routes/adminAuth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const Admin = require('../models/Admin');
const { ok, fail } = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();

// Slow down brute-force attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.', code: 'LOGIN_RATE_LIMIT' }
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES_IN = '12h';
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

// POST /api/admin-auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return fail(res, 400, 'Username and password required', 'INVALID_PAYLOAD');
    }

    const admin = await Admin.findOne({ username: String(username).toLowerCase().trim() })
      .select('+passwordHash');

    // Return a generic error even if the user doesn't exist (prevents enumeration)
    if (!admin) {
      return fail(res, 401, 'Invalid username or password', 'INVALID_CREDENTIALS');
    }
    if (!admin.isActive) {
      return fail(res, 403, 'Account disabled', 'ACCOUNT_DISABLED');
    }
    if (admin.lockUntil && admin.lockUntil > Date.now()) {
      const waitMin = Math.ceil((admin.lockUntil - Date.now()) / 60000);
      return fail(res, 423, `Account locked. Try again in ${waitMin} minute(s).`, 'ACCOUNT_LOCKED');
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      // Increment failed attempts
      admin.loginAttempts = (admin.loginAttempts || 0) + 1;
      if (admin.loginAttempts >= MAX_ATTEMPTS) {
        admin.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        admin.loginAttempts = 0;
        await admin.save();
        logger.warn(`Admin lockout for user "${username}" after ${MAX_ATTEMPTS} failed attempts`);
        return fail(res, 423, 'Too many failed attempts. Account locked for 15 minutes.', 'ACCOUNT_LOCKED');
      }
      await admin.save();
      logger.warn(`Failed login attempt for "${username}" (${admin.loginAttempts}/${MAX_ATTEMPTS})`);
      return fail(res, 401, 'Invalid username or password', 'INVALID_CREDENTIALS');
    }

    // Success — reset counters
    admin.loginAttempts = 0;
    admin.lockUntil = null;
    admin.lastLoginAt = new Date();
    await admin.save();

    const token = jwt.sign(
      { id: admin._id.toString(), username: admin.username, role: admin.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info(`Admin "${admin.username}" logged in`);

    return res.json(ok({
      token,
      expiresIn: JWT_EXPIRES_IN,
      user: {
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role
      }
    }));
  } catch (err) {
    logger.error(`POST /api/admin-auth/login → ${err.message}`);
    return fail(res, 500, 'Login failed', 'LOGIN_ERROR');
  }
});

// GET /api/admin-auth/me — verify current token
router.get('/me', async (req, res) => {
  const auth = req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return fail(res, 401, 'No token', 'UNAUTHORIZED');

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findById(payload.id).lean();
    if (!admin || !admin.isActive) {
      return fail(res, 401, 'Invalid session', 'INVALID_TOKEN');
    }
    return res.json(ok({
      user: {
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role
      }
    }));
  } catch (err) {
    return fail(res, 401, 'Token expired or invalid', 'INVALID_TOKEN');
  }
});

// POST /api/admin-auth/logout — no-op for JWT (client just drops token)
router.post('/logout', (req, res) => {
  return res.json(ok({ message: 'Logged out' }));
});

module.exports = router;