/**
 * Reads optional env overrides for feature toggles.
 * @returns null if unset or empty — caller should use their default (e.g. DB).
 */
export function readEnvBooleanFlag(envVarName: string): boolean | null {
  const raw = process.env[envVarName];
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const l = s.toLowerCase();
  if (['0', 'false', 'off', 'no', 'disabled'].includes(l)) return false;
  if (['1', 'true', 'on', 'yes', 'enabled'].includes(l)) return true;
  return null;
}

/**
 * PATCH bodies may stringify booleans oddly; `Boolean("false")` is true in JS.
 * Use this when persisting `checkout_enabled` from `req.body`.
 */
export function parseCheckoutEnabledPatch(v: unknown): boolean {
  if (v === false || v === 0) return false;
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['false', '0', 'no', 'off', ''].includes(s)) return false;
    if (['true', '1', 'yes', 'on'].includes(s)) return true;
  }
  return Boolean(v);
}
