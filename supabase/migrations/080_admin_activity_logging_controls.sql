-- Runtime controls for admin activity logging to reduce write pressure.

INSERT INTO public.system_settings (key, value, updated_at)
VALUES (
  'admin_activity_logging',
  jsonb_build_object(
    'enabled', true,
    'log_reads', false
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.log_admin_database_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
  rid text;
  logging_enabled boolean := true;
BEGIN
  actor := auth.uid();
  IF actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = actor AND u.role IN ('admin', 'super_admin')
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    SELECT COALESCE((value->>'enabled')::boolean, true)
    INTO logging_enabled
    FROM public.system_settings
    WHERE key = 'admin_activity_logging';
  EXCEPTION WHEN OTHERS THEN
    logging_enabled := true;
  END;

  IF logging_enabled IS NOT TRUE THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'system_settings' THEN
    IF TG_OP = 'DELETE' THEN
      rid := OLD.key::text;
    ELSE
      rid := NEW.key::text;
    END IF;
  ELSE
    BEGIN
      IF TG_OP = 'DELETE' THEN
        rid := OLD.id::text;
      ELSE
        rid := NEW.id::text;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      rid := NULL;
    END;
  END IF;

  INSERT INTO public.admin_activity_logs (
    actor_id, source, action, summary, details
  ) VALUES (
    actor,
    'database',
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || '.' || TG_OP,
    TG_TABLE_NAME || ' · ' || TG_OP || COALESCE(' · ' || rid, ''),
    jsonb_build_object(
      'schema', TG_TABLE_SCHEMA,
      'table', TG_TABLE_NAME,
      'op', TG_OP,
      'id', rid
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
