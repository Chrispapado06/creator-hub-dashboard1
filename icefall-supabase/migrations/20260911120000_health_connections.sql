-- Health accounts: Polar, WHOOP, Withings, Oura. The connection, the tokens
-- the app is never allowed to read, the OAuth handshake tables that make that
-- guarantee possible, and the queue Withings' webhook writes into.
--
-- ============================================================================
-- DRAFT. NOT PUSHED. NOT APPLIED.
-- ============================================================================
--
-- Written 11 September 2026 alongside `supabase/functions/health/`. It is the
-- owner's to gate, like every other file in this directory, and the same
-- warning 20260903060000 carries applies here: `supabase db push` applies
-- EVERY pending file, not this one. There is no per-file push. Pushing this
-- pushes whatever else is waiting alongside it — check what that is first.
--
-- ============================================================================
-- WHY A SECOND SET OF TABLES AND NOT A FIFTH PROVIDER IN `watch_connections`
-- ============================================================================
--
-- 20260907160000 gave four watch vendors one table because they are one kind
-- of thing: an activity summary is a distance and an ascent. These four are
-- asked for heart-rate variability, sleep stages, a recovery score and a body
-- weight — Article 9 special category data, whose lawful basis is the explicit
-- consent recorded in `health_consent_events` (20260903060000). Two differences
-- follow that a shared table could not express:
--
--   1. THE TOKENS HERE ARE CIPHERTEXT. `watch_connections.access_token` holds a
--      readable token; every token column below holds AES-256-GCM ciphertext
--      the database cannot decrypt, because WHOOP's terms require its data to
--      be encrypted at rest and a column that is sometimes encrypted is a
--      column somebody will eventually write plaintext into.
--
--   2. A CONNECTION HERE PRESUPPOSES A CONSENT. The Edge Function refuses to
--      issue an authorize URL without one. Nothing about a watch import needs
--      that gate.
--
-- POLAR APPEARS IN BOTH TABLES ON PURPOSE. `watch_connections` holds its
-- training-session grant; this one holds the daily physiology. They are two
-- rows because Polar's scopes are two grants — see `functions/health/polar.ts`
-- for the collision note about Polar issuing one grant per app per user.
--
-- ============================================================================
-- THE APP CANNOT READ THE TOKENS
-- ============================================================================
--
-- Not "should not" — cannot. There is no SELECT policy on `health_connections`
-- for `authenticated` and no grant. A health-service access token is a bearer
-- credential for somebody's sleep and heart rate; handing it to a browser to
-- save a round trip would make an XSS anywhere in ICEFALL an XSS on that
-- person's WHOOP, Polar or Withings account. What the app legitimately needs —
-- am I connected, as whom, since when — is answered by `health_status()`,
-- which returns no token material and is the security boundary of this file.

/* -------------------------------------------------------------------------- */
/* The connection                                                             */
/* -------------------------------------------------------------------------- */

create table if not exists public.health_connections (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('polar','whoop','oura','withings')),
  -- The vendor's own id for the account. NULL when the vendor did not say —
  -- never a placeholder. Polar: x_user_id. WHOOP: user_id from the basic
  -- profile. Withings: userid, which is also the key every webhook
  -- notification arrives under, so a Withings row without one can never be
  -- matched to an incoming notice.
  provider_user_id text,
  -- What a human is shown so they can tell which of two accounts this is.
  account_label text,
  -- ══════════════════════════════════════════════════════════════════════════
  -- CIPHERTEXT, NOT A TOKEN. Format `v1.<iv>.<ciphertext>`, AES-256-GCM,
  -- sealed in the Edge Function with a key held in `supabase secrets` and
  -- NEVER in this database. A full dump of this table is inert without it.
  --
  -- WHOOP's API terms: "must encrypt Whoop data at rest". A WHOOP access token
  -- is the key to a named member's recovery, HRV and sleep, so the obligation
  -- reaches this column before it reaches any metric. All four vendors are
  -- treated the same way — see functions/health/crypto.ts.
  --
  -- DO NOT ADD A PLAINTEXT COLUMN BESIDE THESE, and do not "temporarily" store
  -- a readable token here for debugging. There is no code path in the function
  -- that writes one.
  -- ══════════════════════════════════════════════════════════════════════════
  access_token  text not null,
  refresh_token text,               -- nullable: not every vendor issues one
  expires_at    timestamptz not null,
  -- What the vendor actually granted, as the vendor named it.
  scope text not null default '',
  -- The vendor host this connection talks to. Constant per vendor today;
  -- stored so no call ever has to guess.
  api_base text not null,
  connected_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, provider)
);

