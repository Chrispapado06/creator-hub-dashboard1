-- Watch accounts: COROS, Polar, Suunto, Garmin. The connection, the tokens
-- the app is never allowed to read, and the OAuth handshake tables that make
-- that guarantee possible.
--
-- ============================================================================
-- THE TWO FACTS THAT SHAPE EVERY LINE BELOW — restated from 20260907140000
-- ============================================================================
--
-- ICEFALL HAS NO SERVER OF ITS OWN. It is a static site: no `api/` directory,
-- no long-running process, `vercel.json` is a SPA rewrite and nothing more.
-- Every one of these four vendors' token exchanges needs a value that cannot
-- live in a browser bundle — COROS's is a redirect_uri bound to a registered
-- public client, the other three a client secret outright — so the exchange
-- has to happen somewhere that isn't the PWA. That somewhere is the
-- `watch` Supabase Edge Function, and this file is the table it writes to.
--
-- THE APP CANNOT READ THE TOKENS. Not "should not" — cannot. There is no
-- SELECT policy on `watch_connections` for `authenticated`, and no grant. A
-- watch-service access token is a bearer credential: anything holding it can
-- read that athlete's activity history from the vendor's cloud. Handing it to
-- a browser to save a round trip would mean an XSS anywhere in this app
-- becomes an XSS on somebody's COROS, Polar, Suunto or Garmin account. What
-- the app legitimately needs — am I connected, as whom, with what permission
-- — is answered by `watch_status()` below, which returns no token material.

create table if not exists public.watch_connections (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('garmin','coros','suunto','polar')),
  -- The vendor's own id for the account. NULL when the vendor did not say —
  -- never a placeholder. Garmin: /user/id. Polar: x_user_id. Suunto: the JWT
  -- `user` claim (the username). COROS: the OIDC subject.
  provider_user_id text,
  -- What a human is shown so they can tell which of two accounts this is.
  account_label text,
  access_token  text not null,
  refresh_token text,               -- nullable: not every vendor issues one
  expires_at    timestamptz not null,
  -- What the vendor actually granted. Polar/COROS/Suunto: the scope string.
  -- Garmin, when it exists: the comma-joined permission names from
  -- /user/permissions, which is a different thing from its fixed scope string.
  scope text not null default '',
  -- The vendor host this connection talks to. COROS is region-sharded and the
  -- issuer genuinely differs per user; the others are constant. Stored so no
  -- call ever has to guess.
  api_base text not null,
  region text check (region in ('eu','us')),
  connected_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, provider)
);

comment on table public.watch_connections is
  'One row per connected watch account, per user. Written only by the watch Edge Function via the service role; the tokens are never readable by a client.';

alter table public.watch_connections enable row level security;
alter table public.watch_connections force row level security;
revoke all on public.watch_connections from anon, authenticated;
-- NO POLICIES, DELIBERATELY. See 20260907140000:63-74. A SELECT policy added
-- here hands watch access tokens to the browser.

/* -------------------------------------------------------------------------- */
/* The OAuth handshake                                                        */
/* -------------------------------------------------------------------------- */

create table if not exists public.watch_oauth_states (
  state text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('garmin','coros','suunto','polar')),
  return_to text not null default '/settings/connections'
    check (return_to in ('/settings/connections','/connect')),
  -- PKCE. Minted at begin, needed at the token exchange inside finalize, and
  -- therefore COPIED onto the pending row when this row is consumed. NULL for
  -- vendors that do not use PKCE (Polar, Suunto).
  code_verifier text,
  region text check (region in ('eu','us')),
  created_at timestamptz not null default now()
);

comment on table public.watch_oauth_states is
  'Short-lived CSRF binding between an ICEFALL user and one watch-vendor consent redirect. Rows are single-use and expire after ten minutes.';

alter table public.watch_oauth_states enable row level security;
alter table public.watch_oauth_states force row level security;
revoke all on public.watch_oauth_states from anon, authenticated;
create index if not exists watch_oauth_states_created_idx
  on public.watch_oauth_states (created_at);

create table if not exists public.watch_pending_links (
  ticket text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('garmin','coros','suunto','polar')),
  code text not null,
  code_verifier text,
  region text check (region in ('eu','us')),
  granted_scope text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.watch_pending_links is
  'A consent a watch vendor has granted but ICEFALL has not yet attached to an account. Single-use, ten-minute, finished only by the user the state was minted for — see the ticket-pattern argument at 20260907140000:122-139, unchanged here.';

alter table public.watch_pending_links enable row level security;
alter table public.watch_pending_links force row level security;
revoke all on public.watch_pending_links from anon, authenticated;
create index if not exists watch_pending_links_created_idx
  on public.watch_pending_links (created_at);

/* -------------------------------------------------------------------------- */
/* What the app may ask                                                       */
/* -------------------------------------------------------------------------- */

create or replace function public.watch_status()
returns table (
  provider text,
  provider_user_id text,
  account_label text,
  scope text,
  region text,
  connected_at timestamptz
) language sql stable security definer set search_path = public, pg_temp as $$
  select c.provider, c.provider_user_id, c.account_label, c.scope, c.region, c.connected_at
  from public.watch_connections c
  where c.user_id = (select auth.uid())
$$;

revoke all on function public.watch_status() from public, anon;
grant execute on function public.watch_status() to authenticated;

comment on function public.watch_status() is
  'Which watch accounts the caller has connected. Returns no tokens — the shape of this return type IS the security boundary; adding access_token here undoes the whole file. Absence IS the answer: an empty array means nothing is connected, and there is no connected:false row.';

create or replace function public.watch_disconnect(p_provider text)
returns void language sql volatile security definer set search_path = public, pg_temp as $$
  delete from public.watch_connections
  where user_id = (select auth.uid()) and provider = p_provider;
$$;

revoke all on function public.watch_disconnect(text) from public, anon;
grant execute on function public.watch_disconnect(text) to authenticated;

comment on function public.watch_disconnect(text) is
  'Forgets one connection. CANNOT revoke at the vendor — only the Edge Function can, holding the client credentials — so this exists for the one case the function cannot serve: a token the vendor has already revoked, where deauthorising answers 401 forever and the row would otherwise be unremovable. Same role as strava_disconnect().';

/* -------------------------------------------------------------------------- */
/* Housekeeping                                                               */
/* -------------------------------------------------------------------------- */

create or replace function public.watch_sweep_states()
returns void language sql volatile security definer set search_path = public, pg_temp as $$
  delete from public.watch_oauth_states  where created_at < now() - interval '10 minutes';
  delete from public.watch_pending_links where created_at < now() - interval '10 minutes';
$$;

revoke all on function public.watch_sweep_states() from public, anon, authenticated;
