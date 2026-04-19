import type { SupabaseClient } from '@supabase/supabase-js';
import { maskKeyHint } from './supportChatSettings.js';

export const UDDOKTAPAY_SETTINGS_KEY = 'uddoktapay_gateway';

export type UddoktaPayStoredValue = {
  api_key?: string;
  /** Merchant API base, e.g. https://sandbox.uddoktapay.com */
  base_url?: string;
};

export type UddoktaPayResolvedCredentials = {
  apiKey: string;
  baseUrl: string;
  api_key_from_env: boolean;
  base_url_from_env: boolean;
};

const CACHE_MS = 45_000;
let cache: { at: number; stored: UddoktaPayStoredValue; resolved: UddoktaPayResolvedCredentials } | null = null;

export function invalidateUddoktaPayCredentialsCache() {
  cache = null;
}

export function normalizeUddoktaPayBaseUrl(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/\/+$/, '');
}

export async function loadUddoktaPayStored(supabase: SupabaseClient): Promise<UddoktaPayStoredValue> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', UDDOKTAPAY_SETTINGS_KEY)
    .maybeSingle();
  if (error || !data?.value || typeof data.value !== 'object') {
    return {};
  }
  return data.value as UddoktaPayStoredValue;
}

/** Server `.env` wins when set so production key rotation does not stick on an old DB value. */
export function resolveUddoktaPayCredentials(stored: UddoktaPayStoredValue): UddoktaPayResolvedCredentials {
  const envKey = (process.env.UDDOKTAPAY_API_KEY || '').trim();
  const envBase = normalizeUddoktaPayBaseUrl(process.env.UDDOKTAPAY_BASE_URL || '');
  const dbKey = typeof stored.api_key === 'string' ? stored.api_key.trim() : '';
  const dbBase = normalizeUddoktaPayBaseUrl(stored.base_url);

  const apiKey = envKey || dbKey;
  const baseUrl = envBase || dbBase;

  return {
    apiKey,
    baseUrl,
    api_key_from_env: Boolean(envKey),
    base_url_from_env: Boolean(envBase),
  };
}

export async function getUddoktaPayCredentialsCached(
  supabase: SupabaseClient,
): Promise<UddoktaPayResolvedCredentials> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return cache.resolved;
  }
  const stored = await loadUddoktaPayStored(supabase);
  const resolved = resolveUddoktaPayCredentials(stored);
  cache = { at: now, stored, resolved };
  return resolved;
}

export type UddoktaPayAdminSettingsPayload = {
  base_url: string;
  has_stored_api_key: boolean;
  api_key_hint: string | null;
  env_api_key: boolean;
  env_base_url: boolean;
};

export function toUddoktaPayAdminSettingsPayload(
  stored: UddoktaPayStoredValue,
  resolved: UddoktaPayResolvedCredentials,
): UddoktaPayAdminSettingsPayload {
  return {
    base_url: typeof stored.base_url === 'string' ? stored.base_url.trim() : '',
    has_stored_api_key: Boolean(stored.api_key && String(stored.api_key).trim()),
    api_key_hint: maskKeyHint(typeof stored.api_key === 'string' ? stored.api_key : null),
    env_api_key: resolved.api_key_from_env,
    env_base_url: resolved.base_url_from_env,
  };
}

export function mergeUddoktaPayPatch(
  existing: UddoktaPayStoredValue,
  patch: Record<string, unknown>,
): UddoktaPayStoredValue {
  const next: UddoktaPayStoredValue = { ...existing };

  if ('base_url' in patch) {
    const s = String(patch.base_url ?? '').trim().slice(0, 500);
    if (s) {
      next.base_url = normalizeUddoktaPayBaseUrl(s);
    } else {
      delete next.base_url;
    }
  }

  if (patch.clear_api_key === true) {
    delete next.api_key;
  }

  if ('api_key' in patch) {
    const v = patch.api_key;
    if (v === null || v === '') {
      delete next.api_key;
    } else if (typeof v === 'string') {
      const t = v.trim();
      if (!t) {
        delete next.api_key;
      } else if (t === '********' || t === '••••••••') {
        // leave existing
      } else {
        next.api_key = t.slice(0, 500);
      }
    }
  }

  return next;
}
