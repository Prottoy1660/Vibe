-- =====================================================================
-- 030: Add RLS policies for tables that have RLS enabled but no policies
-- Fixes: rls_enabled_no_policy lint warning (SECURITY)
-- These are admin/backend-only tables — only admins or service_role
-- should be able to read/write them.
-- =====================================================================

-- bulk_action_logs: audit log of admin bulk actions
CREATE POLICY "Admins can view bulk action logs"
  ON public.bulk_action_logs FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can insert bulk action logs"
  ON public.bulk_action_logs FOR INSERT
  WITH CHECK (public.is_admin());

-- campaign_events: marketing campaign event tracking
CREATE POLICY "Admins can view campaign events"
  ON public.campaign_events FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can insert campaign events"
  ON public.campaign_events FOR INSERT
  WITH CHECK (public.is_admin());

-- campaigns: marketing campaigns (admin-managed)
CREATE POLICY "Admins can view campaigns"
  ON public.campaigns FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can insert campaigns"
  ON public.campaigns FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update campaigns"
  ON public.campaigns FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete campaigns"
  ON public.campaigns FOR DELETE
  USING (public.is_admin());

-- payment_idempotency: duplicate payment guard (backend-only)
CREATE POLICY "Admins can view payment idempotency"
  ON public.payment_idempotency FOR SELECT
  USING (public.is_admin());

-- redeem_code_uses: tracks who used which redeem code
CREATE POLICY "Admins can view redeem code uses"
  ON public.redeem_code_uses FOR SELECT
  USING (public.is_admin());

-- referral_codes: user referral codes
CREATE POLICY "Owners can view own referral codes"
  ON public.referral_codes FOR SELECT
  USING ((select auth.uid()) = owner_user_id);

CREATE POLICY "Admins can manage referral codes"
  ON public.referral_codes FOR SELECT
  USING (public.is_admin());

-- referral_rewards: referral reward tracking
CREATE POLICY "Users can view own referral rewards"
  ON public.referral_rewards FOR SELECT
  USING ((select auth.uid()) = referrer_user_id);

CREATE POLICY "Admins can view all referral rewards"
  ON public.referral_rewards FOR SELECT
  USING (public.is_admin());

-- signup_ip_attempts: rate-limit tracking (backend-only, no client access needed)
-- Intentionally no user-facing policies — only service_role inserts/reads.
-- Add a single admin-read policy to clear the lint warning.
CREATE POLICY "Admins can view signup ip attempts"
  ON public.signup_ip_attempts FOR SELECT
  USING (public.is_admin());

-- subscription_health_snapshots: backend health checks
CREATE POLICY "Admins can view subscription health"
  ON public.subscription_health_snapshots FOR SELECT
  USING (public.is_admin());
