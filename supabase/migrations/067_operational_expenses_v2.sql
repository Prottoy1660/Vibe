-- Operational expenses v2: multi-currency, vendors, payment methods, tags, attachments, recurring templates.
-- Backwards compatible: existing `amount` remains the BDT-equivalent used in net profit calculations.

ALTER TABLE IF EXISTS public.operational_expenses
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BDT',
  ADD COLUMN IF NOT EXISTS amount_original NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS fx_rate_to_bdt NUMERIC(18, 6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fx_source TEXT,
  ADD COLUMN IF NOT EXISTS vendor_name TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS attachment_urls TEXT[] NOT NULL DEFAULT '{}'::text[],
  -- Recurring templates live in the same table to minimize schema complexity.
  ADD COLUMN IF NOT EXISTS is_recurring_template BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurrence_interval TEXT,
  ADD COLUMN IF NOT EXISTS next_due_date DATE,
  ADD COLUMN IF NOT EXISTS template_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Link generated instances back to their template row.
  ADD COLUMN IF NOT EXISTS template_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'operational_expenses_fx_rate_positive'
  ) THEN
    ALTER TABLE public.operational_expenses
      ADD CONSTRAINT operational_expenses_fx_rate_positive CHECK (fx_rate_to_bdt > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'operational_expenses_currency_check'
  ) THEN
    ALTER TABLE public.operational_expenses
      ADD CONSTRAINT operational_expenses_currency_check CHECK (currency IN ('BDT', 'USD'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'operational_expenses_recurrence_interval_check'
  ) THEN
    ALTER TABLE public.operational_expenses
      ADD CONSTRAINT operational_expenses_recurrence_interval_check CHECK (
        recurrence_interval IS NULL OR recurrence_interval IN ('weekly', 'monthly')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'operational_expenses_template_fk'
  ) THEN
    ALTER TABLE public.operational_expenses
      ADD CONSTRAINT operational_expenses_template_fk
      FOREIGN KEY (template_id) REFERENCES public.operational_expenses (id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill: existing rows are BDT with fx=1 and amount_original inferred.
UPDATE public.operational_expenses
SET
  currency = COALESCE(NULLIF(currency, ''), 'BDT'),
  fx_rate_to_bdt = COALESCE(NULLIF(fx_rate_to_bdt, 0), 1),
  amount_original = COALESCE(amount_original, amount)
WHERE TRUE;

CREATE INDEX IF NOT EXISTS idx_operational_expenses_category_date
  ON public.operational_expenses (category, expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_operational_expenses_vendor_date
  ON public.operational_expenses (vendor_name, expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_operational_expenses_template_due
  ON public.operational_expenses (is_recurring_template, template_active, next_due_date);

