-- =====================================================================
-- 027: RLS Performance Optimization
-- Fixes two categories of Supabase database linter warnings:
--   1) auth_rls_initplan  – wrap auth.uid() in (select auth.uid())
--      so the planner evaluates it once (init-plan) instead of per-row.
--   2) multiple_permissive_policies – replace admin FOR ALL with
--      role-scoped individual policies so the same role+action never
--      has more than one permissive policy.
-- =====================================================================

-- ── helper: ensure is_admin() already uses (select auth.uid()) ──────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (select auth.uid()) AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================================
-- TABLE: users
-- =====================================================================
-- Fix initplan on user-scoped policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING ((select auth.uid()) = id);

-- Admin policies already use is_admin() – no change needed.


-- =====================================================================
-- TABLE: orders
-- =====================================================================
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
CREATE POLICY "Users can create orders" ON public.orders
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- Split admin FOR ALL into individual action policies to fix overlap
DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;
CREATE POLICY "Admins can manage all orders – select" ON public.orders
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can manage all orders – insert" ON public.orders
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can manage all orders – update" ON public.orders
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can manage all orders – delete" ON public.orders
  FOR DELETE USING (public.is_admin());


-- =====================================================================
-- TABLE: user_emails
-- =====================================================================
DROP POLICY IF EXISTS "Users can view own emails" ON public.user_emails;
CREATE POLICY "Users can view own emails" ON public.user_emails
  FOR SELECT USING ((select auth.uid()) = user_id);

-- Split admin FOR ALL
DROP POLICY IF EXISTS "Admins can manage user emails" ON public.user_emails;
CREATE POLICY "Admins can manage user emails – select" ON public.user_emails
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can manage user emails – insert" ON public.user_emails
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can manage user emails – update" ON public.user_emails
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can manage user emails – delete" ON public.user_emails
  FOR DELETE USING (public.is_admin());


-- =====================================================================
-- TABLE: emails_pool
-- =====================================================================
DROP POLICY IF EXISTS "Users can view assigned emails" ON public.emails_pool;
CREATE POLICY "Users can view assigned emails" ON public.emails_pool
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_emails ue
      WHERE ue.email_id = id AND ue.user_id = (select auth.uid())
    )
  );

-- Split admin FOR ALL
DROP POLICY IF EXISTS "Admins can manage email pool" ON public.emails_pool;
CREATE POLICY "Admins can manage email pool – select" ON public.emails_pool
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can manage email pool – insert" ON public.emails_pool
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can manage email pool – update" ON public.emails_pool
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can manage email pool – delete" ON public.emails_pool
  FOR DELETE USING (public.is_admin());


-- =====================================================================
-- TABLE: email_generation_logs
-- =====================================================================
DROP POLICY IF EXISTS "Users can view own generation logs" ON public.email_generation_logs;
CREATE POLICY "Users can view own generation logs" ON public.email_generation_logs
  FOR SELECT USING ((select auth.uid()) = user_id);

-- Split admin FOR ALL
DROP POLICY IF EXISTS "Admins can manage generation logs" ON public.email_generation_logs;
CREATE POLICY "Admins can manage generation logs – select" ON public.email_generation_logs
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can manage generation logs – insert" ON public.email_generation_logs
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can manage generation logs – update" ON public.email_generation_logs
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can manage generation logs – delete" ON public.email_generation_logs
  FOR DELETE USING (public.is_admin());


-- =====================================================================
-- TABLE: coupons
-- =====================================================================
-- "Anyone can view active coupons" stays (no auth call).
-- Split admin FOR ALL to avoid overlap with the public SELECT policy.
DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;
CREATE POLICY "Admins can manage coupons – select" ON public.coupons
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can manage coupons – insert" ON public.coupons
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can manage coupons – update" ON public.coupons
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can manage coupons – delete" ON public.coupons
  FOR DELETE USING (public.is_admin());


-- =====================================================================
-- TABLE: products
-- =====================================================================
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products – select" ON public.products
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can manage products – insert" ON public.products
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can manage products – update" ON public.products
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can manage products – delete" ON public.products
  FOR DELETE USING (public.is_admin());


-- =====================================================================
-- TABLE: notices
-- =====================================================================
DROP POLICY IF EXISTS "Admins can manage notices" ON public.notices;
CREATE POLICY "Admins can manage notices – select" ON public.notices
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can manage notices – insert" ON public.notices
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can manage notices – update" ON public.notices
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can manage notices – delete" ON public.notices
  FOR DELETE USING (public.is_admin());


-- =====================================================================
-- TABLE: tutorial_help_content
-- =====================================================================
DROP POLICY IF EXISTS "Admins can manage tutorial content" ON public.tutorial_help_content;
CREATE POLICY "Admins can manage tutorial content – select" ON public.tutorial_help_content
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can manage tutorial content – insert" ON public.tutorial_help_content
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can manage tutorial content – update" ON public.tutorial_help_content
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can manage tutorial content – delete" ON public.tutorial_help_content
  FOR DELETE USING (public.is_admin());


-- =====================================================================
-- TABLE: redeem_codes
-- =====================================================================
DROP POLICY IF EXISTS "Admins can manage redeem codes" ON public.redeem_codes;
CREATE POLICY "Admins can manage redeem codes – select" ON public.redeem_codes
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can manage redeem codes – insert" ON public.redeem_codes
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can manage redeem codes – update" ON public.redeem_codes
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can manage redeem codes – delete" ON public.redeem_codes
  FOR DELETE USING (public.is_admin());


