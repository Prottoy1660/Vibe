import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiBaseUrl } from '../../lib/apiBase';
import { useConfirmDialog } from '../../contexts/ConfirmDialogContext';
import {
  Loader2,
  Save,
  Sparkles,
  Trash2,
  Download,
  RefreshCw,
  Info,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';

function HelpDetails({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group mt-2 rounded-lg border border-gray-200/90 dark:border-[#2a2a32] bg-gray-50/70 dark:bg-white/[0.04] text-sm">
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

function StatusPill({
  ok,
  className = '',
  children,
}: {
  ok?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
        ok === true
          ? 'border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
          : ok === false
            ? 'border-amber-200/80 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100'
            : 'border-gray-200 dark:border-[#2a2a32] bg-gray-50 dark:bg-white/[0.04] text-gray-700 dark:text-gray-300'
      } ${className}`.trim()}
    >
      {children}
    </span>
  );
}

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
  const { confirm } = useConfirmDialog();
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
      setMessage({ type: 'ok', text: 'Saved. Live for new requests within about a minute.' });
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
    const ok = await confirm({
      title: 'Delete all training rows?',
      description: 'This cannot be undone.',
      confirmLabel: 'Delete all',
      variant: 'danger',
    });
    if (!ok) return;
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
    <div className="w-full max-w-6xl space-y-5 pb-10">
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:items-start">
        <aside className="space-y-5 min-w-0 xl:col-span-4">
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 shadow-sm dark:shadow-none">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Help chat (AI)</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
              Floating widget, WhatsApp link, AI keys/models, and optional training capture.
            </p>
            <HelpDetails summary="More about this page">
              <p>
                You can disable the widget for everyone, tune which AI provider runs, store keys in the database (or rely on
                server env), add short policy text for the model, and optionally log Q&amp;A rows for internal review or export.
              </p>
            </HelpDetails>
          </div>
        </div>
      </div>

      {effective && (
        <div className="rounded-xl border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#151518] p-4">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2.5">Current runtime</p>
          <div className="flex flex-wrap gap-2">
            <StatusPill ok={effective.help_chat_enabled}>
              Chat {effective.help_chat_enabled ? 'on' : 'off'}
            </StatusPill>
            <StatusPill ok={effective.ai_configured}>AI {effective.ai_configured ? 'ready' : 'not ready'}</StatusPill>
            <StatusPill>
              Capture {effective.training_capture_enabled ? 'on' : 'off'}
            </StatusPill>
            <StatusPill>
              WA {effective.whatsapp_e164 || '—'}
            </StatusPill>
            <StatusPill>Provider: {effective.provider}</StatusPill>
            <StatusPill className="font-mono text-[10px]">OpenAI: {effective.openai_model || 'default'}</StatusPill>
            <StatusPill className="font-mono text-[10px]">Gemini: {effective.gemini_model || 'default'}</StatusPill>
          </div>
          <HelpDetails summary="What “current runtime” means">
            <p>
              Values reflect saved settings plus server environment fallbacks. They update after Save or Reload; API caches
              can lag up to about a minute.
            </p>
          </HelpDetails>
        </div>
      )}
        </aside>

        <div className="min-w-0 xl:col-span-8">
      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 space-y-5">
        <div className="flex gap-2.5 items-start rounded-lg border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <p className="leading-relaxed">
              API keys here live in <code className="rounded bg-black/5 dark:bg-white/10 px-1 text-[11px]">system_settings</code>.
              If both <code className="text-[11px]">.env</code> and the DB have a key, the server uses <strong>.env first</strong>.
            </p>
            <HelpDetails summary="Env vs database keys">
              <p>
                Admin-only rows in <code className="text-[11px]">system_settings</code> store keys you paste here. When the
                server has a key in Coolify or <code className="text-[11px]">.env</code>, that value wins over the database
                copy, so deploy-time keys apply without clearing admin. If only one source has a key, that one is used.
              </p>
            </HelpDetails>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <label className="flex items-start gap-3 cursor-pointer min-w-0 sm:min-w-[200px]">
            <input
              type="checkbox"
              checked={helpChatEnabled}
              onChange={(e) => setHelpChatEnabled(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">Enable help chat widget</span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer min-w-0 sm:min-w-[220px]">
            <input
              type="checkbox"
              checked={trainingEnabled}
              onChange={(e) => setTrainingEnabled(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-snug">Capture Q&amp;A for review</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">WhatsApp number</label>
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2 text-sm"
            placeholder="Digits only, e.g. 8801712345678"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Shown as wa.me in chat. Empty uses server env if set.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">AI provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2 text-sm"
          >
            <option value="auto">Auto (OpenAI first, else Gemini)</option>
            <option value="openai">OpenAI only</option>
            <option value="gemini">Gemini only</option>
          </select>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">API keys</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">OpenAI</span>
                {hints.openai ? (
                  <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
                    On file · {hints.openai}
                  </span>
                ) : null}
                {envFallback.openai ? (
                  <span className="rounded-full border border-gray-200 dark:border-[#2a2a32] px-2 py-0.5 text-[11px] text-gray-600 dark:text-gray-400">
                    Env fallback
                  </span>
                ) : null}
              </div>
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2 text-sm"
                placeholder={hints.openai ? 'New key (optional)' : 'sk-…'}
                autoComplete="off"
              />
              <label className="flex items-start gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-gray-300 shrink-0"
                  checked={clearOpenaiKey}
                  onChange={(e) => setClearOpenaiKey(e.target.checked)}
                />
                <span>Clear stored key (use env only)</span>
              </label>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Gemini</span>
                {hints.gemini ? (
                  <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
                    On file · {hints.gemini}
                  </span>
                ) : null}
                {envFallback.gemini ? (
                  <span className="rounded-full border border-gray-200 dark:border-[#2a2a32] px-2 py-0.5 text-[11px] text-gray-600 dark:text-gray-400">
                    Env fallback
                  </span>
                ) : null}
              </div>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2 text-sm"
                placeholder={hints.gemini ? 'New key (optional)' : 'AIza…'}
                autoComplete="off"
              />
              <label className="flex items-start gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-gray-300 shrink-0"
                  checked={clearGeminiKey}
                  onChange={(e) => setClearGeminiKey(e.target.checked)}
                />
                <span>Clear stored key (use env only)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">OpenAI model</label>
            <input
              value={openaiModel}
              onChange={(e) => setOpenaiModel(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2 text-sm"
              placeholder="Default: gpt-4o-mini"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Gemini model</label>
            <input
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2 text-sm"
              placeholder="Default: gemini-2.0-flash"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Extra instructions (optional)</label>
          <textarea
            value={customAppend}
            onChange={(e) => setCustomAppend(e.target.value)}
            rows={4}
            maxLength={6000}
            className="w-full max-h-48 rounded-lg border border-gray-200 dark:border-[#26262d] bg-white dark:bg-[#111113] px-3 py-2 text-sm resize-y leading-relaxed [scrollbar-width:thin]"
            placeholder="Tone, promos, or policies for the model — not secrets."
          />
          <HelpDetails summary="How this field is used">
            <p>
              Text here is appended to the assistant&apos;s context safely. Keep it short; do not paste API keys or private
              customer data.
            </p>
          </HelpDetails>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-3.5 text-sm disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-[#26262d] py-2 px-3.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            <RefreshCw className="w-4 h-4" />
            Reload
          </button>
        </div>
      </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-[#26262d] bg-white dark:bg-[#151518] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Training capture log</h2>
            <div className="mt-2 flex gap-2 items-start">
              <Info className="w-3.5 h-3.5 shrink-0 text-gray-400 mt-0.5" aria-hidden />
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed min-w-0">
                Rows appear when capture is on and the AI replies. Logged-in chats may include{' '}
                <code className="rounded bg-gray-100 dark:bg-white/10 px-1 text-[11px]">user_id</code> for support — follow your
                privacy policy.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadTraining()}
              disabled={trainingLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-[#26262d] py-1.5 px-3 text-xs font-medium"
            >
              {trainingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
            <button
              type="button"
              onClick={exportTrainingJson}
              disabled={!trainingRows.length}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-[#26262d] py-1.5 px-3 text-xs font-medium disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              type="button"
              onClick={() => void clearTraining()}
              disabled={clearingTraining || !trainingRows.length}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 py-1.5 px-3 text-xs font-medium disabled:opacity-50"
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
                  <td className="p-2 text-gray-700 dark:text-gray-300 min-w-0 truncate" title={r.content}>
                    {r.content}
                  </td>
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
