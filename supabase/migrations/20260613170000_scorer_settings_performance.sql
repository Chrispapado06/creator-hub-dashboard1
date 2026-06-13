-- Reddit Viability Scorer — settings + creator performance.
--
-- Extends the working scorer (subreddit_catalog + reddit_assessments from
-- 20260613120000_reddit_viability.sql) with two tables the richer features
-- need:
--   • scorer_settings           — admin-tunable rubric weights + capacity params
--   • scorer_creator_performance — actual outcomes, for predicted-vs-actual
--                                  calibration against saved assessments
--
-- Both use the dashboard's public-RLS pattern (the app gates access through
-- its own allowed_pages auth, not Postgres roles) — matching every other
-- table in this project.

-- ── Settings (key/value, JSON) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scorer_settings (
  key        TEXT NOT NULL PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scorer_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.scorer_settings;
CREATE POLICY "Public full access" ON public.scorer_settings FOR ALL USING (true) WITH CHECK (true);

-- Seed defaults. rubric_weights mirrors the constants in
-- src/lib/reddit-scorer/rubric.ts (RUBRIC_WEIGHTS, summing to 100) so the
-- Settings tab starts from the live model; capacity params mirror accounts.ts.
INSERT INTO public.scorer_settings (key, value) VALUES
  ('rubric_weights', '{
    "nicheFit": 30,
    "contentVolume": 20,
    "visualAppeal": 20,
    "verificationWilling": 15,
    "existingReach": 10,
    "complianceOk": 5
  }'),
  ('capacity', '{
    "shadowbanBuffer": 0.20,
    "proxiesPerAccount": 1,
    "postsPerAccountPerDay": 2,
    "staleAfterDays": 45
  }')
ON CONFLICT (key) DO NOTHING;

-- ── Creator performance (actuals for calibration) ───────────────────────────
-- One row per creator per month. reddit_clicks / of_subs / revenue come from
-- the agency's real tracking once a creator has actually been run on Reddit;
-- the calibration view compares these against the assessment that predicted
-- them.
CREATE TABLE IF NOT EXISTS public.scorer_creator_performance (
  id                  UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id          UUID REFERENCES public.creators(id) ON DELETE SET NULL,
  creator_name        TEXT NOT NULL,
  assessment_id       UUID REFERENCES public.reddit_assessments(id) ON DELETE SET NULL,
  month               DATE NOT NULL,
  reddit_clicks       INTEGER NOT NULL DEFAULT 0 CHECK (reddit_clicks >= 0),
  of_subs_attributed  INTEGER NOT NULL DEFAULT 0 CHECK (of_subs_attributed >= 0),
  revenue_attributed  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (revenue_attributed >= 0),
  -- Subjective 0–100 grade of how the creator actually performed on Reddit,
  -- used as the "actual" against the assessment's predicted score.
  actual_outcome      NUMERIC(5,2),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scorer_perf_creator
  ON public.scorer_creator_performance (creator_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_scorer_perf_assessment
  ON public.scorer_creator_performance (assessment_id);
ALTER TABLE public.scorer_creator_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.scorer_creator_performance;
CREATE POLICY "Public full access" ON public.scorer_creator_performance FOR ALL USING (true) WITH CHECK (true);
