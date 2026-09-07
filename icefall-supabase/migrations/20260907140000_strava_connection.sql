-- Strava: the connection, and the tokens the app is never allowed to read.
--
-- The owner, 2026-09-07: "add feature where my users can implement strava data
-- into our app" — OAuth 2.0, `activity:write`, so a recorded ICEFALL activity
-- can be pushed to the athlete's own Strava.
--
-- ============================================================================
-- THE ONE FACT THAT SHAPES EVERY LINE BELOW
-- ============================================================================
--
-- ICEFALL IS A STATIC SITE. There is no server: no `api/` directory, no
-- Node process, and `vercel.json` is a SPA rewrite and nothing else. Strava's
-- token exchange requires the CLIENT SECRET, and a client secret in a browser
-- bundle is a client secret published to the world — anyone who opens dev tools
-- can then impersonate this application to Strava for every user who has ever
-- connected.
--
-- So the exchange happens in a Supabase Edge Function
-- (`supabase/functions/strava/`), the secret lives in `supabase secrets`, and
-- this table is written ONLY by that function using the service role.
--
-- ============================================================================
-- THE APP CANNOT READ THE TOKENS. NOT "SHOULD NOT" — CANNOT.
-- ============================================================================
--
-- There is no SELECT policy on `strava_connections` for `authenticated`, and no
-- grant. A Strava access token is a bearer credential: anything holding it can
-- post activities as that athlete. Handing it to a browser to "save a round
-- trip" would mean an XSS anywhere in this app becomes an XSS on somebody's
-- Strava account.
--
-- What the app legitimately needs is much smaller: *am I connected, as whom,
-- and with what permission*. `strava_status()` answers exactly that and returns
-- no token material at all.

create table if not exists public.strava_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  /* Strava's own id for the athlete. Shown so somebody can tell which account
     they connected — people have more than one. NULL means Strava's token
     response did not identify the athlete; it is never filled with a
     placeholder, because a made-up id is an identity nobody measured. */
  athlete_id bigint,
  athlete_username text,
  access_token text not null,
  refresh_token text not null,
  /* Strava returns `expires_at` as a unix timestamp; stored as a real one. */
  expires_at timestamptz not null,
  /* What the athlete actually granted, which is NOT necessarily what was asked
     for — Strava lets people untick scopes on the consent screen. Stored so the
     app can say "you did not grant activity:write" instead of failing an upload
     with a shrug. */
  scope text not null default '',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.strava_connections is
  'One row per connected athlete. Written only by the strava Edge Function via the service role; the tokens are never readable by a client.';

alter table public.strava_connections enable row level security;
alter table public.strava_connections force row level security;

/*
 * NO POLICIES, DELIBERATELY.
 *
 * With RLS enabled, FORCED, and no policy at all, every request from `anon` and
 * `authenticated` matches nothing and returns nothing — including the owner's
 * own row. The service role bypasses RLS, which is how the Edge Function reads
 * and writes it.
 *
 * This is the rare case where "no policy" is the design rather than an
 * oversight, so it is written down: if a future migration adds a SELECT policy
 * here, it hands access tokens to the browser.
 */

revoke all on public.strava_connections from anon, authenticated;

/* -------------------------------------------------------------------------- */
/* The OAuth handshake                                                        */
/* -------------------------------------------------------------------------- */

/*
 * WHY A STATE TABLE EXISTS.
 *
 * Strava sends the athlete back to a callback URL with a `code`. That request
 * carries no session — it is a plain browser redirect — so the callback has no
 * way of knowing WHICH ICEFALL user it belongs to. Without binding, anyone who
 * can reach the callback could attach their own Strava account to somebody
 * else's ICEFALL profile, or the reverse. That is CSRF against an account link,
 * and `state` is the parameter OAuth defines to prevent it.
 *
 * So: the app asks the function to begin, the function (which DOES have the
 * session) mints a random state bound to that user, and the callback will only
 * accept a state it minted, once, within ten minutes.
 */
create table if not exists public.strava_oauth_states (
  state text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  /*
   * WHERE THE ATHLETE IS SENT BACK TO, inside the app. Two callers begin this
   * flow — the settings screen and the last page of sign-up — and each needs
   * the person returned to itself. It is a PATH, never a URL: the function
   * accepts only values from its own allowlist and refuses anything else, so
   * this column cannot become an open redirect at the end of an OAuth flow,
   * which is the one place an open redirect is worth the most.
   */
  return_to text not null default '/settings/connections'
    check (return_to in ('/settings/connections', '/connect')),
  created_at timestamptz not null default now()
);

alter table public.strava_oauth_states enable row level security;
alter table public.strava_oauth_states force row level security;
revoke all on public.strava_oauth_states from anon, authenticated;

