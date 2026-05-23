import type { SupabaseClient } from '@supabase/supabase-js';
import { parseISO } from 'date-fns';
import { addDurationToDate } from '../../src/lib/durationUtils.js';
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
  return addDurationToDate(parseISO(createdAtIso), String(productDuration || '1 month'));
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
  sent_expired: number;
  errors: number;
  emails_sent: number;
  emails_failed: number;
  whatsapp_sent: number;
  whatsapp_failed: number;
  sms_sent: number;
  sms_failed: number;
};

const SMS_NET_BD_ENDPOINT = 'https://api.sms.net.bd/sendsms';

function normalizeBdPhone(raw: string | null | undefined): string | null {
  const cleaned = String(raw || '').replace(/\D/g, '').trim();
  if (!cleaned) return null;
  if (/^8801\d{9}$/.test(cleaned)) return cleaned;
  if (/^01\d{9}$/.test(cleaned)) return `88${cleaned}`;
  if (/^1\d{9}$/.test(cleaned)) return `880${cleaned}`;
  return null;
}

function buildReminderSmsText(args: {
  key: 'd3' | 'd1' | 'exp';
  productTitle: string;
  expiresAt: Date;
  renewUrl: string;
}): string {
  const cap = 160;
  const name = args.productTitle.replace(/[\r\n]+/g, ' ').trim();
  const shortTitle = name.length > 20 ? `${name.slice(0, 20)}...` : name;
  const dateText = args.expiresAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  let text = '';
  if (args.key === 'd3') {
    text = `Vibe: ${shortTitle} ends in 3 days (${dateText}). Renew: ${args.renewUrl}`;
  } else if (args.key === 'd1') {
    text = `Vibe: ${shortTitle} ends tomorrow (${dateText}). Renew now: ${args.renewUrl}`;
  } else {
    text = `Vibe: ${shortTitle} subscription expired. Renew now: ${args.renewUrl}`;
  }
  return text.length > cap ? text.slice(0, cap) : text;
}

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

  const candidates: { row: any; key: 'd3' | 'd1' | 'exp'; expiresAt: Date; productTitle: string }[] = [];

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
    if (daysLeft !== 3 && daysLeft !== 1 && daysLeft >= 0) continue;

    const key: 'd3' | 'd1' | 'exp' = daysLeft === 3 ? 'd3' : daysLeft === 1 ? 'd1' : 'exp';
    candidates.push({ row, key, expiresAt, productTitle });
  }

  if (candidates.length === 0) {
    return {
      scanned: list.length,
      sent_d3: 0,
      sent_d1: 0,
      sent_expired: 0,
      errors: 0,
      emails_sent: 0,
      emails_failed: 0,
      whatsapp_sent: 0,
      whatsapp_failed: 0,
      sms_sent: 0,
      sms_failed: 0,
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
  let sent_expired = 0;
  let errors = 0;
  let emails_sent = 0;
  let emails_failed = 0;
  let whatsapp_sent = 0;
  let whatsapp_failed = 0;
  let sms_sent = 0;
  let sms_failed = 0;
  const smsApiKey = (process.env.SMS_NET_BD_API_KEY || process.env.SMS_API_KEY || '').trim();
  const smsBatchId = crypto.randomUUID();

  for (const c of candidates) {
    const dedupe = `${c.row.id}:${c.key}`;
    if (sentSet.has(dedupe)) continue;

    const reminderPayload =
      c.key === 'exp'
        ? {
            title: 'Subscription expired',
            body: `Your "${c.productTitle}" subscription has expired on ${c.expiresAt.toLocaleDateString('en-US')}. Renew from the store to restore access.\n\nStore: ${renewUrl}\n\nOrder ID: ${c.row.id}`,
          }
        : buildReminderFromCopy(reminderCopy, c.key, {
            productTitle: c.productTitle,
            expiresAt: c.expiresAt,
            orderId: c.row.id,
            renewUrl,
          });
    const inboxTitle = reminderPayload.title;
    const body = reminderPayload.body;

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

      const emailReminderKey: 'd3' | 'd1' = c.key === 'd3' ? 'd3' : 'd1';
      const html = buildExpiryReminderEmailHtml({
        title: inboxTitle,
        bodyPlain: body,
        renewUrl,
        reminderKey: emailReminderKey,
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

      const smsTo = normalizeBdPhone(profile?.phone ?? undefined);
      let smsStatus: ReminderChannelStatus = 'skipped_no_contact';
      let smsDetail: string | null = null;
      let smsProviderCode = 0;
      let smsProviderRequestId = '';
      if (!channelPrefs.sms_enabled) {
        smsStatus = 'skipped_admin_disabled';
      } else if (!smsApiKey) {
        smsStatus = 'skipped_no_provider';
      } else if (!smsTo) {
        smsStatus = 'skipped_no_contact';
      } else {
        try {
          const form = new URLSearchParams();
          form.set('api_key', smsApiKey);
          form.set('msg', buildReminderSmsText({ key: c.key, productTitle: c.productTitle, expiresAt: c.expiresAt, renewUrl }));
          form.set('to', smsTo);
          const smsRes = await fetch(SMS_NET_BD_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
          });
          const smsText = await smsRes.text();
          let smsJson: any = null;
          try {
            smsJson = smsText ? JSON.parse(smsText) : {};
          } catch {
            smsJson = { error: 409, msg: smsText || 'Upstream returned non-JSON response' };
          }

          smsProviderCode = Number(smsJson?.error ?? 409);
          smsProviderRequestId = String(smsJson?.data?.request_id || '');
          if (smsRes.ok && smsProviderCode === 0) {
            smsStatus = 'sent';
            sms_sent++;
          } else {
            smsStatus = 'failed';
            smsDetail = String(smsJson?.msg || `SMS provider request failed (${smsProviderCode})`);
            sms_failed++;
          }

          const { error: smsLogErr } = await supabase.from('sms_send_logs').insert({
            batch_id: smsBatchId,
            admin_id: null,
            recipient_phone: smsTo,
            message: buildReminderSmsText({ key: c.key, productTitle: c.productTitle, expiresAt: c.expiresAt, renewUrl }),
            sender_id: null,
            schedule_at: null,
            provider: 'sms.net.bd',
            provider_request_id: smsProviderRequestId,
            provider_error_code: smsProviderCode,
            provider_message: smsDetail || '',
            recipient_mode: 'unknown',
          });
          if (smsLogErr) {
            console.error('[expiry-reminders] sms log insert failed:', smsLogErr, c.row.id, smsTo);
          }
        } catch (e) {
          smsStatus = 'failed';
          smsDetail = e instanceof Error ? e.message : 'sms send failed';
          sms_failed++;
          console.error('[expiry-reminders] sms failed:', smsDetail, c.row.id, smsTo);
        }
      }

      const deliveryPayload = {
        order_id: c.row.id,
        user_id: c.row.user_id,
        reminder_key: c.key,
        product_title: c.productTitle,
        in_app_ok: true,
        email_status: emailStatus,
        email_detail: emailDetail,
        whatsapp_status: whatsappStatus,
        whatsapp_detail: whatsappDetail,
        sms_status: smsStatus,
        sms_detail: smsDetail,
      };
      let { error: auditErr } = await supabase.from('subscription_reminder_delivery_log').insert(deliveryPayload);
      if (auditErr && String(auditErr.message || '').toLowerCase().includes('sms_status')) {
        const fallbackPayload = {
          order_id: c.row.id,
          user_id: c.row.user_id,
          reminder_key: c.key,
          product_title: c.productTitle,
          in_app_ok: true,
          email_status: emailStatus,
          email_detail: emailDetail,
          whatsapp_status: whatsappStatus,
          whatsapp_detail: whatsappDetail,
        };
        const retry = await supabase.from('subscription_reminder_delivery_log').insert(fallbackPayload);
        auditErr = retry.error ?? null;
      }
      if (auditErr) {
        console.error('[expiry-reminders] delivery log insert failed:', auditErr, c.row.id, c.key);
      }
    }

    sentSet.add(dedupe);
    if (c.key === 'd3') sent_d3++;
    else if (c.key === 'd1') sent_d1++;
    else sent_expired++;
  }

  const result: SubscriptionExpiryReminderResult = {
    scanned: list.length,
    sent_d3,
    sent_d1,
    sent_expired,
    errors,
    emails_sent,
    emails_failed,
    whatsapp_sent,
    whatsapp_failed,
    sms_sent,
    sms_failed,
  };

  await maybeSendReminderFailureAlert(supabase, result);

  return result;
}
