import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sql = `
-- 1. Add order_id to email_generation_logs
ALTER TABLE public.email_generation_logs ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE;

-- 2. Drop the old unique constraint (user_id, month) and add the new one (user_id, order_id)
ALTER TABLE public.email_generation_logs DROP CONSTRAINT IF EXISTS email_generation_logs_user_id_month_key;
ALTER TABLE public.email_generation_logs ADD CONSTRAINT email_generation_logs_order_id_key UNIQUE (order_id);

-- 3. Update the assign_available_email RPC to check limits per order_id instead of per month
CREATE OR REPLACE FUNCTION public.assign_available_email(target_order_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  avimport { createClient } from '@supabase/supabase-js';
imunimport dotenv from 'dotenv';

dotenv.config();

consrd
dotenv.config();

const supabase =
  
const supabase
  
const sql = `
-- 1. Add order_id to email_generation_logs
ALTER TABLE public.email_generation_logs (-- 1. Add or,ALTER TABLE public.email_generation_logs AXC
-- 2. Drop the old unique constraint (user_id, month) and add the new one (user_id, order_id)
ALTER TABLE public.email_generat IALTER TABLE public.email_generation_logs DROP CONSTRAINT IF EXISTS email_generation_logs_use

ALTER TABLE public.email_generation_logs ADD CONSTRAINT email_generation_logs_order_id_key UNIQUE (order_i E
-- 3. Update the assign_available_email RPC to check limits per order_id instead of per month
CREAemails_pool
CREATE OR REPLACE FUNCTION public.assign_available_email(target_order_id UUID)
RETURNS JSON
ilRETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  avimport { cre