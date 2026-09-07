-- A website, and the social accounts somebody wants found.
--
-- The owner, 2026-09-07: "they can add their instagram accounts, facebook
-- youtube etc".
--
-- ============================================================================
-- HANDLES, NOT URLS — and this is the whole security argument for the file.
-- ============================================================================
--
-- A public profile that renders a URL somebody typed is an open redirect with a
-- person's face next to it. On a platform where climbers arrange to meet
-- strangers on glaciers, "Instagram: <link>" pointing at a credential-harvesting
-- page is not a hypothetical.
--
-- So the five social columns hold a HANDLE and the app builds the address:
-- `instagram.com/<handle>`. The CHECK constraints below are what make that
-- safe — no scheme, no dots-and-slashes, no `@`, nothing that can carry a host.
-- A handle cannot be pointed at another site by construction rather than by a
-- client remembering to sanitise it.
--
-- `website` IS the exception, because there is no way to have a website field
-- without a URL. It is held to https only (see the CHECK): plain http is a
-- downgrade a profile page should not be inviting people into, and every other
-- scheme — `javascript:`, `data:`, `mailto:` — has no business here at all.
--
-- ============================================================================
-- WHAT THIS DOES NOT DO
-- ============================================================================
--
-- IT DOES NOT VERIFY ANYTHING. A handle in this column is a claim its owner
-- typed, exactly like `location_label`. ICEFALL has not checked that the
-- account exists or that they hold it, and no surface may present these as
-- verified — the verification marks are a different thing entirely and are
-- server-computed (`app_owner`, `identity_verified`).
--
-- IT ADDS NO NEW READ EXPOSURE BEYOND THE ROW ITSELF. `profiles_select` already
-- admits every non-blocked signed-in account to every column, which is the
-- posture recorded in `20260903010000`. These columns join that; somebody
-- filling one in is publishing it.

alter table public.profiles add column if not exists website text;
alter table public.profiles add column if not exists instagram text;
alter table public.profiles add column if not exists facebook text;
alter table public.profiles add column if not exists youtube text;
alter table public.profiles add column if not exists tiktok text;
alter table public.profiles add column if not exists strava text;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * https only, and a length that cannot hide a payload.
 *
 * `~*` so the scheme may be typed in any case. The body must contain no
 * whitespace and no control characters: a URL with a newline in it is how a
 * value smuggles a second header or a second link into anything that later
 * writes it out.
 */
alter table public.profiles drop constraint if exists profiles_website_shape;
alter table public.profiles add constraint profiles_website_shape check (
  website is null
  or (
    website ~* '^https://[^[:space:][:cntrl:]]+\.[^[:space:][:cntrl:]]+$'
    and length(website) between 12 and 200
  )
);

/*
 * ONE SHAPE FOR ALL FIVE HANDLES, and it is deliberately narrower than any one
 * platform's own rule.
 *
 * Letters, digits, dot, underscore, hyphen. No `@` (it is punctuation people
 * type, not part of a handle), no `/` (that is a path), no `:` (that is a
 * scheme) and no dot-dot (that is traversal). 1–40 characters covers every
 * platform's maximum; being stricter than the platform costs a rare user an
 * unusual handle and buys the guarantee that nothing in these columns can ever
 * be read as an address.
 *
 * The intersection is enforced per-column rather than by a domain type so the
 * error names the field somebody actually filled in.
 */
alter table public.profiles drop constraint if exists profiles_instagram_shape;
alter table public.profiles add constraint profiles_instagram_shape check (
  instagram is null or (instagram ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}[A-Za-z0-9]$' and instagram !~ '\.\.')
);

alter table public.profiles drop constraint if exists profiles_facebook_shape;
alter table public.profiles add constraint profiles_facebook_shape check (
  facebook is null or (facebook ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}[A-Za-z0-9]$' and facebook !~ '\.\.')
);

alter table public.profiles drop constraint if exists profiles_youtube_shape;
alter table public.profiles add constraint profiles_youtube_shape check (
  youtube is null or (youtube ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}[A-Za-z0-9]$' and youtube !~ '\.\.')
);

alter table public.profiles drop constraint if exists profiles_tiktok_shape;
alter table public.profiles add constraint profiles_tiktok_shape check (
  tiktok is null or (tiktok ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}[A-Za-z0-9]$' and tiktok !~ '\.\.')
);

