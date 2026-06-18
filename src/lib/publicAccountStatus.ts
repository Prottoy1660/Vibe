import type { ResellerUserStatus } from '../services/reseller/resellerApi';

export type PublicAccountSearchResult = {
  searchedEmail: string;
  resellerSubscriptions: ResellerUserStatus[];
};

export async function searchPublicAccountStatus(email: string, apiBase: string): Promise<PublicAccountSearchResult> {
  const base = apiBase.replace(/\/$/, '');
  const res = await fetch(`${base}/api/platform/search-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Search failed');
  }
  return json.data as PublicAccountSearchResult;
}

export async function switchPublicOrganization(
  email: string,
  apiBase: string,
): Promise<{ message: string }> {
  const base = apiBase.replace(/\/$/, '');
  const res = await fetch(`${base}/api/platform/org-switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Switch failed');
  }
  return { message: json.message || 'You have been moved to the new organization.' };
}
