let listenersBound = false;
let visibleCooldownUntil = 0;
let wasHidden = false;
const DEFAULT_TAB_RETURN_COOLDOWN_MS = 5000;
const MIN_TAB_RETURN_COOLDOWN_MS = 0;
const MAX_TAB_RETURN_COOLDOWN_MS = 20000;

function getTabReturnCooldownMs(): number {
  if (typeof window === 'undefined') return DEFAULT_TAB_RETURN_COOLDOWN_MS;
  try {
    const raw = window.localStorage.getItem('admin_live_refresh_cooldown_ms');
    if (!raw) return DEFAULT_TAB_RETURN_COOLDOWN_MS;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_TAB_RETURN_COOLDOWN_MS;
    return Math.min(MAX_TAB_RETURN_COOLDOWN_MS, Math.max(MIN_TAB_RETURN_COOLDOWN_MS, Math.floor(parsed)));
  } catch {
    return DEFAULT_TAB_RETURN_COOLDOWN_MS;
  }
}

function bindVisibilityListeners(): void {
  if (listenersBound) return;
  if (typeof document === 'undefined') return;
  listenersBound = true;
  wasHidden = document.visibilityState !== 'visible';
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      wasHidden = true;
      return;
    }
    if (wasHidden) {
      // Prevent immediate refetch bursts right after tab return.
      visibleCooldownUntil = Date.now() + getTabReturnCooldownMs();
      wasHidden = false;
    }
  });
}

export function shouldPauseAdminLiveRefresh(): boolean {
  if (typeof document === 'undefined') return false;
  bindVisibilityListeners();
  if (document.visibilityState !== 'visible') return true;
  return Date.now() < visibleCooldownUntil;
}
