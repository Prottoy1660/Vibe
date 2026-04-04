-- Loosen default referral risk thresholds so same-WiFi / shared-device testing is not always stuck in pending_review.
-- Only updates rows that still match the original 044 seed values (custom admin values are left alone).
UPDATE public.system_settings
SET
  value = COALESCE(value, '{}'::jsonb)
    || jsonb_build_object(
      'risk_review_from',
      52,
      'risk_block_from',
      88
    ),
  updated_at = NOW()
WHERE key = 'referral_program'
  AND COALESCE((value->>'risk_review_from')::int, 35) = 35
  AND COALESCE((value->>'risk_block_from')::int, 70) = 70;
