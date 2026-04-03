-- =====================================================================
-- 034: Strict shared assignment + expiration burn
-- Implements Phase 2 rules:
--   - Shared slot join allowed only within 24h of first assignment
--   - Join existing partial slots before opening new ones (orphan strategy)
--   - Burn expired emails and deactivate user_emails when terms end
-- =====================================================================

-- 1) emails_pool columns required by shared-slot logic
ALTER TABLE public.emails_pool
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.emails_pool
ADD COLUMN IF NOT EXISTS current_users INTEGER NOT NULL DEFAULT 0;

-- Backfill nulls if any exist (safe no-op)
UPDATE public.emails_pool
SET current_users = 0
WHERE current_users IS NULL;

-- 2) Allow multiple user_emails to reference the same email_id
-- (required for shared slots / pooled access).
ALTER TABLE public.user_emails
DROP CONSTRAINT IF EXISTS user_emails_email_id_key;

-- In case the unique constraint has been implemented as an index with the same name.
DROP INDEX IF EXISTS public.user_emails_email_id_key;

-- Ensure at most one row per (user, order, email) combination.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_emails_user_order_email
ON public.user_emails (user_id, order_id, email_id);

-- 2b) Backfill derived fields for already-existing rows
-- - current_users = count(active user_emails) per email_id
-- - product_id = product_id from any active user_emails -> orders join
-- - status = assigned when capacity is full, otherwise available
UPDATE public.emails_pool ep
SET current_users = COALESCE(x.cnt, 0)
FROM (
  SELECT ue.email_id, COUNT(*)::int AS cnt
  FROM public.user_emails ue
  WHERE ue.is_active = true
  GROUP BY ue.email_id
) x
WHERE ep.id = x.email_id;

UPDATE public.emails_pool ep
SET product_id = q.product_id
FROM (
  -- Pick a deterministic product_id for the email_id (no uuid aggregate needed)
  SELECT DISTINCT ON (ue.email_id)
    ue.email_id,
    o.product_id
  FROM public.user_emails ue
  JOIN public.orders o ON o.id = ue.order_id
  WHERE ue.is_active = true
    AND o.product_id IS NOT NULL
  ORDER BY ue.email_id, ue.assigned_at DESC
) q
WHERE ep.id = q.email_id;

UPDATE public.emails_pool ep
SET status = CASE
  WHEN ep.current_users >= COALESCE(p.max_users_per_email, 1) THEN 'assigned'
  ELSE 'available'
END
FROM public.products p
WHERE p.id = ep.product_id
  AND COALESCE(ep.is_burned, false) = false;

