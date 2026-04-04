-- Help chat / AI support: admin-configurable settings + optional training capture (service role only).

CREATE TABLE IF NOT EXISTS public.support_chat_training_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  session_id text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_support_chat_training_created_at
  ON public.support_chat_training_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_chat_training_session
  ON public.support_chat_training_logs (session_id);

COMMENT ON TABLE public.support_chat_training_logs IS
  'Optional Q/A capture for improving support AI; no client RLS — API uses service role only.';

ALTER TABLE public.support_chat_training_logs ENABLE ROW LEVEL SECURITY;

INSERT INTO public.system_settings (key, value)
VALUES (
  'support_chat',
  jsonb_build_object(
    'help_chat_enabled', true,
    'training_capture_enabled', false,
    'whatsapp_e164', '',
    'provider', 'auto',
    'openai_model', '',
    'gemini_model', '',
    'custom_prompt_append', ''
  )
)
ON CONFLICT (key) DO NOTHING;
