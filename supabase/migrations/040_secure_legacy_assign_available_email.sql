-- =====================================================================
-- 040: Secure legacy assign_available_email RPC
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.assign_available_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_available_email(uuid) TO service_role;

