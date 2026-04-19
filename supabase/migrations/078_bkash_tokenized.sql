-- bKash Tokenized Checkout: store linked agreement per user and short-lived create/execute sessions.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bkash_agreement_id TEXT;

COMMENT ON COLUMN public.users.bkash_agreement_id IS 'bKash tokenized agreement ID after user completes agreement flow; used for PIN-only checkout.';

CREATE TABLE IF NOT EXISTS public.bkash_pending_sessions (
  payment_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  flow TEXT NOT NULL CHECK (flow IN ('agreement', 'checkout')),
  order_id UUID REFERENCES public.orders (id) ON DELETE SET NULL,
  wallet_deduction NUMERIC NOT NULL DEFAULT 0,
  gateway_amount NUMERIC NOT NULL DEFAULT 0,
  merchant_invoice TEXT NOT NULL,
  recharge_meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bkash_pending_sessions_user_idx ON public.bkash_pending_sessions (user_id, created_at DESC);

COMMENT ON TABLE public.bkash_pending_sessions IS 'Server-side correlation for bKash create -> execute; API uses service role only.';

ALTER TABLE public.bkash_pending_sessions ENABLE ROW LEVEL SECURITY;
