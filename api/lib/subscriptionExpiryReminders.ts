import type { SupabaseClient } from '@supabase/supabase-js';
import { addMonths, parseISO } from 'date-fns';
import { parseDurationToMonths } from '../../src/lib/durationUtils.js';
import {
  phoneToWhatsappE164,
  sendExpiryReminderEmail,
  sendExpiryReminderWhatsApp,
} from './reminderOutbound.js';
import { parseSubscriptionReminderChannels } from '../../src/lib/subscriptionReminderChannels.js';
import {
  SUBSCRIPTION_REMINDER_COPY_KEY,
  buildReminderFromCopy,
  parseSubscriptionReminderCopyRow,
} from '../../src/lib/subscriptionReminderCopy.js';
import {
  loadReminderIntegrationsStored,
  resolveReminderOutbound,
} from './reminderIntegrationSettings.js';
import { calendarDaysUntilSubscriptionEndInZone } from './reminderCalendar.js';
import { resolveRenewUrl } from './resolveRenewUrl.js';
import { buildExpiryReminderEmailHtml } from './reminderEmailHtml.js';
import { sendChannelWithRetry } from './reminderRetry.js';
import { maybeSendReminderFailureAlert } from './reminderFailureAlerts.js';

export type ReminderChannelStatus =
  | 'sent'
  | 'failed'
  | 'skipped_admin_disabled'
  | 'skipped_no_provider'
  | 'skipped_no_contact';

export { calendarDaysUntilSubscriptionEndInZone as calendarDaysUntilSubscriptionEnd } from './reminderCalendar.js';

