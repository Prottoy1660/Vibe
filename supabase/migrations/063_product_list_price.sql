-- Optional "was" price for store display (strikethrough + Save %). Checkout still uses `price` as the charged amount.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS list_price DECIMAL(10, 2);

COMMENT ON COLUMN public.products.list_price IS
  'Optional higher reference price for marketing (strikethrough on store). Sale amount remains `price`.';
