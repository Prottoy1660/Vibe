ALTER TABLE public.coupons ADD COLUMN product_id UUID REFERENCES public.products(id) ON DELETE CASCADE;
