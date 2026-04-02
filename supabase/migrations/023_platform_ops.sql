-- Signup abuse: track API-recorded attempts per IP (Express uses service role).
CREATE TABLE IF NOT EXISTS public.signup_ip_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL CHECK (char_length(ip) <= 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signup_ip_attempts_ip_created
  ON public.signup_ip_attempts (ip, created_at DESC);

COMMENT ON TABLE public.signup_ip_attempts IS 'Rows recorded by API before email/password sign-up; used for per-IP rate limits.';

-- No RLS: only service role / backend inserts (anon has no grants).

-- Waitlist: notify when price drops / new plan (user opts in per product).
CREATE TABLE IF NOT EXISTS public.product_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ,
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_waitlist_product ON public.product_waitlist(product_id);
CREATE INDEX IF NOT EXISTS idx_product_waitlist_notified ON public.product_waitlist(notified_at);

COMMENT ON TABLE public.product_waitlist IS 'Users who want to be notified about a product (price drop, restock, etc.).';

ALTER TABLE public.product_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own waitlist rows"
  ON public.product_waitlist FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own waitlist rows"
  ON public.product_waitlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own waitlist rows"
  ON public.product_waitlist FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all waitlist rows"
  ON public.product_waitlist FOR ALL
  USING (public.is_admin());

-- Platform banner + status page (merged into system_settings).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    INSERT INTO public.system_settings (key, value)
    VALUES (
      'platform_status',
      '{"level":"operational","message":"","show_banner":false}'::jsonb
    )
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;
