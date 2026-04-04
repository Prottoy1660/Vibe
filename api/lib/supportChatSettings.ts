import type { SupabaseClient } from '@supabase/supabase-js';

export const SUPPORT_CHAT_SETTINGS_KEY = 'support_chat';

export type SupportChatProvider = 'auto' | 'openai' | 'gemini';

export type SupportChatStoredValue = {
  help_chat_enabled?: boolean;
  training_capture_enabled?: boolean;
  whatsapp_e164?: string;
  provider?: SupportChatProvider;
  openai_api_key?: string;
  gemini_api_key?: string;
  openai_model?: string;
  gemini_model?: string;
  custom_prompt_append?: string;
};

export type SupportChatRuntime = {
  help_chat_enabled: boolean;
  training_capture_enabled: boolean;
  whatsapp_e164: string | null;
  ai_configured: boolean;
  openaiKey: string | null;
  geminiKey: string | null;
  openaiModel: string;
  geminiModel: string;
  provider: SupportChatProvider;
  custom_prompt_append: string;
};

const CACHE_MS = 45_000;
let cache: { at: number; runtime: SupportChatRuntime; stored: SupportChatStoredValue } | null = null;

function digits(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  return d.length >= 10 ? d : null;
}

function envWhatsapp(): string | null {
  const raw = process.env.SUPPORT_WHATSAPP_E164 || process.env.SUPPORT_WHATSAPP || '';
  return digits(raw);
}

export function invalidateSupportChatRuntimeCache() {
  cache = null;
}

export async function loadSupportChatStored(supabase: SupabaseClient): Promise<SupportChatStoredValue> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', SUPPORT_CHAT_SETTINGS_KEY)
    .maybeSingle();
  if (error || !data?.value || typeof data.value !== 'object') {
    return {};
  }
  return data.value as SupportChatStoredValue;
}

export function resolveSupportChatRuntime(stored: SupportChatStoredValue): SupportChatRuntime {
  const help_chat_enabled = stored.help_chat_enabled !== false;
  const training_capture_enabled = stored.training_capture_enabled === true;

  const waStored = typeof stored.whatsapp_e164 === 'string' ? digits(stored.whatsapp_e164) : null;
  const whatsapp_e164 = waStored || envWhatsapp();

  // Server .env wins over DB so rotating keys in deployment does not stay stuck on an old admin-saved key.
  const openaiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    (typeof stored.openai_api_key === 'string' && stored.openai_api_key.trim()
      ? stored.openai_api_key.trim()
      : null) ||
    null;

  const geminiKey =
    process.env.GOOGLE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    (typeof stored.gemini_api_key === 'string' && stored.gemini_api_key.trim()
      ? stored.gemini_api_key.trim()
      : null) ||
    null;

  const provider: SupportChatProvider =
    stored.provider === 'openai' || stored.provider === 'gemini' || stored.provider === 'auto'
      ? stored.provider
      : 'auto';

  const openaiModel =
    (typeof stored.openai_model === 'string' && stored.openai_model.trim()
      ? stored.openai_model.trim()
      : null) ||
    process.env.OPENAI_SUPPORT_MODEL?.trim() ||
    'gpt-4o-mini';

  const geminiModel =
    (typeof stored.gemini_model === 'string' && stored.gemini_model.trim()
      ? stored.gemini_model.trim()
      : null) ||
    process.env.GEMINI_SUPPORT_MODEL?.trim() ||
    'gemini-2.0-flash';

  let ai_configured = false;
  if (provider === 'openai') ai_configured = Boolean(openaiKey);
  else if (provider === 'gemini') ai_configured = Boolean(geminiKey);
  else ai_configured = Boolean(openaiKey || geminiKey);

  const custom =
    typeof stored.custom_prompt_append === 'string' ? stored.custom_prompt_append.trim().slice(0, 6000) : '';

  return {
    help_chat_enabled,
    training_capture_enabled,
    whatsapp_e164,
    ai_configured,
    openaiKey,
    geminiKey,
    openaiModel,
    geminiModel,
    provider,
    custom_prompt_append: custom,
  };
}

export async function getSupportChatRuntimeCached(supabase: SupabaseClient): Promise<SupportChatRuntime> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return cache.runtime;
  }
  const stored = await loadSupportChatStored(supabase);
  const runtime = resolveSupportChatRuntime(stored);
  cache = { at: now, runtime, stored };
  return runtime;
}

export function maskKeyHint(key: string | undefined | null): string | null {
  if (!key || key.length < 6) return null;
  return `…${key.slice(-4)}`;
}

export function toAdminSettingsPayload(stored: SupportChatStoredValue, runtime: SupportChatRuntime) {
  return {
    help_chat_enabled: runtime.help_chat_enabled,
    training_capture_enabled: runtime.training_capture_enabled,
    whatsapp_e164: typeof stored.whatsapp_e164 === 'string' ? stored.whatsapp_e164 : '',
    provider: runtime.provider,
    openai_model: stored.openai_model || '',
    gemini_model: stored.gemini_model || '',
    custom_prompt_append: stored.custom_prompt_append || '',
    has_openai_key: Boolean(stored.openai_api_key && String(stored.openai_api_key).trim()),
    has_gemini_key: Boolean(stored.gemini_api_key && String(stored.gemini_api_key).trim()),
    openai_key_hint: maskKeyHint(stored.openai_api_key),
    gemini_key_hint: maskKeyHint(stored.gemini_api_key),
    env_openai_fallback: Boolean(process.env.OPENAI_API_KEY?.trim()),
    env_gemini_fallback: Boolean(process.env.GOOGLE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim()),
  };
}

const PATCH_STRING_FIELDS = [
  'whatsapp_e164',
  'openai_model',
  'gemini_model',
  'custom_prompt_append',
] as const;

export function mergeSupportChatPatch(
  existing: SupportChatStoredValue,
  patch: Record<string, unknown>,
): SupportChatStoredValue {
  const next: SupportChatStoredValue = { ...existing };

  if ('help_chat_enabled' in patch) {
    next.help_chat_enabled = Boolean(patch.help_chat_enabled);
  }
  if ('training_capture_enabled' in patch) {
    next.training_capture_enabled = Boolean(patch.training_capture_enabled);
  }
  if ('provider' in patch) {
    const p = String(patch.provider || '');
    if (p === 'openai' || p === 'gemini' || p === 'auto') next.provider = p;
  }

  for (const k of PATCH_STRING_FIELDS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === null || v === undefined) {
      (next as any)[k] = '';
      continue;
    }
    const s = String(v).trim();
    (next as any)[k] = k === 'custom_prompt_append' ? s.slice(0, 6000) : s.slice(0, 500);
  }

  for (const field of ['openai_api_key', 'gemini_api_key'] as const) {
    if (!(field in patch)) continue;
    const v = patch[field];
    if (v === null || v === '') {
      delete (next as any)[field];
      continue;
    }
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (!t) {
      delete (next as any)[field];
      continue;
    }
    if (t === '********' || t === '••••••••') continue;
    (next as any)[field] = t.slice(0, 500);
  }

  return next;
}
