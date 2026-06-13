-- Reddit Viability Scorer
-- Two tables:
--   subreddit_catalog  — the internal, marketing-facing database of subreddits
--                        used for ranked matching. Distinct from the existing
--                        `subreddits` table (which is per-reddit-account ops).
--   reddit_assessments — a saved record of each viability run for a creator.

-- ── Subreddit catalog ───────────────────────────────────────────────────────
CREATE TABLE public.subreddit_catalog (
  id                    UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                  TEXT NOT NULL UNIQUE,          -- subreddit name without the "r/"
  display_name          TEXT,                          -- optional pretty label
  subscribers           INTEGER NOT NULL DEFAULT 0,
  nsfw                  BOOLEAN NOT NULL DEFAULT true,
  niche                 TEXT[] NOT NULL DEFAULT '{}',  -- tags, e.g. {gonewild,fitness,cosplay}
  verification_required BOOLEAN NOT NULL DEFAULT false,
  min_karma             INTEGER NOT NULL DEFAULT 0,
  min_account_age_days  INTEGER NOT NULL DEFAULT 0,
  allows_promo          BOOLEAN NOT NULL DEFAULT true, -- some subs ban OF/promo links outright
  posting_notes         TEXT,
  last_verified         DATE,                          -- NULL or 45+ days ago => flagged stale
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subreddit_catalog_active ON public.subreddit_catalog(active);
CREATE INDEX idx_subreddit_catalog_niche ON public.subreddit_catalog USING GIN(niche);
ALTER TABLE public.subreddit_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access" ON public.subreddit_catalog FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_subreddit_catalog_updated BEFORE UPDATE ON public.subreddit_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Saved assessments ───────────────────────────────────────────────────────
CREATE TABLE public.reddit_assessments (
  id                 UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id         UUID REFERENCES public.creators(id) ON DELETE SET NULL,
  creator_name       TEXT NOT NULL,                    -- snapshot label (creator may be hypothetical)
  inputs             JSONB NOT NULL,                   -- the rubric inputs used
  score              NUMERIC(5, 2) NOT NULL,           -- 0..100
  band               TEXT NOT NULL CHECK (band IN ('strong', 'viable', 'marginal', 'skip')),
  breakdown          JSONB NOT NULL,                   -- per-criterion contribution
  accounts_needed    INTEGER NOT NULL,
  proxies_needed     INTEGER NOT NULL,
  matched_subreddits JSONB NOT NULL DEFAULT '[]',      -- ranked snapshot at run time
  launch_plan        TEXT,                             -- AI-generated narrative (nullable)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reddit_assessments_creator ON public.reddit_assessments(creator_id);
CREATE INDEX idx_reddit_assessments_created ON public.reddit_assessments(created_at DESC);
ALTER TABLE public.reddit_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access" ON public.reddit_assessments FOR ALL USING (true) WITH CHECK (true);
