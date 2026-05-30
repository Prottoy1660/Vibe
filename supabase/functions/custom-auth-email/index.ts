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

/** Light layout — keep in sync with api/lib/resellerEmailLayout.ts */
function resellerEmailShell(params: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  footerNote: string;
  expiryNote?: string;
  pageTitle?: string;
}) {
  const logoUrl = `${RESELLER_SITE}/super.png`;
  const expiryRow = params.expiryNote
    ? `<tr><td align="center" style="padding:12px 28px 0;"><p style="margin:0;font-size:12px;color:#71717a;">${params.expiryNote}</p></td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${params.pageTitle || params.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5 !important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:28px 16px;background-color:#f4f4f5;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:520px;width:100%;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">
<tr><td style="height:3px;background-color:#6366f1;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 28px 12px;background-color:#ffffff;">
<a href="${RESELLER_SITE}" style="text-decoration:none;display:inline-block;line-height:0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>
<td align="center" width="52" height="106" style="width:52px;height:106px;line-height:0;">
<img src="${logoUrl}" width="52" height="106" alt="Super Reseller" style="display:block;width:52px;height:106px;max-width:52px;border:0;" />
</td></tr></table></a></td></tr>
<tr><td align="center" style="padding:0 28px 8px;background-color:#ffffff;">
<h1 style="margin:0;font-size:20px;font-weight:700;color:#18181b;">${params.title}</h1>
</td></tr>
<tr><td style="padding:0 28px 8px;background-color:#ffffff;">
<p style="margin:0;font-size:14px;line-height:1.6;color:#52525b;text-align:center;">${params.body}</p>
</td></tr>
<tr><td align="center" style="padding:22px 28px 8px;background-color:#ffffff;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="#6366f1" style="background-color:#6366f1;border-radius:10px;">
<a href="${params.ctaHref}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff !important;">${params.ctaLabel}</a>
</td></tr></table>
</td></tr>
${expiryRow}
<tr><td style="padding:20px 28px 8px;background-color:#ffffff;"><table width="100%"><tr><td style="height:1px;background:#e4e4e7;font-size:0;">&nbsp;</td></tr></table></td></tr>
<tr><td align="center" style="padding:8px 28px 28px;background-color:#ffffff;">
<p style="margin:0;font-size:12px;line-height:1.65;color:#a1a1aa;text-align:center;">${params.footerNote}<br />&copy; 2026 Super Reseller &middot; <a href="${RESELLER_SITE}" style="color:#4f46e5;font-weight:600;">superreseller.shop</a></p>
</td></tr>
</table></td></tr></table>
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
        pageTitle: 'Verify your email',
        title: 'Verify your email',
        body: 'Welcome to Super Reseller! Tap the button below to confirm your email and activate your reseller account.',
        ctaLabel: 'Verify email address',
        ctaHref: confirmUrl,
        footerNote: "If you didn't create a Super Reseller account, you can safely ignore this email.",
        expiryNote: 'This link expires in 24 hours.',
      });
    } else if (action === 'recovery' && confirmUrl) {
      subject = 'Reset your Super Reseller password';
      htmlContent = resellerEmailShell({
        pageTitle: 'Reset password',
        title: 'Reset your password',
        body: 'We received a request to reset your Super Reseller password. Use the button below to choose a new password.',
        ctaLabel: 'Reset password',
        ctaHref: confirmUrl,
        footerNote: "If you didn't request this, ignore this email — your password won't change.",
        expiryNote: 'This link expires in 1 hour for security.',
      });
    } else if (action === 'email_change' && confirmUrl) {
      subject = 'Confirm your new Super Reseller email';
      htmlContent = resellerEmailShell({
        pageTitle: 'Confirm email change',
        title: 'Confirm email change',
        body: 'Confirm this change to the email address on your Super Reseller account.',
        ctaLabel: 'Confirm new email',
        ctaHref: confirmUrl,
        footerNote: "If you didn't request this change, contact support immediately.",
        expiryNote: 'This link expires in 24 hours.',
      });
    } else if (emailData.token) {
      subject = `Super Reseller — your verification code`;
      htmlContent = resellerEmailShell({
        pageTitle: 'Verification code',
        title: 'Your verification code',
        body: `Enter this code on the login page: <strong style="color:#fafafa;font-size:28px;letter-spacing:6px;">${emailData.token}</strong>`,
        ctaLabel: 'Open Super Reseller',
        ctaHref: `${RESELLER_SITE}/reseller/login`,
        footerNote: 'If you did not request this code, you can ignore this email.',
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
