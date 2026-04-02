-- User support tickets: submit issues; admins reply and set status.

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL CHECK (char_length(trim(subject)) > 0 AND char_length(subject) <= 300),
  body TEXT NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 8000),
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'billing', 'adobe_access', 'account', 'other')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_reply TEXT,
  replied_at TIMESTAMPTZ,
  replied_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON public.support_tickets(created_at DESC);

COMMENT ON TABLE public.support_tickets IS 'In-app support requests from users; admins reply via admin_reply.';

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own support tickets"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own support tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all support tickets"
  ON public.support_tickets FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all support tickets"
  ON public.support_tickets FOR UPDATE
  USING (public.is_admin());
