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

// Avoid "surprise redirects" right when the user returns to the tab.
// Browsers often resume timers/network late; the first request after focus may fail transiently.
let lastFocusAtMs = 0;
if (typeof window !== 'undefined') {
  try {
    lastFocusAtMs = Date.now();
    window.addEventListener(
      'focus',
      () => {
        lastFocusAtMs = Date.now();
      },
      { passive: true } as AddEventListenerOptions,
    );
  } catch {
    // ignore
  }
}

export function shouldAutoRedirectToHttpErrorPage(status: number): boolean {
  if (!REDIRECTABLE.has(status)) return false;
  if (typeof window === 'undefined') return false;
  // If the tab is in the background, avoid hijacking navigation.
  // Some browsers resume background timers late and can trigger late API errors that feel like a "reload" on return.
  try {
    const hidden =
      typeof document !== 'undefined' && (document.hidden === true || document.visibilityState === 'hidden');
    if (hidden) return false;
  } catch {
    // ignore
  }
  // If the user just came back to the tab, don't auto-redirect. Let the UI recover or show toasts instead.
  if (lastFocusAtMs && Date.now() - lastFocusAtMs < 3500) return false;
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
