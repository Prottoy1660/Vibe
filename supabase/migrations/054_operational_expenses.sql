-- Manual operational expenses for admin P&L (subtract from gross revenue for net profit).

CREATE TABLE IF NOT EXISTS public.operational_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  expense_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operational_expenses_expense_date
  ON public.operational_expenses (expense_date DESC);

COMMENT ON TABLE public.operational_expenses IS
  'Admin-entered operational costs; used with paid orders revenue for net profit views.';

ALTER TABLE public.operational_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operational_expenses_admin_all" ON public.operational_expenses;
CREATE POLICY "operational_expenses_admin_all" ON public.operational_expenses
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
