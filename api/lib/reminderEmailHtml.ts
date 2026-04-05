function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Safe attribute href from user/store URL */
function safeHref(url: string): string {
  const t = url.trim();
  if (!t) return '#';
  try {
    const u = new URL(t.startsWith('http') ? t : `https://${t}`);
    return escapeHtml(u.href);
  } catch {
    return '#';
  }
}

function bodyPlainToParagraphs(plain: string): string {
  return plain
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (!t) return '';
      return `<p style="margin:0 0 16px;line-height:1.65;color:#334155;font-size:15px;">${escapeHtml(t)}</p>`;
    })
    .join('');
}

/** Drop lines that duplicate the CTA or footer chips in the HTML version */
function filterPlainForHtmlBody(bodyPlain: string, renewUrl: string, orderId?: string): string {
  const ru = renewUrl.trim();
  const oid = orderId?.trim();
  const lines = bodyPlain.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      out.push('');
      continue;
    }
    if (ru) {
      const lower = t.toLowerCase();
      if (lower.startsWith('store:') && t.includes(ru)) continue;
      if (t === ru || t === `Store: ${ru}` || t === `Renew: ${ru}`) continue;
    }
    if (oid) {
      const lower = t.toLowerCase();
      if (lower.startsWith('order id:')) {
        const rest = t.slice(t.indexOf(':') + 1).trim();
        if (rest === oid) continue;
      }
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function badgeForKey(key: 'd3' | 'd1' | undefined): string {
  if (key === 'd1') {
    return '<span style="display:inline-block;padding:6px 12px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;background:rgba(255,255,255,0.2);color:#fef3c7;border:1px solid rgba(255,255,255,0.35);">Ends tomorrow</span>';
  }
  if (key === 'd3') {
    return '<span style="display:inline-block;padding:6px 12px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;background:rgba(255,255,255,0.2);color:#e0e7ff;border:1px solid rgba(255,255,255,0.35);">3 days left</span>';
  }
  return '';
}

/**
 * Branded HTML for subscription expiry reminders — matches app indigo / soft-card styling.
 */
export function buildExpiryReminderEmailHtml(args: {
  title: string;
  bodyPlain: string;
  renewUrl: string;
  brandName?: string;
  reminderKey?: 'd3' | 'd1';
  orderId?: string;
}): string {
  const brandRaw = args.brandName?.trim() || process.env.REMINDER_EMAIL_BRAND_NAME?.trim() || 'Vibe';
  const brand = escapeHtml(brandRaw);
  const renew = args.renewUrl.trim();
  const href = safeHref(renew);
  const filteredBody = filterPlainForHtmlBody(args.bodyPlain, renew, args.orderId);
  const paragraphs = bodyPlainToParagraphs(filteredBody);
  const preheader = escapeHtml(
    args.title.length > 90 ? `${args.title.slice(0, 87)}…` : args.title,
  );
  const badge = badgeForKey(args.reminderKey);
  const orderChip =
    args.orderId && args.orderId.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;width:100%;"><tr><td style="padding:14px 16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;"><p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Order reference</p><p style="margin:0;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:13px;color:#0f172a;word-break:break-all;">${escapeHtml(args.orderId)}</p></td></tr></table>`
      : '';

  const ctaBlock = renew
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
        <tr>
          <td style="border-radius:12px;background:linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#7c3aed 100%);box-shadow:0 10px 25px -5px rgba(79,70,229,0.45);">
            <a href="${href}" style="display:inline-block;padding:16px 32px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Renew in store</a>
          </td>
        </tr>
      </table>
      <p style="margin:12px 0 0;font-size:13px;color:#64748b;word-break:break-all;">
        Or open: <a href="${href}" style="color:#4f46e5;font-weight:600;">${escapeHtml(renew.length > 56 ? `${renew.slice(0, 53)}…` : renew)}</a>
      </p>`
    : `<p style="margin:24px 0 0;font-size:14px;color:#64748b;">Add <strong style="color:#334155;">REMINDER_STORE_URL</strong> or a store URL in admin to enable the renew button.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta http-equiv="x-ua-compatible" content="ie=edge"/>
  <title>${escapeHtml(args.title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2ff;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#eef2ff 0%,#f8fafc 45%,#f1f5f9 100%);padding:40px 16px 48px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;">
          <tr>
            <td style="border-radius:20px 20px 0 0;overflow:hidden;background:linear-gradient(135deg,#4f46e5 0%,#6366f1 42%,#7c3aed 100%);padding:32px 28px 28px;box-shadow:0 4px 6px -1px rgba(79,70,229,0.2);">
              ${badge ? `<div style="margin-bottom:16px;">${badge}</div>` : ''}
              <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);">${brand}</p>
              <h1 style="margin:0;font-size:24px;font-weight:800;line-height:1.25;color:#ffffff;letter-spacing:-0.02em;">${escapeHtml(args.title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 4px 4px;border-radius:0 0 20px 20px;box-shadow:0 25px 50px -12px rgba(15,23,42,0.12);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:0 0 16px 16px;background:#ffffff;">
                <tr>
                  <td style="padding:28px 28px 8px;">
                    ${paragraphs}
                    ${ctaBlock}
                    ${orderChip}
                    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #f1f5f9;font-size:12px;line-height:1.5;color:#94a3b8;">
                      You are receiving this because you have an active subscription with us. If you already renewed, you can ignore this reminder.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 16px 0;font-size:11px;color:#94a3b8;">
              <span style="color:#cbd5e1;">This message was sent automatically.</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
