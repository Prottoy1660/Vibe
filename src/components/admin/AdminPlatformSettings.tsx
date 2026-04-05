import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Save, Settings, Info, Mail, UserCircle } from 'lucide-react';
import { DEFAULT_PLATFORM_STATUS, parsePlatformStatus, type PlatformLevel, type PlatformStatusValue } from '../../lib/platformStatus';

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

  useEffect(() => {
    const load = async () => {
      try {
        const [ps, adobe, personal] = await Promise.all([
          supabase.from('system_settings').select('value').eq('key', 'platform_status').maybeSingle(),
          supabase.from('system_settings').select('value').eq('key', 'adobe_email_slots').maybeSingle(),
          supabase.from('system_settings').select('value').eq('key', 'personal_subscriptions').maybeSingle(),
        ]);
        if (ps.error) throw ps.error;
        setForm(parsePlatformStatus(ps.data?.value));
        const v = (adobe.data?.value || {}) as { emergency_unlock?: boolean };
        setSlotEmergency(v.emergency_unlock === true);
        const pv = (personal.data?.value || {}) as { enabled?: boolean };
        setPersonalSubsEnabled(pv.enabled !== false);
      } catch (e) {
        console.error(e);
        setMessage({ type: 'err', text: 'Could not load platform settings.' });
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
        text: 'Saved. Banner follows “Show banner”. Full-site lock hides the app from everyone except admins until you turn it off.',
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
        text: slotEmergency
          ? 'Emergency mode ON: customers can generate all remaining Adobe slots without waiting for the per-slot interval.'
          : 'Emergency mode OFF: per-product day spacing between slot unlocks is enforced again.',
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
        text: personalSubsEnabled
          ? 'Personal Adobe plans are visible to customers on the Adobe Email page.'
          : 'Personal Adobe plans are hidden; new purchases and wallet auto-renew for personal products are blocked.',
      });
    } catch (e: unknown) {
      setPersonalMessage({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setPersonalSaving(false);
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
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Platform status & banner</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          Controls the global bar and the public <span className="font-mono text-xs">/status</span> page. Turn on &quot;Show
          banner&quot; and enter a message: at <span className="font-medium">Operational</span> it shows as a blue announcement;
          use Degraded / Maintenance for stronger styling. Turn off the toggle to hide completely.
        </p>

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
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="lock_public_site"
                checked={form.lock_public_site}
                onChange={(e) => setForm((f) => ({ ...f, lock_public_site: e.target.checked }))}
                className="mt-1 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
              />
              <div>
                <label htmlFor="lock_public_site" className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                  Full-site maintenance (public lock)
                </label>
                <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/90 leading-relaxed">
                  Visitors and signed-in customers see a full-screen maintenance experience only.{' '}
                  <span className="font-medium">Admins and super admins</span> keep full access to the whole app
                  (dashboard, store, admin panel). Use the message below for details on the maintenance screen.
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
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2.5 text-sm disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Adobe email slots (emergency)</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          When products have &quot;Days between slot unlocks&quot; set, customers normally wait (e.g. 2nd slot 10 days after
          purchase, 3rd after 20 days). Turn this on if many users need replacement emails before those dates — they can
          then generate every remaining slot immediately. Turn off to restore spacing.
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={slotEmergency}
            onChange={(e) => setSlotEmergency(e.target.checked)}
            className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
          />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Emergency unlock — ignore spacing for all Adobe email generations
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
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold px-4 py-2.5 text-sm disabled:opacity-60"
        >
          {slotSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save slot policy
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <UserCircle className="w-5 h-5 text-violet-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Personal Adobe subscriptions</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          Lets customers buy Adobe on <span className="font-medium text-gray-800 dark:text-gray-200">their own email</span> from
          the Adobe Email page (personal tab and checkout). Turn off to hide that flow and block new personal orders and wallet
          renewals for personal products. Existing personal customers can still see their plans if you turn this off.
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={personalSubsEnabled}
            onChange={(e) => setPersonalSubsEnabled(e.target.checked)}
            className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
          />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Offer personal plans (customer&apos;s own Adobe email)
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
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold px-4 py-2.5 text-sm disabled:opacity-60"
        >
          {personalSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save personal plans setting
        </button>
      </div>
    </div>
  );
};
