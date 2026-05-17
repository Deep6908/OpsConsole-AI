'use strict';

const { Router } = require('express');
const auth = require('../middleware/auth');
const {
  listTickets,
  createTicket,
  getTicket,
  resolveTicket,
  escalateTicket,
} = require('../controllers/ticketController');

const router = Router();

// All ticket routes require a valid JWT
router.use(auth);

// GET  /api/v1/tickets?status=OPEN&page=1&limit=20
router.get('/', listTickets);

// POST /api/v1/tickets
router.post('/', createTicket);

// GET  /api/v1/tickets/:id
router.get('/:id', getTicket);

// PATCH /api/v1/tickets/:id/resolve
router.patch('/:id/resolve', resolveTicket);

// PATCH /api/v1/tickets/:id/escalate  (status update only — no email)
router.patch('/:id/escalate', escalateTicket);

module.exports = router;
