-- =====================================================================
-- 042: Block admin user_sessions inserts (prevent admin telemetry capture)
-- =====================================================================

DROP POLICY IF EXISTS "Users can insert own session" ON public.user_sessions;
CREATE POLICY "Users can insert own session" ON public.user_sessions
  FOR INSERT
  WITH CHECK (
    (select auth.uid()) = user_id
    AND NOT public.is_admin()
  );

