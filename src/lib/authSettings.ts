export type AuthSettingsValue = {
  enable_google_login?: boolean;
  enable_facebook_login?: boolean;
  enable_microsoft_login?: boolean;
  google_login_under_maintenance?: boolean;
  facebook_login_under_maintenance?: boolean;
  microsoft_login_under_maintenance?: boolean;
  require_reseller_email_verification?: boolean;
};

export function parseAuthSettings(raw: unknown): AuthSettingsValue {
  const v = (raw && typeof raw === 'object' ? raw : {}) as AuthSettingsValue;
  return {
    ...v,
    enable_google_login: v.enable_google_login !== false,
    enable_facebook_login: v.enable_facebook_login !== false,
    enable_microsoft_login: v.enable_microsoft_login !== false,
    require_reseller_email_verification: v.require_reseller_email_verification !== false,
  };
}

export function isResellerEmailVerificationRequired(settings: AuthSettingsValue): boolean {
  return settings.require_reseller_email_verification !== false;
}
