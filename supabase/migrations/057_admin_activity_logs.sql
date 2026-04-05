-- Immutable audit trail for admin/super_admin actions (API + DB mutations from admin sessions).

CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'api' CHECK (source IN ('api', 'database')),
  http_method TEXT,
  path TEXT,
  status_code INT,
  duration_ms INT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at ON public.admin_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_actor ON public.admin_activity_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_source ON public.admin_activity_logs (source, created_at DESC);

COMMENT ON TABLE public.admin_activity_logs IS
  'Audit log: API admin routes (source=api) and Postgres mutations by admin JWT (source=database).';

ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_activity_logs_select" ON public.admin_activity_logs;
CREATE POLICY "admin_activity_logs_select" ON public.admin_activity_logs
  FOR SELECT
  USING (public.is_admin());

-- No INSERT/UPDATE/DELETE for authenticated role — service role + SECURITY DEFINER triggers only.

CREATE OR REPLACE FUNCTION public.log_admin_database_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
  rid text;
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

-- Attach to tables admins commonly mutate from the dashboard (client JWT).
DROP TRIGGER IF EXISTS tr_admin_activity_emails_pool ON public.emails_pool;
CREATE TRIGGER tr_admin_activity_emails_pool
  AFTER INSERT OR UPDATE OR DELETE ON public.emails_pool
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_email_teams ON public.email_teams;
CREATE TRIGGER tr_admin_activity_email_teams
  AFTER INSERT OR UPDATE OR DELETE ON public.email_teams
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_operational_expenses ON public.operational_expenses;
CREATE TRIGGER tr_admin_activity_operational_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.operational_expenses
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_system_settings ON public.system_settings;
CREATE TRIGGER tr_admin_activity_system_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.system_settings
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_products ON public.products;
CREATE TRIGGER tr_admin_activity_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_coupons ON public.coupons;
CREATE TRIGGER tr_admin_activity_coupons
  AFTER INSERT OR UPDATE OR DELETE ON public.coupons
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_notices ON public.notices;
CREATE TRIGGER tr_admin_activity_notices
  AFTER INSERT OR UPDATE OR DELETE ON public.notices
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_orders ON public.orders;
CREATE TRIGGER tr_admin_activity_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_users ON public.users;
CREATE TRIGGER tr_admin_activity_users
  AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_redeem_codes ON public.redeem_codes;
CREATE TRIGGER tr_admin_activity_redeem_codes
  AFTER INSERT OR UPDATE OR DELETE ON public.redeem_codes
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_support_tickets ON public.support_tickets;
CREATE TRIGGER tr_admin_activity_support_tickets
  AFTER INSERT OR UPDATE OR DELETE ON public.support_tickets
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_user_inbox ON public.user_inbox;
CREATE TRIGGER tr_admin_activity_user_inbox
  AFTER INSERT OR UPDATE OR DELETE ON public.user_inbox
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_product_waitlist ON public.product_waitlist;
CREATE TRIGGER tr_admin_activity_product_waitlist
  AFTER INSERT OR UPDATE OR DELETE ON public.product_waitlist
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_campaigns ON public.campaigns;
CREATE TRIGGER tr_admin_activity_campaigns
  AFTER INSERT OR UPDATE OR DELETE ON public.campaigns
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();

DROP TRIGGER IF EXISTS tr_admin_activity_user_sessions ON public.user_sessions;
CREATE TRIGGER tr_admin_activity_user_sessions
  AFTER INSERT OR UPDATE OR DELETE ON public.user_sessions
  FOR EACH ROW EXECUTE PROCEDURE public.log_admin_database_activity();
