/** Canonical Super Reseller site (auth emails & redirects must use this, not VibeAccess). */
export const RESELLER_SITE_URL = 'https://superreseller.shop';

export function isResellerHostname(hostname = window.location.hostname): boolean {
  return hostname === 'superreseller.shop' || hostname === 'www.superreseller.shop' || hostname.includes('superreseller');
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
