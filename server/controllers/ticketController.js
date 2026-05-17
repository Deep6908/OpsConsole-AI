'use strict';

const { getPool, sql } = require('../db/sql');

// ── Validation helpers ────────────────────────────────────────────────────────

const VALID_ISSUE_TYPES = ['PASSWORD_RESET', 'SOFTWARE_ACCESS', 'HARDWARE_ISSUE', 'NETWORK_ISSUE', 'OTHER'];
const VALID_PRIORITIES  = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VALID_STATUSES    = ['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'];

function validateId(id) {
  const n = parseInt(id, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/tickets
 * Query params: status (optional), page (default 1), limit (default 20)
 */
async function listTickets(req, res) {
  try {
    const { status, page = '1', limit = '20' } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset   = (pageNum - 1) * limitNum;

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid status filter. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const pool    = await getPool();
    const request = pool.request();
    request.input('offset', sql.Int, offset);
    request.input('limit',  sql.Int, limitNum);

    let whereClause = '';
    if (status) {
      request.input('status', sql.NVarChar(16), status);
      whereClause = 'WHERE status = @status';
    }

    const query = `
      SELECT id, userId, issueType, description, priority, status, createdAt, updatedAt, resolvedAt
      FROM   dbo.tickets
      ${whereClause}
      ORDER BY createdAt DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      SELECT COUNT(*) AS total
      FROM   dbo.tickets
      ${whereClause};
    `;

    const result = await request.query(query);
    const tickets = result.recordsets[0];
    const total   = result.recordsets[1][0].total;

    return res.json({
      data: tickets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('[TicketController] listTickets error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}

/**
 * POST /api/v1/tickets
 * Body: { userId, issueType, description, priority }
 */
async function createTicket(req, res) {
  try {
    const { userId, issueType, description, priority = 'MEDIUM' } = req.body;

    // ── Input validation ────────────────────────────────────────────────────
    const errors = [];
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      errors.push('userId is required and must be a non-empty string');
    }
    if (!issueType || !VALID_ISSUE_TYPES.includes(issueType)) {
      errors.push(`issueType must be one of: ${VALID_ISSUE_TYPES.join(', ')}`);
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      errors.push('description is required and must be a non-empty string');
    }
    if (description && description.length > 2000) {
      errors.push('description must not exceed 2000 characters');
    }
    if (!VALID_PRIORITIES.includes(priority)) {
      errors.push(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation Error', messages: errors });
    }

    const pool    = await getPool();
    const request = pool.request();
    request.input('userId',      sql.NVarChar(128),  userId.trim());
    request.input('issueType',   sql.NVarChar(32),   issueType);
    request.input('description', sql.NVarChar(2000), description.trim());
    request.input('priority',    sql.NVarChar(16),   priority);

    const result = await request.query(`
      DECLARE @inserted TABLE (id INT);
      INSERT INTO dbo.tickets (userId, issueType, description, priority, status)
      OUTPUT INSERTED.id INTO @inserted
      VALUES (@userId, @issueType, @description, @priority, 'OPEN');
      SELECT * FROM dbo.tickets WHERE id IN (SELECT id FROM @inserted);
    `);

    return res.status(201).json({ data: result.recordset[0] });
  } catch (err) {
    console.error('[TicketController] createTicket error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}

/**
 * GET /api/v1/tickets/:id
 */
async function getTicket(req, res) {
  try {
    const id = validateId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Bad Request', message: 'Ticket ID must be a positive integer' });
    }

    const pool    = await getPool();
    const request = pool.request();
    request.input('id', sql.Int, id);

    const result = await request.query(`
      SELECT id, userId, issueType, description, priority, status, createdAt, updatedAt, resolvedAt
      FROM   dbo.tickets
      WHERE  id = @id;
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: `Ticket #${id} does not exist` });
    }

    return res.json({ data: result.recordset[0] });
  } catch (err) {
    console.error('[TicketController] getTicket error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}

/**
 * PATCH /api/v1/tickets/:id/resolve
 */
async function resolveTicket(req, res) {
  try {
    const id = validateId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Bad Request', message: 'Ticket ID must be a positive integer' });
    }

    const pool    = await getPool();
    const request = pool.request();
    request.input('id', sql.Int, id);

    const result = await request.query(`
      DECLARE @updated TABLE (id INT);
      UPDATE dbo.tickets
      SET    status     = 'RESOLVED',
             resolvedAt = GETDATE()
      OUTPUT INSERTED.id INTO @updated
      WHERE  id = @id
        AND  status != 'RESOLVED';
      SELECT * FROM dbo.tickets WHERE id IN (SELECT id FROM @updated);
    `);

    if (result.recordset.length === 0) {
      // Check whether it simply didn't exist or was already resolved
      const checkReq = pool.request();
      checkReq.input('id', sql.Int, id);
      const check = await checkReq.query('SELECT id, status FROM dbo.tickets WHERE id = @id');

      if (check.recordset.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: `Ticket #${id} does not exist` });
      }
      return res.status(409).json({
        error: 'Conflict',
        message: `Ticket #${id} is already resolved`,
        data: check.recordset[0],
      });
    }

    return res.json({ data: result.recordset[0] });
  } catch (err) {
    console.error('[TicketController] resolveTicket error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}

/**
 * PATCH /api/v1/tickets/:id/escalate
 * Updates status to ESCALATED only — email is sent via POST /webhooks/escalation.
 */
async function escalateTicket(req, res) {
  try {
    const id = validateId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Bad Request', message: 'Ticket ID must be a positive integer' });
    }

    const pool    = await getPool();
    const request = pool.request();
    request.input('id', sql.Int, id);

    const result = await request.query(`
      DECLARE @updated TABLE (id INT);
      UPDATE dbo.tickets
      SET    status = 'ESCALATED'
      OUTPUT INSERTED.id INTO @updated
      WHERE  id = @id
        AND  status NOT IN ('ESCALATED', 'RESOLVED');
      SELECT * FROM dbo.tickets WHERE id IN (SELECT id FROM @updated);
    `);

    if (result.recordset.length === 0) {
      const checkReq = pool.request();
      checkReq.input('id', sql.Int, id);
      const check = await checkReq.query('SELECT id, status FROM dbo.tickets WHERE id = @id');

      if (check.recordset.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: `Ticket #${id} does not exist` });
      }
      return res.status(409).json({
        error: 'Conflict',
        message: `Ticket #${id} cannot be escalated (current status: ${check.recordset[0].status})`,
        data: check.recordset[0],
      });
    }

    return res.json({ data: result.recordset[0] });
  } catch (err) {
    console.error('[TicketController] escalateTicket error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}

module.exports = { listTickets, createTicket, getTicket, resolveTicket, escalateTicket };
