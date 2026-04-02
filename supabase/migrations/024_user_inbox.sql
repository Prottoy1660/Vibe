-- Per-user inbox: admins send important messages; customers see them in the header bell.

CREATE TABLE IF NOT EXISTS public.user_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0 AND char_length(title) <= 200),
  body TEXT NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 8000),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_inbox_user_created ON public.user_inbox(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_inbox_user_unread ON public.user_inbox(user_id) WHERE read_at IS NULL;

COMMENT ON TABLE public.user_inbox IS 'Admin-to-user notifications shown in the customer app notification bell.';

ALTER TABLE public.user_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own inbox"
  ON public.user_inbox FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins select all inbox"
  ON public.user_inbox FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins insert inbox"
  ON public.user_inbox FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Users update own inbox read state"
  ON public.user_inbox FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Only allow clients to change read_at (not title/body/metadata).
CREATE OR REPLACE FUNCTION public.user_inbox_update_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'user_inbox: only read_at may be updated';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_user_inbox_update_guard ON public.user_inbox;
CREATE TRIGGER tr_user_inbox_update_guard
  BEFORE UPDATE ON public.user_inbox
  FOR EACH ROW
  EXECUTE PROCEDURE public.user_inbox_update_guard();

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_inbox;
