-- Append-only admin reply history per ticket (admin_reply remains "latest" for compatibility).

CREATE TABLE IF NOT EXISTS public.support_ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 8000),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_ticket_created
  ON public.support_ticket_replies (ticket_id, created_at ASC);

COMMENT ON TABLE public.support_ticket_replies IS 'Chronological admin replies; support_tickets.admin_reply mirrors the latest.';

ALTER TABLE public.support_ticket_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_support_ticket_replies" ON public.support_ticket_replies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = support_ticket_replies.ticket_id
        AND ((select auth.uid()) = st.user_id OR public.is_admin())
    )
  );

CREATE POLICY "insert_support_ticket_replies" ON public.support_ticket_replies
  FOR INSERT WITH CHECK (public.is_admin());

-- Backfill one row per existing ticket that had a stored reply (skip tickets that already have any reply row).
INSERT INTO public.support_ticket_replies (ticket_id, body, created_by, created_at)
SELECT st.id, trim(st.admin_reply), st.replied_by, COALESCE(st.replied_at, st.updated_at)
FROM public.support_tickets st
WHERE st.admin_reply IS NOT NULL
  AND trim(st.admin_reply) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.support_ticket_replies r WHERE r.ticket_id = st.id);
