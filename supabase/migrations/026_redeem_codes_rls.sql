-- Fix Row-Level Security explicitly for the redeem_codes table.

ALTER TABLE IF EXISTS public.redeem_codes ENABLE ROW LEVEL SECURITY;

-- Allow admins to manage (SELECT / INSERT / UPDATE / DELETE) redeem codes
DROP POLICY IF EXISTS "Admins can manage redeem codes" ON public.redeem_codes;
CREATE POLICY "Admins can manage redeem codes" ON public.redeem_codes 
FOR ALL USING (public.is_admin());

-- Optionally allow authenticated users to view active codes if they query it directly
DROP POLICY IF EXISTS "Users can view active redeem codes" ON public.redeem_codes;
CREATE POLICY "Users can view active redeem codes" ON public.redeem_codes 
FOR SELECT USING (is_active = true);
