-- Admin toggle: require email verification for Super Reseller sign-up (default on).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    UPDATE public.system_settings
    SET value = COALESCE(value, '{}'::jsonb) || '{"require_reseller_email_verification": true}'::jsonb,
        updated_at = NOW()
    WHERE key = 'auth_settings';
  END IF;
END $$;
