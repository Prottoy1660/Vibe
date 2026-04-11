-- Public bucket for welcome-popup hero banners (customers load via public URL; admins upload from dashboard).

INSERT INTO storage.buckets (id, name, public)
VALUES ('notice-hero', 'notice-hero', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "notice_hero_public_read" ON storage.objects;
CREATE POLICY "notice_hero_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'notice-hero');

DROP POLICY IF EXISTS "notice_hero_admin_insert" ON storage.objects;
CREATE POLICY "notice_hero_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'notice-hero' AND public.is_admin());

DROP POLICY IF EXISTS "notice_hero_admin_update" ON storage.objects;
CREATE POLICY "notice_hero_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'notice-hero' AND public.is_admin())
  WITH CHECK (bucket_id = 'notice-hero' AND public.is_admin());

DROP POLICY IF EXISTS "notice_hero_admin_delete" ON storage.objects;
CREATE POLICY "notice_hero_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'notice-hero' AND public.is_admin());
