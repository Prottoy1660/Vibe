import type { Request, Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SENSITIVE_KEYS = /password|passwd|secret|token|api[_-]?key|authorization|cookie|cvv|card|private[_-]?key|refresh[_-]?token/i;

function truncate(str: string, max = 400): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max)}…`;
}

/** Strip secrets and cap size for audit storage. */
export function sanitizeBodyForLog(body: unknown, depth = 0): unknown {
  if (body === null || body === undefined) return null;
  if (depth > 6) return '[max-depth]';
  if (typeof body === 'string') return truncate(body, 800);
  if (typeof body === 'number' || typeof body === 'boolean') return body;
  if (Array.isArray(body)) {
    const cap = body.slice(0, 30).map((x) => sanitizeBodyForLog(x, depth + 1));
    if (body.length > 30) (cap as unknown[]).push(`…+${body.length - 30} more`);
    return cap as unknown[];
  }
  if (typeof body === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(k)) {
        out[k] = '[redacted]';
        continue;
      }
      out[k] = sanitizeBodyForLog(v, depth + 1) as unknown;
    }
    return out;
  }
  return String(body);
}

let _client: SupabaseClient | null = null;
let _settingsCache: { enabled: boolean; logReads: boolean; expiresAt: number } | null = null;

function serviceClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

async function getActivityLogRuntimeSettings(client: SupabaseClient): Promise<{ enabled: boolean; logReads: boolean }> {
  const now = Date.now();
  if (_settingsCache && _settingsCache.expiresAt > now) {
    return { enabled: _settingsCache.enabled, logReads: _settingsCache.logReads };
  }

  const fallback = { enabled: true, logReads: false };
  try {
    const { data, error } = await client
      .from('system_settings')
      .select('value')
      .eq('key', 'admin_activity_logging')
      .maybeSingle();
    if (error) throw error;
    const value = (data?.value || {}) as { enabled?: boolean; log_reads?: boolean };
    const resolved = {
      enabled: value.enabled !== false,
      logReads: value.log_reads === true,
    };
    _settingsCache = { ...resolved, expiresAt: now + 30_000 };
    return resolved;
  } catch {
    _settingsCache = { ...fallback, expiresAt: now + 10_000 };
    return fallback;
  }
}

export function attachAdminActivityLogging(req: Request, res: Response, actorId: string): void {
  const started = Date.now();
  let done = false;
  const path = (req.originalUrl || req.url || '').split('?')[0];

  const flush = () => {
    if (done) return;
    done = true;
    const client = serviceClient();
    if (!client) {
      console.warn('admin_activity_logs: missing Supabase service client');
      return;
    }
    void (async () => {
      const settings = await getActivityLogRuntimeSettings(client);
      const method = (req.method || '').toUpperCase();
      const isReadOnlyMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
      if (!settings.enabled) return;
      if (isReadOnlyMethod && !settings.logReads) return;

      const body = sanitizeBodyForLog(req.body);
      const query =
        req.query && typeof req.query === 'object' && Object.keys(req.query).length
          ? sanitizeBodyForLog(req.query as unknown)
          : null;

      const { error } = await client.from('admin_activity_logs').insert({
        actor_id: actorId,
        action: `api.${method} ${path}`,
        summary: `${method} ${path} → ${res.statusCode}`,
        details: { body, query },
        source: 'api',
        http_method: method,
        path,
        status_code: res.statusCode,
        duration_ms: Math.min(3_600_000, Date.now() - started),
        ip_address: req.ip || req.socket?.remoteAddress || null,
        user_agent: truncate(req.get('user-agent') || '', 500) || null,
      });
      if (error) console.error('admin_activity_logs insert:', error.message);
    })();
  };

  res.on('finish', flush);
  res.on('close', flush);
}
