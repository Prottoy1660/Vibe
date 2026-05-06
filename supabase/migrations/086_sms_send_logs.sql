-- SMS send history for admin broadcast/custom sends.

CREATE TABLE IF NOT EXISTS public.sms_send_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  recipient_phone TEXT NOT NULL CHECK (char_length(trim(recipient_phone)) >= 11),
  message TEXT NOT NULL CHECK (char_length(trim(message)) > 0 AND char_length(message) <= 2000),
  sender_id TEXT,
  schedule_at TIMESTAMPTZ,
  provider TEXT NOT NULL DEFAULT 'sms.net.bd',
  provider_request_id TEXT,
  provider_error_code INT,
  provider_message TEXT,
  recipient_mode TEXT NOT NULL DEFAULT 'custom_numbers'
    CHECK (recipient_mode IN ('selected_users', 'all_users', 'custom_numbers', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_send_logs_created_at ON public.sms_send_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_send_logs_batch ON public.sms_send_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_sms_send_logs_phone_created ON public.sms_send_logs(recipient_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_send_logs_admin_created ON public.sms_send_logs(admin_id, created_at DESC);

COMMENT ON TABLE public.sms_send_logs IS
  'Recipient-level history of outbound SMS submissions from admin panel.';

ALTER TABLE public.sms_send_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins select sms send logs" ON public.sms_send_logs;
CREATE POLICY "Admins select sms send logs"
  ON public.sms_send_logs FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert sms send logs" ON public.sms_send_logs;
CREATE POLICY "Admins insert sms send logs"
  ON public.sms_send_logs FOR INSERT
  WITH CHECK (public.is_admin());
