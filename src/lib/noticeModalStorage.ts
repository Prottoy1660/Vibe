/** Dismiss/snooze keys for `welcome_popups` (separate from dashboard `notices`). */
const PREFIX = 'vibe_welcome_popup_dismiss_';

export function getNoticeModalDismissUntil(noticeId: string): number | null {
  try {
    const raw = localStorage.getItem(PREFIX + noticeId);
    if (!raw) return null;
    const j = JSON.parse(raw) as { until?: number };
    if (typeof j.until !== 'number' || Number.isNaN(j.until)) return null;
    return j.until;
  } catch {
    return null;
  }
}

/** Hide this notice modal until `snoozeHours` from now (per device). */
export function snoozeNoticeModal(noticeId: string, snoozeHours: number): void {
  const h = Math.min(168, Math.max(1, Math.floor(snoozeHours || 6)));
  const until = Date.now() + h * 60 * 60 * 1000;
  try {
    localStorage.setItem(PREFIX + noticeId, JSON.stringify({ until }));
  } catch {
    // ignore quota / private mode
  }
}
