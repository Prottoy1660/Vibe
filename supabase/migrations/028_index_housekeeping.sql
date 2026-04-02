-- =====================================================================
-- 028: Index Housekeeping
-- Fixes two categories of Supabase database linter warnings:
--   1) unindexed_foreign_keys – add covering indexes for FK columns
--   2) unused_index – drop indexes that have never been used
-- =====================================================================


-- ═══════════════════════════════════════════════════════════════════
-- PART 1: Add missing indexes for foreign keys
-- ═══════════════════════════════════════════════════════════════════

-- bulk_action_logs.performed_by
CREATE INDEX IF NOT EXISTS idx_bulk_action_logs_performed_by
  ON public.bulk_action_logs (performed_by);

-- campaign_events.order_id
CREATE INDEX IF NOT EXISTS idx_campaign_events_order_id
  ON public.campaign_events (order_id);

-- campaign_events.user_id
CREATE INDEX IF NOT EXISTS idx_campaign_events_user_id
  ON public.campaign_events (user_id);

-- campaigns.created_by
CREATE INDEX IF NOT EXISTS idx_campaigns_created_by
  ON public.campaigns (created_by);

-- emails_pool.product_id
CREATE INDEX IF NOT EXISTS idx_emails_pool_product_id
  ON public.emails_pool (product_id);

-- notification_queue.order_id
CREATE INDEX IF NOT EXISTS idx_notification_queue_order_id
  ON public.notification_queue (order_id);

-- notification_queue.user_id
CREATE INDEX IF NOT EXISTS idx_notification_queue_user_id
  ON public.notification_queue (user_id);

-- orders.coupon_id
CREATE INDEX IF NOT EXISTS idx_orders_coupon_id
  ON public.orders (coupon_id);

-- orders.product_id
CREATE INDEX IF NOT EXISTS idx_orders_product_id
  ON public.orders (product_id);

-- redeem_code_uses.order_id
CREATE INDEX IF NOT EXISTS idx_redeem_code_uses_order_id
  ON public.redeem_code_uses (order_id);

-- redeem_codes.product_id
CREATE INDEX IF NOT EXISTS idx_redeem_codes_product_id
  ON public.redeem_codes (product_id);

-- referral_codes.owner_user_id
CREATE INDEX IF NOT EXISTS idx_referral_codes_owner_user_id
  ON public.referral_codes (owner_user_id);

-- referral_rewards.referee_user_id
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referee_user_id
  ON public.referral_rewards (referee_user_id);

-- referral_rewards.source_order_id
CREATE INDEX IF NOT EXISTS idx_referral_rewards_source_order_id
  ON public.referral_rewards (source_order_id);

-- risk_events.order_id
CREATE INDEX IF NOT EXISTS idx_risk_events_order_id
  ON public.risk_events (order_id);

-- subscription_health_snapshots.order_id
CREATE INDEX IF NOT EXISTS idx_subscription_health_snapshots_order_id
  ON public.subscription_health_snapshots (order_id);

-- support_tickets.replied_by
CREATE INDEX IF NOT EXISTS idx_support_tickets_replied_by
  ON public.support_tickets (replied_by);

-- user_activity_logs.changed_by
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_changed_by
  ON public.user_activity_logs (changed_by);

-- user_activity_logs.user_id
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id
  ON public.user_activity_logs (user_id);

-- user_emails.order_id
CREATE INDEX IF NOT EXISTS idx_user_emails_order_id
  ON public.user_emails (order_id);

-- user_inbox.created_by
CREATE INDEX IF NOT EXISTS idx_user_inbox_created_by
  ON public.user_inbox (created_by);


-- ═══════════════════════════════════════════════════════════════════
-- PART 2: Drop unused indexes
-- ═══════════════════════════════════════════════════════════════════

-- users.email already has a UNIQUE constraint which creates an implicit index
DROP INDEX IF EXISTS idx_users_email;

-- email_generation_logs: month index never queried (user_id+month composite is used instead)
DROP INDEX IF EXISTS idx_email_generation_logs_month;

-- orders: redundant composite indexes never hit by queries
DROP INDEX IF EXISTS idx_orders_status_created_at;
DROP INDEX IF EXISTS idx_orders_user_payment_status;

-- user_emails: redundant composite never used
DROP INDEX IF EXISTS idx_user_emails_user_order;

-- notification_queue: status+scheduled_for never queried
DROP INDEX IF EXISTS idx_notification_queue_status_scheduled;

-- campaign_events: composite never used (individual FK indexes added above)
DROP INDEX IF EXISTS idx_campaign_events_campaign_type;

-- bulk_action_logs: action+created_at composite never used
DROP INDEX IF EXISTS idx_bulk_action_logs_action;

-- funnel_events: type+created_at composite never used
DROP INDEX IF EXISTS idx_funnel_events_type_created;

-- support_tickets: status index never used
DROP INDEX IF EXISTS idx_support_tickets_status;

-- signup_ip_attempts: ip+created_at never used
DROP INDEX IF EXISTS idx_signup_ip_attempts_ip_created;

-- product_waitlist: both product and notified indexes never used
DROP INDEX IF EXISTS idx_product_waitlist_product;
DROP INDEX IF EXISTS idx_product_waitlist_notified;

-- user_inbox: partial index on unread never used
DROP INDEX IF EXISTS idx_user_inbox_user_unread;

-- tutorial_help_content: is_active index never used (tiny table)
DROP INDEX IF EXISTS idx_tutorial_help_content_active;
