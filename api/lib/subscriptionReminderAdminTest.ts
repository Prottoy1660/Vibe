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
};

export async function sendSubscriptionReminderTestToAdmin(
  supabase: SupabaseClient,
  adminUserId: string,
  opts: { send_email?: boolean; send_whatsapp?: boolean },
): Promise<TestSendResult> {
  const sendEmail = opts.send_email !== false;
  const sendWa = opts.send_whatsapp !== false;

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

  const out: TestSendResult = {};
  const html = buildExpiryReminderEmailHtml({
    title,
    bodyPlain: body,
    renewUrl,
    reminderKey: 'd3',
    orderId: sample.orderId,
  });

  if (sendEmail) {
    const to = profile?.email?.trim();
    if (!to) {
      out.email = { ok: false, skipped: true, skipped_reason: 'no_email_on_profile' };
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
    const waTo = phoneToWhatsappE164(profile?.phone ?? undefined);
    if (!waTo) {
      out.whatsapp = { ok: false, skipped: true, skipped_reason: 'no_phone_on_profile' };
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
