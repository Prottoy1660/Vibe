import type { BkashTokenizedResolvedCredentials } from './bkashTokenizedSettings.js';

function joinUrl(root: string, path: string): string {
  const r = root.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${r}${p}`;
}

function grantErrorMessage(data: Record<string, unknown>, httpStatus: number): string {
  const statusCode = data.statusCode != null ? String(data.statusCode) : '';
  const msg = String(data.errorMessage || data.statusMessage || '').trim();
  if (msg) return msg;
  if (statusCode && statusCode !== '0000') return `bKash grant failed (statusCode ${statusCode})`;
  return `bKash grant HTTP ${httpStatus}`;
}

/** Extra guidance when bKash rejects credentials (do not log secrets). */
export function appendBkashGrantTroubleshooting(
  message: string,
  creds: BkashTokenizedResolvedCredentials,
): string {
  const m = message.toLowerCase();
  if (!m.includes('app key') && !m.includes('app_secret') && !m.includes('invalid') && !m.includes('credential')) {
    return message;
  }
  const root = creds.apiRoot.toLowerCase();
  const looksSandbox = root.includes('sandbox');
  const envWord = looksSandbox ? 'sandbox' : 'live or production';
  return (
    `${message} — Use app key, app secret, username, and password from the bKash ${envWord} merchant portal, with the API base URL for the same environment (this server is using the ${looksSandbox ? 'sandbox' : 'live'} URL). If you set keys in .env without BKASH_TOKENIZED_API_ROOT, also set BKASH_TOKENIZED_ENVIRONMENT=sandbox or live to match those keys. Any of BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME, BKASH_PASSWORD, or BKASH_TOKENIZED_API_ROOT in .env overrides the admin panel; remove or fix wrong values.`
  );
}

export async function bkashGrantToken(creds: BkashTokenizedResolvedCredentials): Promise<string> {
  const url = joinUrl(creds.apiRoot, '/checkout/token/grant');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      username: creds.username,
      password: creds.password,
    },
    body: JSON.stringify({ app_key: creds.appKey, app_secret: creds.appSecret }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const statusCodeStr = data.statusCode != null ? String(data.statusCode) : '';

  // bKash often returns HTTP 200 with statusCode + errorMessage in JSON (no id_token).
  if (statusCodeStr && statusCodeStr !== '0000') {
    throw new Error(grantErrorMessage(data, res.status));
  }
  if (!res.ok) {
    throw new Error(grantErrorMessage(data, res.status));
  }
  const id = data.id_token;
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error(grantErrorMessage(data, res.status));
  }
  return id.trim();
}

export async function bkashPostJson(
  creds: BkashTokenizedResolvedCredentials,
  path: string,
  idToken: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = joinUrl(creds.apiRoot, path);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: idToken,
      'X-App-Key': creds.appKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.errorMessage || data.statusMessage || `bKash API HTTP ${res.status}`));
  }
  const sc = data.statusCode != null ? String(data.statusCode) : '';
  if (sc && sc !== '0000') {
    throw new Error(String(data.errorMessage || data.statusMessage || `bKash API statusCode ${sc}`));
  }
  return data;
}
