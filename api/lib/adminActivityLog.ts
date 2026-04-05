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

function serviceClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
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
    const body = sanitizeBodyForLog(req.body);
    const query =
      req.query && typeof req.query === 'object' && Object.keys(req.query).length
        ? sanitizeBodyForLog(req.query as unknown)
        : null;

    void client
      .from('admin_activity_logs')
      .insert({
        actor_id: actorId,
        action: `api.${req.method} ${path}`,
        summary: `${req.method} ${path} → ${res.statusCode}`,
        details: { body, query },
        source: 'api',
        http_method: req.method,
        path,
        status_code: res.statusCode,
        duration_ms: Math.min(3_600_000, Date.now() - started),
        ip_address: req.ip || req.socket?.remoteAddress || null,
        user_agent: truncate(req.get('user-agent') || '', 500) || null,
      })
      .then(({ error }) => {
        if (error) console.error('admin_activity_logs insert:', error.message);
      });
  };

  res.on('finish', flush);
  res.on('close', flush);
}
