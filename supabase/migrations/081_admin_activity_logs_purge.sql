-- Controlled purge path for admin_activity_logs.
-- Keeps append-only behavior for normal deletes, but allows explicit purge function.

CREATE OR REPLACE FUNCTION public.prevent_admin_activity_log_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Allow deletes only while running inside the purge function.
  IF current_setting('app.admin_activity_log_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'admin_activity_logs cannot be deleted (append-only audit trail)';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_purge_activity_logs(p_cutoff timestamptz DEFAULT now())
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_rows bigint := 0;
BEGIN
  PERFORM set_config('app.admin_activity_log_purge', 'on', true);

  DELETE FROM public.admin_activity_logs
  WHERE created_at <= COALESCE(p_cutoff, now());

  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  RETURN deleted_rows;
END;
$$;

COMMENT ON FUNCTION public.admin_purge_activity_logs(timestamptz) IS
  'Deletes admin_activity_logs up to the provided timestamp. Intended for controlled admin cleanup.';
