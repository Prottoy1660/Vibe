import crypto from 'node:crypto';

/**
 * Reseller Adobe credits pool — must match official request shape:
 * POST /add-user, body { email, durationMonths }, HMAC-SHA256(timestamp + JSON.stringify(body), api_key)
 * @see https://reseller.adobe.yoga (external API docs)
 */
const API_KEY = (process.env.ADOBE_API_KEY || '').trim();
const BASE_URL = (
  process.env.ADOBE_BASE_URL || 'https://reseller.ado-besoft.com/api/credits-pool/external'
).replace(/\/$/, '');
const DEFAULT_ORGANIZATION_ID = Number(process.env.ADOBE_ORGANIZATION_ID || '');
const DEFAULT_PRODUCTS = (process.env.ADOBE_PRODUCTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

type AdobeBody = {
  email: string;
  durationMonths: number;
  organizationId?: number;
  products?: string[];
};

type GrantOptions = {
  organizationId?: number | null;
  products?: string[] | null;
};

export async function grantAdobeCloudAccess(
  email: string,
  durationMonths: number,
  opts?: GrantOptions,
): Promise<{ success: boolean; error?: string; data?: any }> {
  if (!API_KEY) {
    return { success: false, error: 'ADOBE_API_KEY is not configured in .env' };
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { success: false, error: 'Invalid email for Adobe provisioning' };
  }

  const months = Math.max(1, Math.min(120, Math.floor(Number(durationMonths)) || 1));

  try {
    const preferredOrgId =
      Number.isFinite(Number(opts?.organizationId)) && Number(opts?.organizationId) > 0
        ? Number(opts?.organizationId)
        : Number.isFinite(DEFAULT_ORGANIZATION_ID) && DEFAULT_ORGANIZATION_ID > 0
          ? DEFAULT_ORGANIZATION_ID
          : null;
    const preferredProducts =
      Array.isArray(opts?.products) && opts!.products!.length > 0
        ? opts!.products!.filter(Boolean)
        : DEFAULT_PRODUCTS;

    const makeBody = (orgId?: number | null): AdobeBody => {
      const body: AdobeBody = { email: normalizedEmail, durationMonths: months };
      if (orgId && Number.isFinite(orgId) && orgId > 0) body.organizationId = orgId;
      if (preferredProducts.length > 0) body.products = preferredProducts;
      return body;
    };

    const doRequest = async (body: AdobeBody, mode: 'signed' | 'unsigned') => {
      const bodyJson = JSON.stringify(body);
      const timestamp = Date.now().toString();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      };
      if (mode === 'signed') {
        const signature = crypto
          .createHmac('sha256', API_KEY)
          .update(timestamp + bodyJson, 'utf8')
          .digest('hex');
        headers['x-timestamp'] = timestamp;
        headers['x-signature'] = signature;
      }
      const res = await fetch(`${BASE_URL}/add-user`, {
        method: 'POST',
        headers,
        body: bodyJson,
        signal: AbortSignal.timeout(25000),
      });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: `Invalid non-JSON response (${res.status})`, raw: text?.slice(0, 300) };
      }
      const err =
        data?.error ||
        (data?.success === false ? data?.message || `HTTP ${res.status}` : null);
      return { ok: res.ok && !err, status: res.status, data, err: err ? String(err) : null };
    };

    const attempts: Array<{ label: string; body: AdobeBody; mode: 'signed' | 'unsigned' }> = [];
    attempts.push({ label: 'preferred signed', body: makeBody(preferredOrgId), mode: 'signed' });
    attempts.push({ label: 'preferred unsigned', body: makeBody(preferredOrgId), mode: 'unsigned' });
    // Auto-adapt: if provider default org changed, org-less attempts can succeed and reveal latest organizationId.
    attempts.push({ label: 'org-less signed', body: makeBody(null), mode: 'signed' });
    attempts.push({ label: 'org-less unsigned', body: makeBody(null), mode: 'unsigned' });

    const debug: any[] = [];
    let finalErr = 'Adobe provisioning failed';
    for (const a of attempts) {
      const out = await doRequest(a.body, a.mode);
      debug.push({ attempt: a.label, status: out.status, err: out.err });
      if (out.ok) return { success: true, data: out.data };
      finalErr = out.err || finalErr;
    }

    if (/missing required fields/i.test(finalErr) && !preferredOrgId) {
      finalErr =
        'Missing required fields (organizationId is likely required for this API key). Configure Adobe org ID in settings/env.';
    }
    console.error('[Adobe API add-user] failed', normalizedEmail, finalErr, JSON.stringify(debug).slice(0, 700));
    return { success: false, error: finalErr, data: { debug } };
  } catch (error: any) {
    console.error('Error granting Adobe Cloud Access:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reseller panel (credits-pool) auth surface.
 *
 * The public external API only exposes `add-user` (provisioning). Real removal is only
 * available through the reseller panel's own session API, which uses username/password
 * login and a Bearer JWT — NOT the HMAC api-key. We log in, cache the JWT, and call
 * `remove-user` so customers are actually removed from the provider org (stops billing).
 */
const PANEL_ROOT = (
  process.env.ADOBE_PANEL_ROOT || 'https://reseller.ado-besoft.com/api/credits-pool'
).replace(/\/$/, '');
const PANEL_USERNAME = (process.env.ADOBE_PANEL_USERNAME || '').trim();
const PANEL_PASSWORD = (process.env.ADOBE_PANEL_PASSWORD || '').trim();

let cachedToken: { token: string; expMs: number } | null = null;

async function getPanelToken(force = false): Promise<{ token?: string; error?: string }> {
  if (!PANEL_USERNAME || !PANEL_PASSWORD) {
    return { error: 'ADOBE_PANEL_USERNAME / ADOBE_PANEL_PASSWORD not configured in .env' };
  }
  // Reuse cached token until 5 minutes before expiry.
  if (!force && cachedToken && cachedToken.expMs - Date.now() > 5 * 60 * 1000) {
    return { token: cachedToken.token };
  }
  try {
    const res = await fetch(`${PANEL_ROOT}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: PANEL_USERNAME, password: PANEL_PASSWORD }),
      signal: AbortSignal.timeout(25000),
    });
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    const token = data?.token;
    if (!res.ok || !token) {
      return { error: data?.error || `Panel login failed (HTTP ${res.status})` };
    }
    // Derive expiry from JWT payload if present, else default to 24h.
    let expMs = Date.now() + 24 * 60 * 60 * 1000;
    try {
      const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64').toString('utf8'));
      if (payload?.exp) expMs = payload.exp * 1000;
    } catch {
      /* keep default */
    }
    cachedToken = { token, expMs };
    return { token };
  } catch (error: any) {
    return { error: error?.message || 'Panel login request failed' };
  }
}

/**
 * Revoke Adobe credits-pool access for a customer email via the reseller panel session API.
 * Idempotent: a "not found / already deleted" response is treated as success.
 */
export async function revokeAdobeCloudAccess(
  email: string,
): Promise<{ success: boolean; alreadyGone?: boolean; refunded?: boolean; error?: string; data?: any }> {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { success: false, error: 'Invalid email for Adobe deprovisioning' };
  }

  const removeOnce = async (token: string) => {
    const res = await fetch(`${PANEL_ROOT}/remove-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: normalizedEmail }),
      signal: AbortSignal.timeout(25000),
    });
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: `Invalid non-JSON response (${res.status})`, raw: text?.slice(0, 300) };
    }
    return { status: res.status, data };
  };

  let auth = await getPanelToken();
  if (!auth.token) return { success: false, error: auth.error };

  let out = await removeOnce(auth.token);

  // Token expired / rejected → re-login once and retry.
  if (out.status === 401) {
    auth = await getPanelToken(true);
    if (!auth.token) return { success: false, error: auth.error };
    out = await removeOnce(auth.token);
  }

  if (out.status === 200 && out.data?.success) {
    return { success: true, refunded: !!out.data?.refunded, data: out.data };
  }

  // Already removed / never existed on the panel → safe to clean up locally.
  if (out.status === 404 && /not found|already deleted/i.test(String(out.data?.error || ''))) {
    return { success: true, alreadyGone: true, data: out.data };
  }

  return {
    success: false,
    error: out.data?.error || out.data?.message || `Adobe removal failed (HTTP ${out.status})`,
    data: out.data,
  };
}
