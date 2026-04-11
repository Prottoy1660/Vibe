/** Digits only (strips +, spaces, dashes). Safe to persist; keeps +880… and 01… equivalent for validation. */
export function phoneDigitsOnly(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/** Bangladesh-friendly: at least 11 meaningful digits (e.g. 01XXXXXXXXX or 880…). */
export function hasMinimumPhone(raw: string | null | undefined): boolean {
  const d = phoneDigitsOnly(raw);
  if (d.length < 11) return false;
  if (d.length === 11 && d.startsWith('0')) return true;
  if (d.length >= 12 && d.startsWith('880')) return true;
  return d.length >= 11;
}
