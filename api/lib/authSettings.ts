import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthSettingsValue = {
  enable_google_login?: boolean;
  enable_facebook_login?: boolean;
  enable_microsoft_login?: boolean;
  google_login_under_maintenance?: boolean;
  facebook_login_under_maintenance?: boolean;
  microsoft_login_under_maintenance?: boolean;
  /** When false, new reseller sign-ups skip verification email and can sign in immediately. Default: true. */
  require_reseller_email_verification?: boolean;
};

export function isResellerEmailVerificationRequired(settings: AuthSettingsValue): boolean {
  return settings.require_reseller_email_verification !== false;
}

export async function loadAuthSettings(supabase: SupabaseClient): Promise<AuthSettingsValue> {
  const { data } = await supabase.from('system_settings').select('value').eq('key', 'auth_settings').maybeSingle();
  const raw = (data?.value || {}) as AuthSettingsValue;
  return {
    ...raw,
    enable_google_login: raw.enable_google_login !== false,
    enable_facebook_login: raw.enable_facebook_login !== false,
    enable_microsoft_login: raw.enable_microsoft_login !== false,
    require_reseller_email_verification: raw.require_reseller_email_verification !== false,
  };
}
