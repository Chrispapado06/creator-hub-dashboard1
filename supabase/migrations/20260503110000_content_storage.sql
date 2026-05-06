-- Add file_url column to content_items for uploaded files
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS file_url TEXT;

-- Create content-files storage bucket (public, 100 MB limit per file)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('content-files', 'content-files', true, 104857600)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow full access (internal tool)
CREATE POLICY "content_files_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'content-files');

CREATE POLICY "content_files_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'content-files');

CREATE POLICY "content_files_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'content-files');
