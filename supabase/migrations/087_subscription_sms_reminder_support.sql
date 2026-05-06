-- Add SMS channel support + expired reminder key to subscription reminder pipeline.

-- Ensure channel settings include sms_enabled toggle.
INSERT INTO public.system_settings (key, value)
SELECT
  'subscription_reminder_channels',
  jsonb_build_object('email_enabled', true, 'whatsapp_enabled', true, 'sms_enabled', false)
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings WHERE key = 'subscription_reminder_channels'
);

UPDATE public.system_settings
SET value = jsonb_set(COALESCE(value, '{}'::jsonb), '{sms_enabled}', to_jsonb(false), true)
WHERE key = 'subscription_reminder_channels'
  AND (value IS NULL OR jsonb_typeof(value) = 'object');

-- Allow "exp" (expired) key in dedupe and delivery logs.
ALTER TABLE public.subscription_expiry_reminders
  DROP CONSTRAINT IF EXISTS subscription_expiry_reminders_reminder_key_check;
ALTER TABLE public.subscription_expiry_reminders
  ADD CONSTRAINT subscription_expiry_reminders_reminder_key_check
  CHECK (reminder_key IN ('d3', 'd1', 'exp'));

ALTER TABLE public.subscription_reminder_delivery_log
  DROP CONSTRAINT IF EXISTS subscription_reminder_delivery_log_reminder_key_check;
ALTER TABLE public.subscription_reminder_delivery_log
  ADD CONSTRAINT subscription_reminder_delivery_log_reminder_key_check
  CHECK (reminder_key IN ('d3', 'd1', 'exp'));

-- Persist SMS channel outcome alongside email/WhatsApp delivery audit.
ALTER TABLE public.subscription_reminder_delivery_log
  ADD COLUMN IF NOT EXISTS sms_status TEXT NOT NULL DEFAULT 'skipped_no_provider',
  ADD COLUMN IF NOT EXISTS sms_detail TEXT;
