-- Customizable reminder copy + optional Resend / WhatsApp credentials in admin (env still wins when set).

INSERT INTO public.system_settings (key, value)
SELECT 'subscription_reminder_copy', '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'subscription_reminder_copy');

INSERT INTO public.system_settings (key, value)
SELECT 'subscription_reminder_integrations', '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'subscription_reminder_integrations');
