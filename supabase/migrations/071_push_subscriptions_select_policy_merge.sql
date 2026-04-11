-- =====================================================================
-- 071: Merge overlapping SELECT policies on push_subscriptions
-- Fixes: multiple_permissive_policies lint (PERFORMANCE) for SELECT —
-- one policy with OR logic instead of separate user + admin policies.
-- =====================================================================

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Admins can view all push subscriptions" ON public.push_subscriptions;

CREATE POLICY "select_push_subscriptions" ON public.push_subscriptions
  FOR SELECT USING (
    (select auth.uid()) = user_id OR public.is_admin()
  );
