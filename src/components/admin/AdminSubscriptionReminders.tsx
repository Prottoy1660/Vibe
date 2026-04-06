import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  parseSubscriptionReminderChannels,
  type SubscriptionReminderChannels,
} from '../../lib/subscriptionReminderChannels';
import {
  SUBSCRIPTION_REMINDER_COPY_KEY,
  DEFAULT_SUBSCRIPTION_REMINDER_COPY,
  DEFAULT_REMINDER_DATE_LOCALE,
  buildReminderFromCopy,
  parseSubscriptionReminderCopyRow,
  type SubscriptionReminderCopy,
  previewSampleArgs,
} from '../../lib/subscriptionReminderCopy';
import { getApiBaseUrl } from '../../lib/apiBase';
import { BellRing, Loader2, Mail, MessageCircle, RefreshCw, Smartphone, Eye, Play, Send } from 'lucide-react';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';

const BD_TZ = 'Asia/Dhaka';

function formatLogWhen(iso: string): string {
  return formatInTimeZone(parseISO(iso), BD_TZ, 'MMM d, h:mm a');
}

function ReminderSwitch({
  checked,
  onChange,
  label,
  hideLabel,
  variant = 'amber',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** If true, only the switch is shown (use for cards that already show a title). */
  hideLabel?: boolean;
  variant?: 'amber' | 'indigo' | 'emerald';
}) {
  const onBg =
    variant === 'indigo'
      ? 'bg-indigo-600'
      : variant === 'emerald'
        ? 'bg-emerald-600'
        : 'bg-amber-600';
  const ring =
    variant === 'indigo'
      ? 'focus-visible:ring-indigo-500/50'
      : variant === 'emerald'
        ? 'focus-visible:ring-emerald-500/50'
        : 'focus-visible:ring-amber-500/50';
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#151518] ${ring} ${
          checked ? onBg : 'bg-gray-300 dark:bg-zinc-600'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      {hideLabel ? null : (
        <span className="whitespace-nowrap text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
      )}
    </div>
  );
}

function apiUrl(path: string) {
  const b = getApiBaseUrl().replace(/\/$/, '');
  return b ? `${b}${path}` : path;
}

async function adminFetch(path: string, method: string = 'GET', body?: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(apiUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || json?.message || 'Request failed');
  return json;
}

type IntegrationSettingsPayload = {
  reminder_from_email: string;
  whatsapp_phone_number_id: string;
  whatsapp_api_version: string;
  whatsapp_expiry_template_name: string;
  whatsapp_expiry_template_lang: string;
  has_resend_key: boolean;
  has_whatsapp_token: boolean;
  resend_key_hint: string | null;
  whatsapp_token_hint: string | null;
  env_resend_key: boolean;
  env_reminder_from: boolean;
  env_whatsapp_token: boolean;
  env_whatsapp_phone_id: boolean;
  effective: { resend_ready: boolean; whatsapp_ready: boolean };
};

type DeliveryRow = {
  id: string;
  order_id: string;
  user_id: string | null;
  reminder_key: string;
  product_title: string | null;
  in_app_ok: boolean;
  email_status: string;
  email_detail: string | null;
  whatsapp_status: string;
  whatsapp_detail: string | null;
  created_at: string;
  users?: { name: string | null; email: string | null; phone: string | null } | null;
};

function normalizeDeliveryRows(raw: unknown): DeliveryRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as Record<string, unknown> & { users?: unknown };
    const u = r.users;
    const users: DeliveryRow['users'] =
      u == null ? null : Array.isArray(u) ? (u[0] as DeliveryRow['users']) ?? null : (u as DeliveryRow['users']);
    return { ...(r as unknown as Omit<DeliveryRow, 'users'>), users };
  });
}

function statusLabel(code: string): string {
  switch (code) {
    case 'sent':
      return 'Sent';
    case 'failed':
      return 'Failed';
    case 'skipped_admin_disabled':
      return 'Off (admin)';
    case 'skipped_no_provider':
      return 'Not configured';
    case 'skipped_no_contact':
      return 'No contact';
    default:
      return code;
  }
}

function statusClass(code: string): string {
  if (code === 'sent') return 'text-emerald-600 dark:text-emerald-400';
  if (code === 'failed') return 'text-red-600 dark:text-red-400';
  return 'text-amber-600 dark:text-amber-400';
}