alter table public.profiles drop constraint if exists profiles_strava_shape;
alter table public.profiles add constraint profiles_strava_shape check (
  strava is null or (strava ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,38}[A-Za-z0-9]$' and strava !~ '\.\.')
);

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/*
 * Folded into the EXISTING trigger function rather than added as a second
 * trigger. Two `before update` triggers on one table run in name order and the
 * second sees what the first wrote — which is a thing to reason about every
 * time either is touched, for no gain. `20260903020000` created this function;
 * this replaces it with the same body plus the block at the end.
 *
 * IF THAT MIGRATION HAS NOT BEEN APPLIED, THIS ONE WILL FAIL on the reference to
 * `new.interests`. That is correct: they are ordered, and a normaliser that
 * silently skipped the interest check would be worse than a refusal to apply.
 */
create or replace function public.profiles_normalise_public_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unknown text[];
begin
  new.bio := nullif(btrim(coalesce(new.bio, '')), '');

  new.languages := (
    select coalesce(array_agg(distinct lower(btrim(v)) order by lower(btrim(v))), '{}')
    from unnest(coalesce(new.languages, '{}'::text[])) v
    where btrim(v) <> ''
  );

  new.interests := (
    select coalesce(array_agg(distinct lower(btrim(v)) order by lower(btrim(v))), '{}')
    from unnest(coalesce(new.interests, '{}'::text[])) v
    where btrim(v) <> ''
  );

  if cardinality(new.interests) > 0 then
    select array_agg(v)
      into v_unknown
      from unnest(new.interests) v
     where not exists (select 1 from public.interest_tags it where it.slug = v);

    if v_unknown is not null then
      raise exception 'unknown interest tag(s): %', array_to_string(v_unknown, ', ')
        using hint = 'Interests come from public.interest_tags. Add the tag there before a profile can carry it.';
    end if;
  end if;

  /*
   * THE LINKS. Trimmed, emptied to NULL, and the two things people type without
   * thinking are removed before the CHECK sees them: a leading `@` on a handle,
   * and a `https://` a website field already implies.
   *
   * The `@` strip is a convenience, not a loophole — the CHECK still refuses
   * anything with a slash, colon or dot-dot in it, so stripping one leading
   * character cannot turn a rejected value into an accepted address.
   *
   * A bare domain typed into `website` ("margaret.com") gets the scheme added
   * rather than being refused. Refusing it teaches people to type `https://`
   * into a box that already shows `https://` beside it, which is the mockup's
   * own design and the reason this branch exists.
   */
  new.website := nullif(btrim(coalesce(new.website, '')), '');
  if new.website is not null then
    if new.website !~* '^[a-z][a-z0-9+.-]*://' then
      new.website := 'https://' || new.website;
    end if;
    -- Anything that arrived with a scheme other than https is refused by the
    -- CHECK; it is NOT rewritten to https, because silently changing where a
    -- link points is worse than saying no.
  end if;

  new.instagram := nullif(btrim(ltrim(btrim(coalesce(new.instagram, '')), '@')), '');
  new.facebook  := nullif(btrim(ltrim(btrim(coalesce(new.facebook,  '')), '@')), '');
  new.youtube   := nullif(btrim(ltrim(btrim(coalesce(new.youtube,   '')), '@')), '');
  new.tiktok    := nullif(btrim(ltrim(btrim(coalesce(new.tiktok,    '')), '@')), '');
  new.strava    := nullif(btrim(ltrim(btrim(coalesce(new.strava,    '')), '@')), '');

  return new;
end;
$$;

/* -------------------------------------------------------------------------- */
/* Documentation                                                              */
/* -------------------------------------------------------------------------- */

comment on column public.profiles.website is
  'A personal site, https only. Typed by the account holder and NOT verified by ICEFALL.';
comment on column public.profiles.instagram is
  'Instagram handle only — no URL, no @. The app builds the address. Not verified.';
comment on column public.profiles.facebook is
  'Facebook username only — no URL, no @. The app builds the address. Not verified.';
comment on column public.profiles.youtube is
  'YouTube handle only — no URL, no @. The app builds the address. Not verified.';
comment on column public.profiles.tiktok is
  'TikTok handle only — no URL, no @. The app builds the address. Not verified.';
comment on column public.profiles.strava is
  'Strava athlete handle only — no URL, no @. The app builds the address. Not verified.';
