-- =====================================================================
-- 068: user_sessions VPN flag (server-side detection)
-- =====================================================================

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS is_vpn BOOLEAN;

