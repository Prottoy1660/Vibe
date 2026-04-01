import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sql = `
-- 1. Add avatar_url column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Create the avatars storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true) 
ON CONFLICT (id) DO NOTHING;

-- 3. Set up storage policies for the avatars bucket
-- Allow public read access
CREATE POLICY "Avatar images are publicly accessible." 
ON storage.objects FOR SELECT 
USING (bucket_id = 'avatars');

-- Allow users to upload their own avatars
CREATE POLICY "Users can upload their own avatars." 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'avatars' AND auth.uid() = owner);

-- Allow users to update their own avatars
CREATE POLICY "Users can update their own avatars." 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'avatars' AND auth.uid() = owner);

-- Allow admins to upload/update/delete any avatar
CREATE POLICY "Admins can manage all avatars" 
ON storage.objects FOR ALL 
USING (
  bucket_id = 'avatars' AND 
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
`;

console.log("SQL Script generated for avatars. Please run this in the Supabase SQL Editor:");
console.log(sql);