comment on table public.health_connections is
  'One row per connected health account, per user. Written only by the health Edge Function via the service role. The token columns hold ciphertext the database cannot decrypt; nothing here is readable by a client.';

comment on column public.health_connections.access_token is
  'AES-256-GCM ciphertext, v1.<iv>.<ct>. Never a readable token — see functions/health/crypto.ts and WHOOP''s encryption-at-rest term.';

alter table public.health_connections enable row level security;
alter table public.health_connections force row level security;
revoke all on public.health_connections from anon, authenticated;
-- NO POLICIES, DELIBERATELY. A SELECT policy added here hands health-service
-- access tokens to the browser. See 20260907140000:63-74 for the same argument
-- made about Strava, and 20260907160000 for watches.

-- Withings' webhook arrives keyed by its own `userid` and nothing else, so the
-- lookup from that id to an ICEFALL account has to be unambiguous. Partial,
-- because NULL means "the vendor did not say" and several vendors may honestly
-- say nothing.
create unique index if not exists health_connections_provider_user
  on public.health_connections (provider, provider_user_id)
  where provider_user_id is not null;

/* -------------------------------------------------------------------------- */
/* The OAuth handshake                                                        */
/* -------------------------------------------------------------------------- */

create table if not exists public.health_oauth_states (
  state text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('polar','whoop','oura','withings')),
  return_to text not null default '/settings/connections'
    check (return_to in ('/settings/connections','/connect')),
  -- PKCE. Minted for every provider uniformly and simply unused by the ones
  -- that do not document it; copied onto the pending row when this row is
  -- consumed, because the exchange happens after this row is gone.
  code_verifier text,
  created_at timestamptz not null default now()
);

comment on table public.health_oauth_states is
  'Short-lived CSRF binding between an ICEFALL user and one health-vendor consent redirect. Single-use, ten minutes.';

alter table public.health_oauth_states enable row level security;
alter table public.health_oauth_states force row level security;
revoke all on public.health_oauth_states from anon, authenticated;
create index if not exists health_oauth_states_created_idx
  on public.health_oauth_states (created_at);

create table if not exists public.health_pending_links (
  ticket text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('polar','whoop','oura','withings')),
  code text not null,
  code_verifier text,
  granted_scope text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.health_pending_links is
  'A consent a health vendor has granted but ICEFALL has not yet attached to an account. Single-use, ten-minute, finished only by the user the state was minted for. The callback carries no ICEFALL session, which is why the code is parked rather than exchanged there.';

alter table public.health_pending_links enable row level security;
alter table public.health_pending_links force row level security;
revoke all on public.health_pending_links from anon, authenticated;
create index if not exists health_pending_links_created_idx
  on public.health_pending_links (created_at);

/* -------------------------------------------------------------------------- */
/* What Withings tells us                                                     */
/* -------------------------------------------------------------------------- */

-- Withings' terms: "only query in response to user actions — use their
-- webhooks, don't poll." This table is the receiving end of that. It holds
-- NOTICES, NOT MEASUREMENTS: Withings says which account and what kind of
-- thing changed, never the value.
--
-- `processed_at` stays NULL until something reads the measurement, and nothing
-- does yet — the reading side is not built. That is deliberate and it is said
-- on the connections screen in those words, so nobody is left expecting
-- numbers to appear.
create table if not exists public.health_webhook_events (
  id bigserial primary key,
  provider text not null check (provider in ('polar','whoop','oura','withings')),
  provider_user_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The vendor's own category word, kept verbatim. Withings sends an `appli`
  -- number; it is stored as text and NOT translated here, so a category
  -- ICEFALL has never seen is recorded rather than dropped.
  kind text not null,
  -- Withings' own window for what changed, kept as the strings it sent.
  -- ICEFALL does not know its timezone assumptions and will not guess at them.
  window_start text not null default '',
  window_end   text not null default '',
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  outcome text
);

