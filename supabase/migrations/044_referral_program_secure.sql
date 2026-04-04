-- =====================================================================
-- 044: Secure referral program — promotional (subscription-only) wallet,
-- per-user referral codes, immutability of referral fields for clients,
-- combined wallet deduction for subscription checkout.
-- =====================================================================

-- Ensure base wallet column exists (some deployments added it outside migrations).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS wallet_promotional_balance NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_claim_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.users SET wallet_balance = 0 WHERE wallet_balance IS NULL;
UPDATE public.users SET wallet_promotional_balance = 0 WHERE wallet_promotional_balance IS NULL;

ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS fraud_signals JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS risk_score INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.wallet_promotional_balance IS 'Non-withdrawable credits (e.g. referral bonuses). Usable for subscription/product checkout via deduct_subscription_wallet_combined.';
COMMENT ON COLUMN public.users.referral_claim_meta IS 'Server-written metadata when a referral code is claimed (IP, device hints). Not user-editable.';

-- Prevent authenticated users from tampering with referral attribution (API uses service_role).
CREATE OR REPLACE FUNCTION public.enforce_referral_fields_server_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  jwt_role text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  BEGIN
    jwt_role := COALESCE(current_setting('request.jwt.claim.role', true), '');
  EXCEPTION WHEN OTHERS THEN
    jwt_role := '';
  END;

  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.referred_by_code IS DISTINCT FROM OLD.referred_by_code
     OR NEW.referral_claim_meta IS DISTINCT FROM OLD.referral_claim_meta THEN
    RAISE EXCEPTION 'Referral fields cannot be changed from the client';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_users_enforce_referral_fields ON public.users;
CREATE TRIGGER tr_users_enforce_referral_fields
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_referral_fields_server_only();

-- One referral code per user (server-generated).
CREATE OR REPLACE FUNCTION public.ensure_user_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  attempt int := 0;
  new_code text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.referral_codes WHERE owner_user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  LOOP
    attempt := attempt + 1;
    new_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    BEGIN
      INSERT INTO public.referral_codes (owner_user_id, code, is_active)
      VALUES (NEW.id, new_code, true);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF attempt > 12 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_users_ensure_referral_code ON public.users;
CREATE TRIGGER tr_users_ensure_referral_code
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.ensure_user_referral_code();

-- Backfill referral codes for existing users
DO $$
DECLARE
  r record;
  attempt int;
  new_code text;
BEGIN
  FOR r IN SELECT id FROM public.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.referral_codes c WHERE c.owner_user_id = u.id)
  LOOP
    attempt := 0;
    LOOP
      attempt := attempt + 1;
      new_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      BEGIN
        INSERT INTO public.referral_codes (owner_user_id, code, is_active)
        VALUES (r.id, new_code, true);
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF attempt > 15 THEN
          RAISE NOTICE 'referral code backfill failed for user %', r.id;
          EXIT;
        END IF;
      END;
    END LOOP;
  END LOOP;
END $$;

-- Deduct promotional balance first, then withdrawable wallet (subscriptions / checkout).
CREATE OR REPLACE FUNCTION public.deduct_subscription_wallet_combined(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prom NUMERIC;
  wbal NUMERIC;
  from_prom NUMERIC;
  from_wal NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('from_promotional', 0, 'from_withdrawable', 0);
  END IF;

  SELECT COALESCE(wallet_promotional_balance, 0), COALESCE(wallet_balance, 0)
    INTO prom, wbal
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF prom IS NULL AND wbal IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  prom := COALESCE(prom, 0);
  wbal := COALESCE(wbal, 0);

  from_prom := LEAST(prom, p_amount);
  from_wal := p_amount - from_prom;

  IF from_wal > wbal THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  UPDATE public.users
  SET
    wallet_promotional_balance = prom - from_prom,
    wallet_balance = wbal - from_wal,
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'from_promotional', from_prom,
    'from_withdrawable', from_wal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_subscription_wallet_combined(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_subscription_wallet_combined(UUID, NUMERIC) TO service_role;

-- Default program settings (admins can edit via Growth Ops).
-- Referees can see rewards tied to their account (transparency).
DROP POLICY IF EXISTS "select_referral_rewards" ON public.referral_rewards;
CREATE POLICY "select_referral_rewards" ON public.referral_rewards
  FOR SELECT USING (
    (select auth.uid()) = referrer_user_id
    OR (select auth.uid()) = referee_user_id
    OR public.is_admin()
  );

INSERT INTO public.system_settings (key, value)
VALUES (
  'referral_program',
  '{
    "enabled": true,
    "auto_process_on_order_complete": true,
    "referrer_reward_min": 50,
    "referrer_reward_max": 100,
    "referee_bonus_matches_referrer": true,
    "referee_bonus_fixed": 50,
    "min_order_total_bdt": 100,
    "risk_review_from": 35,
    "risk_block_from": 70,
    "daily_cap_per_referrer_bdt": 1000
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
