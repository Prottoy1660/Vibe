-- Atomic wallet balance deduction to prevent race/double-deduct.
CREATE OR REPLACE FUNCTION public.deduct_wallet_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
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

