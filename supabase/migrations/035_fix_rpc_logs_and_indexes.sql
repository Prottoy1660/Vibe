-- =====================================================================
-- 035: Fix RPC log edge-cases + add performance indexes
-- =====================================================================

-- Ensure email_generation_logs.order_id exists (UI/RPC depends on it)
ALTER TABLE public.email_generation_logs
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE;

-- Ensure uniqueness per order_id (so concurrent inserts behave predictably)
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_generation_logs_order_id
ON public.email_generation_logs (order_id);

-- Performance indexes for assignment + burn selection
CREATE INDEX IF NOT EXISTS idx_emails_pool_assigned_at
ON public.emails_pool (assigned_at);

CREATE INDEX IF NOT EXISTS idx_emails_pool_burn_filter
ON public.emails_pool (is_burned, assigned_at);

CREATE INDEX IF NOT EXISTS idx_emails_pool_product_shared_join
ON public.emails_pool (product_id, status, is_burned, current_users, assigned_at);

CREATE INDEX IF NOT EXISTS idx_user_emails_user_order_active
ON public.user_emails (user_id, order_id, is_active);

-- Fix: assign_email_for_order_strict_24h generation logs insertion edge-case
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

  SELECT COUNT(*)
  INTO v_slot_count
  FROM public.user_emails
  WHERE order_id = p_order_id
    AND user_id = v_user_id
    AND is_active = true;

  IF v_slot_count >= v_email_slots THEN
    RETURN json_build_object('success', false, 'error', 'Order slot limit reached');
  END IF;

  v_current_month := to_char(CURRENT_DATE, 'YYYY-MM');

  -- IMPORTANT: COALESCE prevents NULL edge-case where no row exists yet.
  SELECT COALESCE(gl.count, 0)
  INTO v_log_count
  FROM public.email_generation_logs gl
  WHERE gl.user_id = v_user_id
    AND gl.order_id = p_order_id;

  IF v_max_users_per_email <= 1 THEN
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

  INSERT INTO public.user_emails (user_id, email_id, order_id, is_active)
  VALUES (v_user_id, v_email_id, p_order_id, true);

  -- Generation logs (fixed null insert logic)
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

