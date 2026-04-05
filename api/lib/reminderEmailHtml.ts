function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bodyPlainToParagraphs(plain: string): string {
  return plain
    .split('\n')
    .map((line) => {
      const t = line.trim();
      return t ? `<p style="margin:0 0 14px;line-height:1.55;color:#334155;">${escapeHtml(t)}</p>` : '';
    })
    .join('');
}

export function buildExpiryReminderEmailHtml(args: {
  title: string;
  bodyPlain: string;
  renewUrl: string;
  brandName?: string;
}): string {
  const brand = escapeHtml(args.brandName?.trim() || process.env.REMINDER_EMAIL_BRAND_NAME?.trim() || 'Subscription');
  const renew = args.renewUrl.trim();
  const cta = renew
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:10px;background:#4f46e5;"><a href="${escapeHtml(renew)}" style="display:inline-block;padding:14px 28px;font-family:system-ui,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Renew or visit store</a></td></tr></table>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
        <tr><td style="padding:28px 28px 8px;font-size:13px;font-weight:600;color:#6366f1;letter-spacing:0.02em;">${brand}</td></tr>
        <tr><td style="padding:8px 28px 4px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">${escapeHtml(args.title)}</td></tr>
        <tr><td style="padding:16px 28px 28px;font-size:15px;">${bodyPlainToParagraphs(args.bodyPlain)}${cta}
          <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">You are receiving this because you have an active subscription with us.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
