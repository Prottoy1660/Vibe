import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiBaseUrl } from '../../lib/apiBase';
import { Loader2, Save, CreditCard } from 'lucide-react';

const inputClass =
  'w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400';

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
  if (json && typeof json === 'object' && 'success' in json && (json as { success?: boolean }).success === false) {
    throw new Error((json as { error?: string; message?: string }).error || (json as { message?: string }).message || 'Request failed');
  }
  return json;
}

type SettingsPayload = {
  api_root: string;
  environment: 'sandbox' | 'live';
  app_key: string;
  username: string;
  has_stored_app_secret: boolean;
  app_secret_hint: string | null;
  env_api_root: boolean;
  env_app_key: boolean;
  checkout_enabled: boolean;
};

type Effective = {
  configured: boolean;
  checkout_offered: boolean;
  checkout_toggle_locked_by_env: boolean;
  /** True when BKASH_TOKENIZED_API_ROOT (or legacy env) overrides stored URL */
  api_root_from_env: boolean;
  app_key_from_env: boolean;
};

export const AdminBkashTokenizedSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [effective, setEffective] = useState<Effective | null>(null);

  const [environment, setEnvironment] = useState<'sandbox' | 'live'>('sandbox');
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [clearAppSecret, setClearAppSecret] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [secretHint, setSecretHint] = useState<string | null>(null);
  const [hasStoredSecret, setHasStoredSecret] = useState(false);
  const [checkoutEnabled, setCheckoutEnabled] = useState(true);
  const [toggleSaving, setToggleSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await adminFetch('/api/admin/ops/bkash-tokenized/settings', 'GET');
      const s = data.settings as SettingsPayload;
      const eff = data.effective as Effective;
      setEffective(eff);
      setEnvironment(s.environment === 'live' ? 'live' : 'sandbox');
      setAppKey(s.app_key || '');
      setUsername(s.username || '');
      setAppSecret('');
      setPassword('');
      setClearAppSecret(false);
      setClearPassword(false);
      setSecretHint(s.app_secret_hint);
      setHasStoredSecret(s.has_stored_app_secret);
      setCheckoutEnabled(s.checkout_enabled !== false);
    } catch (e: unknown) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Load failed' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const patch: Record<string, unknown> = {
        environment,
        app_key: appKey.trim(),
        username: username.trim(),
        checkout_enabled: checkoutEnabled,
      };
      if (clearAppSecret) patch.clear_app_secret = true;
      else if (appSecret.trim()) patch.app_secret = appSecret.trim();
      if (clearPassword) patch.clear_password = true;
      else if (password.trim()) patch.password = password.trim();

      const data = await adminFetch('/api/admin/ops/bkash-tokenized/settings', 'PATCH', patch);
      const s = data.settings as SettingsPayload;
      const eff = data.effective as Effective;
      setEffective(eff);
      setSecretHint(s.app_secret_hint);
      setHasStoredSecret(s.has_stored_app_secret);
      setAppSecret('');
      setPassword('');
      setClearAppSecret(false);
      setClearPassword(false);
      setCheckoutEnabled(s.checkout_enabled !== false);
      setEnvironment(s.environment === 'live' ? 'live' : 'sandbox');
      setMessage({
        type: 'ok',
        text: 'Saved. Server environment variables still override these when set.',
      });
    } catch (e: unknown) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const persistCheckoutToggle = async (enabled: boolean) => {
    if (effective?.checkout_toggle_locked_by_env) return;
    setToggleSaving(true);
    setMessage(null);
    const prev = checkoutEnabled;
    setCheckoutEnabled(enabled);
    try {
      const data = await adminFetch('/api/admin/ops/bkash-tokenized/settings', 'PATCH', { checkout_enabled: enabled });
      const eff = data.effective as Effective;
      setEffective(eff);
      const s = data.settings as SettingsPayload;
      setCheckoutEnabled(s.checkout_enabled !== false);
      setMessage({
        type: 'ok',
        text: enabled
          ? 'bKash (tokenized) is visible on checkout again when credentials are complete.'
          : 'bKash (tokenized) is hidden from checkout. Credentials remain stored.',
      });
    } catch (e: unknown) {
      setCheckoutEnabled(prev);
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Could not update checkout visibility' });
    } finally {
      setToggleSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="w-5 h-5 text-indigo-500 shrink-0" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">bKash Tokenized Checkout</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
          Use the API keys from your bKash merchant app for the same environment (sandbox for testing, production when you
          go live). The server picks the correct bKash API URL automatically — only set{' '}
          <code className="rounded bg-gray-100 dark:bg-white/10 px-1 py-0.5 text-[11px]">BKASH_TOKENIZED_API_ROOT</code> in{' '}
          <code className="rounded bg-gray-100 dark:bg-white/10 px-1 py-0.5 text-[11px]">.env</code> if bKash gives you a
          custom host. See{' '}
          <a
            className="text-indigo-600 dark:text-indigo-400 underline"
            href="https://developer.bka.sh/docs/tokenized-checkout-overview"
            target="_blank"
            rel="noreferrer"
          >
            bKash developer docs
          </a>
          .
        </p>

        <div className="rounded-lg border border-gray-200/90 dark:border-[#2a2a32] bg-gray-50/50 dark:bg-white/[0.03] px-3 py-3 mb-4">
          <div className="flex items-start gap-2.5">
            <input
              id="bkash-checkout-enabled"
              type="checkbox"
              checked={checkoutEnabled}
              disabled={toggleSaving || effective?.checkout_toggle_locked_by_env}
              onChange={(e) => void persistCheckoutToggle(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
            />
            <div className="min-w-0">
              <label htmlFor="bkash-checkout-enabled" className="text-sm font-medium text-gray-800 dark:text-gray-200">
                Show on checkout
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                Uncheck to hide bKash from the payment step (credentials stay saved).
              </p>
              {effective?.checkout_toggle_locked_by_env && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1.5">
                  Controlled by server env <code className="text-[10px]">BKASH_TOKENIZED_CHECKOUT_ENABLED</code>.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200/90 dark:border-[#2a2a32] bg-gray-50/70 dark:bg-white/[0.04] px-3 py-2 mb-5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
          <span className="font-medium text-gray-800 dark:text-gray-200">Status · </span>
          {effective?.configured && effective?.checkout_offered ? (
            <span className="text-emerald-700 dark:text-emerald-300">Live on checkout — configured and enabled.</span>
          ) : effective?.configured && !effective?.checkout_offered ? (
            <span className="text-amber-800 dark:text-amber-200">
              Credentials OK, but checkout is hidden (checkbox off or env override).
            </span>
          ) : checkoutEnabled && !effective?.configured ? (
            <span className="text-amber-800 dark:text-amber-200">
              Show on checkout is on — add app key, secret, and merchant username/password (or set{' '}
              <code className="text-[10px]">BKASH_*</code> in server <code className="text-[10px]">.env</code>) so customers
              can use this gateway.
            </span>
          ) : (
            <span className="text-amber-800 dark:text-amber-200">Not configured — add all fields below or use server .env.</span>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5" htmlFor="bkash-environment">
              Environment
            </label>
            <select
              id="bkash-environment"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value === 'live' ? 'live' : 'sandbox')}
              className={inputClass}
            >
              <option value="sandbox">Sandbox (test)</option>
              <option value="live">Production (live)</option>
            </select>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
              API base URL is set automatically for the environment you choose (sandbox vs live keys must match).
            </p>
            {effective?.api_root_from_env && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                URL overridden by server env <code className="text-[10px]">BKASH_TOKENIZED_API_ROOT</code>.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">App key</label>
            <input type="text" value={appKey} onChange={(e) => setAppKey(e.target.value)} className={inputClass} />
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
              Must be from the bKash portal for the same environment you selected above (sandbox vs production). Wrong keys
              show &quot;App key does not exist&quot;. If <code className="text-[10px]">BKASH_APP_KEY</code> is set on the
              server, it overrides this field.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">App secret</label>
            <input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder={hasStoredSecret ? 'Leave blank to keep current secret' : ''}
              className={inputClass}
            />
            {hasStoredSecret && secretHint && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Stored secret ends with {secretHint}</p>
            )}
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                checked={clearAppSecret}
                onChange={(e) => setClearAppSecret(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Remove stored app secret
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Username (merchant)</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Merchant password from bKash"
              className={inputClass}
            />
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                checked={clearPassword}
                onChange={(e) => setClearPassword(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Remove stored password
            </label>
          </div>
        </div>

        {message && (
          <p className={`mt-4 text-sm ${message.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {message.text}
          </p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3.5 py-2 text-sm disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>
    </div>
  );
};
