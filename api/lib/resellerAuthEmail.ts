import type { SupabaseClient, User } from '@supabase/supabase-js';
import { buildResellerEmailHtml } from './resellerEmailLayout.js';

const RESELLER_SITE = (process.env.RESELLER_SITE_URL || 'https://superreseller.shop').replace(/\/$/, '');

function resellerFromAddress(): string {
  const from = (process.env.RESELLER_AUTH_FROM_EMAIL || '').trim();
  if (from) return from;
  return 'Super Reseller <noreply@superreseller.shop>';
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
    const html = buildResellerEmailHtml(
      {
        pageTitle: 'Verify your email',
        title: 'Verify your email',
        body: 'Welcome to Super Reseller! Tap the button below to confirm your email address and activate your account.',
        ctaLabel: 'Verify email address',
        ctaHref: args.confirmationUrl,
        footerNote: "If you didn't create a Super Reseller account, you can safely ignore this email.",
        expiryNote: 'This link expires in 24 hours.',
      },
      RESELLER_SITE,
    );

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

/**
 * GoTrue often embeds the project Site URL (vibeaccessbd.com) in action_link when
 * redirectTo is missing from the allow list. Force Super Reseller redirect before sending.
 */
export function applyResellerRedirectToConfirmationUrl(
  actionLink: string,
  redirectTo = getResellerAuthRedirectUrl('/reseller/login'),
): string {
  try {
    const url = new URL(actionLink);
    url.searchParams.set('redirect_to', redirectTo);
    return url.toString();
  } catch {
    return actionLink;
  }
}

/**
 * Build a verification link for an existing auth user (resend flow).
 * magiclink often returns "already registered" for signup-pending users — try invite/signup first.
 */
export async function generateResellerVerificationLink(
  supabase: SupabaseClient,
  email: string,
  redirectTo = getResellerAuthRedirectUrl('/reseller/login'),
): Promise<{ link?: string; error?: string }> {
  const normalized = email.trim().toLowerCase();
  const options = { redirectTo, data: { role: 'reseller' } };
  const types = ['invite', 'signup', 'magiclink'] as const;
  let lastError = '';

  for (const type of types) {
    const { data, error } = await supabase.auth.admin.generateLink({
      type,
      email: normalized,
      options,
    });

    const raw = data?.properties?.action_link;
    if (!error && typeof raw === 'string' && raw) {
      return { link: raw };
    }
    lastError = error?.message || lastError;
    if (error && /rate|too many/i.test(error.message)) break;
  }

  return { error: lastError || 'Could not create verification link.' };
}
