-- Meta Ads expansion: full agency view of the ad account.
--
-- The existing ad_campaigns table is the *creator-attributed* slice — one
-- row per campaign that the agency cares about for revenue accounting,
-- with the manual link to a creator. These tables are the underlying Meta
-- catalog: every campaign / adset / ad in the account, plus daily and
-- breakdown insights for charting.
--
-- All keys are Meta's own string IDs (not UUIDs). Foreign keys go from
-- adsets -> campaigns and ads -> adsets so deletes cascade if a campaign
-- record is removed during a re-sync.
--
-- The big design call: meta_insights_daily is a single table that stores
-- time series + placement + demographics. The `level` column says whether
-- the row is account/campaign/adset/ad-level. The optional `breakdown_*`
-- columns flag whether the row is a per-day-only count or sliced by
-- placement / age / gender / country / device. One table = one set of
-- charts code that aggregates with WHERE clauses.
--
-- All tables get the project's standard Public-RLS policy.

-- ── Auto-discovered campaigns catalog ────────────────────────────────
-- Independent from ad_campaigns (which is the manual creator-attribution
-- table). meta_campaigns_catalog holds EVERY campaign in the ad account,
-- whether the agency has linked it to a creator or not.

CREATE TABLE IF NOT EXISTS public.meta_campaigns_catalog (
  meta_campaign_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT,
  status TEXT,                          -- ACTIVE / PAUSED / ARCHIVED / DELETED
  effective_status TEXT,                -- the rendered state Meta shows
  objective TEXT,                       -- OUTCOME_TRAFFIC / OUTCOME_AWARENESS / etc
  daily_budget_cents BIGINT,
  lifetime_budget_cents BIGINT,
  start_time TIMESTAMPTZ,
  stop_time TIMESTAMPTZ,
  created_time TIMESTAMPTZ,
  updated_time TIMESTAMPTZ,
  -- Cumulative insight rollup (lifetime). Daily detail lives in meta_insights_daily.
  spend NUMERIC(12,2) DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  reach BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  ctr NUMERIC(8,4),
  cpc NUMERIC(10,4),
  cpm NUMERIC(10,4),
  frequency NUMERIC(8,4),
  deleted_at TIMESTAMPTZ,               -- set when the campaign disappears from a sync
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_catalog_account
  ON public.meta_campaigns_catalog(account_id);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_catalog_status
  ON public.meta_campaigns_catalog(status);

-- ── Adsets within a campaign ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_adsets (
  meta_adset_id TEXT PRIMARY KEY,
  meta_campaign_id TEXT NOT NULL REFERENCES public.meta_campaigns_catalog(meta_campaign_id) ON DELETE CASCADE,
  name TEXT,
  status TEXT,
  effective_status TEXT,
  daily_budget_cents BIGINT,
  lifetime_budget_cents BIGINT,
  optimization_goal TEXT,               -- LINK_CLICKS / LANDING_PAGE_VIEWS / etc
  billing_event TEXT,
  targeting JSONB,                      -- raw audience config — for advanced inspection
  created_time TIMESTAMPTZ,
  updated_time TIMESTAMPTZ,
  spend NUMERIC(12,2) DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  reach BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  ctr NUMERIC(8,4),
  cpc NUMERIC(10,4),
  cpm NUMERIC(10,4),
  frequency NUMERIC(8,4),
  deleted_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meta_adsets_campaign
  ON public.meta_adsets(meta_campaign_id);

-- ── Individual ads (creatives) ───────────────────────────────────────
-- thumbnail_url and image_url are signed Meta CDN URLs that can expire
-- in hours/days. The UI re-syncs before rendering or marks them stale.
CREATE TABLE IF NOT EXISTS public.meta_ads (
  meta_ad_id TEXT PRIMARY KEY,
  meta_adset_id TEXT NOT NULL REFERENCES public.meta_adsets(meta_adset_id) ON DELETE CASCADE,
  meta_campaign_id TEXT NOT NULL,
  name TEXT,
  status TEXT,
  effective_status TEXT,
  creative_id TEXT,
  thumbnail_url TEXT,                   -- ephemeral
  image_url TEXT,                       -- ephemeral
  video_id TEXT,
  permalink_url TEXT,
  headline TEXT,
  body TEXT,
  call_to_action_type TEXT,
  created_time TIMESTAMPTZ,
  updated_time TIMESTAMPTZ,
  spend NUMERIC(12,2) DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  reach BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  ctr NUMERIC(8,4),
  cpc NUMERIC(10,4),
  cpm NUMERIC(10,4),
  frequency NUMERIC(8,4),
  deleted_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meta_ads_adset
  ON public.meta_ads(meta_adset_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_campaign
  ON public.meta_ads(meta_campaign_id);

-- ── Daily insights with optional breakdown (the workhorse) ───────────
-- Stores: per-day campaign/adset/ad/account spend OR per-day broken down
-- by placement / age / gender / country / device.
--
-- The PK includes breakdown_key + breakdown_value so a single object can
-- have multiple rows on the same day (one per breakdown bucket). For
-- "no breakdown, just the day" we use breakdown_key = '' + value = ''.
CREATE TABLE IF NOT EXISTS public.meta_insights_daily (
  level TEXT NOT NULL CHECK (level IN ('account','campaign','adset','ad')),
  object_id TEXT NOT NULL,              -- account_id / campaign_id / adset_id / ad_id
  date_start DATE NOT NULL,
  breakdown_key TEXT NOT NULL DEFAULT '',     -- '' | publisher_platform | platform_position | age | gender | country | device_platform
  breakdown_value TEXT NOT NULL DEFAULT '',
  spend NUMERIC(12,2) DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  reach BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  ctr NUMERIC(8,4),
  cpc NUMERIC(10,4),
  cpm NUMERIC(10,4),
  frequency NUMERIC(8,4),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (level, object_id, date_start, breakdown_key, breakdown_value)
);
CREATE INDEX IF NOT EXISTS idx_meta_insights_daily_obj
  ON public.meta_insights_daily(level, object_id, date_start DESC);
CREATE INDEX IF NOT EXISTS idx_meta_insights_daily_breakdown
  ON public.meta_insights_daily(level, object_id, breakdown_key);

-- ── Account-level snapshot (a thin denormalized view for the homepage) ─
CREATE TABLE IF NOT EXISTS public.meta_account_snapshots (
  account_id TEXT PRIMARY KEY,
  account_name TEXT,
  account_status INTEGER,
  currency TEXT,
  timezone_name TEXT,
  -- Lifetime-ish rollup updated on every full sync. For time series
  -- always read from meta_insights_daily(level='account').
  spend_30d NUMERIC(12,2) DEFAULT 0,
  spend_7d  NUMERIC(12,2) DEFAULT 0,
  active_campaigns INTEGER DEFAULT 0,
  paused_campaigns INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS — match the rest of the app's single-tenant Public-full-access pattern
ALTER TABLE public.meta_campaigns_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_adsets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_insights_daily    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_account_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public full access" ON public.meta_campaigns_catalog;
DROP POLICY IF EXISTS "Public full access" ON public.meta_adsets;
DROP POLICY IF EXISTS "Public full access" ON public.meta_ads;
DROP POLICY IF EXISTS "Public full access" ON public.meta_insights_daily;
DROP POLICY IF EXISTS "Public full access" ON public.meta_account_snapshots;

CREATE POLICY "Public full access" ON public.meta_campaigns_catalog FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access" ON public.meta_adsets            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access" ON public.meta_ads               FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access" ON public.meta_insights_daily    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access" ON public.meta_account_snapshots FOR ALL USING (true) WITH CHECK (true);
