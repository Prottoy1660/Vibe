-- =====================================================================
-- 031: Merge overlapping permissive policies
-- Fixes: multiple_permissive_policies lint warning (PERFORMANCE)
-- Strategy: drop both user+admin SELECT policies and replace with
-- a single merged policy using OR logic.
-- =====================================================================


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: users  (SELECT + UPDATE overlaps)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
CREATE POLICY "select_users" ON public.users
  FOR SELECT USING (
    (select auth.uid()) = id OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;
CREATE POLICY "update_users" ON public.users
  FOR UPDATE USING (
    (select auth.uid()) = id OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: orders  (SELECT + INSERT overlaps)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can manage all orders – select" ON public.orders;
CREATE POLICY "select_orders" ON public.orders
  FOR SELECT USING (
    (select auth.uid()) = user_id OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can manage all orders – insert" ON public.orders;
CREATE POLICY "insert_orders" ON public.orders
  FOR INSERT WITH CHECK (
    (select auth.uid()) = user_id OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: user_emails  (SELECT overlap)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view own emails" ON public.user_emails;
DROP POLICY IF EXISTS "Admins can manage user emails – select" ON public.user_emails;
CREATE POLICY "select_user_emails" ON public.user_emails
  FOR SELECT USING (
    (select auth.uid()) = user_id OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: emails_pool  (SELECT overlap)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view assigned emails" ON public.emails_pool;
DROP POLICY IF EXISTS "Admins can manage email pool – select" ON public.emails_pool;
CREATE POLICY "select_emails_pool" ON public.emails_pool
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_emails ue
      WHERE ue.email_id = id AND ue.user_id = (select auth.uid())
    )
    OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: email_generation_logs  (SELECT overlap)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view own generation logs" ON public.email_generation_logs;
DROP POLICY IF EXISTS "Admins can manage generation logs – select" ON public.email_generation_logs;
CREATE POLICY "select_email_generation_logs" ON public.email_generation_logs
  FOR SELECT USING (
    (select auth.uid()) = user_id OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: coupons  (SELECT overlap: public + admin)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins can manage coupons – select" ON public.coupons;
CREATE POLICY "select_coupons" ON public.coupons
  FOR SELECT USING (
    is_active = true OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: products  (SELECT overlap: public + admin)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products – select" ON public.products;
CREATE POLICY "select_products" ON public.products
  FOR SELECT USING (
    is_active = true OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: notices  (SELECT overlap: public + admin)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Anyone can view active notices" ON public.notices;
DROP POLICY IF EXISTS "Admins can manage notices – select" ON public.notices;
CREATE POLICY "select_notices" ON public.notices
  FOR SELECT USING (
    is_active = true OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: tutorial_help_content  (SELECT overlap: public + admin)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Anyone can view active tutorial content" ON public.tutorial_help_content;
DROP POLICY IF EXISTS "Admins can manage tutorial content – select" ON public.tutorial_help_content;
CREATE POLICY "select_tutorial_help_content" ON public.tutorial_help_content
  FOR SELECT USING (
    is_active = true OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: redeem_codes  (SELECT overlap: public + admin)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view active redeem codes" ON public.redeem_codes;
DROP POLICY IF EXISTS "Admins can manage redeem codes – select" ON public.redeem_codes;
CREATE POLICY "select_redeem_codes" ON public.redeem_codes
  FOR SELECT USING (
    is_active = true OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: order_events  (SELECT overlap)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view own order events" ON public.order_events;
DROP POLICY IF EXISTS "Admins can view all order events" ON public.order_events;
CREATE POLICY "select_order_events" ON public.order_events
  FOR SELECT USING (
    (select auth.uid()) = user_id OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: payment_events  (SELECT overlap)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view own payment events" ON public.payment_events;
DROP POLICY IF EXISTS "Admins can view all payment events" ON public.payment_events;
CREATE POLICY "select_payment_events" ON public.payment_events
  FOR SELECT USING (
    (select auth.uid()) = user_id OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: notification_queue  (SELECT overlap)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notification_queue;
DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notification_queue;
CREATE POLICY "select_notification_queue" ON public.notification_queue
  FOR SELECT USING (
    (select auth.uid()) = user_id OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: funnel_events  (SELECT overlap)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view own funnel events" ON public.funnel_events;
DROP POLICY IF EXISTS "Admins can view all funnel events" ON public.funnel_events;
CREATE POLICY "select_funnel_events" ON public.funnel_events
  FOR SELECT USING (
    (select auth.uid()) = user_id OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: support_tickets  (SELECT overlap)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view own support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Admins can view all support tickets" ON public.support_tickets;
CREATE POLICY "select_support_tickets" ON public.support_tickets
  FOR SELECT USING (
    (select auth.uid()) = user_id OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: product_waitlist  (SELECT + INSERT + DELETE overlaps)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view own waitlist rows" ON public.product_waitlist;
DROP POLICY IF EXISTS "Admins can manage all waitlist rows – select" ON public.product_waitlist;
CREATE POLICY "select_product_waitlist" ON public.product_waitlist
  FOR SELECT USING (
    (select auth.uid()) = user_id OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users can insert own waitlist rows" ON public.product_waitlist;
DROP POLICY IF EXISTS "Admins can manage all waitlist rows – insert" ON public.product_waitlist;
CREATE POLICY "insert_product_waitlist" ON public.product_waitlist
  FOR INSERT WITH CHECK (
    (select auth.uid()) = user_id OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users can delete own waitlist rows" ON public.product_waitlist;
DROP POLICY IF EXISTS "Admins can manage all waitlist rows – delete" ON public.product_waitlist;
CREATE POLICY "delete_product_waitlist" ON public.product_waitlist
  FOR DELETE USING (
    (select auth.uid()) = user_id OR public.is_admin()
  );

-- update stays admin-only (no user update policy existed)
-- keep: "Admins can manage all waitlist rows – update"


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: user_inbox  (SELECT overlap)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users select own inbox" ON public.user_inbox;
DROP POLICY IF EXISTS "Admins select all inbox" ON public.user_inbox;
CREATE POLICY "select_user_inbox" ON public.user_inbox
  FOR SELECT USING (
    (select auth.uid()) = user_id OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: user_activity_logs  (SELECT + INSERT overlaps)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view their own logs" ON public.user_activity_logs;
DROP POLICY IF EXISTS "Admins can view all activity logs" ON public.user_activity_logs;
CREATE POLICY "select_user_activity_logs" ON public.user_activity_logs
  FOR SELECT USING (
    (select auth.uid()) = user_id OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users can insert their own logs" ON public.user_activity_logs;
DROP POLICY IF EXISTS "Admins can insert any logs" ON public.user_activity_logs;
CREATE POLICY "insert_user_activity_logs" ON public.user_activity_logs
  FOR INSERT WITH CHECK (
    (select auth.uid()) = user_id OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: referral_codes  (SELECT overlap)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Owners can view own referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "Admins can manage referral codes" ON public.referral_codes;
CREATE POLICY "select_referral_codes" ON public.referral_codes
  FOR SELECT USING (
    (select auth.uid()) = owner_user_id OR public.is_admin()
  );


-- ═══════════════════════════════════════════════════════════════════
-- TABLE: referral_rewards  (SELECT overlap)
-- ═══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can view own referral rewards" ON public.referral_rewards;
DROP POLICY IF EXISTS "Admins can view all referral rewards" ON public.referral_rewards;
CREATE POLICY "select_referral_rewards" ON public.referral_rewards
  FOR SELECT USING (
    (select auth.uid()) = referrer_user_id OR public.is_admin()
  );
