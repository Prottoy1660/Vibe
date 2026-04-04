-- =====================================================================
-- 043: Add admin SELECT + DELETE policies for user_sessions
-- Fixes: admin Intelligence page cannot read or delete session data.
-- Admin INSERT is intentionally blocked by migration 042.
-- The frontend (AdminIntelligence.tsx) already filters out admin
-- sessions client-side, so admin's own data won't appear.
-- =====================================================================

CREATE POLICY "Admins can view all sessions" ON public.user_sessions
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can delete sessions" ON public.user_sessions
  FOR DELETE USING (public.is_admin());
