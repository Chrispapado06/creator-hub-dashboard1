-- Multi-page support per creator + view tracking for real analytics.
--
-- Until now `creator_landing_pages.creator_id` was UNIQUE, capping each creator
-- at one page. Lifting that constraint so admins can spin up multiple pages
-- (e.g. a "main" linktree, a "Q4 promo" funnel, an audience-specific landing).
--
-- The `slug` and `custom_domain` columns are still UNIQUE — every page has
-- to have a globally distinct URL.

-- Drop the auto-generated UNIQUE constraint on creator_id (Postgres names
-- it "<table>_<col>_key"). IF EXISTS keeps the migration idempotent.
ALTER TABLE public.creator_landing_pages
  DROP CONSTRAINT IF EXISTS creator_landing_pages_creator_id_key;

-- Now that creator_id isn't unique anymore, the lookup-by-creator query
-- (which was free under the UNIQUE) needs an explicit index.
CREATE INDEX IF NOT EXISTS idx_landing_creator
  ON public.creator_landing_pages(creator_id);

-- Page-view tracking. One row per visit. Aggregated at read time so writes
-- stay fast. (Same pattern as landing_clicks.)
CREATE TABLE IF NOT EXISTS public.landing_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id UUID NOT NULL REFERENCES public.creator_landing_pages(id) ON DELETE CASCADE,
  referrer TEXT,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_landing_views_page
  ON public.landing_views(landing_id, occurred_at DESC);

ALTER TABLE public.landing_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.landing_views;
CREATE POLICY "Public full access" ON public.landing_views FOR ALL USING (true) WITH CHECK (true);
