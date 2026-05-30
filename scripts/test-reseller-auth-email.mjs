/**
 * Local check: Super Reseller auth email config + optional live send test.
 * Usage: node scripts/test-reseller-auth-email.mjs
 * Optional: RESELLER_TEST_EMAIL=you@example.com node scripts/test-reseller-auth-email.mjs
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const resendKey = (process.env.RESEND_API_KEY || '').trim();
const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const from = (process.env.RESELLER_AUTH_FROM_EMAIL || 'Super Reseller <noreply@superreseller.shop>').trim();
const testEmail = (process.env.RESELLER_TEST_EMAIL || '').trim().toLowerCase();
const apiPort = process.env.PORT || '3001';

function ok(label, pass, detail = '') {
  const icon = pass ? 'OK' : 'FAIL';
  console.log(`[${icon}] ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

console.log('\n=== Super Reseller auth email diagnostics ===\n');

ok('RESEND_API_KEY set', !!resendKey, resendKey ? `len=${resendKey.length}` : 'missing');
ok('SUPABASE_URL set', !!supabaseUrl);
ok('SUPABASE_SERVICE_ROLE_KEY set', !!serviceKey);
console.log(`     From address: ${from}`);
console.log(`     RESELLER_SITE_URL: ${process.env.RESELLER_SITE_URL || 'https://superreseller.shop (default)'}`);

if (resendKey) {
  try {
    const domainsRes = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${resendKey}` },
    });
    const domainsJson = await domainsRes.json().catch(() => ({}));
    ok('Resend API reachable', domainsRes.ok, domainsRes.ok ? `domains: ${(domainsJson.data || []).length}` : domainsJson.message || domainsRes.status);

    const fromDomain = from.match(/@([^>]+)>/)?.[1] || from.split('@')[1]?.replace(/>.*/, '');
    if (fromDomain && Array.isArray(domainsJson.data)) {
      const verified = domainsJson.data.some(
        (d) => d.name === fromDomain && (d.status === 'verified' || d.status === 'active'),
      );
      ok(`Resend domain "${fromDomain}" verified`, verified, verified ? '' : 'verify domain in Resend dashboard');
    }
  } catch (e) {
    ok('Resend API reachable', false, e.message);
  }
}

if (supabaseUrl && serviceKey) {
  const supabase = createClient(supabaseUrl, serviceKey);
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    ok('Supabase admin API', !error && !!data, error?.message || `users sample: ${data?.users?.length ?? 0}`);
  } catch (e) {
    ok('Supabase admin API', false, e.message);
  }
}

if (testEmail) {
  console.log(`\n--- Live API test (resend) → ${testEmail} ---\n`);
  try {
    const res = await fetch(`http://127.0.0.1:${apiPort}/api/auth/reseller-resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    });
    const body = await res.json().catch(() => ({}));
    console.log(`HTTP ${res.status}`, JSON.stringify(body, null, 2));
    ok('Resend verification endpoint', res.ok && body.success, body.error || body.message || '');
  } catch (e) {
    ok('Resend verification endpoint', false, `Is API running on port ${apiPort}? ${e.message}`);
  }
} else {
  console.log('\nTip: set RESELLER_TEST_EMAIL=your@email.com and run API (npm run server:dev) for a live resend test.\n');
}

console.log('');
