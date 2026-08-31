-- Keyword attribution tracking (OnlyFinder ads → OF tracking links → subs → revenue)
--
-- Reuses the existing public.creators table (id, name, of_username). Adds the
-- three tables the keyword-tracker app needs. Single-user internal tool: RLS is
-- enabled with permissive policies so the app's anon client can read and the
-- service-role client (server actions) can write.

-- ── tracking_links ───────────────────────────────────────────────────
-- One row per OnlyFinder keyword ↔ OF tracking link mapping.
CREATE TABLE IF NOT EXISTS public.tracking_links (
  id                  UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id          UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  link_id             TEXT NOT NULL,          -- OF tracking link / campaign code
  link_name           TEXT,
  keyword             TEXT NOT NULL,          -- the OnlyFinder ad keyword
  onlyfinder_campaign TEXT,
  url                 TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracking_links_creator ON public.tracking_links(creator_id);
-- A given OF tracking link should only be mapped once per creator.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracking_links_creator_link
  ON public.tracking_links(creator_id, link_id);

-- ── keyword_costs ────────────────────────────────────────────────────
-- Manually-entered daily CPC data from OnlyFinder. One row per link per day
-- (upsert on conflict so re-logging a date overwrites rather than duplicates).
CREATE TABLE IF NOT EXISTS public.keyword_costs (
  id               UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracking_link_id UUID NOT NULL REFERENCES public.tracking_links(id) ON DELETE CASCADE,
  date             DATE NOT NULL,
  clicks           INTEGER NOT NULL DEFAULT 0,
  spend_usd        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_keyword_costs_link ON public.keyword_costs(tracking_link_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_keyword_costs_link_date
  ON public.keyword_costs(tracking_link_id, date);

-- ── subscriber_snapshots ─────────────────────────────────────────────
-- Point-in-time subscriber + revenue pulls from the OF API, one per sync.
CREATE TABLE IF NOT EXISTS public.subscriber_snapshots (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracking_link_id  UUID NOT NULL REFERENCES public.tracking_links(id) ON DELETE CASCADE,
  date_pulled       TIMESTAMPTZ NOT NULL DEFAULT now(),
  subscriber_count  INTEGER NOT NULL DEFAULT 0,
  total_revenue_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_link ON public.subscriber_snapshots(tracking_link_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_link_pulled
  ON public.subscriber_snapshots(tracking_link_id, date_pulled DESC);

-- ── RLS (permissive: single-user internal tool) ──────────────────────
ALTER TABLE public.tracking_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keyword_costs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriber_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tracking_links', 'keyword_costs', 'subscriber_snapshots']
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t || '_all', t
    );
  END LOOP;
END $$;
