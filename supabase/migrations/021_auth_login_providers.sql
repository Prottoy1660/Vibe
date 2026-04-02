-- Track how users signed up and last sign-in method (email, google, facebook, etc.)
-- Synced from Supabase Auth: signup from auth.users app metadata; last sign-in from auth.identities.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signup_auth_provider TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS last_sign_in_provider TEXT NOT NULL DEFAULT 'email';

COMMENT ON COLUMN public.users.signup_auth_provider IS 'Primary provider at account creation (email, google, facebook, …).';
COMMENT ON COLUMN public.users.last_sign_in_provider IS 'Provider used for the most recent sign-in (from auth.identities).';

-- New users: set providers from auth app metadata (OAuth users get google/facebook; email/password get email).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_provider text;
BEGIN
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  INSERT INTO public.users (id, email, name, role, phone, signup_auth_provider, last_sign_in_provider)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'user',
    NEW.raw_user_meta_data->>'phone',
    v_provider,
    v_provider
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- When an identity row is created or its last_sign_in_at updates, mirror provider to public.users.
CREATE OR REPLACE FUNCTION public.sync_public_user_from_identity()
RETURNS trigger AS $$
BEGIN
  UPDATE public.users
  SET last_sign_in_provider = NEW.provider,
      updated_at = NOW()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_identity_sign_in ON auth.identities;

CREATE TRIGGER on_auth_identity_sign_in
  AFTER INSERT OR UPDATE OF last_sign_in_at ON auth.identities
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_public_user_from_identity();

-- Default: enable Facebook OAuth toggle in dashboard settings (merge if row exists).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    UPDATE public.system_settings
    SET value = COALESCE(value, '{}'::jsonb) || '{"enable_facebook_login": true}'::jsonb,
        updated_at = NOW()
    WHERE key = 'auth_settings';
  END IF;
END $$;
