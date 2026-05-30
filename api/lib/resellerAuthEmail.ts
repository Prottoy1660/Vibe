import { promises as fs } from 'fs';
import path from 'path';
import type { SupabaseClient, User } from '@supabase/supabase-js';

const RESELLER_SITE = (process.env.RESELLER_SITE_URL || 'https://superreseller.shop').replace(/\/$/, '');

function resellerFromAddress(): string {
  const from = (process.env.RESELLER_AUTH_FROM_EMAIL || '').trim();
  if (from) return from;
  return 'Super Reseller <noreply@superreseller.shop>';
}

async function loadConfirmSignupHtml(): Promise<string> {
  const filePath = path.resolve(process.cwd(), 'supabase', 'reseller-email-templates', 'confirm-signup.html');
  return fs.readFile(filePath, 'utf8');
}

function applyTemplateVars(html: string, confirmationUrl: string): string {
  return html
    .replace(/\{\{\s*\.ConfirmationURL\s*\}\}/g, confirmationUrl)
    .replace(/\{\{\s*\.SiteURL\s*\}\}/g, RESELLER_SITE);
}

/**
 * Send Super Reseller verification email via Resend using the main API server's RESEND_API_KEY.
 * This bypasses Supabase SMTP / edge hooks (which still send VibeAccess if the hook is off).
 */
/** Look up auth user by email (admin API has no direct get-by-email). */
export async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u: User) => u.email?.toLowerCase() === normalized);
    if (found) return found;
    if (data.users.length < perPage) break;
    page += 1;
  }
  return null;
}

export async function sendResellerVerificationEmail(args: {
  to: string;
  confirmationUrl: string;
  subject?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY is not set on the API server.' };
  }

  const to = args.to.trim().toLowerCase();
  if (!to) return { ok: false, error: 'Missing recipient email.' };

  try {
    const raw = await loadConfirmSignupHtml();
    const html = applyTemplateVars(raw, args.confirmationUrl);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resellerFromAddress(),
        to: [to],
        subject: args.subject || 'Super Reseller — verify your email',
        html,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      return { ok: false, error: json?.message || `Resend HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to send verification email' };
  }
}

export function getResellerAuthRedirectUrl(path = '/reseller/login'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${RESELLER_SITE}${normalized}`;
}
