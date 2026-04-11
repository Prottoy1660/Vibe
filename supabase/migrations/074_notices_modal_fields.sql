-- Rich customer welcome modal for notices (admin-configurable image + CTA + snooze).

ALTER TABLE public.notices
  ADD COLUMN IF NOT EXISTS show_as_modal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT,
  ADD COLUMN IF NOT EXISTS cta_label TEXT,
  ADD COLUMN IF NOT EXISTS cta_url TEXT,
  ADD COLUMN IF NOT EXISTS snooze_hours INTEGER NOT NULL DEFAULT 6;

ALTER TABLE public.notices
  DROP CONSTRAINT IF EXISTS notices_snooze_hours_range;

ALTER TABLE public.notices
  ADD CONSTRAINT notices_snooze_hours_range
  CHECK (snooze_hours >= 1 AND snooze_hours <= 168);

COMMENT ON COLUMN public.notices.show_as_modal IS 'When true, logged-in customers see this as a dismissible full-screen style modal on app load (until snoozed).';
COMMENT ON COLUMN public.notices.hero_image_url IS 'Optional banner image URL shown inside the modal (e.g. CDN).';
COMMENT ON COLUMN public.notices.cta_label IS 'Optional button label (e.g. Learn more).';
COMMENT ON COLUMN public.notices.cta_url IS 'Optional URL opened when CTA is clicked (new tab).';
COMMENT ON COLUMN public.notices.snooze_hours IS 'After dismiss, modal stays hidden for this many hours for that notice id.';
