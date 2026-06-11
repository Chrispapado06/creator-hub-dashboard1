-- Add ScrapeCreators provider support to Instagram + Facebook accounts.
--
-- The dashboard already has Meta Graph API columns (meta_access_token,
-- meta_ig_user_id, meta_page_id, meta_connected_at). ScrapeCreators is
-- a third-party scraper alternative that doesn't need Meta App Review
-- or Business Manager paperwork — paste a single API key, sync.
--
-- Both providers can coexist on the same account row: Meta path uses
-- meta_* columns, ScrapeCreators path uses these new columns. The UI
-- shows whichever is set ("Connected via Meta" / "Connected via
-- ScrapeCreators") and stores deltas independently.

alter table public.instagram_accounts
  add column if not exists scrapecreators_key         text,
  add column if not exists scrapecreators_connected_at timestamptz;

alter table public.facebook_accounts
  add column if not exists scrapecreators_key         text,
  add column if not exists scrapecreators_connected_at timestamptz;