-- 3) Strict shared-slot assignment RPC (transactional with row locks)
CREATE OR REPLACE FUNCTION public.assign_email_for_order_strict_24h(p_order_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order RECORD;
  v_user_id UUID;
  v_product_id UUID;
  v_email_slots INTEGER;
  v_max_users_per_email INTEGER;
  v_with_cloud_access BOOLEAN;
  v_current_month VARCHAR(7);
  v_log_count INTEGER;
  v_slot_count INTEGER;

  v_email_id UUID;
  v_partial RECORD;
  v_new_count INTEGER;
BEGIN
  -- Fetch order + product config
  SELECT
    o.id AS order_id,
    o.user_id,
    o.product_id,
    p.email_slots,
    p.max_users_per_email,
    COALESCE(p.is_personal, false) AS is_personal,
    COALESCE(p.with_cloud_access, false) AS with_cloud_access
  INTO v_order
  FROM public.orders o
  JOIN public.products p ON p.id = o.product_id
  WHERE o.id = p_order_id
    AND o.status IN ('paid', 'completed')
    AND o.payment_status IN ('paid', 'refunded');

  IF v_order.order_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or unpaid order');
  END IF;

  IF COALESCE(v_order.is_personal, false) = true THEN
    RETURN json_build_object('success', false, 'error', 'Personal subscription orders cannot use shared email assignment');
  END IF;

  v_user_id := v_order.user_id;
  v_product_id := v_order.product_id;
  v_email_slots := COALESCE(v_order.email_slots, 3);
  v_max_users_per_email := COALESCE(v_order.max_users_per_email, 1);
  v_with_cloud_access := COALESCE(v_order.with_cloud_access, false);

  -- Ensure this order isn't over the slot limit for this user
  SELECT COUNT(*) INTO v_slot_count
  FROM public.user_emails
  WHERE order_id = p_order_id
    AND user_id = v_user_id
    AND is_active = true;

  IF v_slot_count >= v_email_slots THEN
    RETURN json_build_object('success', false, 'error', 'Order slot limit reached');
  END IF;

  -- Generation logs (UI reads per-order count)
  v_current_month := to_char(CURRENT_DATE, 'YYYY-MM');
  SELECT COALESCE(count, 0) INTO v_log_count
  FROM public.email_generation_logs
  WHERE user_id = v_user_id
    AND order_id = p_order_id;

  -- ===========================
  -- Helper: cloud_access filter
  -- ===========================
  -- We keep the filter in-line for clarity instead of dynamic SQL.

  IF v_max_users_per_email <= 1 THEN
    -- ── EXCLUSIVE MODE ──────────────────────────────────────────────────
    SELECT ep.id INTO v_email_id
    FROM public.emails_pool ep
    WHERE ep.status = 'available'
      AND ep.product_id IS NULL
      AND ep.current_users = 0
      AND COALESCE(ep.is_burned, false) = false
      AND (
        (v_with_cloud_access = true AND ep.cloud_access_type IN ('api', 'manual'))
        OR
        (v_with_cloud_access = false AND (
          ep.cloud_access_type IS NULL
          OR lower(trim(ep.cloud_access_type)) IN ('none')
          OR lower(replace(trim(ep.cloud_access_type), '_', ' ')) IN ('no access')
        ))
      )
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_email_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'No available emails in the pool');
    END IF;

    UPDATE public.emails_pool
    SET status = 'assigned',
        assigned_at = NOW(),
        product_id = v_product_id,
        current_users = 1
    WHERE id = v_email_id;

  ELSE
    -- ── SHARED SLOT MODE ───────────────────────────────────────────────
    -- Strict 24h window: only join partial slots if they were opened within last 24h.
    SELECT ep.*
    INTO v_partial
    FROM public.emails_pool ep
    WHERE ep.status = 'available'
      AND ep.product_id = v_product_id
      AND ep.current_users > 0
      AND ep.current_users < v_max_users_per_email
      AND COALESCE(ep.is_burned, false) = false
      AND ep.assigned_at IS NOT NULL
      AND ep.assigned_at >= NOW() - INTERVAL '24 hours'
      AND (
        (v_with_cloud_access = true AND ep.cloud_access_type IN ('api', 'manual'))
        OR
        (v_with_cloud_access = false AND (
          ep.cloud_access_type IS NULL
          OR lower(trim(ep.cloud_access_type)) IN ('none')
          OR lower(replace(trim(ep.cloud_access_type), '_', ' ')) IN ('no access')
        ))
      )
    ORDER BY ep.current_users DESC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_partial.id IS NOT NULL THEN
      v_new_count := COALESCE(v_partial.current_users, 0) + 1;

      UPDATE public.emails_pool
      SET current_users = v_new_count,
          status = CASE WHEN v_new_count >= v_max_users_per_email THEN 'assigned' ELSE 'available' END
      WHERE id = v_partial.id;

      v_email_id := v_partial.id;
    ELSE
      -- Open a new shared slot for this product.
      SELECT ep.id INTO v_email_id
      FROM public.emails_pool ep
      WHERE ep.status = 'available'
        AND ep.product_id IS NULL
        AND ep.current_users = 0
        AND COALESCE(ep.is_burned, false) = false
        AND (
          (v_with_cloud_access = true AND ep.cloud_access_type IN ('api', 'manual'))
          OR
          (v_with_cloud_access = false AND (
            ep.cloud_access_type IS NULL
            OR lower(trim(ep.cloud_access_type)) IN ('none')
            OR lower(replace(trim(ep.cloud_access_type), '_', ' ')) IN ('no access')
          ))
        )
      FOR UPDATE SKIP LOCKED
      LIMIT 1;

      IF v_email_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No available emails in the pool');
      END IF;

      UPDATE public.emails_pool
      SET status = 'available',
          product_id = v_product_id,
          assigned_at = NOW(),
          current_users = 1
      WHERE id = v_email_id;
    END IF;
  END IF;

  -- Link email to this order/user
  INSERT INTO public.user_emails (user_id, email_id, order_id, is_active)
  VALUES (v_user_id, v_email_id, p_order_id, true);

  -- Update generation logs (increment per order)
  IF v_log_count = 0 THEN
    INSERT INTO public.email_generation_logs (user_id, order_id, count, month)
    VALUES (v_user_id, p_order_id, 1, v_current_month);
  ELSE
    UPDATE public.email_generation_logs
    SET count = count + 1
    WHERE user_id = v_user_id
      AND order_id = p_order_id;
  END IF;

  RETURN json_build_object('success', true, 'email_id', v_email_id);
EXCEPTION
  WHEN unique_violation THEN
    -- If the same (user, order, email) got inserted concurrently, return success with the email_id.
    SELECT ue.email_id INTO v_email_id
    FROM public.user_emails ue
    WHERE ue.user_id = v_user_id
      AND ue.order_id = p_order_id
      AND ue.is_active = true
    LIMIT 1;

    RETURN json_build_object('success', true, 'email_id', v_email_id, 'note', 'Duplicate prevented by unique constraint');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4) Burn expired emails and deactivate linked user_emails
CREATE OR REPLACE FUNCTION public.burn_expired_emails(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_burned_count INTEGER;
BEGIN
  WITH expired AS (
    SELECT
      ep.id,
      -- Parse duration into months:
      -- If contains "year" or "yr" => digits * 12, else digits
      CASE
        WHEN (p.duration ILIKE '%year%' OR p.duration ILIKE '%yr%')
          THEN COALESCE(NULLIF(substring(p.duration from '\\d+'), '')::int, 1) * 12
        ELSE COALESCE(NULLIF(substring(p.duration from '\\d+'), '')::int, 1)
      END AS duration_months
    FROM public.emails_pool ep
    JOIN public.products p ON p.id = ep.product_id
    WHERE COALESCE(ep.is_burned, false) = false
      AND ep.assigned_at IS NOT NULL
      AND ep.product_id IS NOT NULL
      AND (ep.assigned_at + make_interval(months => (
        CASE
          WHEN (p.duration ILIKE '%year%' OR p.duration ILIKE '%yr%')
            THEN COALESCE(NULLIF(substring(p.duration from '\\d+'), '')::int, 1) * 12
          ELSE COALESCE(NULLIF(substring(p.duration from '\\d+'), '')::int, 1)
        END
      ))) <= p_now
  ),
  updated AS (
    UPDATE public.emails_pool ep
    SET is_burned = true,
        status = 'used',
        current_users = 0
    WHERE ep.id IN (SELECT id FROM expired)
    RETURNING ep.id
  ),
  deactivated AS (
    UPDATE public.user_emails ue
    SET is_active = false
    WHERE ue.email_id IN (SELECT id FROM updated)
      AND ue.is_active = true
    RETURNING ue.id
  )
  SELECT COUNT(*) INTO v_burned_count FROM updated;

  RETURN COALESCE(v_burned_count, 0);
END;
$$;

