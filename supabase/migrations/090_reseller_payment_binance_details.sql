-- Store Binance payer details on reseller deposit transactions (Payment History)

ALTER TABLE public.reseller_transactions
  ADD COLUMN IF NOT EXISTS binance_order_id TEXT,
  ADD COLUMN IF NOT EXISTS binance_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS payer_binance_id TEXT,
  ADD COLUMN IF NOT EXISTS payer_name TEXT,
  ADD COLUMN IF NOT EXISTS payer_type TEXT,
  ADD COLUMN IF NOT EXISTS payment_channel TEXT CHECK (payment_channel IS NULL OR payment_channel IN ('pay', 'crypto')),
  ADD COLUMN IF NOT EXISTS payment_currency TEXT,
  ADD COLUMN IF NOT EXISTS binance_transaction_time TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reseller_transactions_deposits
  ON public.reseller_transactions (reseller_id, created_at DESC)
  WHERE type = 'deposit';
