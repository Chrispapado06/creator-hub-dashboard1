-- onlyfansapi.com account ID per creator (acct_xxx)
ALTER TABLE public.creators ADD COLUMN IF NOT EXISTS onlyfansapi_acct_id TEXT;

-- Campaign code on each reddit account (the number from c69 → 69)
ALTER TABLE public.reddit_accounts ADD COLUMN IF NOT EXISTS infloww_campaign_code INTEGER;

-- Cache table for synced tracking link stats
CREATE TABLE IF NOT EXISTS public.infloww_tracking_stats (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id           UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  reddit_account_id    UUID REFERENCES public.reddit_accounts(id) ON DELETE SET NULL,
  campaign_code        INTEGER NOT NULL,
  campaign_url         TEXT,
  clicks_count         INTEGER NOT NULL DEFAULT 0,
  subscribers_count    INTEGER NOT NULL DEFAULT 0,
  revenue_total        NUMERIC(10,2) NOT NULL DEFAULT 0,
  revenue_per_sub      NUMERIC(10,2) NOT NULL DEFAULT 0,
  spenders_count       INTEGER NOT NULL DEFAULT 0,
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(creator_id, campaign_code)
);

CREATE INDEX IF NOT EXISTS idx_infloww_stats_creator
  ON public.infloww_tracking_stats(creator_id);
CREATE INDEX IF NOT EXISTS idx_infloww_stats_reddit_acct
  ON public.infloww_tracking_stats(reddit_account_id);
