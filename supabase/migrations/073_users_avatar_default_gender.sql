-- Optional override for default (non-uploaded) character avatar: auto | male | female
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_default_gender TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_avatar_default_gender_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_avatar_default_gender_check
  CHECK (avatar_default_gender IN ('auto', 'male', 'female'));

COMMENT ON COLUMN public.users.avatar_default_gender IS
  'When avatar_url is empty: auto = name/hash pick; male/female = fixed default illustration.';
