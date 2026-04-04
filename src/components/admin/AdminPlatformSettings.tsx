import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Save, Settings, Info, Mail } from 'lucide-react';
import { DEFAULT_PLATFORM_STATUS, parsePlatformStatus, type PlatformLevel, type PlatformStatusValue } from '../../lib/platformStatus';

export const AdminPlatformSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PlatformStatusValue>(DEFAULT_PLATFORM_STATUS);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [slotEmergency, setSlotEmergency] = useState(false);
  const [slotSaving, setSlotSaving] = useState(false);
  const [slotMessage, setSlotMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [ps, adobe] = await Promise.all([
          supabase.from('system_settings').select('value').eq('key', 'platform_status').maybeSingle(),
          supabase.from('system_settings').select('value').eq('key', 'adobe_email_slots').maybeSingle(),
        ]);
        if (ps.error) throw ps.error;
        setForm(parsePlatformStatus(ps.data?.value));
        const v = (adobe.data?.value || {}) as { emergency_unlock?: boolean };
        setSlotEmergency(v.emergency_unlock === true);
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
      };
      const { error } = await supabase.from('system_settings').update(
        {
          value,
          updated_at: new Date().toISOString(),
        }
      ).eq('key', 'platform_status');
      if (error) throw error;
      setForm(parsePlatformStatus(value));
      setMessage({ type: 'ok', text: 'Saved. Users see the banner when Show banner is on and the message field is filled.' });
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
    </div>
  );
};
