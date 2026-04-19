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
  base_url: string;
  has_stored_api_key: boolean;
  api_key_hint: string | null;
  env_api_key: boolean;
  env_base_url: boolean;
  checkout_enabled: boolean;
};

type Effective = {
  checkout_ready: boolean;
  checkout_offered: boolean;
  checkout_toggle_locked_by_env: boolean;
  api_key_from_env: boolean;
  base_url_from_env: boolean;
};

export const AdminUddoktaPaySettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [effective, setEffective] = useState<Effective | null>(null);

  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [envFlags, setEnvFlags] = useState({ api: false, base: false });
  const [checkoutEnabled, setCheckoutEnabled] = useState(true);
  const [toggleSaving, setToggleSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await adminFetch('/api/admin/ops/uddoktapay/settings', 'GET');
      const s = data.settings as SettingsPayload;
      const eff = data.effective as Effective;
      setEffective(eff);
      setBaseUrl(s.base_url || '');
      setApiKey('');
      setClearApiKey(false);
      setHint(s.api_key_hint);
      setHasStoredKey(s.has_stored_api_key);
      setEnvFlags({ api: s.env_api_key, base: s.env_base_url });
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
      const patch: Record<string, unknown> = { base_url: baseUrl.trim(), checkout_enabled: checkoutEnabled };
      if (clearApiKey) {
        patch.clear_api_key = true;
      } else if (apiKey.trim()) {
        patch.api_key = apiKey.trim();
      }

      const data = await adminFetch('/api/admin/ops/uddoktapay/settings', 'PATCH', patch);
      const s = data.settings as SettingsPayload;
      const eff = data.effective as Effective;
      setEffective(eff);
      setHint(s.api_key_hint);
      setHasStoredKey(s.has_stored_api_key);
      setEnvFlags({ api: s.env_api_key, base: s.env_base_url });
      setCheckoutEnabled(s.checkout_enabled !== false);
      setApiKey('');
      setClearApiKey(false);
      setMessage({
        type: 'ok',
        text: 'Saved. Checkout uses server environment variables when set; otherwise these stored values.',
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
      const data = await adminFetch('/api/admin/ops/uddoktapay/settings', 'PATCH', { checkout_enabled: enabled });
      const eff = data.effective as Effective;
      setEffective(eff);
      const s = data.settings as SettingsPayload;
      setCheckoutEnabled(s.checkout_enabled !== false);
      setEnvFlags({ api: s.env_api_key, base: s.env_base_url });
      setMessage({
        type: 'ok',
        text: enabled
          ? 'UddoktaPay is visible on checkout again (when API URL and key are configured).'
          : 'UddoktaPay is hidden from checkout. Customers will not see this option.',
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
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">UddoktaPay gateway</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
          Checkout and wallet recharge use UddoktaPay (bKash, Nagad, Rocket, cards, and bank channels you enable in the
          UddoktaPay dashboard). Paste your merchant API base URL and API key here, or keep using{' '}
          <code className="rounded bg-gray-100 dark:bg-white/10 px-1 py-0.5 text-[11px]">UDDOKTAPAY_*</code> in server
          environment — env always wins when set.
        </p>

        <div className="rounded-lg border border-gray-200/90 dark:border-[#2a2a32] bg-gray-50/50 dark:bg-white/[0.03] px-3 py-3 mb-4">
          <div className="flex items-start gap-2.5">
            <input
              id="uddokta-checkout-enabled"
              type="checkbox"
              checked={checkoutEnabled}
              disabled={toggleSaving || effective?.checkout_toggle_locked_by_env}
              onChange={(e) => void persistCheckoutToggle(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
            />
            <div className="min-w-0">
              <label htmlFor="uddokta-checkout-enabled" className="text-sm font-medium text-gray-800 dark:text-gray-200">
                Show on checkout
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                Uncheck to hide UddoktaPay from the payment step (credentials stay saved).
              </p>
              {effective?.checkout_toggle_locked_by_env && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1.5">
                  Controlled by server env <code className="text-[10px]">UDDOKTAPAY_CHECKOUT_ENABLED</code>.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200/90 dark:border-[#2a2a32] bg-gray-50/70 dark:bg-white/[0.04] px-3 py-2 mb-5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
          <span className="font-medium text-gray-800 dark:text-gray-200">Status · </span>
          {effective?.checkout_ready && effective?.checkout_offered ? (
            <span className="text-emerald-700 dark:text-emerald-300">Live on checkout — API configured and gateway is enabled.</span>
          ) : effective?.checkout_ready && !effective?.checkout_offered ? (
            <span className="text-amber-800 dark:text-amber-200">
              Credentials OK, but checkout is hidden (checkbox off or env override).
            </span>
          ) : checkoutEnabled && !effective?.checkout_ready ? (
            <span className="text-amber-800 dark:text-amber-200">
              Show on checkout is on — add API base URL and key (or set <code className="text-[11px]">UDDOKTAPAY_*</code> in
              server <code className="text-[11px]">.env</code>) so customers can pay.
            </span>
          ) : (
            <span className="text-amber-800 dark:text-amber-200">
              Not ready — add base URL and API key here or in server <code className="text-[11px]">.env</code>.
            </span>
          )}
          {(envFlags.api || envFlags.base) && (
            <span className="block mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              {envFlags.api && <span className="mr-2">API key from env</span>}
              {envFlags.base && <span>Base URL from env</span>}
            </span>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">API base URL</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://sandbox.uddoktapay.com"
              className={inputClass}
              autoComplete="off"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No trailing slash required.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasStoredKey ? 'Leave blank to keep current key' : 'RT-UDDOKTAPAY-API-KEY value'}
              className={inputClass}
              autoComplete="new-password"
            />
            {hasStoredKey && hint && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Stored key ends with {hint}</p>
            )}
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                checked={clearApiKey}
                onChange={(e) => setClearApiKey(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Remove stored API key (env key still applies if set)
            </label>
          </div>
        </div>

        {message && (
          <p
            className={`mt-4 text-sm ${message.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
          >
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
