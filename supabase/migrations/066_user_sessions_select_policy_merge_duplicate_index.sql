-- =====================================================================
-- 066: Supabase linter — multiple permissive SELECT on user_sessions,
--      duplicate unique index on email_generation_logs.order_id
-- =====================================================================

-- user_sessions: replace overlapping SELECT policies with one policy
-- (users need own-row SELECT for fingerprint dedup; admins need all rows)
DROP POLICY IF EXISTS "Allow all reads for now" ON public.user_sessions;
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.user_sessions;

CREATE POLICY "select_user_sessions_own_or_admin" ON public.user_sessions
  FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.is_admin())
  );

-- email_generation_logs: 035 added uq_email_generation_logs_order_id;
-- a UNIQUE constraint on order_id already provides email_generation_logs_order_id_key
DROP INDEX IF EXISTS public.uq_email_generation_logs_order_id;
