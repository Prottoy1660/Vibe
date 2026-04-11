-- Welcome popup: separate from dashboard `notices` (Important Notices).

CREATE TABLE IF NOT EXISTS public.welcome_popups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  hero_image_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  snooze_hours INTEGER NOT NULL DEFAULT 6,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT welcome_popups_snooze_hours_range CHECK (snooze_hours >= 1 AND snooze_hours <= 168)
);

COMMENT ON TABLE public.welcome_popups IS
  'Customer welcome modal content (separate from public.notices dashboard list).';

CREATE INDEX IF NOT EXISTS idx_welcome_popups_active_created
  ON public.welcome_popups (is_active, created_at DESC);

ALTER TABLE public.welcome_popups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_welcome_popups" ON public.welcome_popups;
CREATE POLICY "select_welcome_popups" ON public.welcome_popups
  FOR SELECT USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "welcome_popups_admin_insert" ON public.welcome_popups;
CREATE POLICY "welcome_popups_admin_insert" ON public.welcome_popups
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "welcome_popups_admin_update" ON public.welcome_popups;
CREATE POLICY "welcome_popups_admin_update" ON public.welcome_popups
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "welcome_popups_admin_delete" ON public.welcome_popups;
CREATE POLICY "welcome_popups_admin_delete" ON public.welcome_popups
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Copy legacy popup rows only if migration 074 ever added these columns (skip on DBs that never had 074).
DO $legacy$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notices'
      AND column_name = 'show_as_modal'
  ) THEN
    INSERT INTO public.welcome_popups (title, content, type, is_active, hero_image_url, cta_label, cta_url, snooze_hours, created_at)
    SELECT n.title, n.content, n.type, n.is_active, n.hero_image_url, n.cta_label, n.cta_url, n.snooze_hours, n.created_at
    FROM public.notices n
    WHERE n.show_as_modal = true;
  END IF;
END
$legacy$;

ALTER TABLE public.notices DROP CONSTRAINT IF EXISTS notices_snooze_hours_range;

ALTER TABLE public.notices
  DROP COLUMN IF EXISTS show_as_modal,
  DROP COLUMN IF EXISTS hero_image_url,
  DROP COLUMN IF EXISTS cta_label,
  DROP COLUMN IF EXISTS cta_url,
  DROP COLUMN IF EXISTS snooze_hours;

DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'welcome_popups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.welcome_popups;
  END IF;
END
$pub$;

DROP TRIGGER IF EXISTS tr_admin_activity_welcome_popups ON public.welcome_popups;
CREATE TRIGGER tr_admin_activity_welcome_popups
  AFTER INSERT OR UPDATE OR DELETE ON public.welcome_popups
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();
