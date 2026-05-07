-- Public storage bucket for the agency logo. Reuses the same "public-RLS"
-- pattern as the rest of the app (single-tenant internal tool).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agency-logos',
  'agency-logos',
  true,
  5 * 1024 * 1024, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Permissive policies: anyone can read, write, update, delete inside the bucket.
DROP POLICY IF EXISTS "Public read agency-logos" ON storage.objects;
CREATE POLICY "Public read agency-logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'agency-logos');

DROP POLICY IF EXISTS "Public write agency-logos" ON storage.objects;
CREATE POLICY "Public write agency-logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'agency-logos');

DROP POLICY IF EXISTS "Public update agency-logos" ON storage.objects;
CREATE POLICY "Public update agency-logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'agency-logos')
  WITH CHECK (bucket_id = 'agency-logos');

DROP POLICY IF EXISTS "Public delete agency-logos" ON storage.objects;
CREATE POLICY "Public delete agency-logos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'agency-logos');
