-- =====================================================================
-- 036: Secure RPC permissions (block direct user RPC execution)
-- =====================================================================
-- These functions are called from the backend using SUPABASE service role.
-- We restrict EXECUTE permissions so authenticated users cannot call them
-- directly and manipulate inventory/assignments.

REVOKE EXECUTE ON FUNCTION public.assign_email_for_order_strict_24h(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_email_for_order_strict_24h(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.burn_expired_emails(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.burn_expired_emails(timestamptz) TO service_role;

