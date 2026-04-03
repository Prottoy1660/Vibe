import { getApiBaseUrl } from './apiBase';
import { supabase } from './supabase';

type Json = Record<string, any>;

type ApiAttempt = {
  at: string;
  base: string;
  path: string;
  ok: boolean;
  status?: number;
  request_id?: string | null;
  message?: string;
};

type ApiDebug = {
  last_updated_at: string;
  attempts: ApiAttempt[];
};

function stripTrailingSlashes(url: string) {
  return url.replace(/\/+$/, '');
}

function saveDebug(attempt: ApiAttempt) {
  if (typeof window === 'undefined') return;
  const key = 'api_debug_last';
  const existingRaw = window.localStorage.getItem(key);
  let existing: ApiDebug = { last_updated_at: new Date().toISOString(), attempts: [] };
  try {
    if (existingRaw) existing = JSON.parse(existingRaw);
  } catch {}
  existing.attempts = [attempt, ...(existing.attempts || [])].slice(0, 20);
  existing.last_updated_at = new Date().toISOString();
  window.localStorage.setItem(key, JSON.stringify(existing));
}

export function getLastApiDebug(): ApiDebug | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('api_debug_last');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getSameOriginBase(): string {
  if (typeof window === 'undefined') return '';
  return stripTrailingSlashes(window.location.origin);
}

/** Drop stale api_base_url when user switched apex ↔ www or host changed */
function invalidateStaleApiBaseCache() {
  if (typeof window === 'undefined') return;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return;
  const cached = window.localStorage.getItem('api_base_url');
  if (!cached) return;
  try {
    if (new URL(cached).host !== window.location.host) {
      window.localStorage.removeItem('api_base_url');
    }
  } catch {
    window.localStorage.removeItem('api_base_url');
  }
}

function buildCandidates() {
  const candidates: string[] = [];
  const primary = getApiBaseUrl();
  const origin = getSameOriginBase();

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';

    if (isLocal) {
      if (primary) candidates.push(stripTrailingSlashes(primary));
      candidates.push('http://localhost:3001');
      if (origin) candidates.push(origin);
    } else {
      // Production: same-origin first — SPA + /api on one deployment avoids CORS "Failed to fetch"
      if (origin) candidates.push(origin);
      if (primary && primary !== origin) candidates.push(stripTrailingSlashes(primary));
      candidates.push('https://vibeaccessbd.shop');
      candidates.push('https://www.vibeaccessbd.shop');
    }
  } else {
    if (primary) candidates.push(stripTrailingSlashes(primary));
    candidates.push('http://localhost:3001');
  }

  return [...new Set(candidates.filter(Boolean))];
}

async function healthCheck(base: string) {
  try {
    const res = await fetch(`${base}/api/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveBaseUrl() {
  invalidateStaleApiBaseCache();
  const cached = typeof window !== 'undefined' ? window.localStorage.getItem('api_base_url') : null;
  if (cached) {
    // Guard against stale dev cache in production browsers.
    if (typeof window !== 'undefined') {
      const isLocalRuntime = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (!isLocalRuntime && cached.includes('localhost:3001')) {
        window.localStorage.removeItem('api_base_url');
      } else {
        const ok = await healthCheck(cached);
        if (ok) return cached;
        window.localStorage.removeItem('api_base_url');
      }
    } else {
      return cached;
    }
  }

  const candidates = buildCandidates();
  for (const base of candidates) {
    // If /api is served by the same deployment, health should exist.
    // If health is blocked, we'll still allow the request attempt later.
    const ok = await healthCheck(base);
    if (ok) {
      if (typeof window !== 'undefined') window.localStorage.setItem('api_base_url', base);
      return base;
    }
  }

  // If none passed health, fall back to first candidate.
  const fallback = buildCandidates()[0] || '';
  if (typeof window !== 'undefined' && fallback) window.localStorage.setItem('api_base_url', fallback);
  return fallback;
}

export async function postJsonWithFallback<T = any>(path: string, body: Json): Promise<T> {
  invalidateStaleApiBaseCache();
  const candidates = buildCandidates();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;

  const preferred = await resolveBaseUrl();
  const ordered = [preferred, ...candidates.filter(c => c !== preferred)];

  let lastErr: any = null;
  for (const base of ordered) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body)
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { success: false, message: text || 'Non-JSON response' };
      }

      if (!res.ok) {
        // If server responded, keep base cached (endpoint exists).
        // If we get 405, it usually means this deployment doesn't support the method for the endpoint.
        // Don't cache that base as preferred; allow retry on next candidates.
        if (typeof window !== 'undefined' && res.status !== 405) window.localStorage.setItem('api_base_url', base);
        const message = data?.message || data?.error || `Request failed (${res.status})`;
        saveDebug({
          at: new Date().toISOString(),
          base,
          path,
          ok: false,
          status: res.status,
          request_id: res.headers.get('x-request-id'),
          message
        });
        const e: any = new Error(message);
        e.__alreadyLogged = true;
        throw e;
      }

      saveDebug({
        at: new Date().toISOString(),
        base,
        path,
        ok: true,
        status: res.status,
        request_id: res.headers.get('x-request-id'),
      });
      if (typeof window !== 'undefined') window.localStorage.setItem('api_base_url', base);
      return data as T;
    } catch (err: any) {
      lastErr = err;
      if (!err?.__alreadyLogged) {
        saveDebug({
          at: new Date().toISOString(),
          base,
          path,
          ok: false,
          message: err?.message || 'Unknown error'
        });
      }
      // Try next base on network errors / fetch failures.
      const msg = (err?.message || '').toLowerCase();
      const isNetwork =
        msg.includes('fetch failed') ||
        msg.includes('failed to fetch') ||
        msg.includes('networkerror') ||
        msg.includes('network error') ||
        msg.includes('load failed');
      const isMethodMismatch =
        msg.includes('405') ||
        msg.includes('method not allowed') ||
        msg.includes('not allowed');

      // If method is not supported on this base, continue trying the next candidate.
      if (!isNetwork && !isMethodMismatch) break;
    }
  }

  throw lastErr || new Error('Request failed');
}

