-- Undo orphan redeem_code_uses when /api/redeem/apply fails after apply_redeem_code().
-- Backfill order_id when a redeem order exists but the link row was never updated.

CREATE OR REPLACE FUNCTION public.release_stale_redeem_consumption(p_user_id UUID, p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cid UUID;
  v_use RECORD;
  v_product_id UUID;
BEGIN
  IF p_user_id IS NULL OR p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN;
  END IF;

  SELECT id, product_id
  INTO v_cid, v_product_id
  FROM public.redeem_codes
  WHERE upper(code) = upper(trim(p_code));

  IF v_cid IS NULL THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_use
  FROM public.redeem_code_uses
  WHERE user_id = p_user_id AND redeem_code_id = v_cid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_use.order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = v_use.order_id
  ) THEN
    RETURN;
  END IF;

  IF v_use.order_id IS NULL AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.user_id = p_user_id
      AND o.product_id = v_product_id
      AND o.payment_method = 'redeem_code'
  ) THEN
    UPDATE public.redeem_code_uses rcu
    SET order_id = (
      SELECT o.id
      FROM public.orders o
      WHERE o.user_id = p_user_id
        AND o.product_id = v_product_id
        AND o.payment_method = 'redeem_code'
      ORDER BY o.created_at DESC
      LIMIT 1
    )
    WHERE rcu.id = v_use.id;
    RETURN;
  END IF;

  DELETE FROM public.redeem_code_uses WHERE id = v_use.id;

  UPDATE public.redeem_codes
  SET used_count = GREATEST(0, COALESCE(used_count, 0) - 1)
  WHERE id = v_cid;

  UPDATE public.redeem_codes
  SET is_used = (COALESCE(used_count, 0) >= COALESCE(max_uses, 1))
  WHERE id = v_cid;
END;
$$;

COMMENT ON FUNCTION public.release_stale_redeem_consumption(UUID, TEXT) IS
  'Undo orphan redeem uses or backfill order_id after partial /api/redeem/apply failures.';

GRANT EXECUTE ON FUNCTION public.release_stale_redeem_consumption(UUID, TEXT) TO service_role;
