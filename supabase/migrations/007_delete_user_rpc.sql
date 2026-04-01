CREATE OR REPLACE FUNCTION public.delete_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the requesting user is an admin
  IF EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    -- Delete from auth.users (will cascade to public.users if fk is configured, otherwise we delete public.users too)
    DELETE FROM auth.users WHERE id = target_user_id;
    DELETE FROM public.users WHERE id = target_user_id;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only admins can delete users';
  END IF;
END;
$$;
