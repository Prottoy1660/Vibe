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
/** True when the user still cannot sign in with email/password (unverified). */
export function authUserNeedsEmailVerification(user: User | null | undefined): boolean {
  if (!user) return true;
  return !user.email_confirmed_at;
}

/** Look up auth user by email — prefer public.users id, then paginate auth admin list. */
export async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<User | null> {
  const normalized = email.trim().toLowerCase();

  try {
    const { data: row } = await supabase.from('users').select('id').eq('email', normalized).maybeSingle();
    if (row?.id) {
      const { data, error } = await supabase.auth.admin.getUserById(row.id);
      if (!error && data?.user) return data.user;
    }
  } catch {
    // fall through
  }

  let page = 1;
  const perPage = 1000;

  for (let i = 0; i < 50; i += 1) {
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
  /** recovery = password reset link that also unlocks login when email was never confirmed */
  variant?: 'verify' | 'recovery';
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY is not set on the API server.' };
  }

  const to = args.to.trim().toLowerCase();
  if (!to) return { ok: false, error: 'Missing recipient email.' };

  try {
    const isRecovery = args.variant === 'recovery';
    const html = buildResellerEmailHtml(
      {
        pageTitle: isRecovery ? 'Activate your account' : 'Verify your email',
        title: isRecovery ? 'Activate your Super Reseller account' : 'Verify your email',
        body: isRecovery
          ? 'Your account is registered but not active yet. Tap the button below to confirm your email and choose a password, then sign in.'
          : 'Welcome to Super Reseller! Tap the button below to confirm your email address and activate your account.',
        ctaLabel: isRecovery ? 'Activate account' : 'Verify email address',
        ctaHref: args.confirmationUrl,
        footerNote: "If you didn't create a Super Reseller account, you can safely ignore this email.",
        expiryNote: isRecovery ? 'This link expires in 1 hour.' : 'This link expires in 24 hours.',
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
function actionLinkFromGenerateResult(data: { properties?: { action_link?: string } } | null): string | undefined {
  const raw = data?.properties?.action_link;
  return typeof raw === 'string' && raw ? raw : undefined;
}

export async function generateResellerVerificationLink(
  supabase: SupabaseClient,
  email: string,
  redirectTo = getResellerAuthRedirectUrl('/reseller/login'),
): Promise<{ link?: string; error?: string; variant?: 'verify' | 'recovery' }> {
  const normalized = email.trim().toLowerCase();
  const options = { redirectTo, data: { role: 'reseller' } };
  let lastError = '';

  const invite = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: normalized,
    options,
  });
  const inviteLink = actionLinkFromGenerateResult(invite.data);
  if (inviteLink) return { link: inviteLink, variant: 'verify' };
  lastError = invite.error?.message || lastError;
  if (invite.error && /rate|too many/i.test(invite.error.message)) {
    return { error: lastError };
  }

  const magic = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: normalized,
    options,
  });
  const magicLink = actionLinkFromGenerateResult(magic.data);
  if (magicLink) return { link: magicLink, variant: 'verify' };
  lastError = magic.error?.message || lastError;

  const recovery = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: normalized,
    options: { redirectTo: getResellerAuthRedirectUrl('/reseller/login?verified=1') },
  });
  const recoveryLink = actionLinkFromGenerateResult(recovery.data);
  if (recoveryLink) return { link: recoveryLink, variant: 'recovery' };
  lastError = recovery.error?.message || lastError;

  return { error: lastError || 'Could not create verification link.' };
}

/** Create link + send Super Reseller verification (signup or resend). */
export async function deliverResellerVerificationEmail(
  supabase: SupabaseClient,
  email: string,
  opts?: { subject?: string; redirectTo?: string },
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const redirectTo = opts?.redirectTo ?? getResellerAuthRedirectUrl('/reseller/login');
  const generated = await generateResellerVerificationLink(supabase, email, redirectTo);
  if (!generated.link) {
    return { ok: false, error: generated.error || 'Could not create verification link.' };
  }

  const confirmationUrl = applyResellerRedirectToConfirmationUrl(generated.link, redirectTo);
  const sent = await sendResellerVerificationEmail({
    to: email,
    confirmationUrl,
    subject: opts?.subject,
    variant: generated.variant,
  });

  if (!sent.ok) {
    return { ok: false, error: sent.error || 'Could not send email.' };
  }

  const message =
    generated.variant === 'recovery'
      ? 'We sent an activation link from Super Reseller. Open it to confirm your email and set your password.'
      : 'A verification link was sent from Super Reseller. Check your inbox and spam folder.';

  return { ok: true, message };
}
