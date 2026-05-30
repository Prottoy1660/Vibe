-- Respect role=reseller from auth sign-up metadata (Super Reseller portal).
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
