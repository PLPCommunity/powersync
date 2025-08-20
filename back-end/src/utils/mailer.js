const { Resend } = require('resend');

function ensureResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[mailer] RESEND_API_KEY missing; falling back to console log');
    return null;
  }
  return new Resend(key);
}

function inviteEmailHtml({ boardName, inviterEmail, inviteLink, role }) {
  return `
  <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#0f172a">
    <h2 style="margin:0 0 12px 0;color:#111827">You've been invited to collaborate</h2>
    <p style="margin:0 0 8px 0">${inviterEmail || 'A collaborator'} invited you to <strong>${role}</strong> on the board <strong>"${escapeHtml(boardName || 'Untitled document')}"</strong>.</p>
    <p style="margin:0 0 16px 0">Click the button below to open the board and accept the invite:</p>
    <p style="margin:0 0 20px 0">
      <a href="${inviteLink}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">Open board</a>
    </p>
    <p style="margin:0;color:#475569">If the button doesn't work, copy and paste this URL into your browser:<br/>
      <span style="font-size:12px;color:#64748b">${inviteLink}</span>
    </p>
  </div>`;
}

function inviteEmailText({ boardName, inviterEmail, inviteLink, role }) {
  return `You've been invited to collaborate\n\n${inviterEmail || 'A collaborator'} invited you to ${role} on the board "${boardName || 'Untitled document'}".\n\nOpen board: ${inviteLink}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendInviteEmail({ to, boardName, inviterEmail, inviteLink, role }) {
  const resend = ensureResend();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from) {
    console.log(`[MAIL:console] Invite → ${to} | Board: ${boardName} | Role: ${role} | From: ${inviterEmail} | Link: ${inviteLink}`);
    return true;
  }
  const subject = `You've been invited to collaborate on "${boardName || 'Untitled document'}"`;
  const html = inviteEmailHtml({ boardName, inviterEmail, inviteLink, role });
  const text = inviteEmailText({ boardName, inviterEmail, inviteLink, role });
  try {
    await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
      reply_to: inviterEmail ? [inviterEmail] : undefined,
    });
    return true;
  } catch (e) {
    console.error('[mailer] Resend send failed:', e?.message || e);
    return false;
  }
}

module.exports = { sendInviteEmail };


