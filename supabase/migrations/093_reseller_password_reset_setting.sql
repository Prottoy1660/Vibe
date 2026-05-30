-- Admin toggle: Super Reseller forgot-password / reset link (default on).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    UPDATE public.system_settings
    SET value = COALESCE(value, '{}'::jsonb) || '{"enable_reseller_password_reset": true}'::jsonb,
        updated_at = NOW()
    WHERE key = 'auth_settings';
  END IF;
END $$;
