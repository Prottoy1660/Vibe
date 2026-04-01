import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sql = `
-- Create user_activity_logs table
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- e.g., 'profile_update', 'password_change', 'avatar_update', 'admin_update'
    changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL, -- Who made the change
    details JSONB, -- Store old vs new values or descriptive text
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Set up RLS
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all logs
CREATE POLICY "Admins can view all activity logs" ON public.user_activity_logs 
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Users can view their own logs
CREATE POLICY "Users can view their own logs" ON public.user_activity_logs 
FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own logs
CREATE POLICY "Users can insert their own logs" ON public.user_activity_logs 
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Admins can insert logs for any user
CREATE POLICY "Admins can insert any logs" ON public.user_activity_logs 
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
`;

console.log("Please run this SQL in your Supabase dashboard to enable User Activity Logs:\n\n" + sql);