comment on table public.strava_oauth_states is
  'Short-lived CSRF binding between an ICEFALL user and one Strava consent redirect. Rows are single-use and expire after ten minutes.';

create index if not exists strava_oauth_states_created_idx
  on public.strava_oauth_states (created_at);

/*
 * WHY THE CALLBACK DOES NOT FINISH THE LINK ITSELF.
 *
 * `state` binds a consent to ONE ICEFALL user, but the callback that receives
 * the consent carries no session, so it cannot tell whether the person in the
 * browser is that user. That gap is exploitable: an attacker signed in to
 * their own ICEFALL account calls `begin`, gets a consent URL bound to
 * THEMSELVES, and sends it to a victim. The victim sees Strava's genuine
 * screen, presses Authorize, and — if the callback exchanged the code and
 * wrote the row — the victim's Strava would now be attached to the attacker's
 * ICEFALL account, ready to receive whatever the attacker uploads.
 *
 * So the callback only PARKS the authorisation code under a one-time ticket,
 * and the app — which does have a session — asks the function to finish it.
 * The function finishes only when the ticket's user is the caller. In the
 * attack above the victim's session is not the attacker's, the ticket is
 * refused, and nothing is exchanged or written.
 */
create table if not exists public.strava_pending_links (
  ticket text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  /* Strava's single-use authorisation code, exchanged by `finalize`. Short-
     lived on Strava's side as well, so a stale ticket is doubly dead. */
  code text not null,
  /* The scope Strava reported on the redirect — the athlete may have unticked
     one — carried through so the app can say which permission is missing. */
  granted_scope text not null default '',
  created_at timestamptz not null default now()
);

alter table public.strava_pending_links enable row level security;
alter table public.strava_pending_links force row level security;
revoke all on public.strava_pending_links from anon, authenticated;

comment on table public.strava_pending_links is
  'A consent Strava has granted but ICEFALL has not yet attached to an account. Single-use, ten-minute, finished only by the user the state was minted for.';

create index if not exists strava_pending_links_created_idx
  on public.strava_pending_links (created_at);

/* -------------------------------------------------------------------------- */
/* What the app may ask                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Am I connected, as whom, and with what permission?
 *
 * SECURITY DEFINER because the caller has no rights on the table at all — which
 * is the point. It returns four facts and NO TOKEN MATERIAL: the shape of this
 * return type is the security boundary, so adding `access_token` to it would
 * undo the whole file.
 *
 * `scope` is returned raw rather than as a boolean because Strava's scopes are
 * a comma-separated list the athlete can edit at consent time, and the app has
 * to be able to say which specific permission is missing.
 */
create or replace function public.strava_status()
returns table (
  connected boolean,
  athlete_id bigint,
  athlete_username text,
  scope text,
  connected_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    true,
    c.athlete_id,
    c.athlete_username,
    c.scope,
    c.connected_at
  from public.strava_connections c
  where c.user_id = (select auth.uid())
$$;

revoke all on function public.strava_status() from public, anon;
grant execute on function public.strava_status() to authenticated;

comment on function public.strava_status() is
  'Whether the caller has connected Strava, and which athlete. Returns no tokens — see the header of 20260907140000.';

/**
 * Forget the connection.
 *
 * DELETING THE ROW IS NOT THE WHOLE JOB, and the app must not treat it as such:
 * the athlete is still authorised on Strava's side until the token is
 * deauthorised there. The Edge Function calls Strava's `/oauth/deauthorize`
 * first and this second, which is the correct order — a deauthorise that fails
 * must not leave ICEFALL believing it has forgotten a token it still holds.
 *
 * It is exposed to the client as well because there is one case the function
 * cannot cover: a token Strava has already revoked, where `/oauth/deauthorize`
 * answers 401 forever and the row would otherwise be unremovable.
 */
create or replace function public.strava_disconnect()
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  delete from public.strava_connections where user_id = (select auth.uid());
$$;

revoke all on function public.strava_disconnect() from public, anon;
grant execute on function public.strava_disconnect() to authenticated;

/* -------------------------------------------------------------------------- */
/* Housekeeping                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Expired handshakes are rubbish, and rubbish that names a user id — and an
 * expired pending link is rubbish that holds an authorisation code.
 *
 * Called by the Edge Function when a flow BEGINS and after a callback has
 * matched a state row — not on every unauthenticated hit of the callback,
 * which would let anybody make the database do work by guessing URLs. Often
 * enough for tables that only ever hold the last few minutes of traffic.
 */
create or replace function public.strava_sweep_states()
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  delete from public.strava_oauth_states where created_at < now() - interval '10 minutes';
  delete from public.strava_pending_links where created_at < now() - interval '10 minutes';
$$;

revoke all on function public.strava_sweep_states() from public, anon, authenticated;
