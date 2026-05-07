-- Ads upgrade: add naming, status, Infloww attribution, and Meta Marketing API
-- insight fields to ad_campaigns. Add agency-level Meta Ads connection on
-- agency_settings.
--
-- Self-sufficient: creates ad_campaigns (and dependent multi-channel tables)
-- if they don't already exist, so this migration works even if the older
-- 20260503120000_multi_channel migration was never applied.

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'other',
  amount_spent NUMERIC(10, 2) NOT NULL DEFAULT 0,
  revenue_generated NUMERIC(10, 2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.ad_campaigns;
CREATE POLICY "Public full access" ON public.ad_campaigns FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS infloww_campaign_code INTEGER,
  ADD COLUMN IF NOT EXISTS meta_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS impressions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ctr NUMERIC(7, 4),
  ADD COLUMN IF NOT EXISTS cpc NUMERIC(10, 4),
  ADD COLUMN IF NOT EXISTS cpm NUMERIC(10, 4),
  ADD COLUMN IF NOT EXISTS meta_synced_at TIMESTAMPTZ;

-- Loose status enum via CHECK
ALTER TABLE public.ad_campaigns DROP CONSTRAINT IF EXISTS ad_campaigns_status_check;
ALTER TABLE public.ad_campaigns ADD CONSTRAINT ad_campaigns_status_check
  CHECK (status IN ('active', 'paused', 'completed', 'cancelled'));

-- Indexes for common filters
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_creator ON public.ad_campaigns(creator_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON public.ad_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_start_date ON public.ad_campaigns(start_date);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_meta_campaign_id
  ON public.ad_campaigns(meta_campaign_id) WHERE meta_campaign_id IS NOT NULL;

-- Agency-level Meta Marketing API connection. One token + one ad account ID
-- shared by every campaign synced through Meta.
ALTER TABLE public.agency_settings
  ADD COLUMN IF NOT EXISTS meta_ads_access_token TEXT,
  ADD COLUMN IF NOT EXISTS meta_ad_account_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_ads_connected_at TIMESTAMPTZ;
