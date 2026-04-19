import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiBaseUrl } from '../../lib/apiBase';
import { Loader2, Save, Info } from 'lucide-react';

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
  api_root: string;
  app_key: string;
  username: string;
  has_stored_app_secret: boolean;
  app_secret_hint: string | null;
  env_api_root: boolean;
  env_app_key: boolean;
};

type Effective = {
  configured: boolean;
  api_root_from_env: boolean;
  app_key_from_env: boolean;
};

export const AdminBkashTokenizedSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [effective, setEffective] = useState<Effective | null>(null);

  const [apiRoot, setApiRoot] = useState('');
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [clearAppSecret, setClearAppSecret] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [secretHint, setSecretHint] = useState<string | null>(null);
  const [hasStoredSecret, setHasStoredSecret] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await adminFetch('/api/admin/ops/bkash-tokenized/settings', 'GET');
      const s = data.settings as SettingsPayload;
      const eff = data.effective as Effective;
      setEffective(eff);
      setApiRoot(s.api_root || '');
      setAppKey(s.app_key || '');
      setUsername(s.username || '');
      setAppSecret('');
      setPassword('');
      setClearAppSecret(false);
      setClearPassword(false);
      setSecretHint(s.app_secret_hint);
      setHasStoredSecret(s.has_stored_app_secret);
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
        api_root: apiRoot.trim(),
        app_key: appKey.trim(),
        username: username.trim(),
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
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">bKash Tokenized Checkout</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Credentials from bKash onboarding. API root is usually{' '}
          <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded">
            https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized
          </code>{' '}
          (sandbox) or the live URL bKash provides. See{' '}
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

        <div className="rounded-xl border border-indigo-200/60 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/25 px-4 py-3 flex gap-2 text-sm text-gray-700 dark:text-gray-300 mt-4">
          <Info className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Status</p>
            <p className="mt-1 text-xs">
              {effective?.configured ? (
                <span className="text-emerald-700 dark:text-emerald-300">Ready — checkout can offer bKash (tokenized).</span>
              ) : (
                <span className="text-amber-800 dark:text-amber-200">Not configured — add all fields below or use server .env.</span>
              )}
            </p>
          </div>
        </div>

        <div className="space-y-4 mt-6">
          <div>
            <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">API root URL</label>
            <input
              type="url"
              value={apiRoot}
              onChange={(e) => setApiRoot(e.target.value)}
              placeholder="https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized"
              className="w-full rounded-xl border border-gray-200 dark:border-[#2a2a32] bg-white dark:bg-[#1a1a1f] px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">App key</label>
            <input
              type="text"
              value={appKey}
              onChange={(e) => setAppKey(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-[#2a2a32] bg-white dark:bg-[#1a1a1f] px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">App secret</label>
            <input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder={hasStoredSecret ? 'Leave blank to keep current secret' : ''}
              className="w-full rounded-xl border border-gray-200 dark:border-[#2a2a32] bg-white dark:bg-[#1a1a1f] px-3 py-2.5 text-sm"
            />
            {hasStoredSecret && secretHint && (
              <p className="text-xs text-gray-500 mt-1">Stored secret ends with {secretHint}</p>
            )}
            <label className="mt-2 flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={clearAppSecret} onChange={(e) => setClearAppSecret(e.target.checked)} />
              Remove stored app secret
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">Username (merchant)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-[#2a2a32] bg-white dark:bg-[#1a1a1f] px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Merchant password from bKash"
              className="w-full rounded-xl border border-gray-200 dark:border-[#2a2a32] bg-white dark:bg-[#1a1a1f] px-3 py-2.5 text-sm"
            />
            <label className="mt-2 flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={clearPassword} onChange={(e) => setClearPassword(e.target.checked)} />
              Remove stored password
            </label>
          </div>
        </div>

        {message && (
          <p className={`mt-4 text-sm ${message.type === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600'}`}>
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
