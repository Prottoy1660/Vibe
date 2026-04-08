/**
 * SPA navigation to /error/:code from non-React code (e.g. apiClient).
 * HttpErrorNavBridge registers the react-router navigate function when the app mounts.
 */

let navigateRef: ((path: string, opts?: { replace?: boolean }) => void) | null = null;

export function registerHttpErrorNavigator(fn: typeof navigateRef) {
  navigateRef = fn;
}

export function unregisterHttpErrorNavigator() {
  navigateRef = null;
}

/** Every code with a dedicated `/error/:code` page in the SPA */
export const HTTP_ERROR_PAGE_CODES = [
  400, 401, 402, 403, 404, 405, 406, 408, 409, 410, 413, 415, 422, 429, 500, 501, 502, 503, 504, 505,
] as const;

const REDIRECTABLE = new Set<number>(HTTP_ERROR_PAGE_CODES);

export function shouldAutoRedirectToHttpErrorPage(status: number): boolean {
  if (!REDIRECTABLE.has(status)) return false;
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname;
  if (p.startsWith('/error/')) return false;
  if (p === '/login' || p === '/register') return false;
  return true;
}

/** Client-side navigation to full-screen error page, or full URL fallback before Router mounts. */
export function goToHttpError(status: number, options?: { replace?: boolean }) {
  if (!REDIRECTABLE.has(status)) {
    window.location.assign(`/error/500`);
    return;
  }
  const path = `/error/${status}`;
  if (navigateRef) {
    navigateRef(path, { replace: options?.replace !== false });
    return;
  }
  window.location.assign(path);
}

export function statusShouldUseErrorPage(status: number, allowed: readonly number[] | null): boolean {
  if (allowed === null) return false;
  const list = allowed.length ? allowed : [...REDIRECTABLE];
  return list.includes(status);
}
