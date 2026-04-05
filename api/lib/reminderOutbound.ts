/**
 * Optional outbound channels for subscription expiry reminders (email + WhatsApp).
 * Credentials: env vars and/or admin-saved system_settings (env wins when set).
 */

import type { ResolvedReminderOutbound } from './reminderIntegrationSettings.js';

/** Bangladesh / common formats → E.164 digits only (no +), e.g. 8801712345678 */
export function phoneToWhatsappE164(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const d = raw.replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('880')) return d;
  if (d.length === 11 && d.startsWith('0')) return `880${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('1')) return `880${d}`;
  if (d.length === 13 && d.startsWith('880')) return d;
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}

export type ChannelSendResult = { ok: boolean; skipped?: boolean; error?: string };

/** Resend REST API — credentials from resolveReminderOutbound(). */
export async function sendExpiryReminderEmail(args: {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML body (Resend sends multipart/alternative with text). */
  html?: string;
  resend: ResolvedReminderOutbound['resend'];
}): Promise<ChannelSendResult> {
  const key = args.resend.apiKey;
  const from = args.resend.from;
  if (!key || !from) {
    return { ok: false, skipped: true };
  }
  try {
    const payload: Record<string, unknown> = {
      from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
    };
    if (args.html?.trim()) payload.html = args.html.trim();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      return { ok: false, error: json?.message || `Resend HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'email send failed' };
  }
}

type WhatsAppPayload = Record<string, unknown>;

/**
 * Meta WhatsApp Cloud API.
 * - If templateName is set: sends approved template (typical for production).
 *   Template should have one body variable {{1}} for the reminder text.
 * - Else: sends type "text" (only works inside 24h customer service window for that user).
 */
export async function sendExpiryReminderWhatsApp(args: {
  toE164: string;
  text: string;
  wa: ResolvedReminderOutbound['whatsapp'];
}): Promise<ChannelSendResult> {
  const token = args.wa.token;
  const phoneNumberId = args.wa.phoneNumberId;
  if (!token || !phoneNumberId) {
    return { ok: false, skipped: true };
  }

  const version = args.wa.version;
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

  const templateName = args.wa.templateName;
  const templateLang = args.wa.templateLang;

  let body: WhatsAppPayload;
  if (templateName) {
    const paramText = args.text.slice(0, 1020);
    body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: args.toE164,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLang },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: paramText }],
          },
        ],
      },
    };
  } else {
    body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: args.toE164,
      type: 'text',
      text: {
        preview_url: false,
        body: args.text.slice(0, 4090),
      },
    };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (!res.ok) {
      const msg = json?.error?.message || `WhatsApp HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'whatsapp send failed' };
  }
}
