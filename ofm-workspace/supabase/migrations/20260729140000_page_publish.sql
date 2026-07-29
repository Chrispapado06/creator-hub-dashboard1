-- =====================================================================
-- OFM Workspace — Publish page to web (public read-only link)
-- A published page is served as standalone HTML by the public-page Edge
-- Function, keyed on a random public_token. Only pages with published=true
-- are ever served; RLS on the table is unchanged (the function uses
-- service_role and hard-filters published=true).
-- =====================================================================

alter table public.pages
  add column if not exists published    boolean not null default false,
  add column if not exists public_token uuid unique,
  add column if not exists published_at  timestamptz;

create index if not exists pages_public_token_idx
  on public.pages (public_token)
  where public_token is not null;
