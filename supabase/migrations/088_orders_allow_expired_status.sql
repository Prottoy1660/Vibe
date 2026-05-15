-- Preserve abandoned checkout history with a soft-expired order state.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'completed', 'cancelled', 'refunded', 'expired'));
