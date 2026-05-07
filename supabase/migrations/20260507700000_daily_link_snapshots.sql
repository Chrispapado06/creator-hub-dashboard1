-- Per-day snapshot of OnlyFans tracking links.
--
-- The Daily dashboard needs to compare today's clicks/subscribers/revenue
-- against yesterday's. infloww_tracking_stats only stores current
-- cumulative state — fine for "all-time totals" but useless for delta
-- math. This table snapshots the state once per (creator, campaign) per
-- day so the daily comparison view, automation rules' low-CVR check, and
-- Bernard's link-performance analysis all have something real to read.
--
-- The Daily page upserts into this table from the OnlyFans tracking-links
-- API on each manual sync. Bernard's snapshot loader and automation rules
-- both read it.

CREATE TABLE IF NOT EXISTS public.daily_link_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  campaign_code INTEGER NOT NULL,
  campaign_url TEXT,
  link_name TEXT,
  clicks_count INTEGER NOT NULL DEFAULT 0,
  subscribers_count INTEGER NOT NULL DEFAULT 0,
  revenue_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  spenders_count INTEGER NOT NULL DEFAULT 0,
  snapshot_date DATE NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One row per (creator, campaign, day) — the upsert in daily.tsx uses
  -- this composite key as its conflict target.
  UNIQUE (creator_id, campaign_code, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_link_snapshots_creator
  ON public.daily_link_snapshots(creator_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_link_snapshots_date
  ON public.daily_link_snapshots(snapshot_date DESC);

ALTER TABLE public.daily_link_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.daily_link_snapshots;
CREATE POLICY "Public full access" ON public.daily_link_snapshots FOR ALL USING (true) WITH CHECK (true);
