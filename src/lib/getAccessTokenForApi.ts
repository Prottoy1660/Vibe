import { supabase } from './supabase';

/**
 * Returns a JWT for backend API calls. Refreshes the session when the access token is missing
 * (avoids sending "Bearer undefined" or an expired token after idle tabs).
 */
export async function getAccessTokenForApi(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;

  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session?.access_token) return null;
  return data.session.access_token;
}
