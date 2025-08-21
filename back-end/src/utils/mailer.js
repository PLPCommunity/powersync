// mailer/invite.js
const { Resend } = require('resend');

function ensureResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[mailer] RESEND_API_KEY missing; falling back to console log');
    return null;
  }
  return new Resend(key);
}

// Optional brand controls
const APP_NAME = process.env.APP_NAME || 'DrawBoard';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'noreply@progskill.com';

function inviteEmailHtml({ boardName, inviterEmail,inviterName, inviteLink, role }) {
  const name = escapeHtml(boardName || 'Untitled document');
  const rolePretty = escapeHtml(role || 'edit');
  const inviter = escapeHtml(inviterEmail || 'A teammate');
  const origin = safeOrigin(inviteLink);
  const boardOwner =  escapeHtml(inviterName || 'A teammate');

  return `
  <!-- Preheader (hidden in most clients) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">
    ${inviter} invited you to ${rolePretty} on “${name}”. Jump back in and create together!
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f7fb;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <!-- Container -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="620" style="width:620px;max-width:100%;background:#ffffff;border-radius:16px;box-shadow:0 10px 30px rgba(44,62,80,.08);overflow:hidden;">
          <!-- Header / gradient -->
          <tr>
            <td style="
              background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);
              padding: 28px 24px; text-align:center; color:#fff;">
              <div style="font:700 22px/1.25 Inter,Arial,sans-serif; letter-spacing:.2px;">
                🎨 ${boardOwner} You have been invited to a <strong>${name}</strong> board
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 26px 24px 6px 24px; color:#0f172a; font-family:Inter,Arial,sans-serif;">
              <div style="font-weight:700; font-size:20px; margin:0 0 8px;">Hey there 👋</div>
              <p style="margin:0 0 10px; font-size:14px; line-height:1.7; color:#334155;">
                ${inviter} just invited you to <strong>${rolePretty}</strong> on the board
                <strong>“${name}”</strong>.
              </p>

             

              <!-- Cute card with bullets -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:14px 0; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <div style="font-weight:600; font-size:14px; color:#0f172a; margin-bottom:6px;">🎯 What you can do together:</div>
                    <ul style="margin:8px 0 0 18px; padding:0; color:#475569; font-size:13px; line-height:1.7;">
                      <li>Draw shapes, flows, and wireframes in sync</li>
                      <li>See everyone’s edits live — no refresh needed</li>
                      <li>Comment, iterate, and keep momentum high</li>
                      <li>Rename, organize, and export when it’s polished</li>
                    </ul>
                  </td>
                </tr>
              </table>
               <!-- CTA -->
              <div style="text-align:center; margin:18px 0 6px;">
                <a href="${inviteLink}"
                   style="display:inline-block; background:#4f46e5; color:#ffffff; text-decoration:none;
                          padding:12px 18px; border-radius:10px; font-weight:700; font-size:14px;">
                  Open “${name}”
                </a>
              </div>

              <!-- Secondary info -->
              <div style="text-align:center; margin:8px 0 18px;">
                <a href="${origin}" style="font-size:12px; color:#6366f1; text-decoration:none;">Browse boards</a>
              </div>

              

              <!-- Notice -->
              <div style="background:#fff7ed; border:1px solid #fed7aa; color:#9a3412; padding:10px 12px; border-radius:10px; font-size:12px;">
                ⏰ <strong>Heads up:</strong> invitations may expire for security. If this one stops working, ask ${inviter} to send a new invite.
              </div>

              <!-- Fallback link -->
              <p style="margin:14px 0 0; font-size:12px; color:#64748b;">
                Having trouble with the button? Paste this URL into your browser:<br/>
                <span style="word-break:break-all; color:#475569;">${escapeHtml(inviteLink)}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px 24px 24px; border-top:1px solid #eef2f7; background:#ffffff;">
              <div style="text-align:center; font:500 12px/1.6 Inter,Arial,sans-serif; color:#94a3b8;">
                Keep creating, keep growing 💪 — The ${APP_NAME} Team
              </div>
              <div style="text-align:center; margin-top:8px; font:400 11px/1.6 Inter,Arial,sans-serif; color:#9aa5b1;">
                Need help? Contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#64748b; text-decoration:underline;">${SUPPORT_EMAIL}</a>.
              </div>
            </td>
          </tr>
        </table>
        <!-- /Container -->
      </td>
    </tr>
  </table>`;
}

function inviteEmailText({ boardName, inviterEmail, inviteLink, role }) {
  const name = boardName || 'Untitled document';
  const inviter = inviterEmail || 'A teammate';
  const rolePretty = role || 'edit';

  return [
    'Ready to create together?',
    '',
    `${inviter} invited you to ${rolePretty} on the board “${name}”.`,
    'Draw together, see live edits, and keep momentum high.',
    '',
    `Open the board: ${inviteLink}`,
    '',
    `Need help? ${SUPPORT_EMAIL}`,
  ].join('\n');
}

function safeOrigin(link) {
  try {
    const u = new URL(link);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '#';
  }
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
  const subject = `🎨 ${inviterEmail} (DrawBoard) Has invited you on “${boardName || 'Untitled document'}” board`;
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
