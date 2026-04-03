-- =====================================================================
-- 038: Track admin/user renew chain
-- =====================================================================

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS renewed_from_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_renewed_from_order_id
ON public.orders (renewed_from_order_id);

