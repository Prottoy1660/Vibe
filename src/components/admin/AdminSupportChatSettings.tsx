import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiBaseUrl } from '../../lib/apiBase';
import {
  Loader2,
  Save,
  Sparkles,
  Trash2,
  Download,
  RefreshCw,
  Info,
  AlertTriangle,
} from 'lucide-react';

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
  help_chat_enabled: boolean;
  training_capture_enabled: boolean;
  whatsapp_e164: string;
  provider: string;
  openai_model: string;
  gemini_model: string;
  custom_prompt_append: string;
  has_openai_key: boolean;
  has_gemini_key: boolean;
  openai_key_hint: string | null;
  gemini_key_hint: string | null;
  env_openai_fallback: boolean;
  env_gemini_fallback: boolean;
};

type Effective = {
  help_chat_enabled: boolean;
  training_capture_enabled: boolean;
  ai_configured: boolean;
  whatsapp_e164: string | null;
  provider: string;
  openai_model: string;
  gemini_model: string;
};

type TrainingRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  session_id: string;
  role: string;
  content: string;
  meta: Record<string, unknown>;
};

export const AdminSupportChatSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [effective, setEffective] = useState<Effective | null>(null);

  const [helpChatEnabled, setHelpChatEnabled] = useState(true);
  const [trainingEnabled, setTrainingEnabled] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [provider, setProvider] = useState('auto');
  const [openaiModel, setOpenaiModel] = useState('');
  const [geminiModel, setGeminiModel] = useState('');
  const [customAppend, setCustomAppend] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [clearOpenaiKey, setClearOpenaiKey] = useState(false);
  const [clearGeminiKey, setClearGeminiKey] = useState(false);
  const [hints, setHints] = useState<{ openai: string | null; gemini: string | null }>({
    openai: null,
    gemini: null,
  });
  const [envFallback, setEnvFallback] = useState({ openai: false, gemini: false });

  const [trainingRows, setTrainingRows] = useState<TrainingRow[]>([]);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [clearingTraining, setClearingTraining] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await adminFetch('/api/admin/ops/support-chat/settings', 'GET');
      const s = data.settings as SettingsPayload;
      const eff = data.effective as Effective;
      setEffective(eff);
      setHelpChatEnabled(s.help_chat_enabled);
      setTrainingEnabled(s.training_capture_enabled);
      setWhatsapp(s.whatsapp_e164 || '');
      setProvider(s.provider || 'auto');
      setOpenaiModel(s.openai_model || '');
      setGeminiModel(s.gemini_model || '');
      setCustomAppend(s.custom_prompt_append || '');
      setHints({ openai: s.openai_key_hint, gemini: s.gemini_key_hint });
      setEnvFallback({ openai: s.env_openai_fallback, gemini: s.env_gemini_fallback });
      setOpenaiKey('');
      setGeminiKey('');
      setClearOpenaiKey(false);
      setClearGeminiKey(false);
    } catch (e: unknown) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Load failed' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTraining = useCallback(async () => {
    setTrainingLoading(true);
    try {
      const data = await adminFetch('/api/admin/ops/support-chat/training?limit=500', 'GET');
      setTrainingRows((data.rows as TrainingRow[]) || []);
    } catch (e: unknown) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Could not load training logs' });
    } finally {
      setTrainingLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadTraining();
  }, [loadTraining]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const patch: Record<string, unknown> = {
        help_chat_enabled: helpChatEnabled,
        training_capture_enabled: trainingEnabled,
        whatsapp_e164: whatsapp.trim(),
        provider,
        openai_model: openaiModel.trim(),
        gemini_model: geminiModel.trim(),
        custom_prompt_append: customAppend,
      };
      if (clearOpenaiKey) {
        patch.openai_api_key = '';
      } else if (openaiKey.trim()) {
        patch.openai_api_key = openaiKey.trim();
      }
      if (clearGeminiKey) {
        patch.gemini_api_key = '';
      } else if (geminiKey.trim()) {
        patch.gemini_api_key = geminiKey.trim();
      }

      const data = await adminFetch('/api/admin/ops/support-chat/settings', 'PATCH', patch);
      const eff = data.effective as Effective;
      setEffective(eff);
      const s = data.settings as SettingsPayload;
      setHints({ openai: s.openai_key_hint, gemini: s.gemini_key_hint });
      setEnvFallback({ openai: s.env_openai_fallback, gemini: s.env_gemini_fallback });
      setOpenaiKey('');
      setGeminiKey('');
      setClearOpenaiKey(false);
      setClearGeminiKey(false);
      setMessage({ type: 'ok', text: 'Saved. Changes apply on the next API request (cache refreshes within about a minute).' });
    } catch (e: unknown) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const exportTrainingJson = () => {
    const blob = new Blob([JSON.stringify(trainingRows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `support-chat-training-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const clearTraining = async () => {
    if (!window.confirm('Delete all captured training rows? This cannot be undone.')) return;
    setClearingTraining(true);
    try {
      await adminFetch('/api/admin/ops/support-chat/training', 'DELETE');
      setTrainingRows([]);
      setMessage({ type: 'ok', text: 'Training log cleared.' });
    } catch (e: unknown) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Clear failed' });
    } finally {
      setClearingTraining(false);
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
    <div className="space-y-8 pb-12 max-w-4xl">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/40 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent dark:from-indigo-950/40 dark:via-[#151518] dark:to-[#151518] p-6 md:p-8">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Sparkles className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Help chat (AI)</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
              Turn the floating assistant on or off, set WhatsApp, API keys / models, optional extra instructions for the
              model, and capture anonymized Q&amp;A for review or future training exports.
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === 'ok'
              ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
              : 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {effective && (
        <div className="rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4 text-sm">
          <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Effective runtime (after save + env fallbacks)</p>
          <ul className="text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
            <li>Help chat visible to users: {effective.help_chat_enabled ? 'Yes' : 'No'}</li>
            <li>AI ready (keys + provider): {effective.ai_configured ? 'Yes' : 'No'}</li>
            <li>Training capture: {effective.training_capture_enabled ? 'On' : 'Off'}</li>
            <li>WhatsApp (wa.me): {effective.whatsapp_e164 || '—'}</li>
            <li>Provider: {effective.provider}</li>
            <li>OpenAI model: {effective.openai_model}</li>
            <li>Gemini model: {effective.gemini_model}</li>
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 space-y-6">
        <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            API keys stored here live in <code className="text-[11px]">system_settings</code> (admin-only). Prefer server{' '}
            <code className="text-[11px]">.env</code> for production if you do not want keys in the database. Env keys
            still work as fallback when DB keys are empty.
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={helpChatEnabled}
              onChange={(e) => setHelpChatEnabled(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Enable help chat (floating widget)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={trainingEnabled}
              onChange={(e) => setTrainingEnabled(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Capture Q&amp;A for training / review</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">WhatsApp number (digits only)</label>
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm"
            placeholder="e.g. 8801712345678"
          />
          <p className="text-xs text-gray-500 mt-1">Shown as wa.me link in the chat panel. Empty falls back to server env if set.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">AI provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm"
          >
            <option value="auto">Auto (OpenAI first, else Gemini)</option>
            <option value="openai">OpenAI only</option>
            <option value="gemini">Gemini only</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
              OpenAI API key {hints.openai ? <span className="text-indigo-600 dark:text-indigo-400">({hints.openai} stored)</span> : null}
              {envFallback.openai ? (
                <span className="text-gray-500 font-normal"> · env fallback active</span>
              ) : null}
            </label>
            <input
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm"
              placeholder={hints.openai ? 'New key (optional)' : 'sk-…'}
              autoComplete="off"
            />
            <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={clearOpenaiKey} onChange={(e) => setClearOpenaiKey(e.target.checked)} />
              Remove stored OpenAI key (use env only)
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
              Gemini API key {hints.gemini ? <span className="text-indigo-600 dark:text-indigo-400">({hints.gemini} stored)</span> : null}
              {envFallback.gemini ? (
                <span className="text-gray-500 font-normal"> · env fallback active</span>
              ) : null}
            </label>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm"
              placeholder={hints.gemini ? 'New key (optional)' : 'AIza…'}
              autoComplete="off"
            />
            <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={clearGeminiKey} onChange={(e) => setClearGeminiKey(e.target.checked)} />
              Remove stored Gemini key (use env only)
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">OpenAI model (optional)</label>
            <input
              value={openaiModel}
              onChange={(e) => setOpenaiModel(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm"
              placeholder="Default: gpt-4o-mini"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Gemini model (optional)</label>
            <input
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm"
              placeholder="Default: gemini-2.0-flash"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
            Extra instructions for the assistant (optional)
          </label>
          <textarea
            value={customAppend}
            onChange={(e) => setCustomAppend(e.target.value)}
            rows={5}
            maxLength={6000}
            className="w-full rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2.5 text-sm resize-y min-h-[100px]"
            placeholder="Short internal notes, promos, or policies — appended safely to the model context. Do not put secrets here."
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-4 text-sm disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save settings
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-[#26262d] py-2.5 px-4 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            <RefreshCw className="w-4 h-4" />
            Reload
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Training capture log</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-start gap-1">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Rows are written only when capture is on and users get AI replies. Logged-in users are linked by{' '}
              <code className="text-[11px]">user_id</code> for support context — handle under your privacy policy.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadTraining()}
              disabled={trainingLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-[#26262d] py-2 px-3 text-xs font-medium"
            >
              {trainingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
            <button
              type="button"
              onClick={exportTrainingJson}
              disabled={!trainingRows.length}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-[#26262d] py-2 px-3 text-xs font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              Export JSON
            </button>
            <button
              type="button"
              onClick={() => void clearTraining()}
              disabled={clearingTraining || !trainingRows.length}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 py-2 px-3 text-xs font-medium"
            >
              {clearingTraining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Clear all
            </button>
          </div>
        </div>

        <div className="max-h-[420px] overflow-auto rounded-xl border border-gray-100 dark:border-[#26262d] text-xs">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-gray-50 dark:bg-[#1a1a1f]">
              <tr>
                <th className="p-2 font-semibold text-gray-600 dark:text-gray-300">Time</th>
                <th className="p-2 font-semibold text-gray-600 dark:text-gray-300">Role</th>
                <th className="p-2 font-semibold text-gray-600 dark:text-gray-300">Session</th>
                <th className="p-2 font-semibold text-gray-600 dark:text-gray-300">Preview</th>
              </tr>
            </thead>
            <tbody>
              {trainingRows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 dark:border-[#26262d]">
                  <td className="p-2 text-gray-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-2 font-medium">{r.role}</td>
                  <td className="p-2 font-mono text-[10px] text-gray-500 max-w-[100px] truncate">{r.session_id}</td>
                  <td className="p-2 text-gray-700 dark:text-gray-300 max-w-md truncate">{r.content}</td>
                </tr>
              ))}
              {!trainingRows.length && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    No rows yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
