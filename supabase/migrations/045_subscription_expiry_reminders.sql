-- Dedup log for automated subscription expiry inbox reminders (service role only).
CREATE TABLE IF NOT EXISTS public.subscription_expiry_reminders (
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  reminder_key TEXT NOT NULL CHECK (reminder_key IN ('d3', 'd1')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (order_id, reminder_key)
);

CREATE INDEX IF NOT EXISTS idx_subscription_expiry_reminders_sent
  ON public.subscription_expiry_reminders (sent_at DESC);

COMMENT ON TABLE public.subscription_expiry_reminders IS 'Tracks d3/d1 user_inbox reminders per order; RLS blocks client access.';

ALTER TABLE public.subscription_expiry_reminders ENABLE ROW LEVEL SECURITY;
