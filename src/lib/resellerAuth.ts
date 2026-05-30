/** Canonical Super Reseller site (auth emails & redirects must use this, not VibeAccess). */
export const RESELLER_SITE_URL = 'https://superreseller.shop';

export function isResellerHostname(hostname = window.location.hostname): boolean {
  return hostname === 'superreseller.shop' || hostname === 'www.superreseller.shop' || hostname.includes('superreseller');
}

/** Vibe Access customer site (not Super Reseller). */
export function isMainCustomerSite(hostname = window.location.hostname): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return false;
  return !isResellerHostname(host);
}

export function isResellerRole(role: string | null | undefined): boolean {
  return String(role ?? '').trim().toLowerCase() === 'reseller';
}

/**
 * Auth redirect target on the reseller domain (email confirm, password reset, OAuth).
 */
export function getResellerAuthRedirectUrl(path = '/reseller/login'): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined' && isResellerHostname(window.location.hostname)) {
    return `${window.location.origin}${normalizedPath}`;
  }
  return `${RESELLER_SITE_URL}${normalizedPath}`;
}

export function isResellerAuthMetadata(meta: Record<string, unknown> | undefined | null): boolean {
  if (!meta) return false;
  const role = String(meta.role ?? '').trim().toLowerCase();
  return role === 'reseller';
}

/** Read `user_metadata` from a Supabase access token without establishing a session. */
export function getJwtUserMetadata(accessToken: string): Record<string, unknown> | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
    ) as { user_metadata?: Record<string, unknown> };
    return payload.user_metadata ?? null;
  } catch {
    return null;
  }
}

/** Hard navigation to the Super Reseller site (cross-origin; preserves hash for auth tokens). */
export function redirectToResellerPortal(path = '/reseller/dashboard', hash = ''): void {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  window.location.replace(`${RESELLER_SITE_URL}${normalizedPath}${hash}`);
}
