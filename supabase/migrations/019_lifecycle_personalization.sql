-- Sprint C: lifecycle personalization and health scoring foundation

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferred_language TEXT;

CREATE TABLE IF NOT EXISTS public.subscription_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  label TEXT NOT NULL,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_health_user_created
  ON public.subscription_health_snapshots(user_id, created_at DESC);

