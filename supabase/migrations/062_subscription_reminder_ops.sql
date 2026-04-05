-- Cooldown state for failure alerts (written by API service role).

INSERT INTO public.system_settings (key, value)
SELECT 'subscription_reminder_ops', '{"last_failure_alert_at": null}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'subscription_reminder_ops');
