-- Track which Adobe credits-pool organization each reseller customer belongs to.
ALTER TABLE public.reseller_user_access
  ADD COLUMN IF NOT EXISTS adobe_organization_id INTEGER,
  ADD COLUMN IF NOT EXISTS adobe_organization_name TEXT,
  ADD COLUMN IF NOT EXISTS adobe_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reseller_user_access_org_name
  ON public.reseller_user_access (adobe_organization_name)
  WHERE adobe_organization_name IS NOT NULL;
