-- =====================================================================
-- 029: Pin function search_path for security
-- Fixes: function_search_path_mutable lint warning (SECURITY)
-- Without an explicit search_path, a malicious user could shadow
-- tables/functions via a schema-prepend attack.
-- Fix: add  SET search_path = ''  and fully-qualify all references.
-- =====================================================================


-- 1) is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (select auth.uid()) AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- 2) handle_new_user  (latest version from 021_auth_login_providers)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- 3) sync_public_user_from_identity
CREATE OR REPLACE FUNCTION public.sync_public_user_from_identity()
RETURNS trigger AS $$
BEGIN
  UPDATE public.users
  SET last_sign_in_provider = NEW.provider,
      updated_at = NOW()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- 4) deduct_wallet_balance
CREATE OR REPLACE FUNCTION public.deduct_wallet_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.users
  SET wallet_balance = wallet_balance - p_amount,
      updated_at = NOW()
  WHERE id = p_user_id
    AND wallet_balance >= p_amount
  RETURNING wallet_balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  RETURN new_balance;
END;
$$;


-- 5) user_inbox_update_guard
CREATE OR REPLACE FUNCTION public.user_inbox_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'user_inbox: only read_at may be updated';
  END IF;
  RETURN NEW;
END;
$$;


-- 6) apply_redeem_code
CREATE OR REPLACE FUNCTION public.apply_redeem_code(p_user_id UUID, p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code_row RECORD;
  v_product_id UUID;
BEGIN
  IF p_user_id IS NULL OR p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RAISE EXCEPTION 'Invalid parameters';
  END IF;

  SELECT *
  INTO v_code_row
  FROM public.redeem_codes
  WHERE upper(code) = upper(trim(p_code))
  FOR UPDATE;

  IF v_code_row IS NULL THEN
    RAISE EXCEPTION 'Invalid redeem code';
  END IF;

  IF COALESCE(v_code_row.is_active, false) = false THEN
    RAISE EXCEPTION 'Redeem code is disabled';
  END IF;

  IF COALESCE(v_code_row.is_used, false) = true THEN
    RAISE EXCEPTION 'Redeem code exhausted';
  END IF;

  IF COALESCE(v_code_row.used_count, 0) >= COALESCE(v_code_row.max_uses, 1) THEN
    RAISE EXCEPTION 'Redeem code exhausted';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.redeem_code_uses
    WHERE user_id = p_user_id AND redeem_code_id = v_code_row.id
  ) THEN
    RAISE EXCEPTION 'You already used this code';
  END IF;

  INSERT INTO public.redeem_code_uses(user_id, redeem_code_id)
  VALUES (p_user_id, v_code_row.id);

  UPDATE public.redeem_codes
  SET used_count = COALESCE(used_count, 0) + 1,
      is_used = (COALESCE(used_count, 0) + 1) >= COALESCE(max_uses, 1)
  WHERE id = v_code_row.id;

  v_product_id := v_code_row.product_id;
  RETURN v_product_id;
END;
$$;


-- 7) delete_user
CREATE OR REPLACE FUNCTION public.delete_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (select auth.uid()) AND role = 'admin'
  ) THEN
    DELETE FROM auth.users WHERE id = target_user_id;
    DELETE FROM public.users WHERE id = target_user_id;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only admins can delete users';
  END IF;
END;
$$;


-- 8) assign_available_email
CREATE OR REPLACE FUNCTION public.assign_available_email(target_order_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  available_email_id UUID;
  user_uuid UUID;
  current_month VARCHAR(7);
  log_id UUID;
  log_count INT;
BEGIN
  user_uuid := (select auth.uid());

  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = target_order_id AND user_id = user_uuid AND status IN ('paid', 'completed')
  ) THEN
    RAISE EXCEPTION 'Invalid order or order not paid';
  END IF;

  current_month := to_char(CURRENT_DATE, 'YYYY-MM');

  SELECT id, count INTO log_id, log_count FROM public.email_generation_logs
  WHERE user_id = user_uuid AND month = current_month;

  IF log_count >= 3 THEN
    RAISE EXCEPTION 'Monthly generation limit reached';
  END IF;

  SELECT id INTO available_email_id
  FROM public.emails_pool
  WHERE status = 'available'
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF available_email_id IS NULL THEN
    RAISE EXCEPTION 'No available emails in the pool';
  END IF;

  UPDATE public.emails_pool
  SET status = 'assigned', assigned_at = NOW()
  WHERE id = available_email_id;

  INSERT INTO public.user_emails (user_id, email_id, order_id, is_active)
  VALUES (user_uuid, available_email_id, target_order_id, true);

  IF log_id IS NULL THEN
    INSERT INTO public.email_generation_logs (user_id, count, month)
    VALUES (user_uuid, 1, current_month);
  ELSE
    UPDATE public.email_generation_logs
    SET count = count + 1
    WHERE id = log_id;
  END IF;

  RETURN json_build_object('success', true, 'email_id', available_email_id);
END;
$$;


-- 9) get_email_by_phone (created outside migrations, recreate with pinned path)
DROP FUNCTION IF EXISTS public.get_email_by_phone(text);
CREATE OR REPLACE FUNCTION public.get_email_by_phone(p_phone TEXT)
RETURNS TABLE(email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT u.email::TEXT
  FROM public.users u
  WHERE u.phone = p_phone
  LIMIT 1;
END;
$$;
