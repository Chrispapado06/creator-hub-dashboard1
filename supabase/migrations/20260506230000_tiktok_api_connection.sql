-- TikTok API connection per account. Stores which third-party scraper API
-- the user has linked + the API key, so we can pull live profile + video
-- stats. Implemented end-to-end for ScrapeCreators; other providers can be
-- added by extending the runTikTokSync function in src/routes/tiktok.tsx.

ALTER TABLE public.tiktok_accounts
  ADD COLUMN IF NOT EXISTS api_provider TEXT,
  ADD COLUMN IF NOT EXISTS api_key TEXT,
  ADD COLUMN IF NOT EXISTS api_connected_at TIMESTAMPTZ;

ALTER TABLE public.tiktok_accounts DROP CONSTRAINT IF EXISTS tiktok_accounts_api_provider_check;
ALTER TABLE public.tiktok_accounts ADD CONSTRAINT tiktok_accounts_api_provider_check
  CHECK (api_provider IS NULL OR api_provider IN ('scrapecreators', 'apify', 'tikapi'));
