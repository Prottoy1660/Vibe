-- Internal team / org labels for generated pool emails + slot intent (exclusive vs shared) for admin routing.

CREATE TABLE IF NOT EXISTS public.email_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_teams_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_email_teams_created ON public.email_teams (created_at DESC);

COMMENT ON TABLE public.email_teams IS
  'Admin-defined labels to group generated inventory emails (internal only).';

ALTER TABLE public.emails_pool
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.email_teams(id) ON DELETE SET NULL;

ALTER TABLE public.emails_pool
  ADD COLUMN IF NOT EXISTS slot_intent TEXT;

COMMENT ON COLUMN public.emails_pool.slot_intent IS
  'exclusive = intended for single-user products; shared = intended for 2-user shared slots.';

ALTER TABLE public.emails_pool DROP CONSTRAINT IF EXISTS emails_pool_slot_intent_check;
ALTER TABLE public.emails_pool ADD CONSTRAINT emails_pool_slot_intent_check
  CHECK (slot_intent IS NULL OR slot_intent IN ('exclusive', 'shared'));

CREATE INDEX IF NOT EXISTS idx_emails_pool_team_id ON public.emails_pool (team_id);
CREATE INDEX IF NOT EXISTS idx_emails_pool_slot_intent ON public.emails_pool (slot_intent);

ALTER TABLE public.email_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_teams_admin_all" ON public.email_teams;
CREATE POLICY "email_teams_admin_all" ON public.email_teams
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
