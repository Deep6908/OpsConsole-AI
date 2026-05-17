'use strict';

require('dotenv').config();

const express = require('express');
const path    = require('path');
const cors    = require('cors');

const { connectMongo }  = require('./db/mongo');
const { closePool }     = require('./db/sql');

const ticketRoutes  = require('./routes/tickets');
const kbRoutes      = require('./routes/kb');
const healthRoutes  = require('./routes/health');
const webhookRoutes = require('./routes/webhooks');
const authRoutes    = require('./routes/auth');

const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ── Global Middleware ─────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (lightweight, no external dependency)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ── Static Dashboard ──────────────────────────────────────────────────────────
// Serves client/dashboard/ at /dashboard
app.use(
  '/dashboard',
  express.static(path.join(__dirname, '..', 'client', 'dashboard'))
);

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/tickets', ticketRoutes);
app.use('/api/v1/kb',      kbRoutes);
app.use('/api/v1/health',  healthRoutes);
app.use('/api/v1/auth',    authRoutes);
app.use('/webhooks',       webhookRoutes);

// ── Root redirect ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.redirect('/dashboard'));

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'The requested endpoint does not exist' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Global Error]', err.stack || err.message);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  try {
    // Connect MongoDB first — SQL pool connects lazily on first request
    await connectMongo();

    const server = app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════╗
║       IT Helpdesk API — Running                      ║
╠══════════════════════════════════════════════════════╣
║  Port     : ${String(PORT).padEnd(39)}║
║  Env      : ${String(process.env.NODE_ENV || 'development').padEnd(39)}║
║  Dashboard: http://localhost:${PORT}/dashboard       ║
║  Health   : http://localhost:${PORT}/api/v1/health   ║
╚══════════════════════════════════════════════════════╝
      `.trim());
    });

    // ── Graceful shutdown ───────────────────────────────────────────────────────
    const shutdown = async (signal) => {
      console.log(`\n[Server] ${signal} received — shutting down gracefully...`);
      server.close(async () => {
        await closePool();
        process.exit(0);
      });
      // Force kill after 10 s if graceful shutdown stalls
      setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  } catch (err) {
    console.error('[Server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();
