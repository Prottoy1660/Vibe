-- Personal manual order ops metadata: checklist, notes, assignment, delivery timestamps, and reminder tracking.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS internal_admin_note TEXT,
  ADD COLUMN IF NOT EXISTS manual_access_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_manual_alert_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_manual_urgent_alert_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_assigned_admin_created
  ON public.orders (assigned_admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_personal_manual_pending
  ON public.orders (created_at DESC)
  WHERE personal_email IS NOT NULL AND payment_status = 'paid' AND status = 'pending';
