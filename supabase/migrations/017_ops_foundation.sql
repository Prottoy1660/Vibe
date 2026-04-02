-- Ops foundation: events + notification queue for support/risk/timeline features

CREATE TABLE IF NOT EXISTS public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  status TEXT,
  message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  amount NUMERIC,
  gateway TEXT,
  message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  risk_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low',
  message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'in_app',
  template_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_created
  ON public.order_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_user_created
  ON public.order_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_events_order_created
  ON public.payment_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_user_created
  ON public.payment_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_events_created
  ON public.risk_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_user_created
  ON public.risk_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_queue_status_scheduled
  ON public.notification_queue(status, scheduled_for);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- Users can view their own timeline/payment notifications
DROP POLICY IF EXISTS "Users can view own order events" ON public.order_events;
CREATE POLICY "Users can view own order events"
  ON public.order_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own payment events" ON public.payment_events;
CREATE POLICY "Users can view own payment events"
  ON public.payment_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notification_queue;
CREATE POLICY "Users can view own notifications"
  ON public.notification_queue FOR SELECT
  USING (auth.uid() = user_id);

-- Admin visibility from dashboard
DROP POLICY IF EXISTS "Admins can view all order events" ON public.order_events;
CREATE POLICY "Admins can view all order events"
  ON public.order_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  ));

DROP POLICY IF EXISTS "Admins can view all payment events" ON public.payment_events;
CREATE POLICY "Admins can view all payment events"
  ON public.payment_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  ));

DROP POLICY IF EXISTS "Admins can view all risk events" ON public.risk_events;
CREATE POLICY "Admins can view all risk events"
  ON public.risk_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  ));

DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notification_queue;
CREATE POLICY "Admins can view all notifications"
  ON public.notification_queue FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  ));

