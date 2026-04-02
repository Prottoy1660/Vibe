-- =====================================================================
-- 032: Add remaining unindexed FK indexes
-- The composite indexes for these columns were dropped in 028 but
-- individual FK indexes were not created for campaign_id and product_id.
-- The "unused_index" warnings on other FK indexes are expected —
-- they were just created in 028 and haven't been queried yet.
-- Those will self-resolve as the application uses them.
-- =====================================================================

-- campaign_events.campaign_id (was covered by dropped idx_campaign_events_campaign_type)
CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign_id
  ON public.campaign_events (campaign_id);

-- product_waitlist.product_id (was covered by dropped idx_product_waitlist_product)
CREATE INDEX IF NOT EXISTS idx_product_waitlist_product_id
  ON public.product_waitlist (product_id);
