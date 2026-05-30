/**
 * Send one Super Reseller template preview email.
 * Usage: node scripts/send-reseller-email-test.mjs [email]
 */
import dotenv from 'dotenv';
import { buildResellerEmailHtml } from '../api/lib/resellerEmailLayout.ts';

dotenv.config();

const to = (process.argv[2] || 'theunknownworld500@gmail.com').trim().toLowerCase();
const key = (process.env.RESEND_API_KEY || '').trim();
const from = process.env.RESELLER_AUTH_FROM_EMAIL || 'Super Reseller <noreply@superreseller.shop>';
const site = (process.env.RESELLER_SITE_URL || 'https://superreseller.shop').replace(/\/$/, '');

if (!key) {
  console.error('RESEND_API_KEY missing in .env');
  process.exit(1);
}

const html = buildResellerEmailHtml(
  {
    pageTitle: 'Verify your email (design test)',
    title: 'Verify your email',
    body: 'This is a preview of the updated Super Reseller email template. The button below opens the reseller login page.',
    ctaLabel: 'Verify email address',
    ctaHref: `${site}/reseller/login`,
    footerNote: 'Test email — safe to ignore if you did not request a design preview.',
    expiryNote: 'Design preview only.',
  },
  site,
);

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from,
    to: [to],
    subject: 'Super Reseller — email template test',
    html,
  }),
});

const json = await res.json().catch(() => ({}));
console.log('Status:', res.status);
if (res.ok) {
  console.log('Sent to:', to);
  console.log('Resend id:', json.id);
} else {
  console.error('Failed:', json.message || JSON.stringify(json));
  process.exit(1);
}
