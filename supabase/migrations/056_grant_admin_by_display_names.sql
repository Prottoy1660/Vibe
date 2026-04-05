-- Promote the two operator accounts to admin by public.users.name (must match profile name exactly).
-- Run after both users have signed up at least once (public.users row exists).

UPDATE public.users
SET
  role = 'admin',
  updated_at = NOW()
WHERE TRIM(name) IN (
  'Mahmudul Hasan Prottoy',
  'Tuzayer Hossain'
);
