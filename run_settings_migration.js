import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sql = `
-- Create settings table
CREATE TABLE IF NOT EXISTS public.system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default setting for Google Sign In
INSERT INTO public.system_settings (key, value) 
VALUES ('auth_settings', '{"enable_google_login": true}')
ON CONFLICT (key) DO NOTHING;

-- Set up RLS for settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read settings
CREATE POLICY "Anyone can view settings" ON public.system_settings 
FOR SELECT USING (true);

-- Only admins can update settings
CREATE POLICY "Admins can update settings" ON public.system_settings 
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
`;

console.log("Please run this SQL in your Supabase dashboard to enable System Settings:\n\n" + sql);
