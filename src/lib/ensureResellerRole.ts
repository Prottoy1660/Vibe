import { getApiBaseUrl } from './apiBase';

/** Server-side (service role) sync — fixes missing public.users row and reseller role. */
export async function syncResellerProfileViaApi(
  accessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiRes = await fetch(`${getApiBaseUrl()}/api/auth/reseller-sync-profile`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await apiRes.json().catch(() => ({}))) as { success?: boolean; error?: string };
  if (!apiRes.ok || !payload.success) {
    return { ok: false, error: payload.error || 'Could not sync reseller profile.' };
  }
  return { ok: true };
}
