import { getApiBaseUrl } from './apiBase';

/**
 * Server-side IP rate limit before supabase.auth.signUp.
 * Returns false + error message when blocked or unreachable (production).
 */
export async function requestSignupIntent(): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = getApiBaseUrl();
  if (!base) {
    if (import.meta.env.DEV) {
      return { ok: true };
    }
    return { ok: false, error: 'Sign-up service is not configured. Please contact support.' };
  }

  const url = `${base.replace(/\/$/, '')}/api/auth/signup-intent`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 429) {
      return {
        ok: false,
        error: data.error || 'Too many sign-up attempts from this network. Try again later.',
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || 'Could not verify sign-up eligibility. Please try again.',
      };
    }
    return { ok: true };
  } catch {
    if (import.meta.env.DEV) {
      return { ok: true };
    }
    return { ok: false, error: 'Could not reach the sign-up service. Check your connection and try again.' };
  }
}
