import { getApiBaseUrl } from './apiBase';

type Json = Record<string, any>;

function stripTrailingSlashes(url: string) {
  return url.replace(/\/+$/, '');
}

function buildCandidates() {
  const candidates: string[] = [];

  const primary = getApiBaseUrl();
  if (primary) candidates.push(stripTrailingSlashes(primary));

  // Always try same-origin as a fallback.
  if (typeof window !== 'undefined') {
    candidates.push(stripTrailingSlashes(window.location.origin));
  }

  // Legacy hardcoded fallback (in case backend is hosted here).
  candidates.push('https://vibeaccessbd.shop');

  // Local dev fallback.
  candidates.push('http://localhost:3001');

  // Unique only, preserve order.
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
  const cached = typeof window !== 'undefined' ? window.localStorage.getItem('api_base_url') : null;
  if (cached) return cached;

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
  const candidates = buildCandidates();

  const preferred = await resolveBaseUrl();
  const ordered = [preferred, ...candidates.filter(c => c !== preferred)];

  let lastErr: any = null;
  for (const base of ordered) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        if (typeof window !== 'undefined') window.localStorage.setItem('api_base_url', base);
        throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
      }

      if (typeof window !== 'undefined') window.localStorage.setItem('api_base_url', base);
      return data as T;
    } catch (err: any) {
      lastErr = err;
      // Try next base on network errors / fetch failures.
      const msg = (err?.message || '').toLowerCase();
      const isNetwork =
        msg.includes('fetch failed') ||
        msg.includes('failed to fetch') ||
        msg.includes('networkerror') ||
        msg.includes('network error') ||
        msg.includes('load failed');
      if (!isNetwork) break;
    }
  }

  throw lastErr || new Error('Request failed');
}

