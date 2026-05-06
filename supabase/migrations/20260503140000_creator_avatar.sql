-- Add avatar_url to creators
ALTER TABLE public.creators ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Storage bucket for creator avatars (public, 5 MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('creator-avatars', 'creator-avatars', true, 5242880)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "creator_avatars_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'creator-avatars');

CREATE POLICY "creator_avatars_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'creator-avatars');

CREATE POLICY "creator_avatars_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'creator-avatars');
