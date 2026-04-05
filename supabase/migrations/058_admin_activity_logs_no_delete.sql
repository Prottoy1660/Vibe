-- Activity log is append-only: no row may be deleted (including service role).

REVOKE DELETE ON public.admin_activity_logs FROM PUBLIC;
REVOKE DELETE ON public.admin_activity_logs FROM anon;
REVOKE DELETE ON public.admin_activity_logs FROM authenticated;

CREATE OR REPLACE FUNCTION public.prevent_admin_activity_log_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'admin_activity_logs cannot be deleted (append-only audit trail)';
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_admin_activity_log_delete ON public.admin_activity_logs;
CREATE TRIGGER tr_prevent_admin_activity_log_delete
  BEFORE DELETE ON public.admin_activity_logs
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_admin_activity_log_delete();

COMMENT ON FUNCTION public.prevent_admin_activity_log_delete() IS
  'Blocks all DELETE on admin_activity_logs. To purge in an emergency, drop this trigger as superuser.';
