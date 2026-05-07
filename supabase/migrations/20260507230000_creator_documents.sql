-- Per-creator document storage: contracts, ID, DMCA, W-9, NDAs, brand kits.
-- Files live in the new `creator-documents` bucket; metadata + expiry tracking
-- live in this table.

CREATE TABLE IF NOT EXISTS public.creator_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
    'contract', 'id', 'dmca', 'w9_1099', 'nda', 'brand_kit', 'agreement', 'other'
  )),
  -- Path inside the creator-documents storage bucket. Format: creatorId/uuid.ext
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  notes TEXT,
  expires_at DATE,
  -- If a document supersedes a previous version of the same thing, link them
  supersedes_id UUID REFERENCES public.creator_documents(id) ON DELETE SET NULL,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_documents_creator
  ON public.creator_documents(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_documents_expiring
  ON public.creator_documents(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE public.creator_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.creator_documents;
CREATE POLICY "Public full access" ON public.creator_documents FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for the actual files. Private (signed URLs only) since
-- contracts and IDs shouldn't be publicly accessible by URL.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'creator-documents',
  'creator-documents',
  false,
  50 * 1024 * 1024,
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Same permissive RLS as the rest of this single-tenant app.
DROP POLICY IF EXISTS "Public read creator-documents"   ON storage.objects;
DROP POLICY IF EXISTS "Public write creator-documents"  ON storage.objects;
DROP POLICY IF EXISTS "Public update creator-documents" ON storage.objects;
DROP POLICY IF EXISTS "Public delete creator-documents" ON storage.objects;
CREATE POLICY "Public read creator-documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'creator-documents');
CREATE POLICY "Public write creator-documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'creator-documents');
CREATE POLICY "Public update creator-documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'creator-documents')
  WITH CHECK (bucket_id = 'creator-documents');
CREATE POLICY "Public delete creator-documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'creator-documents');
