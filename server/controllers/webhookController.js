'use strict';

const { getPool, sql } = require('../db/sql');
const { ConversationLog } = require('../db/mongo');
const { sendEscalationEmail } = require('../services/mailer');

/**
 * POST /webhooks/escalation
 *
 * Called by Power Automate. Performs three actions atomically from the caller's perspective:
 *  1. Updates ticket status → ESCALATED in SQL Server
 *  2. Appends an escalation event to the conversation log in MongoDB
 *  3. Sends an escalation notification email via Nodemailer
 *
 * Body: { ticketId: string|number, userId?: string, note?: string }
 * Returns: { success: true, ticketId, message }
 */
async function handleEscalation(req, res) {
  try {
    const { ticketId, userId, note } = req.body;

    // ── Input validation ──────────────────────────────────────────────────────
    if (ticketId === undefined || ticketId === null || String(ticketId).trim() === '') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'ticketId is required',
      });
    }

    const id = parseInt(ticketId, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'ticketId must be a positive integer',
      });
    }

    // ── 1. Update SQL Server ──────────────────────────────────────────────────
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

    let ticket;

    if (result.recordset.length === 0) {
      // The ticket may already be escalated — fetch current state
      const checkReq = pool.request();
      checkReq.input('id', sql.Int, id);
      const check = await checkReq.query('SELECT * FROM dbo.tickets WHERE id = @id');

      if (check.recordset.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: `Ticket #${id} does not exist` });
      }

      ticket = check.recordset[0];

      if (ticket.status === 'RESOLVED') {
        return res.status(409).json({
          error: 'Conflict',
          message: `Ticket #${id} is already resolved and cannot be escalated`,
        });
      }

      // Already escalated — continue so email + log still fire (idempotent behaviour)
    } else {
      ticket = result.recordset[0];
    }

    // ── 2. Log to MongoDB ─────────────────────────────────────────────────────
    try {
      const escalationNote = note || 'Ticket escalated to human agent via webhook.';
      const resolvedUserId = userId || ticket.userId;

      await ConversationLog.findOneAndUpdate(
        { ticketId: String(id) },
        {
          $set:  { ticketId: String(id), userId: resolvedUserId },
          $push: {
            messages: {
              role: 'bot',
              content: `[ESCALATION] ${escalationNote}`,
              timestamp: new Date(),
            },
          },
        },
        { upsert: true, new: true }
      );
    } catch (mongoErr) {
      // Non-fatal — log the error but don't fail the response
      console.error('[WebhookController] MongoDB log error:', mongoErr.message);
    }

    // ── 3. Send escalation email ──────────────────────────────────────────────
    await sendEscalationEmail(ticket);

    // ── Response ──────────────────────────────────────────────────────────────
    return res.json({
      success: true,
      ticketId: id,
      message: `Ticket #${id} has been escalated. Notification sent to ${process.env.ESCALATION_EMAIL || 'configured address'}.`,
    });
  } catch (err) {
    console.error('[WebhookController] handleEscalation error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}

module.exports = { handleEscalation };
