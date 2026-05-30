import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
const RESELLER_SITE = (Deno.env.get('RESELLER_SITE_URL') || 'https://superreseller.shop').replace(/\/$/, '');

type EmailData = {
  token?: string;
  token_hash?: string;
  redirect_to?: string;
  email_action_type?: string;
  site_url?: string;
};

function isResellerUser(
  user: { user_metadata?: Record<string, unknown>; raw_user_meta_data?: Record<string, unknown> },
  emailData?: EmailData,
) {
  const meta = user.user_metadata || user.raw_user_meta_data || {};
  if (String(meta.role || '').trim().toLowerCase() === 'reseller') return true;
  const redirect = String(emailData?.redirect_to || '');
  return redirect.includes('superreseller.shop');
}

function buildConfirmationUrl(emailData: EmailData): string | null {
  const tokenHash = emailData.token_hash;
  const action = emailData.email_action_type;
  if (!SUPABASE_URL || !tokenHash || !action) return null;

  const redirectTo = emailData.redirect_to || `${RESELLER_SITE}/reseller/login`;
  const params = new URLSearchParams({
    token: tokenHash,
    type: action,
    redirect_to: redirectTo,
  });
  return `${SUPABASE_URL}/auth/v1/verify?${params.toString()}`;
}

function resellerEmailShell(params: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  footerNote: string;
}) {
  const logoUrl = `${RESELLER_SITE}/super.png`;
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#050505;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#050505;"><tr><td align="center" style="padding:40px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0a0a0a;border-radius:24px;border:1px solid rgba(255,255,255,0.1);">
<tr><td align="center" style="padding:40px 28px 12px;">
  <img src="${logoUrl}" width="64" height="64" alt="Super Reseller" style="border-radius:16px;display:block;" />
</td></tr>
<tr><td align="center" style="padding:0 28px 8px;">
  <span style="font-size:22px;font-weight:800;color:#fff;">Super<span style="color:#71717a;font-weight:500;">Reseller</span></span>
</td></tr>
<tr><td align="center" style="padding:24px 28px 8px;">
  <h1 style="margin:0;font-size:22px;color:#fff;">${params.title}</h1>
</td></tr>
<tr><td style="padding:0 28px 8px;">
  <p style="margin:0;font-size:15px;line-height:1.6;color:#a1a1aa;text-align:center;">${params.body}</p>
</td></tr>
<tr><td align="center" style="padding:28px 28px 12px;">
  <a href="${params.ctaHref}" style="display:inline-block;padding:14px 36px;background:#fff;color:#000;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px;">${params.ctaLabel}</a>
</td></tr>
<tr><td align="center" style="padding:8px 28px 32px;">
  <p style="margin:0;font-size:12px;color:#71717a;">${params.footerNote}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

serve(async (req) => {
  try {
    const payload = await req.json();
    const user = payload.user;
    const emailData: EmailData = payload.email_data || {};

    if (!isResellerUser(user, emailData)) {
      // Fail so Supabase Auth falls back to default VibeAccess SMTP/templates.
      return new Response(JSON.stringify({ error: 'not_reseller_use_default_provider' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!RESEND_API_KEY) {
      console.error('[custom-auth-email] RESEND_API_KEY missing');
      return new Response(JSON.stringify({ error: 'resend_not_configured' }), { status: 500 });
    }

    const brandName = 'Super Reseller';
    const senderEmail = 'noreply@superreseller.shop';
    const action = emailData.email_action_type || 'signup';
    const confirmUrl = buildConfirmationUrl(emailData);

    let subject = `Super Reseller — verify your email`;
    let htmlContent = '';

    if (action === 'signup' && confirmUrl) {
      subject = 'Welcome to Super Reseller — verify your email';
      htmlContent = resellerEmailShell({
        title: 'Verify your email',
        body: 'Welcome to Super Reseller! Tap the button below to confirm your email and activate your reseller account.',
        ctaLabel: 'Verify email address',
        ctaHref: confirmUrl,
        footerNote: 'This link expires in 24 hours. If you did not sign up, ignore this email.',
      });
    } else if (action === 'recovery' && confirmUrl) {
      subject = 'Reset your Super Reseller password';
      htmlContent = resellerEmailShell({
        title: 'Reset password',
        body: 'We received a request to reset your Super Reseller password. Use the button below to choose a new password.',
        ctaLabel: 'Reset password',
        ctaHref: confirmUrl,
        footerNote: 'If you did not request this, you can safely ignore this email.',
      });
    } else if (action === 'email_change' && confirmUrl) {
      subject = 'Confirm your new Super Reseller email';
      htmlContent = resellerEmailShell({
        title: 'Confirm email change',
        body: 'Confirm this change to the email address on your Super Reseller account.',
        ctaLabel: 'Confirm email',
        ctaHref: confirmUrl,
        footerNote: 'If you did not request this change, contact support immediately.',
      });
    } else if (emailData.token) {
      subject = `Super Reseller — your verification code`;
      htmlContent = resellerEmailShell({
        title: 'Verification code',
        body: `Your code: <strong style="color:#fff;font-size:28px;letter-spacing:4px;">${emailData.token}</strong>`,
        ctaLabel: 'Open Super Reseller',
        ctaHref: `${RESELLER_SITE}/reseller/login`,
        footerNote: 'Enter this code if prompted on the login page.',
      });
    } else {
      return new Response(JSON.stringify({ error: 'unsupported_email_action' }), { status: 500 });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${brandName} <${senderEmail}>`,
        to: [user.email],
        subject,
        html: htmlContent,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[custom-auth-email] Resend error', data);
      return new Response(JSON.stringify({ error: data }), { status: 500 });
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[custom-auth-email]', message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
