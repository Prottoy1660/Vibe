-- Performance indexes for hot paths (orders, user emails, redeem).
CREATE INDEX IF NOT EXISTS idx_orders_user_created_at
  ON public.orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
  ON public.orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_user_payment_status
  ON public.orders (user_id, payment_status);

CREATE INDEX IF NOT EXISTS idx_user_emails_user_order
  ON public.user_emails (user_id, order_id);

CREATE INDEX IF NOT EXISTS idx_redeem_codes_code_upper
  ON public.redeem_codes ((upper(code)));

