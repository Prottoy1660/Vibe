/** Months for Adobe / subscription provisioning; safe when duration is null or missing. */
export function productDurationToMonths(duration: string | null | undefined): number {
  const raw = String(duration || '').toLowerCase();
  if (!raw) return 1;
  if (raw.includes('year') || raw.includes('yr')) {
    const match = raw.match(/\d+/);
    return match ? Math.max(1, parseInt(match[0], 10) * 12) : 12;
  }
  const match = raw.match(/\d+/);
  return match ? Math.max(1, parseInt(match[0], 10)) : 1;
}
