DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    INSERT INTO public.system_settings (key, value, updated_at)
    VALUES (
      'product_store_visibility',
      '{"hidden_product_ids":[]}'::jsonb,
      NOW()
    )
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;
