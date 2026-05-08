-- OnlyFans native tracking links (campaign codes).
--
-- OF's own /tracking-links endpoint returns the campaigns a creator
-- has set up on onlyfans.com (each campaign has a code → URL → revenue
-- attribution). These are different from the Reddit `tracking_links`
-- table (which is just labeled URLs the agency tracks manually).
--
-- We mirror them locally so:
--   • Revenue page can show real per-campaign revenue without an API
--     call on every render
--   • The chart can include OF tracking-link revenue as a series
--   • Adding a tracking link in the OF dashboard is actually visible
--     in this software once a sync runs
--
-- Synced on every OF sync run (per-creator, in onlyfans.tsx). Source
-- data is the same listTrackingLinks() helper in src/lib/of-api.ts.

CREATE TABLE IF NOT EXISTS public.of_tracking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  -- OF's campaign code is a numeric id; we keep BIGINT to be safe.
  campaign_code BIGINT NOT NULL,
  campaign_url TEXT,
  name TEXT,
  clicks_count INTEGER NOT NULL DEFAULT 0,
  subscribers_count INTEGER NOT NULL DEFAULT 0,
  spenders_count INTEGER NOT NULL DEFAULT 0,
  revenue_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  revenue_per_subscriber NUMERIC(10, 4) NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creator_id, campaign_code)
);
CREATE INDEX IF NOT EXISTS idx_of_tracking_creator
  ON public.of_tracking_links(creator_id);
CREATE INDEX IF NOT EXISTS idx_of_tracking_revenue
  ON public.of_tracking_links(revenue_total DESC);

ALTER TABLE public.of_tracking_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.of_tracking_links;
CREATE POLICY "Public full access" ON public.of_tracking_links
  FOR ALL USING (true) WITH CHECK (true);
