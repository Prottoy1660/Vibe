-- =====================================================================
-- 072: Allow self-insert of public.users when the auth signup trigger
-- did not create a row (OAuth edge cases, legacy accounts, failed trigger).
-- Without this, UPDATE phone affects 0 rows and mandatory phone save fails.
-- Role is fixed to "user" to prevent privilege escalation via the client.
-- =====================================================================

DROP POLICY IF EXISTS "insert_users_own_row" ON public.users;

CREATE POLICY "insert_users_own_row" ON public.users
  FOR INSERT
  WITH CHECK (
    (select auth.uid()) = id
    AND role = 'user'
  );
