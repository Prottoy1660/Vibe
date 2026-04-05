-- Admin-togglable email/WhatsApp for expiry reminders + delivery audit trail.

INSERT INTO public.system_settings (key, value)
SELECT 'subscription_reminder_channels', jsonb_build_object(
  'email_enabled', true,
  'whatsapp_enabled', true
)
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'subscription_reminder_channels');

CREATE TABLE IF NOT EXISTS public.subscription_reminder_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reminder_key TEXT NOT NULL CHECK (reminder_key IN ('d3', 'd1')),
  product_title TEXT,
  in_app_ok BOOLEAN NOT NULL DEFAULT true,
  email_status TEXT NOT NULL,
  email_detail TEXT,
  whatsapp_status TEXT NOT NULL,
  whatsapp_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_reminder_delivery_log_created
  ON public.subscription_reminder_delivery_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_reminder_delivery_log_user
  ON public.subscription_reminder_delivery_log (user_id, created_at DESC);

COMMENT ON TABLE public.subscription_reminder_delivery_log IS
  'Per-run audit: which channels fired for each d3/d1 subscription reminder (in_app, email, WhatsApp).';

ALTER TABLE public.subscription_reminder_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_reminder_delivery_log_admin_select" ON public.subscription_reminder_delivery_log;
CREATE POLICY "subscription_reminder_delivery_log_admin_select"
  ON public.subscription_reminder_delivery_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
