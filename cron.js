require('dotenv').config();
const cron = require('node-cron');
const { Resend } = require('resend');
const db = require('./db');

// Constructed lazily inside sendDigest — `new Resend()` throws when the API key is
// missing, and this module is require()d by the web server at boot, so building it
// eagerly would crash the whole site whenever RESEND_API_KEY isn't set.

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function fmt(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hh = parseInt(h, 10);
  return `${hh % 12 || 12}:${m} ${hh < 12 ? 'AM' : 'PM'}`;
}

async function buildEmail() {
  const now = new Date();
  const today = DAYS[now.getDay()];
  // Local date (YYYY-MM-DD) respecting the process TZ — toISOString() returns
  // UTC, which is off-by-one for timezones ahead of UTC and drops today's
  // one-off events from the digest.
  const todayDate = now.toLocaleDateString('en-CA');

  const recurring = (await db.query(
    'SELECT * FROM schedule WHERE day_of_week = $1 ORDER BY start_time', [today]
  )).rows;

  const oneoffs = (await db.query(
    'SELECT * FROM one_off_items WHERE date = $1 ORDER BY time', [todayDate]
  )).rows;

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
          Sent by Kids Scheduler • <a href="${APP_URL}" style="color:#667eea">Open app</a>
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
  if (!process.env.NOTIFY_EMAILS) {
    console.warn('[cron] NOTIFY_EMAILS not set — skipping digest');
    return;
  }

  const recipients = process.env.NOTIFY_EMAILS.split(',').map(e => e.trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.warn('[cron] NOTIFY_EMAILS is empty — skipping digest');
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  // Build the digest once — it's identical for everyone — then send a separate
  // email per recipient so addresses aren't exposed to each other and one bad
  // recipient doesn't sink the whole batch.
  const { subject, html } = await buildEmail();

  let sent = 0;
  for (const to of recipients) {
    try {
      const { data, error } = await resend.emails.send({
        from: 'Kids Scheduler <schedule@kidsscheduler.com>',
        to,
        subject,
        html
      });
      if (error) throw new Error(error.message);
      sent++;
      console.log(`[cron] Digest sent to ${to} (id: ${data.id})`);
    } catch (err) {
      console.error(`[cron] Failed to send digest to ${to}:`, err.message);
    }
  }

  console.log(`[cron] Digest run complete — ${sent}/${recipients.length} sent: "${subject}"`);
}

// Run at 9:00 AM every day
const DIGEST_CRON = '0 9 * * *';
const FALLBACK_TZ = 'America/New_York';

// Validate the configured TZ before handing it to node-cron. An invalid IANA name
// (e.g. "Egypt/Cairo" instead of "Africa/Cairo") makes cron.schedule throw, and
// since the web server require()s this module at boot, that throw would take the
// whole website down. Fall back to a known-good zone instead of crashing.
function resolveTimezone(tz) {
  if (!tz) return FALLBACK_TZ;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    console.error(`[cron] Invalid TZ "${tz}" — falling back to ${FALLBACK_TZ}. Use an IANA name like Africa/Cairo.`);
    return FALLBACK_TZ;
  }
}

const DIGEST_TZ = resolveTimezone(process.env.TZ);

// Never let a scheduler-setup failure crash the process that also serves the website.
try {
  if (!cron.validate(DIGEST_CRON)) {
    throw new Error(`Invalid cron expression: ${DIGEST_CRON}`);
  }
  cron.schedule(DIGEST_CRON, sendDigest, { timezone: DIGEST_TZ });
  console.log(`[cron] Daily digest scheduled — "${DIGEST_CRON}" (9:00 AM) in timezone ${DIGEST_TZ}`);
} catch (err) {
  console.error(`[cron] Failed to schedule digest (${err.message}) — continuing without it.`);
}

// Manual trigger: node cron.js --now
if (process.argv.includes('--now')) {
  console.log('[cron] Sending digest immediately (--now flag)...');
  sendDigest().then(() => process.exit(0)).catch(() => process.exit(1));
}
