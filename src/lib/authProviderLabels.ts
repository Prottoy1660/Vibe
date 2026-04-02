/** Google / Facebook OAuth: checkout does not require a Bangladesh phone (email/password still does). */
export const CHECKOUT_PHONE_OPTIONAL_PROVIDERS = new Set(['google', 'facebook']);

export function isPhoneOptionalAtCheckout(
  sessionProvider: string | null | undefined,
  profileSignupProvider: string | null | undefined
): boolean {
  const p = (sessionProvider || profileSignupProvider || 'email').toLowerCase();
  return CHECKOUT_PHONE_OPTIONAL_PROVIDERS.has(p);
}

/** Supabase Auth provider ids (email, google, facebook, apple, …) */
export function formatAuthProviderLabel(provider: string | null | undefined): string {
  const p = (provider || 'email').toLowerCase();
  if (p === 'email') return 'Email / password';
  if (p === 'google') return 'Google';
  if (p === 'facebook') return 'Facebook';
  return p.charAt(0).toUpperCase() + p.slice(1);
}
