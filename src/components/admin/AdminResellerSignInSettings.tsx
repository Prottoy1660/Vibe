import React, { useEffect, useState } from 'react';
import { Info, Loader2, Save, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { parseAuthSettings, type AuthSettingsValue } from '../../lib/authSettings';

export const AdminResellerSignInSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requireEmailVerification, setRequireEmailVerification] = useState(true);
  const [passwordResetEnabled, setPasswordResetEnabled] = useState(true);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'auth_settings')
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        const settings = parseAuthSettings(data?.value);
        setRequireEmailVerification(settings.require_reseller_email_verification !== false);
        setPasswordResetEnabled(settings.enable_reseller_password_reset !== false);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setMessage({ type: 'err', text: 'Could not load Super Reseller sign-in settings.' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { data: current, error: readErr } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'auth_settings')
        .maybeSingle();
      if (readErr) throw readErr;

      const merged: AuthSettingsValue = {
        ...parseAuthSettings(current?.value),
        require_reseller_email_verification: requireEmailVerification,
        enable_reseller_password_reset: passwordResetEnabled,
      };

      const { data, error } = await supabase
        .from('system_settings')
        .update({ value: merged, updated_at: new Date().toISOString() })
        .eq('key', 'auth_settings')
        .select('key');
      if (error) throw error;
      if (!data?.length) {
        throw new Error(
          'Setting row missing: system_settings.key = auth_settings. Run your settings migration, then try again.',
        );
      }
      setMessage({ type: 'ok', text: 'Super Reseller sign-in settings saved.' });
    } catch (e: unknown) {
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : 'Save failed',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-6 flex justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-emerald-500" aria-hidden />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-500/25 bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Super Reseller sign-in options</h2>
      </div>
      <div className="mb-4 flex gap-2.5 items-start">
        <Info className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" aria-hidden />
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed min-w-0">
          Control email verification on sign-up and the forgot-password link on{' '}
          <span className="font-medium">superreseller.shop</span>.
        </p>
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={requireEmailVerification}
            onChange={(e) => setRequireEmailVerification(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
          />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug min-w-0">
            Require email verification for Super Reseller sign-up
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={passwordResetEnabled}
            onChange={(e) => setPasswordResetEnabled(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
          />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug min-w-0">
            Allow password reset link on Super Reseller login
          </span>
        </label>
      </div>

      {message ? (
        <p
          className={`text-sm mt-4 ${message.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
        >
          {message.text}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3.5 py-2 text-sm disabled:opacity-60"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Super Reseller settings
      </button>
    </div>
  );
};