comment on table public.health_webhook_events is
  'Notices from a vendor that something changed. Never a measurement. Written only by the health Edge Function, and deleted with the connection on disconnect — an unprocessed notice about somebody who has disconnected is data with no permission behind it.';

alter table public.health_webhook_events enable row level security;
alter table public.health_webhook_events force row level security;
revoke all on public.health_webhook_events from anon, authenticated;

create index if not exists health_webhook_events_unprocessed
  on public.health_webhook_events (provider, received_at)
  where processed_at is null;

/* -------------------------------------------------------------------------- */
/* What the app may ask                                                       */
/* -------------------------------------------------------------------------- */

create or replace function public.health_status()
returns table (
  provider text,
  provider_user_id text,
  account_label text,
  scope text,
  connected_at timestamptz
) language sql stable security definer set search_path = public, pg_temp as $$
  select c.provider, c.provider_user_id, c.account_label, c.scope, c.connected_at
  from public.health_connections c
  where c.user_id = (select auth.uid())
$$;

revoke all on function public.health_status() from public, anon;
grant execute on function public.health_status() to authenticated;

comment on function public.health_status() is
  'Which health accounts the caller has connected. Returns no tokens — THE SHAPE OF THIS RETURN TYPE IS THE SECURITY BOUNDARY; adding access_token here undoes the whole file. Absence IS the answer: an empty result means nothing is connected, and there is no connected:false row.';

create or replace function public.health_disconnect(p_provider text)
returns void language sql volatile security definer set search_path = public, pg_temp as $$
  delete from public.health_connections
  where user_id = (select auth.uid()) and provider = p_provider;
$$;

revoke all on function public.health_disconnect(text) from public, anon;
grant execute on function public.health_disconnect(text) to authenticated;

comment on function public.health_disconnect(text) is
  'Forgets one connection. CANNOT revoke at the vendor — only the Edge Function holds the client credentials — so this exists for the one case the function cannot serve: a token the vendor has already revoked, where the row would otherwise be unremovable. Same role as strava_disconnect() and watch_disconnect().';

/* -------------------------------------------------------------------------- */
/* What the function may ask                                                  */
/* -------------------------------------------------------------------------- */

-- The general-purpose reader for the Article 9 consent, for callers holding the
-- service role.
--
-- `oura_consent_state(uuid)` (20260903060000) reads the same row and is kept
-- exactly as it is: it is granted to the `oura_service` role that the Vercel
-- Oura functions authenticate as, and re-pointing a live integration at a new
-- name buys nothing. New callers use this one, whose name says what it reads
-- rather than which vendor asked first.
create or replace function public.health_consent_state(p_user uuid)
returns table (decision text, version text, recorded_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.decision, e.version, e.recorded_at
    from public.health_consent_events e
   where e.user_id = p_user
     and e.purpose = 'health-metrics'
   order by e.seq desc
   limit 1
$$;

-- `revoke from anon` IS NOT REDUNDANT: Supabase's default privileges grant
-- EXECUTE to anon separately from PUBLIC, so `revoke from public` alone leaves
-- this callable by anybody holding the publishable key — which is everybody,
-- since it ships in the app bundle. 20260903050000 and 20260903060000 both
-- record the same trap.
revoke all on function public.health_consent_state(uuid) from public, anon, authenticated;
grant execute on function public.health_consent_state(uuid) to service_role;

comment on function public.health_consent_state(uuid) is
  'The latest health-metrics consent decision for one person, or no row at all. No row means never asked, which is a different instruction to the caller than declined. Read by the health Edge Function before any authorize URL is issued.';

comment on function public.oura_consent_state(uuid) is
  'The latest decision, or no row at all. No row means never asked, which is a different instruction to the app than declined. Kept for the Vercel Oura functions, which authenticate as oura_service; new callers use health_consent_state(uuid).';

/* -------------------------------------------------------------------------- */
/* Housekeeping                                                               */
/* -------------------------------------------------------------------------- */

create or replace function public.health_sweep_states()
returns void language sql volatile security definer set search_path = public, pg_temp as $$
  delete from public.health_oauth_states  where created_at < now() - interval '10 minutes';
  delete from public.health_pending_links where created_at < now() - interval '10 minutes';
$$;

revoke all on function public.health_sweep_states() from public, anon, authenticated;
grant execute on function public.health_sweep_states() to service_role;
