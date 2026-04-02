import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sql = `
-- Add is_personal to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT false;

-- Add personal_email to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS personal_email VARCHAR(255);
`;

console.log("Please run this SQL in your Supabase dashboard to enable Personal Subscriptions:\n\n" + sql);
