-- Prevent duplicate use per user per code
CREATE UNIQUE INDEX IF NOT EXISTS redeem_code_uses_unique_user_code
ON public.redeem_code_uses (user_id, redeem_code_id);

-- Atomic redeem apply to avoid race conditions / double-spend.
-- Returns: product_id granted by the code.
CREATE OR REPLACE FUNCTION public.apply_redeem_code(p_user_id UUID, p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Ensure user hasn’t already used it (unique index also enforces this)
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

