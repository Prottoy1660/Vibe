-- Add redeem pending functionality
-- Allow redeem codes to grant access first, with payment due later

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS redeem_pending BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payment_due_date TIMESTAMPTZ;

-- Index for admin queries
CREATE INDEX IF NOT EXISTS idx_orders_redeem_pending_due
ON public.orders (redeem_pending, payment_due_date)
WHERE redeem_pending = true;