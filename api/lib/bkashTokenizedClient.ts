import type { BkashTokenizedResolvedCredentials } from './bkashTokenizedSettings.js';

function joinUrl(root: string, path: string): string {
  const r = root.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${r}${p}`;
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
  if (!res.ok) {
    throw new Error(String(data.errorMessage || data.statusMessage || `bKash grant HTTP ${res.status}`));
  }
  const id = data.id_token;
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error(String(data.errorMessage || data.statusMessage || 'bKash grant token: missing id_token'));
  }
  if (data.statusCode != null && String(data.statusCode) !== '0000') {
    throw new Error(String(data.errorMessage || data.statusMessage || 'bKash grant token rejected'));
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
  return data;
}
