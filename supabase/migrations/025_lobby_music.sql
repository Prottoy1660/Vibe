-- Lobby music: YouTube audio for signed-in customers (controlled in admin).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'system_settings'
  ) THEN
    INSERT INTO public.system_settings (key, value)
    VALUES (
      'lobby_music',
      '{"enabled":false,"urls":[]}'::jsonb
    )
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;
