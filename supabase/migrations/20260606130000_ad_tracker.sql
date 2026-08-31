-- UNCVRD Ad Tracker — Supabase mirror of the Google-Sheet tracker.
--
-- The Apps-Script project in `ad-tracker/` is the working surface (Daily Log +
-- the OnlyFans / Meta / OnlyFinder pulls). This migration gives that data a home
-- in Supabase so it's queryable next to the rest of the creator-hub stack.
--
--   ad_settings          — the ROAS targets + SCALE/CUT thresholds (single row).
--   ad_creator_salaries  — per-creator monthly salary (drives net profit).
--   ad_daily_log         — one row per (date, platform, variant); the Apps Script
--                          upserts into this on each daily refresh.
--   ad_daily_log_metrics — a view that derives CPC / CAC / LTV / ROAS / profit /
--                          SCALE-KEEP-CUT verdict, mirroring the Sheet formulas.
--
-- Single-user internal tool: RLS on with permissive policies (anon reads,
-- service-role writes), matching the keyword_attribution migration.

-- ── ad_settings ──────────────────────────────────────────────────────
-- One row (id = 1). Thresholds the verdict view reads.
CREATE TABLE IF NOT EXISTS public.ad_settings (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  target_roas NUMERIC(6, 2) NOT NULL DEFAULT 2.5,
  target_cac  NUMERIC(10, 2) NOT NULL DEFAULT 15,
  target_ltv  NUMERIC(10, 2) NOT NULL DEFAULT 40,
  scale_roas  NUMERIC(6, 2) NOT NULL DEFAULT 2.0, -- SCALE when ROAS ≥ this
  cut_roas    NUMERIC(6, 2) NOT NULL DEFAULT 1.0, -- CUT when ROAS < this
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ad_settings_singleton CHECK (id = 1)
);
INSERT INTO public.ad_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── ad_creator_salaries ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_creator_salaries (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator        TEXT NOT NULL,
  monthly_salary NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_creator_salaries_creator
  ON public.ad_creator_salaries (lower(creator));

-- ── ad_daily_log ─────────────────────────────────────────────────────
-- The mirror of the Sheet's Daily Log. `creator` is free text (matches the
-- Sheet); join to public.creators by name if you need the id elsewhere.
CREATE TABLE IF NOT EXISTS public.ad_daily_log (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date       DATE NOT NULL,
  platform   TEXT NOT NULL DEFAULT '',  -- 'Meta' | 'OnlyFinder' | ''
  creator    TEXT NOT NULL DEFAULT '',
  campaign   TEXT NOT NULL DEFAULT '',
  test       TEXT NOT NULL DEFAULT '',  -- what's being tested
  variant    TEXT NOT NULL,             -- == OF tracking-link name
  of_link    TEXT NOT NULL DEFAULT '',
  spend      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  clicks     INTEGER NOT NULL DEFAULT 0,
  new_fans   INTEGER NOT NULL DEFAULT 0,
  revenue    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One row per variant per platform per day (the Apps Script upserts on this).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_daily_log_day_platform_variant
  ON public.ad_daily_log (date, platform, variant);
CREATE INDEX IF NOT EXISTS idx_ad_daily_log_date ON public.ad_daily_log (date);
CREATE INDEX IF NOT EXISTS idx_ad_daily_log_creator ON public.ad_daily_log (creator);

-- ── ad_daily_log_metrics (view) ──────────────────────────────────────
-- Same derived numbers + verdict the Sheet computes, so SQL consumers don't
-- re-implement the formulas. Cross-joins the single settings row.
CREATE OR REPLACE VIEW public.ad_daily_log_metrics AS
SELECT
  l.*,
  CASE WHEN l.clicks   > 0 THEN l.spend   / l.clicks   END AS cpc,
  CASE WHEN l.new_fans > 0 THEN l.spend   / l.new_fans END AS cac,
  CASE WHEN l.clicks   > 0 THEN l.new_fans::numeric / l.clicks END AS click_sub_rate,
  CASE WHEN l.new_fans > 0 THEN l.revenue / l.new_fans END AS ltv,
  CASE WHEN l.spend    > 0 THEN l.revenue / l.spend    END AS roas,
  l.revenue - l.spend AS profit,
  CASE
    WHEN l.spend = 0 THEN NULL
    WHEN l.revenue / l.spend >= s.scale_roas THEN 'SCALE'
    WHEN l.revenue / l.spend <  s.cut_roas   THEN 'CUT'
    ELSE 'KEEP'
  END AS verdict
FROM public.ad_daily_log l
CROSS JOIN public.ad_settings s
WHERE s.id = 1;

-- ── RLS (permissive: single-user internal tool) ──────────────────────
ALTER TABLE public.ad_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creator_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_daily_log        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ad_settings', 'ad_creator_salaries', 'ad_daily_log']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t || '_all', t
    );
  END LOOP;
END $$;
