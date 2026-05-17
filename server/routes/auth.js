'use strict';

const { Router } = require('express');
const jwt = require('jsonwebtoken');

const router = Router();

/**
 * POST /api/v1/auth/login
 *
 * Dashboard login. Accepts { password } and checks against DASHBOARD_PASSWORD env var.
 * Returns a signed JWT on success (valid 8 hours).
 * Works in all environments — production safe.
 */
router.post('/login', (req, res) => {
  const { password } = req.body || {};

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration', message: 'JWT_SECRET is not set' });
  }

  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    return res.status(500).json({ error: 'Server misconfiguration', message: 'DASHBOARD_PASSWORD is not set' });
  }

  if (!password || password !== expected) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Incorrect password' });
  }

  const token = jwt.sign(
    { sub: 'dashboard-ops-user', role: 'ops' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '8h' }
  );

  return res.json({ token, expiresIn: '8h' });
});

/**
 * GET /api/v1/auth/demo-token  — DEV ONLY
 * Kept for backward compatibility with local testing (disabled in production).
 */
router.get('/demo-token', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not Found' });
  }
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'Server misconfiguration', message: 'JWT_SECRET is not set' });
  }
  const token = jwt.sign(
    { sub: 'demo-dashboard-user', role: 'ops' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '24h' }
  );
  return res.json({ token, expiresIn: '24h' });
});

module.exports = router;
