import crypto from 'node:crypto';

/**
 * Reseller Adobe credits pool — must match official request shape:
 * POST /add-user, body { email, durationMonths }, HMAC-SHA256(timestamp + JSON.stringify(body), api_key)
 * @see https://reseller.adobe.yoga (external API docs)
 */
const API_KEY = (process.env.ADOBE_API_KEY || '').trim();
const BASE_URL = 'https://reseller.adobe.yoga/api/credits-pool/external';
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
