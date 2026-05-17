'use strict';

const nodemailer = require('nodemailer');

/** Lazily created Nodemailer transporter */
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465, // true for 465, STARTTLS for others
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return _transporter;
}

/**
 * Sends an escalation notification email to the configured ESCALATION_EMAIL address.
 * @param {{ id: number, userId: string, issueType: string, description: string, priority: string }} ticket
 */
async function sendEscalationEmail(ticket) {
  const to = process.env.ESCALATION_EMAIL;
  if (!to) {
    console.warn('[Mailer] ESCALATION_EMAIL not set — skipping email');
    return;
  }

  const fromName = process.env.SMTP_FROM_NAME || 'IT Helpdesk Bot';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  const subject = `[ESCALATED] Ticket #${ticket.id} — ${ticket.issueType} (${ticket.priority})`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#c0392b;padding:16px 24px;border-radius:6px 6px 0 0">
        <h2 style="color:#fff;margin:0">🚨 Ticket Escalated</h2>
      </div>
      <div style="background:#f9f9f9;padding:24px;border:1px solid #ddd;border-top:none;border-radius:0 0 6px 6px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px;color:#555;width:140px"><strong>Ticket ID</strong></td><td style="padding:8px">#${ticket.id}</td></tr>
          <tr style="background:#fff"><td style="padding:8px;color:#555"><strong>User ID</strong></td><td style="padding:8px">${ticket.userId}</td></tr>
          <tr><td style="padding:8px;color:#555"><strong>Issue Type</strong></td><td style="padding:8px">${ticket.issueType}</td></tr>
          <tr style="background:#fff"><td style="padding:8px;color:#555"><strong>Priority</strong></td><td style="padding:8px">${ticket.priority}</td></tr>
          <tr><td style="padding:8px;color:#555"><strong>Description</strong></td><td style="padding:8px">${ticket.description}</td></tr>
        </table>
        <p style="margin-top:20px;color:#888;font-size:12px">
          This notification was sent automatically by the IT Helpdesk system.
          Please assign a human agent to this ticket immediately.
        </p>
      </div>
    </div>
  `;

  const text = `
TICKET ESCALATED
----------------
Ticket ID  : #${ticket.id}
User ID    : ${ticket.userId}
Issue Type : ${ticket.issueType}
Priority   : ${ticket.priority}
Description: ${ticket.description}

Please assign a human agent immediately.
  `.trim();

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`[Mailer] Escalation email sent: ${info.messageId}`);
  } catch (err) {
    console.error('[Mailer] Failed to send escalation email:', err.message);
    // Do not re-throw — email failure must not break the webhook response
  }
}

module.exports = { sendEscalationEmail };
