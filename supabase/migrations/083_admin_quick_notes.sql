CREATE TABLE IF NOT EXISTS public.admin_quick_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('user', 'order')),
  entity_id uuid NOT NULL,
  note text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_quick_notes_entity
  ON public.admin_quick_notes (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_admin_quick_notes_updated_at
  ON public.admin_quick_notes (updated_at DESC);

ALTER TABLE public.admin_quick_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can select quick notes" ON public.admin_quick_notes;
CREATE POLICY "Admins can select quick notes"
  ON public.admin_quick_notes
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert quick notes" ON public.admin_quick_notes;
CREATE POLICY "Admins can insert quick notes"
  ON public.admin_quick_notes
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update quick notes" ON public.admin_quick_notes;
CREATE POLICY "Admins can update quick notes"
  ON public.admin_quick_notes
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete quick notes" ON public.admin_quick_notes;
CREATE POLICY "Admins can delete quick notes"
  ON public.admin_quick_notes
  FOR DELETE
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.touch_admin_quick_notes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_admin_quick_notes_updated_at ON public.admin_quick_notes;
CREATE TRIGGER trg_touch_admin_quick_notes_updated_at
BEFORE UPDATE ON public.admin_quick_notes
FOR EACH ROW
EXECUTE FUNCTION public.touch_admin_quick_notes_updated_at();
