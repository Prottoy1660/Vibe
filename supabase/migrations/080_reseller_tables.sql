-- =====================================================================
-- 080: Reseller Panel Tables (Packages, Deposits, User Access)
-- =====================================================================

-- Create the updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Reseller Packages (Managed by Admin)
CREATE TABLE IF NOT EXISTS public.reseller_packages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    label TEXT NOT NULL,          -- e.g., '1 Month', '14 Days Trial'
    value TEXT NOT NULL,          -- e.g., '1', '14d'
    cost NUMERIC(10, 2) NOT NULL, -- Cost in USD
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reseller_packages ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage reseller packages" ON public.reseller_packages
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.role = 'super_admin')
        )
    );

-- Resellers can only read
CREATE POLICY "Resellers can view packages" ON public.reseller_packages
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'reseller'
        )
    );


-- 2. Reseller Transactions (Deposits, Deductions, Refunds)
CREATE TABLE IF NOT EXISTS public.reseller_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reseller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('deposit', 'deduct', 'refund', 'system')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    tx_id TEXT, -- e.g., Binance Transaction ID for deposits
    description TEXT,
    balance_after NUMERIC(10, 2), -- Snapshot of balance after this transaction
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reseller_transactions ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage reseller transactions" ON public.reseller_transactions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.role = 'super_admin')
        )
    );

-- Resellers can only see their own transactions
CREATE POLICY "Resellers can view own transactions" ON public.reseller_transactions
    FOR SELECT TO authenticated
    USING (reseller_id = auth.uid());

-- Resellers can insert pending deposits
CREATE POLICY "Resellers can insert pending deposits" ON public.reseller_transactions
    FOR INSERT TO authenticated
    WITH CHECK (
        reseller_id = auth.uid() 
        AND type = 'deposit' 
        AND status = 'pending'
    );


-- 3. Reseller User Access (Adobe Subscriptions given to customers)
CREATE TABLE IF NOT EXISTS public.reseller_user_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reseller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    customer_email TEXT NOT NULL,
    duration_months TEXT NOT NULL, -- The package value used
    duration_days INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'refunded')),
    products TEXT[] DEFAULT '{}',
    activated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reseller_user_access ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage reseller user access" ON public.reseller_user_access
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users WHERE users.id = auth.uid() AND (users.role = 'admin' OR users.role = 'super_admin')
        )
    );

-- Resellers can read their own
CREATE POLICY "Resellers can view own user access" ON public.reseller_user_access
    FOR SELECT TO authenticated
    USING (reseller_id = auth.uid());

-- Triggers for updated_at
CREATE TRIGGER set_timestamp_reseller_packages
BEFORE UPDATE ON public.reseller_packages
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_timestamp_reseller_transactions
BEFORE UPDATE ON public.reseller_transactions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_timestamp_reseller_user_access
BEFORE UPDATE ON public.reseller_user_access
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Insert initial packages
INSERT INTO public.reseller_packages (label, value, cost) VALUES
('7 Days Trial', '7d', 3.50),
('14 Days Trial', '14d', 7.00),
('1 Month', '1', 15.00),
('3 Months', '3', 40.00),
('6 Months', '6', 75.00),
('12 Months', '12', 140.00);