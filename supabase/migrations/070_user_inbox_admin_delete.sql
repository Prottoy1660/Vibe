-- =====================================================================
-- 070: Allow admins to delete user inbox messages
-- =====================================================================

DROP POLICY IF EXISTS "Admins delete inbox" ON public.user_inbox;
CREATE POLICY "Admins delete inbox" ON public.user_inbox
  FOR DELETE
  USING (public.is_admin());

