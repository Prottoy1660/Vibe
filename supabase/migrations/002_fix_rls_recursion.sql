-- Fix infinite recursion in users table policies

-- Drop the old recursive policies
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;

-- Create a secure function to check for admin status bypassing RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new policies using the secure function
CREATE POLICY "Admins can view all users" ON public.users 
FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can update all users" ON public.users 
FOR UPDATE USING (public.is_admin());

-- Also update other policies that use the recursive check to use the function for better performance
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products" ON public.products FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;
CREATE POLICY "Admins can manage coupons" ON public.coupons FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;
CREATE POLICY "Admins can manage all orders" ON public.orders FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage email pool" ON public.emails_pool;
CREATE POLICY "Admins can manage email pool" ON public.emails_pool FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage user emails" ON public.user_emails;
CREATE POLICY "Admins can manage user emails" ON public.user_emails FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage generation logs" ON public.email_generation_logs;
CREATE POLICY "Admins can manage generation logs" ON public.email_generation_logs FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage notices" ON public.notices;
CREATE POLICY "Admins can manage notices" ON public.notices FOR ALL USING (public.is_admin());

-- Ensure anon and authenticated roles have access
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
