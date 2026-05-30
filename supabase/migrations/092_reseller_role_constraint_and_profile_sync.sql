-- Reseller sign-up: allow role value + sync auth.users → public.users + fix trigger.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'customer', 'admin', 'super_admin', 'reseller'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_provider text;
  v_role text;
BEGIN
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');

  v_role := 'user';
  IF COALESCE(NEW.raw_user_meta_data->>'role', '') = 'reseller' THEN
    v_role := 'reseller';
  END IF;

  INSERT INTO public.users (id, email, name, role, phone, signup_auth_provider, last_sign_in_provider)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_role,
    NEW.raw_user_meta_data->>'phone',
    v_provider,
    v_provider
  );

  RETURN NEW;
END;
$$;

-- Backfill: auth users missing from public.users (e.g. trigger/constraint failures).
INSERT INTO public.users (id, email, name, role, phone, signup_auth_provider, last_sign_in_provider)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
  CASE
    WHEN COALESCE(au.raw_user_meta_data->>'role', '') = 'reseller' THEN 'reseller'
    ELSE 'user'
  END,
  au.raw_user_meta_data->>'phone',
  COALESCE(au.raw_app_meta_data->>'provider', 'email'),
  COALESCE(au.raw_app_meta_data->>'provider', 'email')
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Promote profiles that were created as user but signed up via Super Reseller metadata.
UPDATE public.users u
SET role = 'reseller',
    updated_at = NOW()
FROM auth.users au
WHERE u.id = au.id
  AND u.role IN ('user', 'customer')
  AND COALESCE(au.raw_user_meta_data->>'role', '') = 'reseller';
