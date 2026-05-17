'use strict';

const { Router } = require('express');
const { getPool }  = require('../db/sql');
const mongoose     = require('mongoose');

const router = Router();

/**
 * GET /api/v1/health
 * Returns status of the API, SQL Server, and MongoDB connections.
 */
router.get('/', async (_req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      sql: 'unknown',
      mongo: 'unknown',
    },
  };

  // ── Check SQL ──────────────────────────────────────────────────────────────
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    health.services.sql = 'connected';
  } catch {
    health.services.sql = 'disconnected';
    health.status = 'degraded';
  }

  // ── Check MongoDB ──────────────────────────────────────────────────────────
  const mongoState = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  health.services.mongo = mongoState === 1 ? 'connected' : 'disconnected';
  if (mongoState !== 1) health.status = 'degraded';

  const httpStatus = health.status === 'ok' ? 200 : 503;
  return res.status(httpStatus).json(health);
});

module.exports = router;
