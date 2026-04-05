/** Store / renew link for {renewUrl} in templates and HTML CTA. Env wins as fallback when DB empty. */
export function resolveRenewUrl(storedRenewUrl: string | null | undefined): string {
  const s = typeof storedRenewUrl === 'string' ? storedRenewUrl.trim() : '';
  if (s) return s.slice(0, 2000);
  return (
    process.env.REMINDER_STORE_URL?.trim() ||
    process.env.VITE_APP_URL?.trim() ||
    process.env.PUBLIC_SITE_URL?.trim() ||
    ''
  );
}
