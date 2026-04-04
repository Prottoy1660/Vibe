/** Must match abandoned-checkout window in api/routes/payment.ts (lazy cleanup) and Orders page UX. */
export const PENDING_CHECKOUT_VISIBLE_MS = 30 * 60 * 1000;

/** Pending orders older than this are hidden from order history UI (until DB cleanup removes them). */
export function isStalePendingOrder(status: string, createdAt: string, nowMs: number = Date.now()): boolean {
  if (status !== 'pending') return false;
  return nowMs - new Date(createdAt).getTime() > PENDING_CHECKOUT_VISIBLE_MS;
}