export const AdminSubscriptionReminders = () => {
  const { confirm: confirmAction } = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [savingChannels, setSavingChannels] = useState(false);
  const [savingCopy, setSavingCopy] = useState(false);
  const [savingIntegrations, setSavingIntegrations] = useState(false);
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [form, setForm] = useState<SubscriptionReminderChannels>({
    email_enabled: true,
    whatsapp_enabled: true,
  });
  const [copyForm, setCopyForm] = useState<SubscriptionReminderCopy>(() => ({ ...DEFAULT_SUBSCRIPTION_REMINDER_COPY }));
  const [renewUrlField, setRenewUrlField] = useState('');
  const [integration, setIntegration] = useState<IntegrationSettingsPayload | null>(null);
  const [reminderFromEmail, setReminderFromEmail] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [waToken, setWaToken] = useState('');
  const [waPhoneId, setWaPhoneId] = useState('');
  const [waApiVersion, setWaApiVersion] = useState('');
  const [waTemplateName, setWaTemplateName] = useState('');
  const [waTemplateLang, setWaTemplateLang] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [runningJob, setRunningJob] = useState(false);
  const [runningTest, setRunningTest] = useState(false);
  const [testSendEmail, setTestSendEmail] = useState(true);
  const [testSendWhatsapp, setTestSendWhatsapp] = useState(true);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testWhatsappTo, setTestWhatsappTo] = useState('');

  const sample = useMemo(() => previewSampleArgs(), []);
  const previewRenewUrl = useMemo(() => {
    const t = renewUrlField.trim();
    if (t) return t;
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
    return '';
  }, [renewUrlField]);

  const previewD3 = useMemo(
    () =>
      buildReminderFromCopy(copyForm, 'd3', {
        ...sample,
        renewUrl: previewRenewUrl,
        dateLocale: DEFAULT_REMINDER_DATE_LOCALE,
      }),
    [copyForm, sample, previewRenewUrl],
  );
  const previewD1 = useMemo(
    () =>
      buildReminderFromCopy(copyForm, 'd1', {
        ...sample,
        renewUrl: previewRenewUrl,
        dateLocale: DEFAULT_REMINDER_DATE_LOCALE,
      }),
    [copyForm, sample, previewRenewUrl],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const [settings, copyRow, log, intJson] = await Promise.all([
        supabase.from('system_settings').select('value').eq('key', 'subscription_reminder_channels').maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', SUBSCRIPTION_REMINDER_COPY_KEY).maybeSingle(),
        supabase
          .from('subscription_reminder_delivery_log')
          .select(
            `
            id, order_id, user_id, reminder_key, product_title, in_app_ok,
            email_status, email_detail, whatsapp_status, whatsapp_detail, created_at,
            users:user_id (name, email, phone)
          `,
          )
          .order('created_at', { ascending: false })
          .limit(300),
        adminFetch('/api/admin/ops/subscription-reminder/integrations', 'GET').catch(() => null),
      ]);
      if (settings.error) throw settings.error;
      setForm(parseSubscriptionReminderChannels(settings.data?.value));

      if (copyRow.error) throw copyRow.error;
      const parsedCopy = parseSubscriptionReminderCopyRow(copyRow.data?.value);
      setCopyForm(parsedCopy.copy);
      setRenewUrlField(parsedCopy.renew_url || '');

      if (log.error) throw log.error;
      setRows(normalizeDeliveryRows(log.data));

      const emptyIntegration: IntegrationSettingsPayload = {
        reminder_from_email: '',
        whatsapp_phone_number_id: '',
        whatsapp_api_version: '',
        whatsapp_expiry_template_name: '',
        whatsapp_expiry_template_lang: '',
        has_resend_key: false,
        has_whatsapp_token: false,
        resend_key_hint: null,
        whatsapp_token_hint: null,
        env_resend_key: false,
        env_reminder_from: false,
        env_whatsapp_token: false,
        env_whatsapp_phone_id: false,
        effective: { resend_ready: false, whatsapp_ready: false },
      };
      if (intJson?.settings) {
        const s = intJson.settings as IntegrationSettingsPayload;
        setIntegration(s);
        setReminderFromEmail(s.reminder_from_email || '');
        setWaPhoneId(s.whatsapp_phone_number_id || '');
        setWaApiVersion(s.whatsapp_api_version || '');
        setWaTemplateName(s.whatsapp_expiry_template_name || '');
        setWaTemplateLang(s.whatsapp_expiry_template_lang || '');
        setResendApiKey('');
        setWaToken('');
      } else {
        setIntegration(emptyIntegration);
      }
    } catch (e: unknown) {
      console.error(e);
      setMsg({
        type: 'err',
        text: e instanceof Error ? e.message : 'Could not load. Apply migrations 060–061 if tables or keys are missing.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveChannels = async () => {
    setSavingChannels(true);
    setMsg(null);
    try {
      const value = {
        email_enabled: form.email_enabled,
        whatsapp_enabled: form.whatsapp_enabled,
      };
      const { error } = await supabase
        .from('system_settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', 'subscription_reminder_channels');
      if (error) throw error;
      setForm(parseSubscriptionReminderChannels(value));
      setMsg({
        type: 'ok',
        text: 'Channel toggles saved.',
      });
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSavingChannels(false);
    }
  };

  const saveCopy = async () => {
    setSavingCopy(true);
    setMsg(null);
    try {
      const value: Record<string, unknown> = {
        d3_title: copyForm.d3_title,
        d3_body: copyForm.d3_body,
        d1_title: copyForm.d1_title,
        d1_body: copyForm.d1_body,
        renew_url: renewUrlField.trim() || null,
      };
      const { error } = await supabase.from('system_settings').upsert(
        {
          key: SUBSCRIPTION_REMINDER_COPY_KEY,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );
      if (error) throw error;
      const again = parseSubscriptionReminderCopyRow(value);
      setCopyForm(again.copy);
      setRenewUrlField(again.renew_url || '');
      setMsg({ type: 'ok', text: 'Message templates saved. Next cron run uses this text for inbox, email, and WhatsApp.' });
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSavingCopy(false);
    }
  };

  const saveIntegrations = async () => {
    setSavingIntegrations(true);
    setMsg(null);
    try {
      const patch: Record<string, unknown> = {
        reminder_from_email: reminderFromEmail,
        whatsapp_phone_number_id: waPhoneId,
        whatsapp_api_version: waApiVersion,
        whatsapp_expiry_template_name: waTemplateName,
        whatsapp_expiry_template_lang: waTemplateLang,
      };
      if (resendApiKey.trim()) patch.resend_api_key = resendApiKey.trim();
      if (waToken.trim()) patch.whatsapp_cloud_token = waToken.trim();

      const data = await adminFetch('/api/admin/ops/subscription-reminder/integrations', 'PATCH', patch);
      const s = data.settings as IntegrationSettingsPayload;
      setIntegration(s);
      setResendApiKey('');
      setWaToken('');
      setMsg({
        type: 'ok',
        text: 'API settings saved. If the server .env already defines the same keys, those still take priority.',
      });
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSavingIntegrations(false);
    }
  };

  const clearStoredKeys = async () => {
    const ok = await confirmAction({
      title: 'Clear stored API tokens?',
      description: 'Removes Resend and WhatsApp tokens saved in the database. Server env keys are untouched.',
      confirmLabel: 'Clear tokens',
      variant: 'danger',
    });
    if (!ok) return;
    setSavingIntegrations(true);
    setMsg(null);
    try {
      const data = await adminFetch('/api/admin/ops/subscription-reminder/integrations', 'PATCH', {
        resend_api_key: '',
        whatsapp_cloud_token: '',
      });
      const s = data.settings as IntegrationSettingsPayload;
      setIntegration(s);
      setMsg({ type: 'ok', text: 'Stored secret keys cleared.' });
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Failed' });
    } finally {
      setSavingIntegrations(false);
    }
  };

  const runJobNow = async () => {
    const ok = await confirmAction({
      title: 'Run reminder job now?',
      description:
        'Runs the full subscription expiry reminder job. Real customers may receive inbox, email, or WhatsApp if they match d3/d1 rules.',
      confirmLabel: 'Run job',
    });
    if (!ok) return;
    setRunningJob(true);
    setMsg(null);
    try {
      const j = await adminFetch('/api/admin/ops/subscription-reminder/run', 'POST');
      setMsg({
        type: 'ok',
        text: `Job finished. Inbox reminders queued: d3=${j.sent_d3 ?? 0}, d1=${j.sent_d1 ?? 0}. Email OK=${j.emails_sent ?? 0}, WA OK=${j.whatsapp_sent ?? 0}. Failures: email=${j.emails_failed ?? 0}, WA=${j.whatsapp_failed ?? 0}, inbox errors=${j.errors ?? 0}.`,
      });
      void load();
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Run failed' });
    } finally {
      setRunningJob(false);
    }
  };

  const sendTest = async () => {
    if (!testSendEmail && !testSendWhatsapp) {
      setMsg({ type: 'err', text: 'Choose at least email or WhatsApp for the test.' });
      return;
    }
    const emailTrim = testEmailTo.trim();
    if (testSendEmail && emailTrim) {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim);
      if (!ok) {
        setMsg({ type: 'err', text: 'Enter a valid test email address, or leave it blank to use your profile email.' });
        return;
      }
    }
    setRunningTest(true);
    setMsg(null);
    try {
      const data = await adminFetch('/api/admin/ops/subscription-reminder/test', 'POST', {
        send_email: testSendEmail,
        send_whatsapp: testSendWhatsapp,
        ...(emailTrim ? { test_email: emailTrim } : {}),
        ...(testWhatsappTo.trim() ? { test_whatsapp_phone: testWhatsappTo.trim() } : {}),
      });
      const r = data.result as {
        email?: { ok?: boolean; skipped?: boolean; error?: string; skipped_reason?: string };
        whatsapp?: { ok?: boolean; skipped?: boolean; error?: string; skipped_reason?: string };
        recipients?: { email: string | null; whatsapp_e164: string | null };
      };
      const parts: string[] = [];
      if (testSendEmail) {
        const dest = r.recipients?.email ? ` → ${r.recipients.email}` : '';
        const e = r.email;
        if (!e) parts.push(`Email: (no result)${dest}`);
        else if (e.skipped) parts.push(`Email: skipped (${e.skipped_reason || e.error || 'unknown'})${dest}`);
        else parts.push(e.ok ? `Email: sent${dest}` : `Email: failed — ${e.error || 'unknown'}${dest}`);
      }
      if (testSendWhatsapp) {
        const dest = r.recipients?.whatsapp_e164 ? ` → ${r.recipients.whatsapp_e164}` : '';
        const w = r.whatsapp;
        if (!w) parts.push(`WhatsApp: (no result)${dest}`);
        else if (w.skipped) parts.push(`WhatsApp: skipped (${w.skipped_reason || w.error || 'unknown'})${dest}`);
        else parts.push(w.ok ? `WhatsApp: sent${dest}` : `WhatsApp: failed — ${w.error || 'unknown'}${dest}`);
      }
      setMsg({ type: 'ok', text: `Test: ${parts.join(' · ')}` });
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Test failed' });
    } finally {
      setRunningTest(false);
    }
  };

  return (
    <div className="w-full max-w-6xl space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-slate-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] px-4 py-4 sm:px-6 sm:py-5 md:px-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-3">
          <div className="shrink-0 rounded-xl bg-indigo-500/15 p-2.5 text-indigo-600 dark:text-indigo-400">
            <BellRing className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 md:text-2xl">Subscription expiry reminders</h2>
            <p className="mt-1.5 text-sm leading-snug text-gray-600 dark:text-gray-400">
              One place for copy, channels, and API keys. <span className="font-medium text-gray-800 dark:text-gray-200">“Days left”</span> counts by{' '}
              <span className="font-medium text-gray-800 dark:text-gray-200">Bangladesh (Asia/Dhaka)</span> calendar days.
            </p>
            <details className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              <summary className="cursor-pointer select-none text-indigo-600 hover:underline dark:text-indigo-400 [&::-webkit-details-marker]:hidden">
                How this page works
              </summary>
              <p className="mt-2 max-w-2xl border-l-2 border-gray-200 pl-3 leading-relaxed dark:border-gray-700">
                You edit the text customers see (in-app, email, WhatsApp), turn channels on/off, and can save Resend / Meta Cloud credentials here. If the same keys exist in{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">server environment variables</span>, those override the database (like other admin API keys).
              </p>
            </details>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-amber-200/50 bg-amber-50/40 p-4 shadow-sm dark:border-amber-900/30 dark:bg-amber-950/20 sm:p-5 md:p-6">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-800 dark:text-gray-200">
          <Play className="h-4 w-4 text-amber-600" />
          Run &amp; test
        </h3>
        <p className="text-xs leading-snug text-gray-600 dark:text-gray-400">
          <span className="font-medium text-gray-800 dark:text-gray-200">Run</span> = real cron job (live sends).{' '}
          <span className="font-medium text-gray-800 dark:text-gray-200">Test</span> = [TEST] to you; empty fields use your profile email/phone.
        </p>
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:gap-4">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Test email</span>
            <input
              type="email"
              value={testEmailTo}
              onChange={(e) => setTestEmailTo(e.target.value)}
              placeholder="Blank = your profile email"
              autoComplete="email"
              className="w-full rounded-lg border border-amber-200/80 bg-white px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-[#151518]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Test WhatsApp</span>
            <input
              type="tel"
              inputMode="tel"
              value={testWhatsappTo}
              onChange={(e) => setTestWhatsappTo(e.target.value)}
              placeholder="Blank = your profile phone"
              autoComplete="tel"
              className="w-full rounded-lg border border-amber-200/80 bg-white px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-[#151518]"
            />
          </label>
        </div>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          <button
            type="button"
            onClick={() => void runJobNow()}
            disabled={runningJob}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50 sm:text-sm"
          >
            {runningJob ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 shrink-0" />}
            Run job now
          </button>
          <ReminderSwitch checked={testSendEmail} onChange={setTestSendEmail} label="Email" />
          <ReminderSwitch checked={testSendWhatsapp} onChange={setTestSendWhatsapp} label="WhatsApp" />
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={runningTest}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:text-amber-200 sm:text-sm"
          >
            {runningTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 shrink-0" />}
            Send test
          </button>
        </div>
        <details className="text-xs text-gray-500 dark:text-gray-400">
          <summary className="cursor-pointer select-none text-amber-800/90 hover:underline dark:text-amber-200/90 [&::-webkit-details-marker]:hidden">
            Server: failure alerts (env vars)
          </summary>
          <p className="mt-2 max-w-3xl space-y-1 border-l-2 border-amber-200/60 pl-3 leading-relaxed dark:border-amber-900/40">
            Optional ops alerts: <code className="rounded bg-white/70 px-1 text-[10px] dark:bg-white/10">REMINDER_ALERT_FAILURE_THRESHOLD</code>{' '}
            (default 3),{' '}
            <code className="rounded bg-white/70 px-1 text-[10px] dark:bg-white/10">REMINDER_ALERT_SLACK_WEBHOOK_URL</code> and/or{' '}
            <code className="rounded bg-white/70 px-1 text-[10px] dark:bg-white/10">REMINDER_OPS_ALERT_EMAIL</code>. Cooldown:{' '}
            <code className="rounded bg-white/70 px-1 text-[10px] dark:bg-white/10">REMINDER_ALERT_COOLDOWN_HOURS</code> (default 24).
          </p>
        </details>
      </div>

      <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-[#26262d] dark:bg-[#151518] sm:p-5 md:p-6">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-800 dark:text-gray-200">
          <Eye className="h-4 w-4" />
          Customer preview
        </h3>
        <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-1 text-[11px] [scrollbar-width:thin]">
          {['{productTitle}', '{expiresDate}', '{orderId}', '{renewUrl}'].map((ph) => (
            <code
              key={ph}
              className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 font-mono text-gray-700 dark:bg-white/10 dark:text-gray-300"
            >
              {ph}
            </code>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Sample data below — live sends use each customer&apos;s values.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-[#303038] dark:bg-white/[0.02]">
            <p className="text-[11px] font-bold uppercase text-indigo-600 dark:text-indigo-400">3 days before</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{previewD3.title}</p>
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-gray-700 dark:text-gray-300">{previewD3.body}</pre>
          </div>
          <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-[#303038] dark:bg-white/[0.02]">
            <p className="text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400">1 day before</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{previewD1.title}</p>
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-gray-700 dark:text-gray-300">{previewD1.body}</pre>
          </div>
        </div>
      </div>

      <div className="space-y-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-[#26262d] dark:bg-[#151518] sm:p-5 md:p-6">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Reminder wording</h3>
          <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">Customers see this in the app, email, and WhatsApp.</p>
        </div>

        <label className="block max-w-xl space-y-1.5">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Store link</span>
          <input
            value={renewUrlField}
            onChange={(e) => setRenewUrlField(e.target.value)}
            placeholder="https://yourstore.com — used as {renewUrl}"
            title="Shown as {renewUrl} in messages and Renew button in emails"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-[#303038] dark:bg-[#1a1a1f] dark:text-gray-100"
          />
        </label>

        <details className="text-xs text-gray-500 dark:text-gray-400">
          <summary className="cursor-pointer select-none font-medium text-indigo-600 hover:underline dark:text-indigo-400 [&::-webkit-details-marker]:hidden">
            Renew button in HTML emails
          </summary>
          <p className="mt-2 max-w-xl border-l-2 border-gray-200 pl-3 leading-relaxed dark:border-gray-700">
            Uses the store link above, or server{' '}
            <code className="rounded bg-gray-100 px-1 text-[10px] dark:bg-white/10">REMINDER_STORE_URL</code> /{' '}
            <code className="rounded bg-gray-100 px-1 text-[10px] dark:bg-white/10">VITE_APP_URL</code>.
          </p>
        </details>

        <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
          <div className="space-y-3 rounded-xl border border-indigo-200/50 bg-indigo-50/30 p-4 dark:border-indigo-500/25 dark:bg-indigo-500/[0.06]">
            <div className="flex items-center gap-2 border-b border-indigo-200/40 pb-2 dark:border-indigo-500/20">
              <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white dark:bg-indigo-500">
                3 days left
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">First reminder</span>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Headline</span>
              <input
                value={copyForm.d3_title}
                onChange={(e) => setCopyForm((c) => ({ ...c, d3_title: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-[#303038] dark:bg-[#1a1a1f] dark:text-gray-100"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Message</span>
              <textarea
                rows={5}
                value={copyForm.d3_body}
                onChange={(e) => setCopyForm((c) => ({ ...c, d3_body: e.target.value }))}
                className="max-h-52 min-h-[7.5rem] w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-900 shadow-sm [scrollbar-width:thin] focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-[#303038] dark:bg-[#1a1a1f] dark:text-gray-100"
                spellCheck
              />
            </label>
          </div>

          <div className="space-y-3 rounded-xl border border-emerald-200/50 bg-emerald-50/30 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/[0.06]">
            <div className="flex items-center gap-2 border-b border-emerald-200/40 pb-2 dark:border-emerald-500/20">
              <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white dark:bg-emerald-500">
                1 day left
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">Last reminder</span>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Headline</span>
              <input
                value={copyForm.d1_title}
                onChange={(e) => setCopyForm((c) => ({ ...c, d1_title: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-[#303038] dark:bg-[#1a1a1f] dark:text-gray-100"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Message</span>
              <textarea
                rows={5}
                value={copyForm.d1_body}
                onChange={(e) => setCopyForm((c) => ({ ...c, d1_body: e.target.value }))}
                className="max-h-52 min-h-[7.5rem] w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-900 shadow-sm [scrollbar-width:thin] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-[#303038] dark:bg-[#1a1a1f] dark:text-gray-100"
                spellCheck
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-[#26262d]">
          <button
            type="button"
            onClick={() => void saveCopy()}
            disabled={savingCopy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {savingCopy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save wording
          </button>
          <button
            type="button"
            onClick={() => {
              setCopyForm({ ...DEFAULT_SUBSCRIPTION_REMINDER_COPY });
              setRenewUrlField('');
            }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#303038] dark:text-gray-200 dark:hover:bg-white/5"
          >
            Reset to defaults
          </button>
        </div>
      </div>

      <div className="space-y-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-[#26262d] dark:bg-[#151518] sm:p-5 md:p-6">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Email &amp; WhatsApp sending</h3>
          <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">Connect Resend for email and Meta for WhatsApp.</p>
        </div>

        {integration ? (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                integration.effective.resend_ready
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-500/15 text-amber-900 dark:text-amber-200'
              }`}
            >
              Email {integration.effective.resend_ready ? 'ready' : 'needs key + from address'}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                integration.effective.whatsapp_ready
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-500/15 text-amber-900 dark:text-amber-200'
              }`}
            >
              WhatsApp {integration.effective.whatsapp_ready ? 'ready' : 'needs token + phone ID'}
            </span>
            <details className="text-xs text-gray-500 dark:text-gray-400">
              <summary className="cursor-pointer select-none font-medium text-gray-600 hover:underline dark:text-gray-400 [&::-webkit-details-marker]:hidden">
                Env overrides
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {integration.env_resend_key ? (
                  <span className="rounded-md bg-slate-500/10 px-2 py-0.5 font-mono text-[10px]">RESEND_API_KEY</span>
                ) : null}
                {integration.env_reminder_from ? (
                  <span className="rounded-md bg-slate-500/10 px-2 py-0.5 font-mono text-[10px]">REMINDER_FROM_EMAIL</span>
                ) : null}
                {integration.env_whatsapp_token ? (
                  <span className="rounded-md bg-slate-500/10 px-2 py-0.5 font-mono text-[10px]">WHATSAPP_CLOUD_TOKEN</span>
                ) : null}
                {integration.env_whatsapp_phone_id ? (
                  <span className="rounded-md bg-slate-500/10 px-2 py-0.5 font-mono text-[10px]">WHATSAPP_CLOUD_PHONE_NUMBER_ID</span>
                ) : null}
                {!integration.env_resend_key &&
                !integration.env_reminder_from &&
                !integration.env_whatsapp_token &&
                !integration.env_whatsapp_phone_id ? (
                  <span className="text-gray-500">No keys forced from server env.</span>
                ) : null}
              </div>
            </details>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Start the API server and refresh to see connection status.</p>
        )}

        <div className="space-y-6">
          <section className="space-y-3 rounded-xl border border-gray-200/90 p-4 dark:border-[#303038] dark:bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-indigo-500" />
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Resend</h4>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">From address</span>
              <input
                type="email"
                value={reminderFromEmail}
                onChange={(e) => setReminderFromEmail(e.target.value)}
                placeholder="Verified sender in Resend"
                title="Must be verified in your Resend dashboard"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-[#303038] dark:bg-[#1a1a1f] dark:text-gray-100"
              />
            </label>
            <label className="block space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">API key</span>
                {integration?.has_resend_key ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                    On file{integration.resend_key_hint ? ` · …${integration.resend_key_hint}` : ''}
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] font-medium text-gray-500">Not saved</span>
                )}
              </div>
              <input
                type="password"
                autoComplete="off"
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
                placeholder="re_…  · empty = keep saved key"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 font-mono text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-[#303038] dark:bg-[#1a1a1f] dark:text-gray-100"
              />
            </label>
          </section>

          <section className="space-y-3 rounded-xl border border-gray-200/90 p-4 dark:border-[#303038] dark:bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-emerald-500" />
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">WhatsApp Cloud</h4>
            </div>
            <label className="block space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Access token</span>
                {integration?.has_whatsapp_token ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                    On file{integration.whatsapp_token_hint ? ` · …${integration.whatsapp_token_hint}` : ''}
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] font-medium text-gray-500">Not saved</span>
                )}
              </div>
              <input
                type="password"
                autoComplete="off"
                value={waToken}
                onChange={(e) => setWaToken(e.target.value)}
                placeholder="Empty = keep saved token"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 font-mono text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-[#303038] dark:bg-[#1a1a1f] dark:text-gray-100"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Phone number ID</span>
                <input
                  value={waPhoneId}
                  onChange={(e) => setWaPhoneId(e.target.value)}
                  placeholder="From Meta Business"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 font-mono text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-[#303038] dark:bg-[#1a1a1f] dark:text-gray-100"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Graph API version</span>
                <input
                  value={waApiVersion}
                  onChange={(e) => setWaApiVersion(e.target.value)}
                  placeholder="v21.0"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 font-mono text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-[#303038] dark:bg-[#1a1a1f] dark:text-gray-100"
                />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Template name</span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400">Optional — for production broadcasts outside the 24h window</span>
                <input
                  value={waTemplateName}
                  onChange={(e) => setWaTemplateName(e.target.value)}
                  placeholder="subscription_expiry_reminder"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-[#303038] dark:bg-[#1a1a1f] dark:text-gray-100"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Template language</span>
                <input
                  value={waTemplateLang}
                  onChange={(e) => setWaTemplateLang(e.target.value)}
                  placeholder="en"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-[#303038] dark:bg-[#1a1a1f] dark:text-gray-100"
                />
              </label>
            </div>
            <details className="text-xs text-gray-500 dark:text-gray-400">
              <summary className="cursor-pointer select-none font-medium text-gray-700 hover:underline dark:text-gray-300 [&::-webkit-details-marker]:hidden">
                How WhatsApp templates work
              </summary>
              <p className="mt-2 max-w-2xl border-l-2 border-gray-200 pl-3 leading-relaxed dark:border-gray-700">
                Use <strong className="text-gray-800 dark:text-gray-200">one body variable</strong> for the full reminder. Without a template name, messages are plain text (best effort inside Meta&apos;s 24h reply window).
              </p>
            </details>
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-[#26262d]">
          <button
            type="button"
            onClick={() => void saveIntegrations()}
            disabled={savingIntegrations}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {savingIntegrations ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save connections
          </button>
          <button
            type="button"
            onClick={() => void clearStoredKeys()}
            disabled={savingIntegrations || (!integration?.has_resend_key && !integration?.has_whatsapp_token)}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            Clear saved keys
          </button>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-[#26262d] dark:bg-[#151518] sm:p-5 md:p-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800 dark:text-gray-200">Outbound channels</h3>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-gray-200 p-4 dark:border-[#303038]">
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <Mail className="h-4 w-4 text-indigo-500" /> Email
            </span>
            <ReminderSwitch
              checked={form.email_enabled}
              onChange={(v) => setForm((f) => ({ ...f, email_enabled: v }))}
              label="Send expiry reminders by email"
              hideLabel
              variant="indigo"
            />
          </div>
          <div className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-gray-200 p-4 dark:border-[#303038]">
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <Smartphone className="h-4 w-4 text-emerald-500" /> WhatsApp
            </span>
            <ReminderSwitch
              checked={form.whatsapp_enabled}
              onChange={(v) => setForm((f) => ({ ...f, whatsapp_enabled: v }))}
              label="Send expiry reminders by WhatsApp"
              hideLabel
              variant="emerald"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void saveChannels()}
            disabled={savingChannels}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            {savingChannels ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save channel toggles
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] text-sm font-semibold text-gray-700 dark:text-gray-200"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh all
          </button>
        </div>
        {msg ? (
          <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {msg.text}
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-[#26262d] flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Delivery log (latest 300)</h3>
        </div>
        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">No reminder runs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto max-h-[min(70vh,640px)] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-gray-50/95 dark:bg-[#1a1a1f] border-b border-gray-100 dark:border-[#26262d]">
                <tr>
                  <th className="py-2.5 px-3 font-bold text-gray-500 uppercase">When</th>
                  <th className="py-2.5 px-3 font-bold text-gray-500 uppercase">Customer</th>
                  <th className="py-2.5 px-3 font-bold text-gray-500 uppercase">Reminder</th>
                  <th className="py-2.5 px-3 font-bold text-gray-500 uppercase">In-app</th>
                  <th className="py-2.5 px-3 font-bold text-gray-500 uppercase">Email</th>
                  <th className="py-2.5 px-3 font-bold text-gray-500 uppercase">WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = r.users;
                  return (
                    <tr key={r.id} className="border-b border-gray-50 dark:border-white/[0.04]">
                      <td className="py-2 px-3 whitespace-nowrap text-gray-600 dark:text-gray-300">
                        {formatLogWhen(r.created_at)}
                      </td>
                      <td className="py-2 px-3 max-w-[200px]">
                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{u?.name || '—'}</div>
                        <div className="text-[10px] text-gray-500 truncate">{u?.email || r.user_id || '—'}</div>
                        {u?.phone ? <div className="text-[10px] text-gray-400 truncate">{u.phone}</div> : null}
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-mono text-[10px] text-gray-500">{r.reminder_key}</span>
                        <div className="text-[10px] text-gray-500 truncate max-w-[140px]" title={r.product_title || ''}>
                          {r.product_title || '—'}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        {r.in_app_ok ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Yes</span>
                        ) : (
                          <span className="text-red-500">No</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`font-semibold ${statusClass(r.email_status)}`}>{statusLabel(r.email_status)}</span>
                        {r.email_detail ? (
                          <div className="text-[10px] text-gray-500 mt-0.5 max-w-[180px] break-words">{r.email_detail}</div>
                        ) : null}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`font-semibold ${statusClass(r.whatsapp_status)}`}>
                          {statusLabel(r.whatsapp_status)}
                        </span>
                        {r.whatsapp_detail ? (
                          <div className="text-[10px] text-gray-500 mt-0.5 max-w-[180px] break-words">{r.whatsapp_detail}</div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
