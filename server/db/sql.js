'use strict';

const sql = require('mssql');

const config = {
  server: process.env.MSSQL_HOST || 'localhost',
  port: parseInt(process.env.MSSQL_PORT || '1433', 10),
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE || 'helpdesk_db',
  options: {
    encrypt: process.env.MSSQL_ENCRYPT === 'true',
    trustServerCertificate: process.env.MSSQL_TRUST_SERVER_CERT === 'true',
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30_000,
  },
  connectionTimeout: 15_000,
  requestTimeout: 15_000,
};

/** @type {sql.ConnectionPool | null} */
let _pool = null;

/**
 * Returns the singleton mssql connection pool.
 * Creates and connects the pool on the first call.
 * @returns {Promise<sql.ConnectionPool>}
 */
async function getPool() {
  if (_pool && _pool.connected) return _pool;

  try {
    _pool = await new sql.ConnectionPool(config).connect();
    console.log('[SQL] Connection pool established');

    _pool.on('error', (err) => {
      console.error('[SQL] Pool error:', err.message);
      _pool = null; // force reconnect on next call
    });

    return _pool;
  } catch (err) {
    console.error('[SQL] Failed to connect:', err.message);
    throw err;
  }
}

/**
 * Closes the pool — call during graceful shutdown.
 */
async function closePool() {
  if (_pool) {
    await _pool.close();
    _pool = null;
    console.log('[SQL] Connection pool closed');
  }
}

module.exports = { getPool, closePool, sql };
