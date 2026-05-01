-- Admin: delete an email team and all pool accounts under it.
-- IMPORTANT: This is destructive. Intended for admin-only cleanup.

CREATE OR REPLACE FUNCTION public.admin_delete_email_team_and_accounts(p_team_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_accounts_count integer := 0;
  deleted_team_count integer := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Delete all pool emails under the team.
  -- This will cascade-delete related rows in user_emails via FK emails_pool(id) ON DELETE CASCADE.
  DELETE FROM public.emails_pool
  WHERE team_id = p_team_id;
  GET DIAGNOSTICS deleted_accounts_count = ROW_COUNT;

  -- Delete the team label itself.
  DELETE FROM public.email_teams
  WHERE id = p_team_id;
  GET DIAGNOSTICS deleted_team_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'deleted_accounts', deleted_accounts_count,
    'deleted_teams', deleted_team_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_email_team_and_accounts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_email_team_and_accounts(uuid) TO authenticated;