export function subscriptionExpiresAt(createdAtIso: string, productDuration: string | null | undefined): Date {
  const months = parseDurationToMonths(String(productDuration || '1 month'));
  return addMonths(parseISO(createdAtIso), months);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type SubscriptionExpiryReminderResult = {
  scanned: number;
  sent_d3: number;
  sent_d1: number;
  errors: number;
  emails_sent: number;
  emails_failed: number;
  whatsapp_sent: number;
  whatsapp_failed: number;
};

/**
 * Sends user_inbox rows for completed/paid orders whose subscription ends in 3 or 1 calendar days
 * (calendar days in Asia/Dhaka). Idempotent via subscription_expiry_reminders.
 */
export async function runSubscriptionExpiryReminders(
  supabase: SupabaseClient
): Promise<SubscriptionExpiryReminderResult> {
  const { data: rows, error } = await supabase
    .from('orders')
    .select(
      `
      id,
      user_id,
      created_at,
      status,
      payment_status,
      products:product_id ( title, duration )
    `
    )
    .in('status', ['completed', 'paid'])
    .order('created_at', { ascending: false })
    .limit(8000);

  if (error) throw error;

  const [{ data: chRow }, { data: copyRow }, integrationStored] = await Promise.all([
    supabase.from('system_settings').select('value').eq('key', 'subscription_reminder_channels').maybeSingle(),
    supabase.from('system_settings').select('value').eq('key', SUBSCRIPTION_REMINDER_COPY_KEY).maybeSingle(),
    loadReminderIntegrationsStored(supabase),
  ]);
  const channelPrefs = parseSubscriptionReminderChannels(chRow?.value);
  const { copy: reminderCopy, renew_url: renewUrlStored } = parseSubscriptionReminderCopyRow(copyRow?.value);
  const renewUrl = resolveRenewUrl(renewUrlStored);
  const outbound = resolveReminderOutbound(integrationStored);

  const list = (rows || []) as any[];
  const now = new Date();

  const candidates: { row: any; key: 'd3' | 'd1'; expiresAt: Date; productTitle: string }[] = [];

  for (const row of list) {
    const duration = row.products?.duration as string | undefined;
    const productTitle = (row.products?.title as string) || 'Subscription';
    if (!row.user_id || !row.created_at) continue;

    let expiresAt: Date;
    try {
      expiresAt = subscriptionExpiresAt(row.created_at, duration);
    } catch {
      continue;
    }

    const daysLeft = calendarDaysUntilSubscriptionEndInZone(expiresAt, now);
    if (daysLeft !== 3 && daysLeft !== 1) continue;

    const key: 'd3' | 'd1' = daysLeft === 3 ? 'd3' : 'd1';
    candidates.push({ row, key, expiresAt, productTitle });
  }

  if (candidates.length === 0) {
    return {
      scanned: list.length,
      sent_d3: 0,
      sent_d1: 0,
      errors: 0,
      emails_sent: 0,
      emails_failed: 0,
      whatsapp_sent: 0,
      whatsapp_failed: 0,
    };
  }

  const userIds = [...new Set(candidates.map((c) => c.row.user_id as string))];
  const { data: profiles } = await supabase.from('users').select('id, email, phone').in('id', userIds);
  const byUser = new Map((profiles || []).map((p: { id: string; email?: string | null; phone?: string | null }) => [p.id, p]));

  const orderIds = [...new Set(candidates.map((c) => c.row.id as string))];
  const sentSet = new Set<string>();
  for (const part of chunk(orderIds, 400)) {
    const { data: logs, error: logErr } = await supabase
      .from('subscription_expiry_reminders')
      .select('order_id, reminder_key')
      .in('order_id', part);
    if (logErr) {
      console.error('[expiry-reminders] batch log fetch:', logErr);
      continue;
    }
    for (const l of logs || []) {
      sentSet.add(`${(l as any).order_id}:${(l as any).reminder_key}`);
    }
  }

  let sent_d3 = 0;
  let sent_d1 = 0;
  let errors = 0;
  let emails_sent = 0;
  let emails_failed = 0;
  let whatsapp_sent = 0;
  let whatsapp_failed = 0;

  for (const c of candidates) {
    const dedupe = `${c.row.id}:${c.key}`;
    if (sentSet.has(dedupe)) continue;

    const { title: inboxTitle, body } = buildReminderFromCopy(reminderCopy, c.key, {
      productTitle: c.productTitle,
      expiresAt: c.expiresAt,
      orderId: c.row.id,
      renewUrl,
    });

    const { error: insInbox } = await supabase.from('user_inbox').insert({
      user_id: c.row.user_id,
      title: inboxTitle,
      body,
      created_by: null,
    });

    if (insInbox) {
      console.error('[expiry-reminders] user_inbox insert failed:', insInbox, c.row.id);
      errors++;
      continue;
    }

    const { error: logIns } = await supabase.from('subscription_expiry_reminders').insert({
      order_id: c.row.id,
      reminder_key: c.key,
    });

    if (logIns) {
      console.error('[expiry-reminders] log insert failed:', logIns, c.row.id);
      errors++;
    } else {
      const profile = byUser.get(c.row.user_id as string);
      const emailTo = profile?.email?.trim();

      const html = buildExpiryReminderEmailHtml({
        title: inboxTitle,
        bodyPlain: body,
        renewUrl,
        reminderKey: c.key,
        orderId: c.row.id,
      });

      let emailStatus: ReminderChannelStatus = 'skipped_no_contact';
      let emailDetail: string | null = null;
      if (!channelPrefs.email_enabled) {
        emailStatus = 'skipped_admin_disabled';
      } else if (!emailTo) {
        emailStatus = 'skipped_no_contact';
      } else {
        const er = await sendChannelWithRetry(() =>
          sendExpiryReminderEmail({
            to: emailTo,
            subject: inboxTitle,
            text: body,
            html,
            resend: outbound.resend,
          }),
        );
        if (er.skipped) {
          emailStatus = 'skipped_no_provider';
        } else if (er.ok) {
          emailStatus = 'sent';
          emails_sent++;
        } else {
          emailStatus = 'failed';
          emailDetail = er.error || 'unknown';
          emails_failed++;
          console.error('[expiry-reminders] email failed:', er.error, c.row.id);
        }
      }

      const waTo = phoneToWhatsappE164(profile?.phone ?? undefined);
      let whatsappStatus: ReminderChannelStatus = 'skipped_no_contact';
      let whatsappDetail: string | null = null;
      if (!channelPrefs.whatsapp_enabled) {
        whatsappStatus = 'skipped_admin_disabled';
      } else if (!waTo) {
        whatsappStatus = 'skipped_no_contact';
      } else {
        const wr = await sendChannelWithRetry(() =>
          sendExpiryReminderWhatsApp({
            toE164: waTo,
            text: `${inboxTitle}\n\n${body}`,
            wa: outbound.whatsapp,
          }),
        );
        if (wr.skipped) {
          whatsappStatus = 'skipped_no_provider';
        } else if (wr.ok) {
          whatsappStatus = 'sent';
          whatsapp_sent++;
        } else {
          whatsappStatus = 'failed';
          whatsappDetail = wr.error || 'unknown';
          whatsapp_failed++;
          console.error('[expiry-reminders] whatsapp failed:', wr.error, c.row.id, waTo);
        }
      }

      const { error: auditErr } = await supabase.from('subscription_reminder_delivery_log').insert({
        order_id: c.row.id,
        user_id: c.row.user_id,
        reminder_key: c.key,
        product_title: c.productTitle,
        in_app_ok: true,
        email_status: emailStatus,
        email_detail: emailDetail,
        whatsapp_status: whatsappStatus,
        whatsapp_detail: whatsappDetail,
      });
      if (auditErr) {
        console.error('[expiry-reminders] delivery log insert failed:', auditErr, c.row.id);
      }
    }

    sentSet.add(dedupe);
    if (c.key === 'd3') sent_d3++;
    else sent_d1++;
  }

  const result: SubscriptionExpiryReminderResult = {
    scanned: list.length,
    sent_d3,
    sent_d1,
    errors,
    emails_sent,
    emails_failed,
    whatsapp_sent,
    whatsapp_failed,
  };

  await maybeSendReminderFailureAlert(supabase, result);

  return result;
}
