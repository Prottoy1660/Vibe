-- Default partner share % for admin Profit & expenses (0 = disabled).

INSERT INTO public.system_settings (key, value)
VALUES (
  'partner_profit_share',
  '{"percent": 0}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