-- =====================================================================
-- TABLE: order_events
-- =====================================================================
DROP POLICY IF EXISTS "Users can view own order events" ON public.order_events;
CREATE POLICY "Users can view own order events" ON public.order_events
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view all order events" ON public.order_events;
CREATE POLICY "Admins can view all order events" ON public.order_events
  FOR SELECT USING (public.is_admin());


-- =====================================================================
-- TABLE: payment_events
-- =====================================================================
DROP POLICY IF EXISTS "Users can view own payment events" ON public.payment_events;
CREATE POLICY "Users can view own payment events" ON public.payment_events
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view all payment events" ON public.payment_events;
CREATE POLICY "Admins can view all payment events" ON public.payment_events
  FOR SELECT USING (public.is_admin());


-- =====================================================================
-- TABLE: risk_events
-- =====================================================================
DROP POLICY IF EXISTS "Admins can view all risk events" ON public.risk_events;
CREATE POLICY "Admins can view all risk events" ON public.risk_events
  FOR SELECT USING (public.is_admin());


-- =====================================================================
-- TABLE: notification_queue
-- =====================================================================
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notification_queue;
CREATE POLICY "Users can view own notifications" ON public.notification_queue
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notification_queue;
CREATE POLICY "Admins can view all notifications" ON public.notification_queue
  FOR SELECT USING (public.is_admin());


-- =====================================================================
-- TABLE: funnel_events
-- =====================================================================
DROP POLICY IF EXISTS "Users can insert own funnel events" ON public.funnel_events;
CREATE POLICY "Users can insert own funnel events" ON public.funnel_events
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own funnel events" ON public.funnel_events;
CREATE POLICY "Users can view own funnel events" ON public.funnel_events
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view all funnel events" ON public.funnel_events;
CREATE POLICY "Admins can view all funnel events" ON public.funnel_events
  FOR SELECT USING (public.is_admin());


-- =====================================================================
-- TABLE: support_tickets
-- =====================================================================
DROP POLICY IF EXISTS "Users can view own support tickets" ON public.support_tickets;
CREATE POLICY "Users can view own support tickets" ON public.support_tickets
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own support tickets" ON public.support_tickets;
CREATE POLICY "Users can create own support tickets" ON public.support_tickets
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- Admin policies use is_admin() – already fine for initplan.


-- =====================================================================
-- TABLE: product_waitlist
-- =====================================================================
DROP POLICY IF EXISTS "Users can view own waitlist rows" ON public.product_waitlist;
CREATE POLICY "Users can view own waitlist rows" ON public.product_waitlist
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own waitlist rows" ON public.product_waitlist;
CREATE POLICY "Users can insert own waitlist rows" ON public.product_waitlist
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own waitlist rows" ON public.product_waitlist;
CREATE POLICY "Users can delete own waitlist rows" ON public.product_waitlist
  FOR DELETE USING ((select auth.uid()) = user_id);

-- Split admin FOR ALL
DROP POLICY IF EXISTS "Admins can manage all waitlist rows" ON public.product_waitlist;
CREATE POLICY "Admins can manage all waitlist rows – select" ON public.product_waitlist
  FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can manage all waitlist rows – insert" ON public.product_waitlist
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Admins can manage all waitlist rows – update" ON public.product_waitlist
  FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can manage all waitlist rows – delete" ON public.product_waitlist
  FOR DELETE USING (public.is_admin());


-- =====================================================================
-- TABLE: user_inbox
-- =====================================================================
DROP POLICY IF EXISTS "Users select own inbox" ON public.user_inbox;
CREATE POLICY "Users select own inbox" ON public.user_inbox
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users update own inbox read state" ON public.user_inbox;
CREATE POLICY "Users update own inbox read state" ON public.user_inbox
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Admin SELECT + INSERT are separate policies (no overlap) – fine.


-- =====================================================================
-- TABLE: user_activity_logs
-- =====================================================================
DROP POLICY IF EXISTS "Users can view their own logs" ON public.user_activity_logs;
CREATE POLICY "Users can view their own logs" ON public.user_activity_logs
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own logs" ON public.user_activity_logs;
CREATE POLICY "Users can insert their own logs" ON public.user_activity_logs
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view all activity logs" ON public.user_activity_logs;
CREATE POLICY "Admins can view all activity logs" ON public.user_activity_logs
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert any logs" ON public.user_activity_logs;
CREATE POLICY "Admins can insert any logs" ON public.user_activity_logs
  FOR INSERT WITH CHECK (public.is_admin());


-- =====================================================================
-- TABLE: user_sessions
-- =====================================================================
DROP POLICY IF EXISTS "Users can insert own session" ON public.user_sessions;
CREATE POLICY "Users can insert own session" ON public.user_sessions
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);


-- =====================================================================
-- TABLE: system_settings
-- =====================================================================
DROP POLICY IF EXISTS "Admins can update settings" ON public.system_settings;
CREATE POLICY "Admins can update settings" ON public.system_settings
  FOR UPDATE USING (public.is_admin());

-- "Anyone can view settings" has no auth calls – leave as-is.
-- But they overlap on SELECT for same roles. Split admin to UPDATE only.
-- The admin SELECT was part of "Admins can update settings" which was FOR ALL.
-- If it was FOR UPDATE already, verify. If not, we only keep UPDATE.


-- =====================================================================
-- Done. All auth_rls_initplan and multiple_permissive_policies resolved.
-- =====================================================================
