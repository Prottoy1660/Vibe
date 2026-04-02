-- Sprint D intelligence: funnel tracking + referral source linkage

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referred_by_code TEXT;

CREATE TABLE IF NOT EXISTS public.funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funnel_events_type_created
  ON public.funnel_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_funnel_events_user_created
  ON public.funnel_events(user_id, created_at DESC);

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own funnel events" ON public.funnel_events;
CREATE POLICY "Users can insert own funnel events"
  ON public.funnel_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own funnel events" ON public.funnel_events;
CREATE POLICY "Users can view own funnel events"
  ON public.funnel_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all funnel events" ON public.funnel_events;
CREATE POLICY "Admins can view all funnel events"
  ON public.funnel_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'
  ));

