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
  durationMonths: number | string;
  organizationId?: number;
  products?: string[];
};

function normalizeAdobeDuration(durationMonths: string | number): number | string {
  const raw = String(durationMonths ?? '').trim();
  if (/^\d+d$/i.test(raw)) return raw.toLowerCase();
  return Math.max(1, Math.min(120, Math.floor(Number(raw)) || 1));
}

type GrantOptions = {
  organizationId?: number | null;
  products?: string[] | null;
};

export async function grantAdobeCloudAccess(
  email: string,
  durationMonths: string | number,
  opts?: GrantOptions,
): Promise<{ success: boolean; error?: string; data?: any }> {
  if (!API_KEY) {
    return { success: false, error: 'ADOBE_API_KEY is not configured in .env' };
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { success: false, error: 'Invalid email for Adobe provisioning' };
  }

  const duration = normalizeAdobeDuration(durationMonths);

  try {
    await getPanelToken();
    await fetchAdobePanelUsers();

    const { orgId: preferredOrgId, products: orgProducts } = pickAccessibleOrganization(
      [
        opts?.organizationId,
        DEFAULT_ORGANIZATION_ID,
        inferAdobeOrganizationIdFromPanel(),
      ],
      cachedOrgAccess ?? [],
    );
    const preferredProducts =
      Array.isArray(opts?.products) && opts!.products!.length > 0
        ? opts!.products!.filter(Boolean)
        : orgProducts.length > 0
          ? orgProducts
          : DEFAULT_PRODUCTS;

    const makeBody = (orgId?: number | null): AdobeBody => {
      const body: AdobeBody = { email: normalizedEmail, durationMonths: duration };
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
    // Only try org-less when no accessible organizations are known (single-org legacy keys).
    if (!preferredOrgId && (cachedOrgAccess?.length ?? 0) === 0) {
      attempts.push({ label: 'org-less signed', body: makeBody(null), mode: 'signed' });
      attempts.push({ label: 'org-less unsigned', body: makeBody(null), mode: 'unsigned' });
    }

    const debug: any[] = [];
    let finalErr = 'Adobe provisioning failed';
    for (const a of attempts) {
      const out = await doRequest(a.body, a.mode);
      debug.push({ attempt: a.label, status: out.status, err: out.err });
      if (out.ok) return { success: true, data: out.data };
      finalErr = out.err || finalErr;
    }

    if (/organizationId is required|missing required fields/i.test(finalErr) && !preferredOrgId) {
      finalErr =
        'organizationId is required for this API account. Set ADOBE_ORGANIZATION_ID in .env or configure adobe_api_config.organizationId in system settings.';
    }
    if (/do not have access to this organization/i.test(finalErr) && (cachedOrgAccess?.length ?? 0) > 0) {
      const names = (cachedOrgAccess ?? [])
        .map((o) => `${o.organizationName} (${o.organizationId})`)
        .join(', ');
      finalErr = `Configured organization is not accessible. Available organizations: ${names}`;
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

function panelCredentials() {
  return {
    username: (process.env.ADOBE_PANEL_USERNAME || '').trim(),
    password: (process.env.ADOBE_PANEL_PASSWORD || '').trim(),
  };
}

let cachedToken: { token: string; expMs: number } | null = null;

export type AdobeOrganizationAccess = {
  organizationId: number;
  organizationName: string;
  products: string[];
};

let cachedOrgAccess: AdobeOrganizationAccess[] | null = null;

function parseOrganizationAccess(data: any): AdobeOrganizationAccess[] {
  const raw = data?.reseller?.organizationAccess;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row: any) => ({
      organizationId: Number(row.organizationId),
      organizationName: String(row.organizationName || '').trim(),
      products: Array.isArray(row.products) ? row.products.filter(Boolean) : [],
    }))
    .filter((row) => Number.isFinite(row.organizationId) && row.organizationId > 0);
}

export function getAdobeOrganizationAccess(): AdobeOrganizationAccess[] {
  return cachedOrgAccess ?? [];
}

function pickAccessibleOrganization(
  candidates: Array<number | null | undefined>,
  accessList: AdobeOrganizationAccess[],
): { orgId: number | null; products: string[] } {
  const allowed = new Map(accessList.map((a) => [a.organizationId, a]));
  for (const c of candidates) {
    const id = Number(c);
    if (!Number.isFinite(id) || id <= 0) continue;
    const match = allowed.get(id);
    if (match) return { orgId: id, products: match.products };
  }
  if (accessList.length > 0) {
    const first = accessList[0];
    return { orgId: first.organizationId, products: first.products };
  }
  for (const c of candidates) {
    const id = Number(c);
    if (Number.isFinite(id) && id > 0) return { orgId: id, products: [] };
  }
  return { orgId: null, products: [] };
}

export type AdobePanelUserRow = {
  email: string;
  organizationId?: number;
  organizationName?: string;
  displayProducts?: string[];
  products?: string[];
  status?: string;
  expiresAt?: string;
  activatedAt?: string;
};

export type AdobeOrgSnapshot = {
  organizationId: number | null;
  organizationName: string | null;
  displayProducts: string[];
};

let panelUsersCache: {
  atMs: number;
  map: Map<string, AdobeOrgSnapshot>;
  fullByEmail: Map<string, AdobePanelUserRow>;
} | null = null;
const PANEL_USERS_CACHE_MS = 3 * 60 * 1000;

/** Infer org from existing panel users when env/settings omit organizationId. */
export function inferAdobeOrganizationIdFromPanel(): number | null {
  if (!panelUsersCache?.map.size) return null;
  const counts = new Map<number, number>();
  for (const snap of panelUsersCache.map.values()) {
    const id = snap.organizationId;
    if (id && id > 0) counts.set(id, (counts.get(id) || 0) + 1);
  }
  if (!counts.size) return null;
  let best: number | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

async function panelGet(path: string, token: string) {
  const res = await fetch(`${PANEL_ROOT}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: `Invalid non-JSON response (${res.status})`, raw: text?.slice(0, 300) };
  }
  return { status: res.status, data };
}

/**
 * Full credits-pool user list (same data as reseller.ado-besoft.com → Users tab).
 */
export async function fetchAdobePanelUsers(
  forceRefresh = false,
): Promise<{ success: boolean; users?: AdobePanelUserRow[]; error?: string }> {
  if (!forceRefresh && panelUsersCache && Date.now() - panelUsersCache.atMs < PANEL_USERS_CACHE_MS) {
    return { success: true, users: undefined };
  }

  let auth = await getPanelToken(forceRefresh);
  if (!auth.token) return { success: false, error: auth.error };

  let out = await panelGet('/users', auth.token);
  if (out.status === 401) {
    auth = await getPanelToken(true);
    if (!auth.token) return { success: false, error: auth.error };
    out = await panelGet('/users', auth.token);
  }

  if (out.status !== 200 || !out.data?.success || !Array.isArray(out.data.users)) {
    return {
      success: false,
      error: out.data?.error || out.data?.message || `Panel users fetch failed (HTTP ${out.status})`,
    };
  }

  const users = out.data.users as AdobePanelUserRow[];
  const map = new Map<string, AdobeOrgSnapshot>();
  const fullByEmail = new Map<string, AdobePanelUserRow>();
  for (const row of users) {
    const email = String(row.email || '').trim().toLowerCase();
    if (!email) continue;
    fullByEmail.set(email, row);
    map.set(email, {
      organizationId:
        Number.isFinite(Number(row.organizationId)) && Number(row.organizationId) > 0
          ? Number(row.organizationId)
          : null,
      organizationName: row.organizationName ? String(row.organizationName).trim() : null,
      displayProducts: Array.isArray(row.displayProducts)
        ? row.displayProducts.filter(Boolean)
        : Array.isArray(row.products)
          ? row.products.filter(Boolean)
          : [],
    });
  }
  panelUsersCache = { atMs: Date.now(), map, fullByEmail };
  return { success: true, users };
}

export function getAdobePanelUserByEmail(email: string): AdobePanelUserRow | null {
  const key = String(email || '').trim().toLowerCase();
  if (!key || !panelUsersCache) return null;
  return panelUsersCache.fullByEmail.get(key) ?? null;
}

export function getAdobeOrgSnapshotByEmail(email: string): AdobeOrgSnapshot | null {
  const key = String(email || '').trim().toLowerCase();
  if (!key || !panelUsersCache) return null;
  return panelUsersCache.map.get(key) ?? null;
}

export function getAdobeOrgMap(): Map<string, AdobeOrgSnapshot> {
  return panelUsersCache?.map ?? new Map();
}

async function getPanelToken(force = false): Promise<{ token?: string; error?: string }> {
  const { username, password } = panelCredentials();
  if (!username || !password) {
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
      body: JSON.stringify({ username, password }),
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
    cachedOrgAccess = parseOrganizationAccess(data);
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

/**
 * Extend Adobe credits-pool access via the reseller panel session API (`POST /extend-user`).
 * `extensionMonths` accepts panel values such as `1`, `"1"`, or `"7d"`.
 */
export async function extendAdobeCloudAccess(
  email: string,
  extensionMonths: string | number,
): Promise<{ success: boolean; error?: string; newExpiresAt?: string; data?: any }> {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { success: false, error: 'Invalid email for Adobe extension' };
  }

  const extensionValue = String(extensionMonths ?? '').trim();
  if (!extensionValue) {
    return { success: false, error: 'Extension duration is required' };
  }

  const extendOnce = async (token: string) => {
    const res = await fetch(`${PANEL_ROOT}/extend-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: normalizedEmail, extensionMonths: extensionValue }),
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

  let out = await extendOnce(auth.token);

  if (out.status === 401) {
    auth = await getPanelToken(true);
    if (!auth.token) return { success: false, error: auth.error };
    out = await extendOnce(auth.token);
  }

  if (out.status === 200 && out.data?.success) {
    return {
      success: true,
      newExpiresAt: out.data?.newExpiresAt ? String(out.data.newExpiresAt) : undefined,
      data: out.data,
    };
  }

  return {
    success: false,
    error: out.data?.error || out.data?.message || `Adobe extension failed (HTTP ${out.status})`,
    data: out.data,
  };
}
