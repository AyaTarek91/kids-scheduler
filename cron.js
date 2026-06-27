require('dotenv').config();
const cron = require('node-cron');
const { Resend } = require('resend');
const db = require('./db');

const resend = new Resend(process.env.RESEND_API_KEY);

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function fmt(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hh = parseInt(h, 10);
  return `${hh % 12 || 12}:${m} ${hh < 12 ? 'AM' : 'PM'}`;
}

function buildEmail() {
  const now = new Date();
  const today = DAYS[now.getDay()];
  const todayDate = now.toISOString().slice(0, 10);

  const recurring = db.prepare(
    'SELECT * FROM schedule WHERE day_of_week = ? ORDER BY start_time'
  ).all(today);

  const oneoffs = db.prepare(
    'SELECT * FROM one_off_items WHERE date = ? ORDER BY time'
  ).all(todayDate);

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const total = recurring.length + oneoffs.length;
  const subject = `Kids Schedule: ${dateStr} — ${total} item${total !== 1 ? 's' : ''}`;

  const itemRow = (label, time, notes) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0">
        <strong style="color:#1a1a2e">${label}</strong><br>
        <span style="color:#667eea;font-size:0.9rem">${time}</span>
        ${notes ? `<br><span style="color:#888;font-size:0.82rem">${notes}</span>` : ''}
      </td>
    </tr>`;

  const recurringRows = recurring.map(r =>
    itemRow(`${r.child_name} — ${r.activity}`, `${fmt(r.start_time)} – ${fmt(r.end_time)}`, r.notes)
  ).join('');

  const oneoffRows = oneoffs.map(r =>
    itemRow(r.child_name ? `${r.child_name} — ${r.title}` : r.title, fmt(r.time), r.notes)
  ).join('');

  const emptyMsg = `
    <p style="color:#888;font-style:italic;padding:12px 0">
      Nothing scheduled for today — enjoy the free day! 🌟
    </p>`;

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#f0f4ff;font-family:'Segoe UI',sans-serif">
      <div style="max-width:560px;margin:32px auto;background:white;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">

        <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:24px 28px">
          <div style="font-size:1.8rem;margin-bottom:4px">🎒</div>
          <h1 style="margin:0;color:white;font-size:1.3rem;font-weight:700">Kids Daily Schedule</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:0.9rem">${dateStr}</p>
        </div>

        <div style="padding:20px 28px">

          ${total === 0 ? emptyMsg : ''}

          ${recurring.length > 0 ? `
            <h2 style="color:#4a4a8a;font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">
              Recurring Activities
            </h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:20px">
              <tbody>${recurringRows}</tbody>
            </table>` : ''}

          ${oneoffs.length > 0 ? `
            <h2 style="color:#4a4a8a;font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">
              One-Off Events
            </h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:20px">
              <tbody>${oneoffRows}</tbody>
            </table>` : ''}

        </div>

        <div style="background:#f8f9ff;padding:12px 28px;border-top:1px solid #eee;font-size:0.75rem;color:#aaa;text-align:center">
          Sent by Kids Scheduler • <a href="http://localhost:3000" style="color:#667eea">Open app</a>
        </div>

      </div>
    </body>
    </html>`;

  return { subject, html };
}

async function sendDigest() {
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.startsWith('re_your')) {
    console.warn('[cron] RESEND_API_KEY not configured — skipping digest');
    return;
  }
  if (!process.env.NOTIFY_EMAIL) {
    console.warn('[cron] NOTIFY_EMAIL not set — skipping digest');
    return;
  }

  const recipients = process.env.NOTIFY_EMAIL.split(',').map(e => e.trim()).filter(Boolean);

  try {
    const { subject, html } = buildEmail();
    const { data, error } = await resend.emails.send({
      from:    'Kids Scheduler <onboarding@resend.dev>',
      to:      recipients,
      subject,
      html
    });
    if (error) throw new Error(error.message);
    console.log(`[cron] Digest sent (id: ${data.id}): "${subject}"`);
  } catch (err) {
    console.error('[cron] Failed to send digest:', err.message);
  }
}

// Run at 9:00 AM every day
cron.schedule('0 9 * * *', sendDigest, {
  timezone: process.env.TZ || 'America/New_York'
});

console.log('[cron] Daily digest scheduled for 9:00 AM');

// Manual trigger: node cron.js --now
if (process.argv.includes('--now')) {
  console.log('[cron] Sending digest immediately (--now flag)...');
  sendDigest().then(() => process.exit(0)).catch(() => process.exit(1));
}
