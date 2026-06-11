-- Profile picture column for the Instagram + Facebook account cards.
-- Synced from ScrapeCreators (or Meta) profile responses; rendered as
-- the big circular avatar on the account-detail page.

alter table public.instagram_accounts
  add column if not exists avatar_url text;

alter table public.facebook_accounts
  add column if not exists avatar_url text;
