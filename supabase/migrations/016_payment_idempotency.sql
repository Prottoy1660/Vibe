-- Store idempotent payment/recharge create responses
CREATE TABLE IF NOT EXISTS public.payment_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  idem_key TEXT NOT NULL,
  response_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint, idem_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_idempotency_lookup
  ON public.payment_idempotency (user_id, endpoint, idem_key, created_at DESC);

