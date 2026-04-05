import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  parseSubscriptionReminderChannels,
  type SubscriptionReminderChannels,
} from '../../lib/subscriptionReminderChannels';
import {
  SUBSCRIPTION_REMINDER_COPY_KEY,
  SUBSCRIPTION_REMINDER_PLACEHOLDERS,
  DEFAULT_SUBSCRIPTION_REMINDER_COPY,
  DEFAULT_REMINDER_DATE_LOCALE,
  buildReminderFromCopy,
  parseSubscriptionReminderCopyRow,
  type SubscriptionReminderCopy,
  previewSampleArgs,
} from '../../lib/subscriptionReminderCopy';
import { getApiBaseUrl } from '../../lib/apiBase';
import { BellRing, Loader2, Mail, MessageCircle, RefreshCw, Smartphone, Eye, Play, Send } from 'lucide-react';
import { format, parseISO } from 'date-fns';

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
    if (!confirm('Remove Resend and WhatsApp tokens saved in the database? (Server env keys are untouched.)')) return;
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
    if (!confirm('Run the full subscription expiry reminder job now? Real customers may receive inbox/email/WhatsApp if they match d3/d1 rules.')) return;
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
    setRunningTest(true);
    setMsg(null);
    try {
      const data = await adminFetch('/api/admin/ops/subscription-reminder/test', 'POST', {
        send_email: testSendEmail,
        send_whatsapp: testSendWhatsapp,
      });
      const r = data.result as {
        email?: { ok?: boolean; skipped?: boolean; error?: string; skipped_reason?: string };
        whatsapp?: { ok?: boolean; skipped?: boolean; error?: string; skipped_reason?: string };
      };
      const parts: string[] = [];
      if (testSendEmail) {
        const e = r.email;
        if (!e) parts.push('Email: (no result)');
        else if (e.skipped) parts.push(`Email: skipped (${e.skipped_reason || e.error || 'unknown'})`);
        else parts.push(e.ok ? 'Email: sent' : `Email: failed — ${e.error || 'unknown'}`);
      }
      if (testSendWhatsapp) {
        const w = r.whatsapp;
        if (!w) parts.push('WhatsApp: (no result)');
        else if (w.skipped) parts.push(`WhatsApp: skipped (${w.skipped_reason || w.error || 'unknown'})`);
        else parts.push(w.ok ? 'WhatsApp: sent' : `WhatsApp: failed — ${w.error || 'unknown'}`);
      }
      setMsg({ type: 'ok', text: `Test: ${parts.join(' · ')}` });
    } catch (e: unknown) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Test failed' });
    } finally {
      setRunningTest(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-slate-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
            <BellRing className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Subscription expiry reminders</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
              Edit the exact text customers see (in-app bell + email + WhatsApp), turn channels on/off, and optionally store
              Resend / Meta Cloud credentials here. When both exist, <span className="font-medium">server environment variables win</span>{' '}
              over values saved in the database (same idea as Help chat AI keys). “Days left” uses the{' '}
              <span className="font-medium">Asia/Dhaka</span> calendar day.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200/50 dark:border-amber-900/30 bg-amber-50/40 dark:bg-amber-950/20 p-5 md:p-6 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide flex items-center gap-2">
          <Play className="w-4 h-4 text-amber-600" />
          Run &amp; test
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <strong className="font-medium text-gray-800 dark:text-gray-200">Run now</strong> executes the same job as the daily cron
          (real sends). <strong className="font-medium text-gray-800 dark:text-gray-200">Send test</strong> uses your admin profile email
          and phone only, prefixed [TEST].
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runJobNow()}
            disabled={runningJob}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-500 disabled:opacity-50"
          >
            {runningJob ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run reminder job now
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={testSendEmail} onChange={(e) => setTestSendEmail(e.target.checked)} className="rounded" />
            Test email
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={testSendWhatsapp}
              onChange={(e) => setTestSendWhatsapp(e.target.checked)}
              className="rounded"
            />
            Test WhatsApp
          </label>
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={runningTest}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300 dark:border-amber-800 text-sm font-semibold text-amber-900 dark:text-amber-200"
          >
            {runningTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send test to me
          </button>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Failure alerts (optional): set <code className="text-[10px] bg-white/60 dark:bg-white/10 px-1 rounded">REMINDER_ALERT_FAILURE_THRESHOLD</code>{' '}
          (default 3), <code className="text-[10px] bg-white/60 dark:bg-white/10 px-1 rounded">REMINDER_ALERT_SLACK_WEBHOOK_URL</code> and/or{' '}
          <code className="text-[10px] bg-white/60 dark:bg-white/10 px-1 rounded">REMINDER_OPS_ALERT_EMAIL</code> with Resend env for email. Cooldown:{' '}
          <code className="text-[10px] bg-white/60 dark:bg-white/10 px-1 rounded">REMINDER_ALERT_COOLDOWN_HOURS</code> (default 24).
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide flex items-center gap-2">
          <Eye className="w-4 h-4" />
          Customer message (preview)
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Placeholders: <code className="text-[10px] bg-gray-100 dark:bg-white/10 px-1 rounded">{SUBSCRIPTION_REMINDER_PLACEHOLDERS}</code>
          . Sample product & date below — real sends use each customer&apos;s data.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 dark:border-[#303038] p-4 space-y-2 bg-gray-50/50 dark:bg-white/[0.02]">
            <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">3 days before (d3)</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{previewD3.title}</p>
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
              {previewD3.body}
            </pre>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-[#303038] p-4 space-y-2 bg-gray-50/50 dark:bg-white/[0.02]">
            <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">1 day before (d1)</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{previewD1.title}</p>
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
              {previewD1.body}
            </pre>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">Message templates</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Title = notification title + email subject. Body = inbox message, email body, and WhatsApp text (title is prepended for
          WhatsApp with a blank line). HTML emails include a “Renew” button using this URL when set (else env{' '}
          <code className="text-[10px] bg-gray-100 dark:bg-white/10 px-1 rounded">REMINDER_STORE_URL</code> /{' '}
          <code className="text-[10px] bg-gray-100 dark:bg-white/10 px-1 rounded">VITE_APP_URL</code>).
        </p>
        <label className="block space-y-1 max-w-xl">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Store / renew URL ({'{renewUrl}'})</span>
          <input
            value={renewUrlField}
            onChange={(e) => setRenewUrlField(e.target.value)}
            placeholder="https://yoursite.com/store"
            className="w-full rounded-lg border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] px-3 py-2 text-sm"
          />
        </label>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">d3 title</span>
            <input
              value={copyForm.d3_title}
              onChange={(e) => setCopyForm((c) => ({ ...c, d3_title: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">d1 title</span>
            <input
              value={copyForm.d1_title}
              onChange={(e) => setCopyForm((c) => ({ ...c, d1_title: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">d3 body</span>
            <textarea
              rows={6}
              value={copyForm.d3_body}
              onChange={(e) => setCopyForm((c) => ({ ...c, d3_body: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">d1 body</span>
            <textarea
              rows={6}
              value={copyForm.d1_body}
              onChange={(e) => setCopyForm((c) => ({ ...c, d1_body: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] px-3 py-2 text-sm font-mono"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveCopy()}
            disabled={savingCopy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            {savingCopy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save message templates
          </button>
          <button
            type="button"
            onClick={() => {
              setCopyForm({ ...DEFAULT_SUBSCRIPTION_REMINDER_COPY });
              setRenewUrlField('');
            }}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#303038] text-sm font-semibold text-gray-700 dark:text-gray-200"
          >
            Reset form to defaults
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">Email &amp; WhatsApp API</h3>
        {integration ? (
          <div className="flex flex-wrap gap-2 text-[11px] text-gray-600 dark:text-gray-400">
            <span
              className={`px-2 py-0.5 rounded-md ${integration.effective.resend_ready ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'}`}
            >
              Resend: {integration.effective.resend_ready ? 'ready' : 'missing key or from-address'}
            </span>
            <span
              className={`px-2 py-0.5 rounded-md ${integration.effective.whatsapp_ready ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'}`}
            >
              WhatsApp Cloud: {integration.effective.whatsapp_ready ? 'ready' : 'missing token or phone number id'}
            </span>
            {integration.env_resend_key ? (
              <span className="px-2 py-0.5 rounded-md bg-slate-500/10">RESEND_API_KEY from env</span>
            ) : null}
            {integration.env_reminder_from ? (
              <span className="px-2 py-0.5 rounded-md bg-slate-500/10">REMINDER_FROM_EMAIL from env</span>
            ) : null}
            {integration.env_whatsapp_token ? (
              <span className="px-2 py-0.5 rounded-md bg-slate-500/10">WHATSAPP_CLOUD_TOKEN from env</span>
            ) : null}
            {integration.env_whatsapp_phone_id ? (
              <span className="px-2 py-0.5 rounded-md bg-slate-500/10">WHATSAPP_CLOUD_PHONE_NUMBER_ID from env</span>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-gray-500">Load the page to fetch API status (requires API server running).</p>
        )}
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">From email (verified in Resend)</span>
            <input
              type="email"
              value={reminderFromEmail}
              onChange={(e) => setReminderFromEmail(e.target.value)}
              placeholder="noreply@yourdomain.com"
              className="w-full rounded-lg border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
              Resend API key
              {integration?.has_resend_key ? (
                <span className="ml-2 font-normal text-gray-500">(saved: {integration.resend_key_hint || 'yes'})</span>
              ) : null}
            </span>
            <input
              type="password"
              autoComplete="off"
              value={resendApiKey}
              onChange={(e) => setResendApiKey(e.target.value)}
              placeholder="re_…  (leave empty to keep current)"
              className="w-full rounded-lg border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
              WhatsApp Cloud access token
              {integration?.has_whatsapp_token ? (
                <span className="ml-2 font-normal text-gray-500">(saved: {integration.whatsapp_token_hint || 'yes'})</span>
              ) : null}
            </span>
            <input
              type="password"
              autoComplete="off"
              value={waToken}
              onChange={(e) => setWaToken(e.target.value)}
              placeholder="Leave empty to keep current"
              className="w-full rounded-lg border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Phone number ID</span>
            <input
              value={waPhoneId}
              onChange={(e) => setWaPhoneId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Graph API version</span>
            <input
              value={waApiVersion}
              onChange={(e) => setWaApiVersion(e.target.value)}
              placeholder="v21.0"
              className="w-full rounded-lg border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Template name (optional, production)</span>
            <input
              value={waTemplateName}
              onChange={(e) => setWaTemplateName(e.target.value)}
              placeholder="e.g. subscription_expiry_reminder"
              className="w-full rounded-lg border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Template language code</span>
            <input
              value={waTemplateLang}
              onChange={(e) => setWaTemplateLang(e.target.value)}
              placeholder="en"
              className="w-full rounded-lg border border-gray-200 dark:border-[#303038] bg-white dark:bg-[#151518] px-3 py-2 text-sm"
            />
          </label>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Approved WhatsApp template should expose <strong className="font-medium">one body variable</strong> — the full reminder
          (title + body) is sent as that single parameter. Without a template name, the API sends a plain text message (usually only
          works inside Meta&apos;s 24h session window).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveIntegrations()}
            disabled={savingIntegrations}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
          >
            {savingIntegrations ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save API settings
          </button>
          <button
            type="button"
            onClick={() => void clearStoredKeys()}
            disabled={savingIntegrations || (!integration?.has_resend_key && !integration?.has_whatsapp_token)}
            className="px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900/40 text-sm font-semibold text-red-700 dark:text-red-400 disabled:opacity-40"
          >
            Clear stored secret keys
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 md:p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">Outbound channels</h3>
        <div className="flex flex-col sm:flex-row gap-4">
          <label className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-[#303038] p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03]">
            <input
              type="checkbox"
              checked={form.email_enabled}
              onChange={(e) => setForm((f) => ({ ...f, email_enabled: e.target.checked }))}
              className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <Mail className="w-4 h-4 text-indigo-500" /> Email (Resend)
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Uses the Resend key and from-address above (or server env).
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-[#303038] p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03]">
            <input
              type="checkbox"
              checked={form.whatsapp_enabled}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_enabled: e.target.checked }))}
              className="mt-1 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <Smartphone className="w-4 h-4 text-emerald-500" /> WhatsApp (Meta Cloud)
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Uses customer phone from profile and settings above.</p>
            </div>
          </label>
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
                        {format(parseISO(r.created_at), 'MMM d, HH:mm')}
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
