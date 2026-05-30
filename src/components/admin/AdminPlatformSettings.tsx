import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Save, Settings, Info, Mail, UserCircle, ChevronRight, ShieldCheck } from 'lucide-react';
import { DEFAULT_PLATFORM_STATUS, parsePlatformStatus, type PlatformLevel, type PlatformStatusValue } from '../../lib/platformStatus';
import { type AuthSettingsValue, parseAuthSettings } from '../../lib/authSettings';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';
import { getApiBaseUrl } from '../../lib/apiBase';

function HelpDetails({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-gray-200/90 dark:border-[#2a2a32] bg-gray-50/70 dark:bg-white/[0.04] text-sm">
      <summary className="cursor-pointer list-none px-3 py-2 font-medium text-gray-700 dark:text-gray-300 [&::-webkit-details-marker]:hidden flex items-center gap-1.5 select-none hover:bg-gray-100/80 dark:hover:bg-white/[0.06] rounded-lg">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform group-open:rotate-90" aria-hidden />
        {summary}
      </summary>
      <div className="border-t border-gray-200/80 dark:border-[#2a2a32] px-3 pb-3 pt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
        {children}
      </div>
    </details>
  );
}

type AdminActivityLoggingValue = {
  enabled?: boolean;
  log_reads?: boolean;
};

export const AdminPlatformSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PlatformStatusValue>(DEFAULT_PLATFORM_STATUS);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [slotEmergency, setSlotEmergency] = useState(false);
  const [slotSaving, setSlotSaving] = useState(false);
  const [slotMessage, setSlotMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [personalSubsEnabled, setPersonalSubsEnabled] = useState(true);
  const [personalSaving, setPersonalSaving] = useState(false);
  const [personalMessage, setPersonalMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [authForm, setAuthForm] = useState<AuthSettingsValue>({
    enable_google_login: true,
    enable_facebook_login: true,
    enable_microsoft_login: true,
    google_login_under_maintenance: false,
    facebook_login_under_maintenance: false,
    microsoft_login_under_maintenance: false,
    require_reseller_email_verification: true,
    enable_reseller_password_reset: true,
  });
  const [authSaving, setAuthSaving] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [activityForm, setActivityForm] = useState<AdminActivityLoggingValue>({
    enabled: true,
    log_reads: false,
  });
  const [activitySaving, setActivitySaving] = useState(false);
  const [activityMessage, setActivityMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [purgingActivityLogs, setPurgingActivityLogs] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [ps, adobe, personal, auth, activity] = await Promise.all([
          supabase.from('system_settings').select('value').eq('key', 'platform_status').maybeSingle(),
          supabase.from('system_settings').select('value').eq('key', 'adobe_email_slots').maybeSingle(),
          supabase.from('system_settings').select('value').eq('key', 'personal_subscriptions').maybeSingle(),
          supabase.from('system_settings').select('value').eq('key', 'auth_settings').maybeSingle(),
          supabase.from('system_settings').select('value').eq('key', 'admin_activity_logging').maybeSingle(),
        ]);
        if (ps.error) throw ps.error;
        setForm(parsePlatformStatus(ps.data?.value));
        const v = (adobe.data?.value || {}) as { emergency_unlock?: boolean };
        setSlotEmergency(v.emergency_unlock === true);
        const pv = (personal.data?.value || {}) as { enabled?: boolean };
        setPersonalSubsEnabled(pv.enabled !== false);
        const av = parseAuthSettings(auth.data?.value);
        setAuthForm({
          ...av,
          google_login_under_maintenance: av.google_login_under_maintenance === true,
          facebook_login_under_maintenance: av.facebook_login_under_maintenance === true,
          microsoft_login_under_maintenance: av.microsoft_login_under_maintenance === true,
        });
        const aiv = (activity.data?.value || {}) as AdminActivityLoggingValue;
        setActivityForm({
          enabled: aiv.enabled !== false,
          log_reads: aiv.log_reads === true,
        });
      } catch (e) {
        console.error(e);
        setMessage({ type: 'err', text: 'Could not load platform settings.' });
        setAuthMessage({ type: 'err', text: 'Could not load login provider maintenance settings.' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const value = {
        level: form.level === 'unknown' ? 'operational' : form.level,
        message: form.message.trim(),
        show_banner: form.show_banner,
        lock_public_site: form.lock_public_site,
      };
      const { error } = await supabase.from('system_settings').update(
        {
          value,
          updated_at: new Date().toISOString(),
        }
      ).eq('key', 'platform_status');
      if (error) throw error;
      setForm(parsePlatformStatus(value));
      setMessage({
        type: 'ok',
        text: 'Saved. Banner and maintenance lock updated.',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setMessage({ type: 'err', text: msg });
    } finally {
      setSaving(false);
    }
  };

  const saveAdobeSlots = async () => {
    setSlotSaving(true);
    setSlotMessage(null);
    try {
      const value = { emergency_unlock: slotEmergency };
      const { error } = await supabase
        .from('system_settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', 'adobe_email_slots');
      if (error) throw error;
      setSlotMessage({
        type: 'ok',
        text: slotEmergency ? 'Emergency mode on — spacing ignored for new generations.' : 'Emergency mode off — spacing enforced again.',
      });
    } catch (e: unknown) {
      setSlotMessage({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSlotSaving(false);
    }
  };

  const savePersonalSubs = async () => {
    setPersonalSaving(true);
    setPersonalMessage(null);
    try {
      const value = { enabled: personalSubsEnabled };
      const { data, error } = await supabase
        .from('system_settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', 'personal_subscriptions')
        .select('key');
      if (error) throw error;
      if (!data?.length) {
        throw new Error('Setting row missing. Apply migration 048_personal_subscriptions_setting.sql in Supabase.');
      }
      setPersonalMessage({
        type: 'ok',
        text: personalSubsEnabled ? 'Personal plans are visible on Adobe Email.' : 'Personal plans hidden; new orders and renewals blocked.',
      });
    } catch (e: unknown) {
      setPersonalMessage({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setPersonalSaving(false);
    }
  };

  const saveAuthUnderMaintenance = async () => {
    setAuthSaving(true);
    setAuthMessage(null);
    try {
      const value: AuthSettingsValue = {
        ...authForm,
        google_login_under_maintenance: authForm.google_login_under_maintenance === true,
        facebook_login_under_maintenance: authForm.facebook_login_under_maintenance === true,
        microsoft_login_under_maintenance: authForm.microsoft_login_under_maintenance === true,
        require_reseller_email_verification: authForm.require_reseller_email_verification !== false,
        enable_reseller_password_reset: authForm.enable_reseller_password_reset !== false,
      };
      // Prefer UPDATE so we don't require insert permissions (common with RLS).
      // If the row is missing, give a clear actionable message.
      const { data, error } = await supabase
        .from('system_settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', 'auth_settings')
        .select('key');
      if (error) throw error;
      if (!data?.length) {
        throw new Error(
          'Setting row missing: system_settings.key = auth_settings. Create it (run your settings migration / seed) then try again.',
        );
      }
      setAuthMessage({
        type: 'ok',
        text: 'Auth settings saved (login maintenance + Super Reseller sign-in options).',
      });
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof (e as any)?.message === 'string'
            ? (e as any).message
            : 'Save failed';
      setAuthMessage({ type: 'err', text: msg });
    } finally {
      setAuthSaving(false);
    }
  };

  const saveActivityLogging = async () => {
    setActivitySaving(true);
    setActivityMessage(null);
    try {
      const token = await getAccessTokenForApi();
      if (!token) throw new Error('You are not signed in. Please log in again.');
      const value: AdminActivityLoggingValue = {
        enabled: activityForm.enabled !== false,
        log_reads: activityForm.log_reads === true,
      };
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/admin/ops/activity-logging/settings`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(value),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setActivityMessage({
        type: 'ok',
        text:
          value.enabled === false
            ? 'Activity logging is now OFF. API and database audit inserts are paused.'
            : value.log_reads
              ? 'Activity logging is ON (including read-only API requests).'
              : 'Activity logging is ON (write actions only, read-only API requests excluded).',
      });
    } catch (e: unknown) {
      setActivityMessage({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setActivitySaving(false);
    }
  };

  const purgeActivityLogs = async () => {
    const yes = window.confirm(
      'Delete all admin activity logs up to now? This action removes existing rows and cannot be undone.',
    );
    if (!yes) return;

    setPurgingActivityLogs(true);
    setPurgeMessage(null);
    try {
      const token = await getAccessTokenForApi();
      if (!token) throw new Error('You are not signed in. Please log in again.');

      const res = await fetch('/api/admin/ops/activity-logs/purge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; deleted?: number };
      if (!res.ok) throw new Error(data.error || 'Failed to purge logs');
      setPurgeMessage({
        type: 'ok',
        text: `Deleted ${Number(data.deleted || 0).toLocaleString()} activity log rows.`,
      });
    } catch (e: unknown) {
      setPurgeMessage({ type: 'err', text: e instanceof Error ? e.message : 'Purge failed' });
    } finally {
      setPurgingActivityLogs(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl space-y-6">
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-5 h-5 text-indigo-500 shrink-0" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Platform status & banner</h2>
        </div>
        <div className="mb-5 space-y-3">
          <div className="flex gap-2.5 items-start">
            <Info className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" aria-hidden />
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed min-w-0">
              Global top banner for signed-in users and the public{' '}
              <code className="rounded bg-gray-100 dark:bg-white/10 px-1 py-0.5 text-[11px]">/status</code> page.
            </p>
          </div>
          <HelpDetails summary="How levels, banner, and maintenance work">
            <p>
              Turn on <span className="font-medium text-gray-800 dark:text-gray-200">Show banner</span> and set a message.
              At <span className="font-medium">Operational</span> it appears as a calm announcement;{' '}
              <span className="font-medium">Degraded</span> / <span className="font-medium">Maintenance</span> use stronger
              styling. Turn the banner off to hide it completely.
            </p>
            <p className="mt-2">
              <span className="font-medium text-gray-800 dark:text-gray-200">Full-site maintenance</span> shows a
              full-screen page to visitors and customers; admins and super admins keep normal access. Use the message field
              for text on that screen.
            </p>
          </HelpDetails>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Level</label>
            <select
              value={form.level === 'unknown' ? 'operational' : form.level}
              onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as PlatformLevel }))}
              className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm"
            >
              <option value="operational">Operational (all good)</option>
              <option value="degraded">Degraded (issues, partial outage)</option>
              <option value="maintenance">Maintenance (expect disruption)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show_banner"
              checked={form.show_banner}
              onChange={(e) => setForm((f) => ({ ...f, show_banner: e.target.checked }))}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="show_banner" className="text-sm text-gray-700 dark:text-gray-200">
              Show banner to signed-in users (top of app)
            </label>
          </div>

          <div className="rounded-xl border border-amber-200/80 dark:border-amber-500/25 bg-amber-50/60 dark:bg-amber-500/10 px-4 py-3">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="lock_public_site"
                checked={form.lock_public_site}
                onChange={(e) => setForm((f) => ({ ...f, lock_public_site: e.target.checked }))}
                className="mt-1 rounded border-amber-400 text-amber-600 focus:ring-amber-500 shrink-0"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <label htmlFor="lock_public_site" className="text-sm font-semibold text-amber-950 dark:text-amber-100 block">
                  Full-site maintenance (public lock)
                </label>
                <p className="text-xs text-amber-900/85 dark:text-amber-200/90 leading-relaxed">
                  Locks the storefront for everyone except admins. Same message field as above.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Message</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              rows={4}
              className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm"
              placeholder="e.g. We are upgrading payment processing. Purchases may be delayed until 6 PM."
            />
          </div>

          {message && (
            <p className={`text-sm ${message.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {message.text}
            </p>
          )}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3.5 py-2 text-sm disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="w-5 h-5 text-amber-500 shrink-0" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Adobe email slots (emergency)</h2>
        </div>
        <div className="mb-4 space-y-3">
          <div className="flex gap-2.5 items-start">
            <Info className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" aria-hidden />
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed min-w-0">
              Temporarily let customers use every Adobe email slot at once (skip per-product day spacing).
            </p>
          </div>
          <HelpDetails summary="When to use this">
            <p>
              When products use &quot;Days between slot unlocks&quot;, customers normally wait (for example 2nd slot 10 days
              after purchase, 3rd after 20 days). Enable emergency mode if many people need replacement emails before those
              dates. Turn it off to enforce spacing again.
            </p>
          </HelpDetails>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={slotEmergency}
            onChange={(e) => setSlotEmergency(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500 shrink-0"
          />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug min-w-0">
            Emergency unlock — ignore spacing for Adobe email generations
          </span>
        </label>
        {slotMessage && (
          <p
            className={`text-sm mt-3 ${slotMessage.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {slotMessage.text}
          </p>
        )}
        <button
          type="button"
          onClick={() => void saveAdobeSlots()}
          disabled={slotSaving}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium px-3.5 py-2 text-sm disabled:opacity-60"
        >
          {slotSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save slot policy
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2 mb-3">
          <UserCircle className="w-5 h-5 text-violet-500 shrink-0" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Personal Adobe subscriptions</h2>
        </div>
        <div className="mb-4 space-y-3">
          <div className="flex gap-2.5 items-start">
            <Info className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" aria-hidden />
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed min-w-0">
              Show or hide personal Adobe plans on the Adobe Email page (customer&apos;s own Adobe ID email).
            </p>
          </div>
          <HelpDetails summary="What changes when you turn this off">
            <p>
              When off, that checkout path is hidden and new personal orders plus wallet auto-renew for personal products are
              blocked. Existing personal customers can usually still see their plans.
            </p>
          </HelpDetails>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={personalSubsEnabled}
            onChange={(e) => setPersonalSubsEnabled(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 shrink-0"
          />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug min-w-0">
            Offer personal plans
          </span>
        </label>
        {personalMessage && (
          <p
            className={`text-sm mt-3 ${personalMessage.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {personalMessage.text}
          </p>
        )}
        <button
          type="button"
          onClick={() => void savePersonalSubs()}
          disabled={personalSaving}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium px-3.5 py-2 text-sm disabled:opacity-60"
        >
          {personalSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save personal plans
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none lg:col-span-2">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Super Reseller sign-in options</h2>
        </div>
        <div className="mb-4 space-y-3">
          <div className="flex gap-2.5 items-start">
            <Info className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" aria-hidden />
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed min-w-0">
              Control email verification on sign-up and the forgot-password reset link on superreseller.shop.
            </p>
          </div>
          <HelpDetails summary="Email verification off">
            <p>
              Sign-up creates an active account right away. Existing unverified reseller accounts are auto-activated
              when they try to sign in or use &quot;Resend verification&quot;. Google sign-up is unchanged.
            </p>
          </HelpDetails>
          <HelpDetails summary="Password reset off">
            <p>
              The &quot;Forgot password?&quot; link is hidden on the reseller login page and the reset form is
              disabled. Resellers must contact you to reset passwords manually.
            </p>
          </HelpDetails>
        </div>
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={authForm.require_reseller_email_verification !== false}
              onChange={(e) =>
                setAuthForm((f) => ({ ...f, require_reseller_email_verification: e.target.checked }))
              }
              className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug min-w-0">
              Require email verification for Super Reseller sign-up
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={authForm.enable_reseller_password_reset !== false}
              onChange={(e) =>
                setAuthForm((f) => ({ ...f, enable_reseller_password_reset: e.target.checked }))
              }
              className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug min-w-0">
              Allow password reset link on Super Reseller login
            </span>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none lg:col-span-2">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-5 h-5 text-indigo-500 shrink-0" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Login providers maintenance (toast)</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed min-w-0 mb-4">
          When enabled, the Google/Facebook/Microsoft login buttons will still be shown (if enabled) but clicks will display an “Under maintenance” toast and block OAuth.
        </p>

        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={authForm.google_login_under_maintenance === true}
              onChange={(e) => setAuthForm((f) => ({ ...f, google_login_under_maintenance: e.target.checked }))}
              className="mt-0.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug min-w-0">
              Google login under maintenance
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={authForm.facebook_login_under_maintenance === true}
              onChange={(e) => setAuthForm((f) => ({ ...f, facebook_login_under_maintenance: e.target.checked }))}
              className="mt-0.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug min-w-0">
              Facebook login under maintenance
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={authForm.microsoft_login_under_maintenance === true}
              onChange={(e) => setAuthForm((f) => ({ ...f, microsoft_login_under_maintenance: e.target.checked }))}
              className="mt-0.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug min-w-0">
              Microsoft login under maintenance
            </span>
          </label>
        </div>

        {authMessage && (
          <p
            className={`text-sm mt-4 ${authMessage.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {authMessage.text}
          </p>
        )}

        <button
          type="button"
          onClick={() => void saveAuthUnderMaintenance()}
          disabled={authSaving}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3.5 py-2 text-sm disabled:opacity-60"
        >
          {authSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save auth settings
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none lg:col-span-2">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-5 h-5 text-rose-500 shrink-0" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Admin activity logging</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed min-w-0 mb-4">
          Use this to reduce audit write pressure. Turning this off pauses both API and database activity log inserts.
        </p>

        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={activityForm.enabled !== false}
              onChange={(e) => setActivityForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="mt-0.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500 shrink-0"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug min-w-0">
              Enable admin activity logs
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={activityForm.log_reads === true}
              disabled={activityForm.enabled === false}
              onChange={(e) => setActivityForm((f) => ({ ...f, log_reads: e.target.checked }))}
              className="mt-0.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500 shrink-0 disabled:opacity-60"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug min-w-0">
              Also log read-only API requests (GET/HEAD/OPTIONS)
            </span>
          </label>
        </div>

        {activityMessage && (
          <p
            className={`text-sm mt-4 ${activityMessage.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {activityMessage.text}
          </p>
        )}

        <button
          type="button"
          onClick={() => void saveActivityLogging()}
          disabled={activitySaving}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium px-3.5 py-2 text-sm disabled:opacity-60"
        >
          {activitySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save activity logging
        </button>

        <div className="mt-5 rounded-xl border border-red-200/80 dark:border-red-500/30 bg-red-50/60 dark:bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">Danger zone: clear stored activity logs</p>
          <p className="text-xs mt-1 text-red-700/90 dark:text-red-200/90">
            This deletes all accumulated admin activity logs up to now in one click.
          </p>
          {purgeMessage && (
            <p
              className={`text-sm mt-3 ${purgeMessage.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {purgeMessage.text}
            </p>
          )}
          <button
            type="button"
            onClick={() => void purgeActivityLogs()}
            disabled={purgingActivityLogs}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium px-3.5 py-2 text-sm disabled:opacity-60"
          >
            {purgingActivityLogs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Delete all accumulated logs
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};
