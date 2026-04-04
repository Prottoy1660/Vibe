-- Toggle for Personal Adobe subscriptions (user's own email). Admins update via Platform status in admin.
INSERT INTO public.system_settings (key, value)
SELECT 'personal_subscriptions', '{"enabled": true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'personal_subscriptions');
