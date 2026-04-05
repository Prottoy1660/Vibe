import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SUBSCRIPTION_REMINDER_COPY_KEY,
  buildReminderFromCopy,
  parseSubscriptionReminderCopyRow,
  previewSampleArgs,
  DEFAULT_REMINDER_DATE_LOCALE,
} from '../../src/lib/subscriptionReminderCopy.js';
import { resolveRenewUrl } from './resolveRenewUrl.js';
import { loadReminderIntegrationsStored, resolveReminderOutbound } from './reminderIntegrationSettings.js';
import {
  phoneToWhatsappE164,
  sendExpiryReminderEmail,
  sendExpiryReminderWhatsApp,
  type ChannelSendResult,
} from './reminderOutbound.js';
import { buildExpiryReminderEmailHtml } from './reminderEmailHtml.js';

export type TestSendResult = {
  email?: ChannelSendResult & { skipped_reason?: string };
  whatsapp?: ChannelSendResult & { skipped_reason?: string };
  /** Where the test was actually sent (admin-only response). */
  recipients?: { email: string | null; whatsapp_e164: string | null };
};

function isValidTestEmail(s: string): boolean {
  const t = s.trim();
  if (t.length < 5 || t.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export async function sendSubscriptionReminderTestToAdmin(
  supabase: SupabaseClient,
  adminUserId: string,
  opts: {
    send_email?: boolean;
    send_whatsapp?: boolean;
    /** If set and valid, test email goes here instead of profile email */
    test_email?: string | null | undefined;
    /** If set, parsed as BD-style mobile; else profile phone */
    test_whatsapp_phone?: string | null | undefined;
  },
): Promise<TestSendResult> {
  const sendEmail = opts.send_email !== false;
  const sendWa = opts.send_whatsapp !== false;

  const overrideEmail = typeof opts.test_email === 'string' ? opts.test_email.trim() : '';
  if (overrideEmail && !isValidTestEmail(overrideEmail)) {
    throw new Error('Invalid test_email address');
  }

  const { data: profile, error: pErr } = await supabase
    .from('users')
    .select('email, phone')
    .eq('id', adminUserId)
    .maybeSingle();
  if (pErr) throw pErr;

  const { data: copyRow } = await supabase.from('system_settings').select('value').eq('key', SUBSCRIPTION_REMINDER_COPY_KEY).maybeSingle();
  const { copy, renew_url } = parseSubscriptionReminderCopyRow(copyRow?.value);
  const renewUrl = resolveRenewUrl(renew_url);
  const sample = previewSampleArgs();
  const { title, body } = buildReminderFromCopy(copy, 'd3', {
    ...sample,
    renewUrl,
    dateLocale: DEFAULT_REMINDER_DATE_LOCALE,
  });

  const integrationStored = await loadReminderIntegrationsStored(supabase);
  const outbound = resolveReminderOutbound(integrationStored);

  const out: TestSendResult = { recipients: { email: null, whatsapp_e164: null } };
  const html = buildExpiryReminderEmailHtml({
    title,
    bodyPlain: body,
    renewUrl,
    reminderKey: 'd3',
    orderId: sample.orderId,
  });

  if (sendEmail) {
    const to = overrideEmail || profile?.email?.trim() || '';
    out.recipients!.email = to || null;
    if (!to) {
      out.email = { ok: false, skipped: true, skipped_reason: 'no_email_entered_or_on_profile' };
    } else {
      out.email = await sendExpiryReminderEmail({
        to,
        subject: `[TEST] ${title}`,
        text: `[TEST — not a real expiry reminder]\n\n${body}`,
        html,
        resend: outbound.resend,
      });
    }
  }

  if (sendWa) {
    const rawOverride =
      typeof opts.test_whatsapp_phone === 'string' ? opts.test_whatsapp_phone.trim() : '';
    const waTo = rawOverride
      ? phoneToWhatsappE164(rawOverride)
      : phoneToWhatsappE164(profile?.phone ?? undefined);
    out.recipients!.whatsapp_e164 = waTo;
    if (!waTo) {
      out.whatsapp = {
        ok: false,
        skipped: true,
        skipped_reason: rawOverride ? 'invalid_test_whatsapp_phone' : 'no_phone_on_profile',
      };
    } else {
      out.whatsapp = await sendExpiryReminderWhatsApp({
        toE164: waTo,
        text: `[TEST]\n${title}\n\n${body}`,
        wa: outbound.whatsapp,
      });
    }
  }

  return out;
}
