/** Supabase Auth provider ids (email, google, facebook, apple, azure, …) */
export function formatAuthProviderLabel(provider: string | null | undefined): string {
  const p = (provider || 'email').toLowerCase();
  if (p === 'email') return 'Email / password';
  if (p === 'google') return 'Google';
  if (p === 'facebook') return 'Facebook';
  if (p === 'azure') return 'Microsoft';
  return p.charAt(0).toUpperCase() + p.slice(1);
}
