/** Months for Adobe / subscription provisioning; safe when duration is null or missing. */
export function productDurationToMonths(duration: string | null | undefined): number {
  const raw = String(duration || '').toLowerCase();
  if (!raw) return 1;
  const match = raw.match(/\d+/);
  const value = match ? Math.max(1, parseInt(match[0], 10)) : 1;
  if (raw.includes('day')) {
    return Math.max(1, Math.ceil(value / 30));
  }
  if (raw.includes('week') || raw.includes('wk')) {
    return Math.max(1, Math.ceil((value * 7) / 30));
  }
  if (raw.includes('year') || raw.includes('yr')) {
    return value * 12;
  }
  return value;
}
