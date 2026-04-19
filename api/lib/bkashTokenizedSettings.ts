import type { SupabaseClient } from '@supabase/supabase-js';
import { maskKeyHint } from './supportChatSettings.js';

export const BKASH_TOKENIZED_SETTINGS_KEY = 'bkash_tokenized_gateway';

export type BkashTokenizedStoredValue = {
  /** e.g. https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized */
  api_root?: string;
  app_key?: string;
  app_secret?: string;
  username?: string;
  password?: string;
};

export type BkashTokenizedResolvedCredentials = {
  apiRoot: string;
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
  api_root_from_env: boolean;
  app_key_from_env: boolean;
};

const CACHE_MS = 45_000;
let cache: {
  at: number;
  stored: BkashTokenizedStoredValue;
  resolved: BkashTokenizedResolvedCredentials | null;
} | null = null;

export function invalidateBkashTokenizedCredentialsCache() {
  cache = null;
}

export function normalizeBkashApiRoot(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/\/+$/, '');
}

export async function loadBkashTokenizedStored(supabase: SupabaseClient): Promise<BkashTokenizedStoredValue> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', BKASH_TOKENIZED_SETTINGS_KEY)
    .maybeSingle();
  if (error || !data?.value || typeof data.value !== 'object') {
    return {};
  }
  return data.value as BkashTokenizedStoredValue;
}

/** Server `.env` wins when set (same pattern as UddoktaPay / support chat). */
export function resolveBkashTokenizedCredentials(
  stored: BkashTokenizedStoredValue,
): BkashTokenizedResolvedCredentials | null {
  const envRoot = normalizeBkashApiRoot(
    process.env.BKASH_TOKENIZED_API_ROOT || process.env.BKASH_TOKENIZE_BASE_URL || '',
  );
  const envKey = (process.env.BKASH_APP_KEY || process.env.BKASH_TOKENIZE_APP_KEY || '').trim();
  const envSecret = (process.env.BKASH_APP_SECRET || process.env.BKASH_TOKENIZE_APP_SECRET || '').trim();
  const envUser = (process.env.BKASH_USERNAME || process.env.BKASH_TOKENIZE_USER_NAME || '').trim();
  const envPass = (process.env.BKASH_PASSWORD || process.env.BKASH_TOKENIZE_PASSWORD || '').trim();

  const dbRoot = normalizeBkashApiRoot(stored.api_root);
  const dbKey = typeof stored.app_key === 'string' ? stored.app_key.trim() : '';
  const dbSecret = typeof stored.app_secret === 'string' ? stored.app_secret.trim() : '';
  const dbUser = typeof stored.username === 'string' ? stored.username.trim() : '';
  const dbPass = typeof stored.password === 'string' ? stored.password.trim() : '';

  const apiRoot = envRoot || dbRoot;
  const appKey = envKey || dbKey;
  const appSecret = envSecret || dbSecret;
  const username = envUser || dbUser;
  const password = envPass || dbPass;

  if (!apiRoot || !appKey || !appSecret || !username || !password) {
    return null;
  }

  return {
    apiRoot,
    appKey,
    appSecret,
    username,
    password,
    api_root_from_env: Boolean(envRoot),
    app_key_from_env: Boolean(envKey),
  };
}

export async function getBkashTokenizedCredentialsCached(
  supabase: SupabaseClient,
): Promise<BkashTokenizedResolvedCredentials | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return cache.resolved;
  }
  const stored = await loadBkashTokenizedStored(supabase);
  const resolved = resolveBkashTokenizedCredentials(stored);
  cache = { at: now, stored, resolved };
  return resolved;
}

export type BkashTokenizedAdminSettingsPayload = {
  api_root: string;
  has_stored_app_secret: boolean;
  app_secret_hint: string | null;
  app_key: string;
  username: string;
  env_api_root: boolean;
  env_app_key: boolean;
};

export function toBkashTokenizedAdminSettingsPayload(
  stored: BkashTokenizedStoredValue,
  resolved: BkashTokenizedResolvedCredentials | null,
): BkashTokenizedAdminSettingsPayload {
  return {
    api_root: typeof stored.api_root === 'string' ? stored.api_root.trim() : '',
    has_stored_app_secret: Boolean(stored.app_secret && String(stored.app_secret).trim()),
    app_secret_hint: maskKeyHint(typeof stored.app_secret === 'string' ? stored.app_secret : null),
    app_key: typeof stored.app_key === 'string' ? stored.app_key.trim() : '',
    username: typeof stored.username === 'string' ? stored.username.trim() : '',
    env_api_root: Boolean(resolved?.api_root_from_env),
    env_app_key: Boolean(resolved?.app_key_from_env),
  };
}

export function mergeBkashTokenizedPatch(
  existing: BkashTokenizedStoredValue,
  patch: Record<string, unknown>,
): BkashTokenizedStoredValue {
  const next: BkashTokenizedStoredValue = { ...existing };

  if ('api_root' in patch) {
    const s = String(patch.api_root ?? '').trim().slice(0, 500);
    if (s) next.api_root = normalizeBkashApiRoot(s);
    else delete next.api_root;
  }

  if ('app_key' in patch) {
    const s = String(patch.app_key ?? '').trim().slice(0, 300);
    if (s) next.app_key = s;
    else delete next.app_key;
  }

  if ('username' in patch) {
    const s = String(patch.username ?? '').trim().slice(0, 80);
    if (s) next.username = s;
    else delete next.username;
  }

  if (patch.clear_password === true) {
    delete next.password;
  }
  if ('password' in patch) {
    const v = patch.password;
    if (v === null || v === '') {
      delete next.password;
    } else if (typeof v === 'string') {
      const t = v.trim();
      if (!t) delete next.password;
      else if (t === '********' || t === '••••••••') {
        /* keep */
      } else {
        next.password = t.slice(0, 200);
      }
    }
  }

  if (patch.clear_app_secret === true) {
    delete next.app_secret;
  }
  if ('app_secret' in patch) {
    const v = patch.app_secret;
    if (v === null || v === '') {
      delete next.app_secret;
    } else if (typeof v === 'string') {
      const t = v.trim();
      if (!t) delete next.app_secret;
      else if (t === '********' || t === '••••••••') {
        /* keep */
      } else {
        next.app_secret = t.slice(0, 300);
      }
    }
  }

  return next;
}
