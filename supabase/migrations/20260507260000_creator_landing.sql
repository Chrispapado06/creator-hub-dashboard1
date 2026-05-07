-- Public landing pages per creator: a Linktree-style bio+links page hosted by
-- this app. Each creator can have one. Reachable at /p/<slug> or, if a custom
-- domain is set, at the apex/sub-domain itself.

CREATE TABLE IF NOT EXISTS public.creator_landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL UNIQUE REFERENCES public.creators(id) ON DELETE CASCADE,
  -- URL slug. Must be unique across the app. Lowercase letters, numbers, hyphens.
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  -- Custom domain (e.g. creatorname.com). Optional. Vercel handles the cert
  -- + routing to this app; we just match the request hostname against this column.
  custom_domain TEXT UNIQUE,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,

  -- Profile content
  display_name TEXT,                    -- defaults to creator.name if NULL
  tagline TEXT,                         -- short subtitle under display_name
  bio TEXT,                             -- longer description (markdown allowed)
  avatar_url TEXT,
  cover_url TEXT,                       -- optional banner image

  -- Theme settings
  theme TEXT NOT NULL DEFAULT 'cream',  -- 'cream' | 'dark' | 'rose' | 'gradient' | 'minimal'
  accent_color TEXT,                    -- optional override (oklch / hex)
  font TEXT NOT NULL DEFAULT 'poppins', -- 'poppins' | 'serif' | 'mono'

  -- Links: ordered array of { label, url, icon? }
  links JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- SEO
  seo_title TEXT,
  seo_description TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_slug ON public.creator_landing_pages(slug);
CREATE INDEX IF NOT EXISTS idx_landing_custom_domain ON public.creator_landing_pages(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_landing_creator ON public.creator_landing_pages(creator_id);

-- Permissive RLS — public read so /p/<slug> works without auth
ALTER TABLE public.creator_landing_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.creator_landing_pages;
CREATE POLICY "Public full access" ON public.creator_landing_pages FOR ALL USING (true) WITH CHECK (true);

-- Click tracking. One row per click. We aggregate at read time so the
-- write path stays minimal (a fire-and-forget INSERT).
CREATE TABLE IF NOT EXISTS public.landing_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id UUID NOT NULL REFERENCES public.creator_landing_pages(id) ON DELETE CASCADE,
  link_url TEXT NOT NULL,
  link_label TEXT,
  -- Coarse-grained referrer / device info; no PII.
  referrer TEXT,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_landing_clicks_page
  ON public.landing_clicks(landing_id, occurred_at DESC);

ALTER TABLE public.landing_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.landing_clicks;
CREATE POLICY "Public full access" ON public.landing_clicks FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for landing-page assets (avatars + cover photos). Public read
-- so the public page works without auth.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landing-assets',
  'landing-assets',
  true,
  10 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read landing-assets"   ON storage.objects;
DROP POLICY IF EXISTS "Public write landing-assets"  ON storage.objects;
DROP POLICY IF EXISTS "Public update landing-assets" ON storage.objects;
DROP POLICY IF EXISTS "Public delete landing-assets" ON storage.objects;
CREATE POLICY "Public read landing-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'landing-assets');
CREATE POLICY "Public write landing-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'landing-assets');
CREATE POLICY "Public update landing-assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'landing-assets')
  WITH CHECK (bucket_id = 'landing-assets');
CREATE POLICY "Public delete landing-assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'landing-assets');
