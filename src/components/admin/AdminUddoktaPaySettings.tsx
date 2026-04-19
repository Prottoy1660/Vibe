import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiBaseUrl } from '../../lib/apiBase';
import { Loader2, Save, Info, CreditCard } from 'lucide-react';

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

type SettingsPayload = {
  base_url: string;
  has_stored_api_key: boolean;
  api_key_hint: string | null;
  env_api_key: boolean;
  env_base_url: boolean;
};

type Effective = {
  checkout_ready: boolean;
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
      const patch: Record<string, unknown> = { base_url: baseUrl.trim() };
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

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-6 shadow-sm dark:shadow-none">
        <div className="flex items-start gap-3 mb-5">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">UddoktaPay gateway</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Checkout and wallet recharge use UddoktaPay (bKash, Nagad, Rocket, cards, and bank channels you enable in
              the UddoktaPay dashboard). Paste your merchant API base URL and API key here, or keep using{' '}
              <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded">UDDOKTAPAY_*</code> in server
              environment — env always wins when set.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-indigo-200/60 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/25 px-4 py-3 flex gap-2 text-sm text-gray-700 dark:text-gray-300 mb-5">
          <Info className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Status</p>
            <p className="mt-1 text-xs leading-relaxed">
              {effective?.checkout_ready ? (
                <span className="text-emerald-700 dark:text-emerald-300">Live checkout — API URL and key are configured.</span>
              ) : (
                <span className="text-amber-800 dark:text-amber-200">
                  Not ready — add base URL and API key here or in server <code className="text-[11px]">.env</code>.
                </span>
              )}
            </p>
            {(envFlags.api || envFlags.base) && (
              <p className="mt-2 text-[11px] text-gray-600 dark:text-gray-400">
                {envFlags.api && <span className="mr-2">API key from env</span>}
                {envFlags.base && <span>Base URL from env</span>}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">API base URL</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://sandbox.uddoktapay.com"
              className="w-full rounded-xl border border-gray-200 dark:border-[#2a2a32] bg-white dark:bg-[#1a1a1f] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
              autoComplete="off"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No trailing slash required.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasStoredKey ? 'Leave blank to keep current key' : 'RT-UDDOKTAPAY-API-KEY value'}
              className="w-full rounded-xl border border-gray-200 dark:border-[#2a2a32] bg-white dark:bg-[#1a1a1f] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
              autoComplete="new-password"
            />
            {hasStoredKey && hint && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Stored key ends with {hint}</p>
            )}
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={clearApiKey}
                onChange={(e) => setClearApiKey(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Remove stored API key (env key still applies if set)
            </label>
          </div>
        </div>

        {message && (
          <p
            className={`mt-4 text-sm ${message.type === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`}
          >
            {message.text}
          </p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>
    </div>
  );
};
