import type { SupabaseClient } from '@supabase/supabase-js';

export const SUBSCRIPTION_REMINDER_OPS_KEY = 'subscription_reminder_ops';

type OpsValue = { last_failure_alert_at?: string | null };

const DEFAULT_COOLDOWN_HOURS = 24;

function parseThreshold(): number {
  const n = Number(process.env.REMINDER_ALERT_FAILURE_THRESHOLD?.trim());
  if (Number.isFinite(n) && n >= 1) return Math.min(500, Math.floor(n));
  return 3;
}

function parseCooldownHours(): number {
  const n = Number(process.env.REMINDER_ALERT_COOLDOWN_HOURS?.trim());
  if (Number.isFinite(n) && n >= 1) return Math.min(168, Math.floor(n));
  return DEFAULT_COOLDOWN_HOURS;
}

async function loadOps(supabase: SupabaseClient): Promise<OpsValue> {
  const { data } = await supabase.from('system_settings').select('value').eq('key', SUBSCRIPTION_REMINDER_OPS_KEY).maybeSingle();
  const v = data?.value;
  if (!v || typeof v !== 'object') return {};
  return v as OpsValue;
}

async function saveOps(supabase: SupabaseClient, next: OpsValue) {
  await supabase.from('system_settings').upsert(
    {
      key: SUBSCRIPTION_REMINDER_OPS_KEY,
      value: next as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
}

async function postSlack(webhookUrl: string, text: string) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch(() => {});
}

async function sendOpsEmail(to: string, subject: string, text: string, resendKey: string, from: string) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  }).catch(() => {});
}

/**
 * If outbound failures in this run exceed threshold, notify via Slack webhook and/or ops email (once per cooldown).
 */
export async function maybeSendReminderFailureAlert(
  supabase: SupabaseClient,
  stats: {
    emails_failed: number;
    whatsapp_failed: number;
    errors: number;
    emails_sent: number;
    whatsapp_sent: number;
    sent_d3: number;
    sent_d1: number;
    scanned: number;
  },
): Promise<void> {
  const failures = stats.emails_failed + stats.whatsapp_failed + stats.errors;
  const threshold = parseThreshold();
  if (failures < threshold) return;

  const webhook = process.env.REMINDER_ALERT_SLACK_WEBHOOK_URL?.trim();
  const opsEmail = process.env.REMINDER_OPS_ALERT_EMAIL?.trim();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.REMINDER_FROM_EMAIL?.trim();
  if (!webhook && !(opsEmail && resendKey && from)) {
    console.warn('[expiry-reminders] failures >= threshold but no REMINDER_ALERT_* / ops email configured');
    return;
  }

  const ops = await loadOps(supabase);
  const last = ops.last_failure_alert_at ? new Date(ops.last_failure_alert_at).getTime() : 0;
  const cooldownMs = parseCooldownHours() * 3600_000;
  if (last && Date.now() - last < cooldownMs) return;

  const lines = [
    `Subscription reminder job: ${failures} failure(s) (threshold ${threshold})`,
    `emails_failed=${stats.emails_failed}, whatsapp_failed=${stats.whatsapp_failed}, inbox/errors=${stats.errors}`,
    `sent: d3+d1=${stats.sent_d3 + stats.sent_d1}, emails_ok=${stats.emails_sent}, wa_ok=${stats.whatsapp_sent}, scanned_orders=${stats.scanned}`,
    `time=${new Date().toISOString()}`,
  ];
  const text = lines.join('\n');

  if (webhook) await postSlack(webhook, text);
  if (opsEmail && resendKey && from) {
    await sendOpsEmail(opsEmail, '[Vibe] Subscription reminder failures', text, resendKey, from);
  }

  await saveOps(supabase, { ...ops, last_failure_alert_at: new Date().toISOString() });
}
