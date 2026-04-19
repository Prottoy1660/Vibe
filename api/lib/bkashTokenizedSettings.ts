import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCheckoutEnabledPatch, readEnvBooleanFlag } from './envToggles.js';
import { maskKeyHint } from './supportChatSettings.js';

export const BKASH_TOKENIZED_SETTINGS_KEY = 'bkash_tokenized_gateway';

/** bKash-documented tokenized API roots; override with BKASH_TOKENIZED_API_ROOT in .env if bKash gives a different host. */
export const BKASH_TOKENIZED_URL_SANDBOX = 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized';
export const BKASH_TOKENIZED_URL_LIVE = 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized';

export type BkashTokenizedEnvironment = 'sandbox' | 'live';

export type BkashTokenizedStoredValue = {
  /**
   * Which bKash environment to use — server fills `api_root` from built-in URLs unless overridden.
   * Legacy rows may only have `api_root` set; we infer environment from that.
   */
  environment?: BkashTokenizedEnvironment;
  /** Legacy / explicit override; prefer `environment` + defaults for new saves. */
  api_root?: string;
  app_key?: string;
  app_secret?: string;
  username?: string;
  password?: string;
  /** When false, checkout must not offer bKash tokenized (admin toggle). Default true if unset. */
  checkout_enabled?: boolean;
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

/** Trim BOM / smart quotes from values pasted from docs or email. */
export function normalizeBkashCredentialPart(raw: string): string {
  return raw
    .trim()
    .replace(/^\uFEFF+/, '')
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'");
}

export function defaultTokenizedApiRoot(env: BkashTokenizedEnvironment): string {
  return env === 'live' ? BKASH_TOKENIZED_URL_LIVE : BKASH_TOKENIZED_URL_SANDBOX;
}

export function inferBkashEnvironment(stored: BkashTokenizedStoredValue): BkashTokenizedEnvironment {
  if (stored.environment === 'live' || stored.environment === 'sandbox') {
    return stored.environment;
  }
  const r = (stored.api_root || '').toLowerCase();
  if (r.includes('sandbox')) return 'sandbox';
  if (r.includes('pay.bka') || r.includes('checkout.pay')) return 'live';
  return 'sandbox';
}

/** Resolved DB-side API root when env var is not set. */
export function resolveStoredBkashApiRoot(stored: BkashTokenizedStoredValue): string {
  const explicit = normalizeBkashApiRoot(stored.api_root);
  if (explicit) return explicit;
  return defaultTokenizedApiRoot(inferBkashEnvironment(stored));
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
  const envKey = normalizeBkashCredentialPart(process.env.BKASH_APP_KEY || process.env.BKASH_TOKENIZE_APP_KEY || '');
  const envSecret = normalizeBkashCredentialPart(
    process.env.BKASH_APP_SECRET || process.env.BKASH_TOKENIZE_APP_SECRET || '',
  );
  const envUser = normalizeBkashCredentialPart(process.env.BKASH_USERNAME || process.env.BKASH_TOKENIZE_USER_NAME || '');
  const envPass = normalizeBkashCredentialPart(process.env.BKASH_PASSWORD || process.env.BKASH_TOKENIZE_PASSWORD || '');

  const dbRoot = resolveStoredBkashApiRoot(stored);
  const dbKey = typeof stored.app_key === 'string' ? normalizeBkashCredentialPart(stored.app_key) : '';
  const dbSecret = typeof stored.app_secret === 'string' ? normalizeBkashCredentialPart(stored.app_secret) : '';
  const dbUser = typeof stored.username === 'string' ? normalizeBkashCredentialPart(stored.username) : '';
  const dbPass = typeof stored.password === 'string' ? normalizeBkashCredentialPart(stored.password) : '';

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

const BKASH_CHECKOUT_ENV = 'BKASH_TOKENIZED_CHECKOUT_ENABLED';

export function bkashTokenizedCheckoutEnvOverride(): boolean | null {
  return readEnvBooleanFlag(BKASH_CHECKOUT_ENV);
}

export function resolveBkashTokenizedCheckoutToggle(stored: BkashTokenizedStoredValue): {
  enabled: boolean;
  locked_by_env: boolean;
} {
  const env = bkashTokenizedCheckoutEnvOverride();
  if (env !== null) {
    return { enabled: env, locked_by_env: true };
  }
  return { enabled: stored.checkout_enabled !== false, locked_by_env: false };
}

export function isBkashTokenizedOfferedAtCheckout(
  stored: BkashTokenizedStoredValue,
  resolved: BkashTokenizedResolvedCredentials | null,
): boolean {
  return Boolean(resolved) && resolveBkashTokenizedCheckoutToggle(stored).enabled;
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
  /** Resolved URL (for display / debugging); prefer `environment` in UI. */
  api_root: string;
  environment: BkashTokenizedEnvironment;
  has_stored_app_secret: boolean;
  app_secret_hint: string | null;
  app_key: string;
  username: string;
  env_api_root: boolean;
  env_app_key: boolean;
  checkout_enabled: boolean;
};

export function toBkashTokenizedAdminSettingsPayload(
  stored: BkashTokenizedStoredValue,
  resolved: BkashTokenizedResolvedCredentials | null,
): BkashTokenizedAdminSettingsPayload {
  const env = inferBkashEnvironment(stored);
  const resolvedRoot =
    normalizeBkashApiRoot(stored.api_root) || defaultTokenizedApiRoot(env);
  return {
    api_root: resolvedRoot,
    environment: env,
    has_stored_app_secret: Boolean(stored.app_secret && String(stored.app_secret).trim()),
    app_secret_hint: maskKeyHint(typeof stored.app_secret === 'string' ? stored.app_secret : null),
    app_key: typeof stored.app_key === 'string' ? stored.app_key.trim() : '',
    username: typeof stored.username === 'string' ? stored.username.trim() : '',
    env_api_root: Boolean(resolved?.api_root_from_env),
    env_app_key: Boolean(resolved?.app_key_from_env),
    checkout_enabled: stored.checkout_enabled !== false,
  };
}

export function mergeBkashTokenizedPatch(
  existing: BkashTokenizedStoredValue,
  patch: Record<string, unknown>,
): BkashTokenizedStoredValue {
  const next: BkashTokenizedStoredValue = { ...existing };

  if ('environment' in patch) {
    const raw = String(patch.environment ?? '').toLowerCase();
    const env: BkashTokenizedEnvironment = raw === 'live' ? 'live' : 'sandbox';
    next.environment = env;
    next.api_root = defaultTokenizedApiRoot(env);
  }

  if ('api_root' in patch && !('environment' in patch)) {
    const s = String(patch.api_root ?? '').trim().slice(0, 500);
    if (s) {
      next.api_root = normalizeBkashApiRoot(s);
      delete next.environment;
    } else {
      delete next.api_root;
    }
  }

  if ('app_key' in patch) {
    const s = normalizeBkashCredentialPart(String(patch.app_key ?? '')).slice(0, 300);
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

  if ('checkout_enabled' in patch) {
    next.checkout_enabled = parseCheckoutEnabledPatch(patch.checkout_enabled);
  }

  return next;
}
