-- =====================================================================
-- 094: Per-reseller custom package pricing (admin-managed discounts)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.reseller_package_pricing (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reseller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES public.reseller_packages(id) ON DELETE CASCADE,
    custom_cost NUMERIC(10, 2) NOT NULL CHECK (custom_cost >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (reseller_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_reseller_package_pricing_reseller
    ON public.reseller_package_pricing (reseller_id);

ALTER TABLE public.reseller_package_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage reseller package pricing" ON public.reseller_package_pricing
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
              AND (users.role = 'admin' OR users.role = 'super_admin')
        )
    );

CREATE POLICY "Resellers can view own package pricing" ON public.reseller_package_pricing
    FOR SELECT TO authenticated
    USING (reseller_id = auth.uid());

CREATE TRIGGER set_timestamp_reseller_package_pricing
BEFORE UPDATE ON public.reseller_package_pricing
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
