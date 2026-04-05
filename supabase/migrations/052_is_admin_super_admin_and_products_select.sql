-- super_admin must satisfy RLS the same way as API verifyAdmin (admin | super_admin).
-- Previously is_admin() only checked role = 'admin', so super_admin users failed RLS
-- on tables that relied on public.is_admin() while still passing the Express admin gate.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (select auth.uid())
      AND role IN ('admin', 'super_admin')
  );
END;
$$;

-- Treat NULL is_active as inactive for the public leg of the policy (explicit, safe).
DROP POLICY IF EXISTS "select_products" ON public.products;
CREATE POLICY "select_products" ON public.products
  FOR SELECT USING (
    (COALESCE(is_active, false) = true)
    OR public.is_admin()
  );
