-- Stores Airtable share/embed URLs that appear inside the app.
-- "scope" lets us reuse the same table for Reddit / Instagram / Facebook /
-- TikTok pages later — for now only 'reddit' is wired up in the UI.
CREATE TABLE IF NOT EXISTS public.airtable_embeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'reddit',
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_airtable_embeds_scope
  ON public.airtable_embeds(scope, display_order);

ALTER TABLE public.airtable_embeds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.airtable_embeds;
CREATE POLICY "Public full access" ON public.airtable_embeds FOR ALL USING (true) WITH CHECK (true);
