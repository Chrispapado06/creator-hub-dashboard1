/* ==========================================================================
 * The profile a stranger reads — a bio, languages, interests, and a photo
 * that exists somewhere other than one phone.
 *
 * WHY THIS EXISTS. The owner asked for the profile to be adjustable, and
 * clarified what adjustable has to mean: what somebody types must reach their
 * public profile and their share link. Today it does not. Every field on
 * `icefall-app/src/screens/settings/Sections.tsx` is written through `patch()`
 * from `useSettings()`, which is localStorage, and nothing anywhere in
 * `icefall-app/src` has ever issued an UPDATE against `profiles` — every
 * `from("profiles")` call in the app is a `.select()`. So a person changes
 * their name, their bio and their photo, watches all three change, and no other
 * human being ever sees any of it. The share card keeps showing whatever signup
 * put there.
 *
 * Three of the fields already have somewhere to land: `display_name`,
 * `location_label` and `country_code` are on the live table and
 * `profiles_update_self` already permits a person to write their own row. That
 * half needs no migration at all and should ship on its own. This file is the
 * other half — the fields with no home, and the photo with no bucket.
 *
 * WHAT THIS FILE DOES NOT DO, SAID FIRST SO NOBODY READS IT AS DONE.
 * It does not make the app save anything. After this migration the app still
 * writes to localStorage and the profile a stranger opens still says whatever
 * signup said. Columns without a client are a promise, not a feature. The
 * client work is a separate change in `icefall-app`, and until it lands nothing
 * on any screen may claim an edit was saved.
 *
 * THE UPDATE POLICY'S RULE IS NOT TOUCHED, AND NOTHING HERE WEAKENS IT.
 * Read against the live database on 2026-09-03, `profiles_update_self` lets a
 * person write their own row while pinning `role` to its current value and
 * refusing any change to `username` — handles move only through
 * `claim_username`, which checks `reserved_usernames` and the unique index.
 * Every word of that rule survives. Section 0 re-expresses it so that it can be
 * evaluated at all, which today it cannot; section 9 adds one strengthening;
 * both are argued where they stand.
 *
 * SECTION 0 IS NOT ABOUT THIS FEATURE AND IS NOT OPTIONAL. Read it first: as
 * the tree stands, the next migration to be pushed makes every profile update
 * on the platform fail with a planner error, and this file is where that is
 * caught.
 * ========================================================================== */

/* ========================================================================== */
/* 0. FIRST — AS THE TREE STANDS, NOBODY CAN UPDATE THEIR PROFILE AT ALL      */
/* ========================================================================== */

/*
 * MEASURED, NOT REASONED, AND IT IS THE MOST IMPORTANT THING IN THIS FILE.
 *
 * Apply every migration in this directory to an empty Postgres 17, then as an
 * ordinary signed-in person run the simplest edit this product has:
 *
 *     update public.profiles set display_name = 'New name' where id = auth.uid();
 *
 * It fails. `infinite recursion detected in policy for relation "profiles"`,
 * SQLSTATE 42P17. Not a refusal — a planner error, for every account, on every
 * column, including the three the brief for this work correctly said needed no
 * migration at all. Ship the client half without this section and "Edit
 * profile" throws on save for everybody, which is the loudest possible version
 * of the bug this whole file exists to close.
 *
 * WHERE IT COMES FROM, bisected file by file rather than guessed:
 *
 *  · `profiles_update_self` pins `role` and `username` by re-reading them —
 *        role = (select p.role from public.profiles p where p.id = ...)
 *    a subquery on `profiles` inside a policy ON `profiles`.
 *  · That has been survivable only because `profiles_select` was `using (true)`:
 *    a constant needs no expansion, so the inner read never re-entered RLS.
 *  · `20260903010000_block_and_report` changes `profiles_select` to
 *        id = (select auth.uid())
 *        or public.is_staff()
 *        or id not in (select b.id from public.blocked_ids() as b (id))
 *    which is the correct policy for the block feature and is NOT the bug. But
 *    moment the neighbour stops being a constant, the inner read has real RLS
 *    to expand while `profiles` is already being expanded, and Postgres stops.
 *
 * 20260830170000 hit this exact failure on `guide_profiles`, fixed it, and
 * wrote the prediction down: it works on profiles "because that policy's
 * subquery is on a table whose SELECT policy is `using (true)` — a fact about
 * the neighbour, not about the technique." The neighbour changed today.
 *
 * VERIFIED BOTH WAYS, because the difference matters. Against the LIVE database
 * (PostgreSQL 17.6, which does not yet have `block_and_report` applied) the
 * same statement plans clean. With every migration in this directory applied it
 * does not. So nothing is broken in production this minute — this is the thing
 * that has to be in the tree BEFORE `block_and_report` is pushed, and the two
 * files are gated together whether or not anybody intended that.
 *
 * THE FIX KEEPS THE RULE AND CHANGES ONLY HOW IT IS READ. Same predicate, word
 * for word: your own row, `role` pinned to what is stored, `username` pinned to
 * what is stored, or an admin. The two subqueries move inside SECURITY DEFINER
 * functions, which are planned separately and therefore cannot re-enter the
 * policy. `my_role()` has existed since 20260817120000 and IS that subquery
 * already; `my_username()` is its missing twin.
 *
 * NOTHING IS WEAKENED. `role` still cannot move. `username` still cannot move
 * through a table update, so handles still go only through `claim_username` —
 * which is SECURITY DEFINER and therefore never consults this policy at all,
 * leaving the reclaim window in 20260903030000 untouched.
 *
 * WHY NOT A TRIGGER, which is what 20260830170000 chose for `guide_profiles`:
 * because `claim_username` MUST be able to move `username`, and a trigger fires
 * for definer functions too. Pinning the handle in a trigger would break the one
 * sanctioned path for changing it, from a file that does not own it.
 */
create or replace function public.my_username()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.username from public.profiles p where p.id = (select auth.uid());
$$;

/*
 * No revoke, matching `my_role()`, and by decision rather than by omission: it
 * is called from inside a policy and therefore evaluated as whoever is writing
 * the row, so a role without EXECUTE would meet "permission denied for
 * function" where it expected a policy decision — inside a constraint, which is
 * not a place anybody would think to look. It discloses nothing: it answers
 * only about the caller, and returns NULL when there is no session.
 */
comment on function public.my_username() is
  'The caller''s own handle. Exists so profiles_update_self can pin `username` '
  'without putting a subquery on `profiles` inside a policy on `profiles` — which '
  'is 42P17 the moment profiles_select stops being `using (true)`.';

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using ((id = (select auth.uid())) or public.is_admin())
  with check (
    (
      id = (select auth.uid())
      and role = public.my_role()
      and username is not distinct from public.my_username()
    )
    or public.is_admin()
  );

/* ========================================================================== */
/* 1. A helper the CHECK constraints below need                               */
/* ========================================================================== */

/*
 * "Does every element of this array match this pattern?"
 *
 * A CHECK constraint may not contain a subquery, so `... where exists (select
 * ...)` and `unnest` in a FROM clause are both unavailable to it. They ARE
 * available inside a function, and an IMMUTABLE function is legal in a CHECK.
 * That is the whole reason this exists.
 *
 * NOTHING IS REVOKED FROM IT, DELIBERATELY. A check constraint is evaluated as
 * whoever is writing the row, and function EXECUTE is checked like any other
 * permission — so a tidy-looking `revoke all ... from public` would make some
 * future writer (staff tooling on the service role, a backfill run as another
 * role) fail with "permission denied for function" inside a constraint, which
 * is a place nobody would think to look. The function reads no table, holds no
 * privilege, and answers a question about its own two arguments.
 */
create or replace function public.array_elements_match(vals text[], pattern text)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  -- bool_and over zero rows is NULL, which a CHECK would accept as unknown;
  -- coalesced to true so an empty array passes for the honest reason (there is
  -- nothing in it to violate the pattern) rather than by accident.
  select coalesce(bool_and(v ~ pattern), true)
  from unnest(coalesce(vals, '{}'::text[])) v;
$$;

comment on function public.array_elements_match(text[], text) is
  'Every element matches the pattern. Exists because a CHECK constraint cannot hold a '
  'subquery and therefore cannot unnest an array. NULL elements are invisible to '
  'bool_and, so any constraint using this must also reject NULL elements itself.';

/* ========================================================================== */
/* 2. BIO — the only free text on the profile, and it is public               */
/* ========================================================================== */

alter table public.profiles add column if not exists bio text;

/*
 * IT GOES ON `profiles` BECAUSE IT IS MEANT TO BE READ BY STRANGERS.
 * 20260830100000 put the onboarding answers on `athlete_profiles` instead, and
 * gave the reason: `profiles_select` is `using (true)`, so every signed-in
 * account reads every profile row in full, and body mass on this table would
 * publish it to the whole platform. A bio is the opposite case — it is written
 * to be read — so this table is right for it.
 *
 * THE CONSEQUENCE THE APP MUST SAY OUT LOUD: the app's `profileVisibility`
 * setting ("connections", "private") does not exist on the server. There is no
 * policy behind it. A bio is readable by every signed-in ICEFALL account
 * whatever that toggle says, and the Edit-profile screen has to tell people so
 * before they type, not after.
 *
 * 300 CHARACTERS. A ceiling is a rendering budget, not a courtesy: this string
 * is drawn on a profile card, in search results and on a share preview, and a
 * bio with no ceiling is a denial-of-service on all three at once, paid for by
 * every reader. 300 is about four short lines — the length of an actual
 * introduction. Raising it later is one line; lowering it after people have
 * written 600 characters means truncating somebody's words, so it starts tight.
 *
 * AND A LINE-BREAK CEILING, because a character count does not bound a height:
 * 300 newlines is 300 characters and a card three hundred lines tall. Four
 * breaks, so a bio can have paragraphs and cannot have a scroll bar.
 *
 * Control characters are refused apart from the newline — a bidi override or a
 * zero-width run inside a public display string is a rendering exploit, not a
 * bio. An empty string is normalised to NULL in section 5, so "nothing written"
 * has exactly one representation.
 */
alter table public.profiles drop constraint if exists profiles_bio_shape;
alter table public.profiles add constraint profiles_bio_shape check (
  bio is null or (
    length(bio) between 1 and 300
    and length(bio) - length(translate(bio, chr(10), '')) <= 4
    and translate(bio, chr(10), ' ') !~ '[[:cntrl:]]'
  )
);

comment on column public.profiles.bio is
  'Public. Read by every signed-in account, whatever the app''s visibility toggle says '
  '— there is no policy behind that toggle. 300 characters and at most four line '
  'breaks, because this renders on a card. NULL means nothing was written; the empty '
  'string cannot be stored.';

/* ========================================================================== */
/* 3. LANGUAGES — codes in an array, not names in a sentence                  */
/* ========================================================================== */

alter table public.profiles add column if not exists languages text[] not null default '{}';

/*
 * AN ARRAY, NOT THE COMMA-JOINED STRING THE APP HOLDS TODAY. `settings.languages`
 * is one text box containing "English, Greek". That is easy now and painful the
 * first time anybody filters by it: "who speaks Greek" over a joined string is
 * `like '%Greek%'`, which is a full scan that also matches nothing when somebody
 * typed "greek", and matches "Greek Sign Language" when they did not mean it.
 * An array with a GIN index answers the same question with `&&` and an index.
 *
 * CODES, NOT DISPLAY NAMES, AND THIS IS THE DECISION WORTH THE PARAGRAPH.
 * "Greek", "greek" and "Ελληνικά" are one language and three strings. A filter
 * over typed names is a filter over spellings, and it silently returns fewer
 * people than it should — the worst kind of wrong answer, because it looks like
 * an answer. A code is canonical, so the filter is exact, and it renders in the
 * READER's language rather than the writer's: a Greek climber sees Ελληνικά
 * where a French one sees grec, from the same row.
 *
 * TWO OR THREE LETTERS, NOT EXACTLY TWO. ISO 639-1 is two letters and 184
 * languages, and it has no code for Sherpa. On a mountaineering platform, a
 * schema in which a Sherpa guide cannot say they speak Sherpa is not a schema
 * that has thought about who is using it. 639-3 has `xsr` for Sherpa and `new`
 * for Newar, so the shape accepts three as well, and 639-1 stays the right
 * choice wherever it has a code (`ne`, `bo`, `fr`).
 *
 * NO LOOKUP TABLE, UNLIKE `interests` BELOW, AND THE ASYMMETRY IS DELIBERATE.
 * The interest vocabulary is 22 words ICEFALL wrote and can therefore hold. ISO
 * 639-3 is roughly 7,900 entries maintained by somebody else; importing it is a
 * data job rather than a migration, and a stale copy of it would eventually
 * refuse a language that genuinely exists. So the shape is enforced here and
 * the vocabulary belongs to the client's picker.
 *
 * THE COST OF THAT, STATED: `xyz` is storable and means nothing. It renders as
 * a code nobody recognises, which is a display problem in one profile, not a
 * corruption of anybody else's data. That trade is worth naming rather than
 * discovering.
 *
 * TWELVE. Somebody who genuinely speaks twelve languages is not being cut off,
 * and a chip row rendering forty is the same DoS the bio ceiling refuses.
 *
 * AN EMPTY ARRAY MEANS NOTHING IS LISTED. It is NOT a measured statement that
 * this person speaks no languages, and no screen may count it, average it, or
 * print a zero from it. There is deliberately no third state: "never filled it
 * in" and "cleared it" are the same product fact here.
 *
 * NOTED, NOT DONE: `guide_profiles.languages` is also `text[]` and the guide
 * catalogue in the app carries display NAMES in it ("French, English, Italian"),
 * filtered by exact string match. It holds zero rows on the live database, so
 * nothing is being contradicted yet — but the two should converge on codes, and
 * that is a migration against another surface's table rather than a change to
 * smuggle in here.
 */
alter table public.profiles drop constraint if exists profiles_languages_shape;
alter table public.profiles add constraint profiles_languages_shape check (
  cardinality(languages) <= 12
  -- bool_and cannot see a NULL element, so the helper cannot reject one either.
  and array_position(languages, null::text) is null
  and public.array_elements_match(languages, '^[a-z]{2,3}$')
);

/*
 * The index that makes the array worth having. Without it, `languages && '{el}'`
 * is a sequential scan and the column is a comma-joined string wearing brackets.
 */
create index if not exists profiles_languages_gin on public.profiles using gin (languages);

comment on column public.profiles.languages is
  'ISO 639-1 or 639-3 codes, lowercase, deduplicated and sorted by trigger. Codes '
  'rather than names so a filter matches languages instead of spellings, and so the '
  'list renders in the reader''s language. Three letters are accepted because 639-1 '
  'has no code for Sherpa. An empty array means nothing listed — never a measured zero.';

/* ========================================================================== */
/* 4. INTERESTS — a closed vocabulary, because the free half has the bio      */
/* ========================================================================== */

/*
 * THE APP'S ONE FIELD IS TWO DIFFERENT THINGS. Its placeholder is "Alpine
 * climbing, ski touring, long days". The first two are facets: things somebody
 * else will one day filter by, that mean the same thing on every profile.
 * "Long days" is personality — true, worth saying, and impossible to filter.
 * Collapsing them into one box means neither works: the facets cannot be
 * searched because they are free text, and the personality cannot be read as
 * prose because it is a chip.
 *
 * So they are separated. The prose half now has a home — that is section 2 —
 * and this column carries only the half a query can use.
 *
 * A TABLE, NOT AN ENUM, because the list will grow. Same reasoning
 * 20260830100000 gave for `reserved_usernames`: adding a word should be one
 * INSERT, not a type migration and a rewrite of `profiles`.
 */
create table if not exists public.interest_tags (
  slug text primary key
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 40),
  label text not null check (length(btrim(label)) between 1 and 60),
  sort_order integer not null default 100,
  /*
   * RETIRED RATHER THAN DELETED. Deleting a tag would make every profile
   * carrying it fail its next save — the person edits their bio and gets an
   * error about a word they chose last year and cannot see. Retired tags stay
   * valid on the rows that already hold them and simply stop being offered.
   */
  retired boolean not null default false
);

/*
 * THE VOCABULARY IS THE ONE THE APP ALREADY USES, NOT A THIRD ONE.
 * ICEFALL already has two lists of these words: the onboarding disciplines in
 * `screens/Onboarding.tsx` (`hiking`, `trail-running`, `mountaineering`,
 * `climbing`, `ski-touring`, `mountain-biking`, `alpine-skiing`) and the guide
 * specialities in `guides/types.ts` (`mountaineering`, `glacier`, `ice`,
 * `rock`, `mixed`, `ski-mountaineering`, `winter`, `high-altitude`,
 * `trekking`). The seed below is both lists in full — fifteen slugs, spelled
 * exactly as the app already spells them, so that an athlete's interest and a
 * guide's speciality are the same word and can one day be matched to each
 * other. A third spelling of the same nine concepts would make that impossible
 * and nobody would notice until the matching quietly returned nothing.
 *
 * PLUS SIX, AND NOT ONE OF THEM INVENTED HERE: thru-hiking, scrambling, via
 * ferrata, expedition, bouldering and snowshoeing. Each is a word the product
 * already uses in its own copy — `expedition` in 94 files — and each is a thing
 * somebody would look for. Nothing was added because it sounded plausible.
 *
 * The labels follow `SPECIALITY_LABELS` where it has one, for the reason that
 * file gives: one phrasing across the whole feature, so two screens cannot
 * disagree.
 *
 * WHAT IS DELIBERATELY ABSENT.
 *  · `other` ("Something else"), which is a real onboarding answer and a
 *    useless chip: a reader learns nothing from it and a filter cannot use it.
 *  · SKILLS — avalanche safety, crevasse rescue, navigation, wilderness
 *    medicine. The app's own CV screen says "Summits and skills come from what
 *    you recorded. They cannot be edited by hand." A self-declared skill chip
 *    sitting beside that list would blur the single distinction that screen
 *    exists to draw, and on glaciated ground the difference between a skill
 *    somebody claims and a skill somebody demonstrated is not cosmetic.
 *  · Anything the product does not already name — splitboarding, canyoning,
 *    paragliding, sky running. Not because they are not real, but because
 *    seeding a vocabulary the app never mentions is inventing product in a
 *    migration. They are one INSERT away when a screen asks for them.
 */
insert into public.interest_tags (slug, label, sort_order) values
  ('hiking',             'Hiking',                 10),
  ('trekking',           'Trekking',               20),
  ('thru-hiking',        'Thru-hiking',            30),
  ('scrambling',         'Scrambling',             40),
  ('via-ferrata',        'Via ferrata',            50),
  ('trail-running',      'Trail running',          60),
  ('mountaineering',     'Alpine mountaineering',  70),
  ('expedition',         'Expedition',             80),
  ('high-altitude',      'High altitude',          90),
  ('climbing',           'Climbing',              100),
  ('rock',               'Rock',                  110),
  ('ice',                'Ice climbing',          120),
  ('mixed',              'Mixed ground',          130),
  ('bouldering',         'Bouldering',            140),
  ('glacier',            'Glacier travel',        150),
  ('winter',             'Winter skills',         160),
  ('ski-touring',        'Ski touring',           170),
  ('ski-mountaineering', 'Ski mountaineering',    180),
  ('alpine-skiing',      'Alpine skiing',         190),
  ('snowshoeing',        'Snowshoeing',           200),
  ('mountain-biking',    'Mountain biking',       210)
on conflict (slug) do nothing;

/*
 * `on conflict do nothing`, not `do update`: if somebody has already retired a
 * tag or renamed a label on the live database, re-running this migration must
 * not quietly undo that decision.
 */

alter table public.interest_tags enable row level security;

-- Readable by any signed-in account, because the picker cannot be drawn from
-- rows the client may not read. There is no write policy at all: the vocabulary
-- is ICEFALL's, and it changes through a migration or the dashboard.
drop policy if exists interest_tags_select on public.interest_tags;
create policy interest_tags_select on public.interest_tags
  for select to authenticated
  using (true);

revoke all on public.interest_tags from anon, authenticated;
grant select on public.interest_tags to authenticated;

comment on table public.interest_tags is
  'The closed vocabulary behind profiles.interests. Slugs match the ids the app '
  'already uses for onboarding disciplines and guide specialities so ICEFALL does not '
  'acquire a third spelling of the same words. Tags are retired, never deleted — '
  'deleting one would make every profile carrying it fail its next save.';

alter table public.profiles add column if not exists interests text[] not null default '{}';

/*
 * TEN. Chips on a profile card, and a person whose interests are "everything"
 * has told a reader nothing. The membership rule is enforced by the trigger in
 * section 5, because a CHECK cannot reference another table — the same reason
 * `reserved_usernames` is checked inside `claim_username` rather than by a
 * constraint. What stays here is what a CHECK does well and what survives a
 * disabled trigger: a count, a shape, and no NULL elements.
 *
 * AN ARRAY ON THE ROW RATHER THAN A JOIN TABLE. A `profile_interests` table
 * would give a real foreign key and cost a join on the hottest read in the app
 * — every profile card, every feed avatar row — plus a second set of policies
 * to keep in step with `profiles_select`. The trigger gives the foreign key's
 * guarantee against every write path, including the service role, which is more
 * than a policy would have done, and the read stays one request.
 */
alter table public.profiles drop constraint if exists profiles_interests_shape;
alter table public.profiles add constraint profiles_interests_shape check (
  cardinality(interests) <= 10
  and array_position(interests, null::text) is null
  and public.array_elements_match(interests, '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index if not exists profiles_interests_gin on public.profiles using gin (interests);

comment on column public.profiles.interests is
  'Slugs from public.interest_tags — a closed vocabulary, so this can be filtered. The '
  'free-text half of what the app''s single "Interests" box collects belongs in bio. '
  'Empty means nothing listed, never a measured zero.';

/* ========================================================================== */
/* 5. NORMALISATION AND THE MEMBERSHIP CHECK                                  */
/* ========================================================================== */

/*
 * WHY NORMALISING INPUT IS SAFE HERE, given how much of this project is about
 * never showing somebody something that did not happen: because every write
 * against this table reads the row back. The doctrine is that a write returns
 * `.select()` and the client renders what came back, so a person who types
 * " EN " and gets `en` sees `en` — the app is never in a position to claim it
 * stored something it did not. `claim_username` already lowercases input for
 * the same reason.
 *
 * It runs BEFORE INSERT as well as UPDATE so the row created by the auth
 * trigger cannot start out unnormalised, and it holds against the service role
 * and against anything a later migration adds, which a policy would not.
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
  -- Ends trimmed; the line breaks in between are the author's and are left
  -- alone. An empty string becomes NULL so "nothing written" has exactly one
  -- representation and no screen has to test for two.
  new.bio := nullif(btrim(coalesce(new.bio, '')), '');

  /*
   * NULL is folded to the empty array rather than raising. A PATCH that sends
   * `languages: null` means "I have cleared this", and the column is NOT NULL,
   * so without this the person gets a constraint error for an edit that made
   * perfect sense. Both spellings mean nothing is listed.
   */
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

  /*
   * The membership check a CHECK constraint cannot do. Every unknown tag is
   * named at once rather than one per attempt — the same courtesy
   * `record_commission` extends when it refuses ("naming every reason at once"
   * is what its own test calls it), and the reason is the same: a person fixing
   * a form should be told everything wrong with it in one go.
   *
   * A RETIRED tag still passes, because it still exists. That is the point of
   * retiring rather than deleting: somebody who chose it years ago can still
   * save their bio.
   */
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

  return new;
end;
$$;

drop trigger if exists profiles_normalise on public.profiles;
create trigger profiles_normalise
  before insert or update on public.profiles
  for each row execute function public.profiles_normalise_public_fields();

/* ========================================================================== */
/* 6. THE PHOTO COLUMNS — and what may not be stored in them                  */
/* ========================================================================== */

/*
 * `avatar_url` already exists. `banner_url` does not, and the app has held a
 * banner since the profile mockup: `settings.cover`, "a JPEG data URL,
 * 1024x384", stored beside the avatar with a comment saying "there is nowhere
 * to upload it to". Section 10 is that somewhere; this is the column that
 * remembers which file it was.
 *
 * A URL COLUMN RATHER THAN A `media_assets` REFERENCE, unlike
 * `companies.banner_media_id`. A company's banner goes through ICEFALL review;
 * a person's does not, and there is no approval state to model. More decisively,
 * `avatar_url` must be able to hold a URL ICEFALL did not mint: a Google or
 * Apple sign-in arrives with a provider avatar before the person has been asked
 * anything. Its sibling should behave the same way.
 */
alter table public.profiles add column if not exists banner_url text;

/*
 * WHAT THE CONSTRAINT IS ACTUALLY FOR, and it is not tidiness.
 *
 *  · A `data:` URL. The app holds BOTH images as base64 data URLs right now,
 *    because until section 10 there was nowhere to put them. If the client work
 *    naively writes `settings.avatar` into this column, every signed-in account
 *    downloads a base64 JPEG on every read of that profile row — `profiles` is
 *    `using (true)` and this table is read constantly. Refusing it here means
 *    that mistake fails immediately and loudly at the moment it is made,
 *    instead of becoming a slow app nobody can explain.
 *  · A `javascript:` URL, which is stored text until something renders it into
 *    an href.
 *  · An unbounded string in a row every account reads.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: pin the URL to ICEFALL's own bucket. That
 * would reject the provider avatar a social sign-in supplies, and it would bake
 * a project reference into the schema so the same migration behaves differently
 * on a local stack. The residual risk is worth stating plainly: an off-platform
 * URL means every reader's browser contacts that host to draw the picture, and
 * whoever runs it learns something about who looked. The client should prefer
 * ICEFALL's own bucket and copy a provider avatar into it at signup.
 *
 * `http` is allowed for localhost only, because the Supabase CLI serves local
 * storage over `http://127.0.0.1:54321` and a schema that cannot be developed
 * against is a schema that gets worked around.
 */
alter table public.profiles drop constraint if exists profiles_avatar_url_shape;
alter table public.profiles add constraint profiles_avatar_url_shape check (
  avatar_url is null or (
    length(avatar_url) <= 512
    and avatar_url ~ '^(https://|http://(localhost|127\.0\.0\.1)([:/]|$))'
  )
);

alter table public.profiles drop constraint if exists profiles_banner_url_shape;
alter table public.profiles add constraint profiles_banner_url_shape check (
  banner_url is null or (
    length(banner_url) <= 512
    and banner_url ~ '^(https://|http://(localhost|127\.0\.0\.1)([:/]|$))'
  )
);

comment on column public.profiles.banner_url is
  'The profile banner, the app''s `settings.cover`. An https URL, 512 characters — '
  'never a data URL: this row is read by every signed-in account and a base64 JPEG '
  'here is a download for all of them. Files belong in the profile-media bucket.';

comment on column public.profiles.avatar_url is
  'An https URL. May point outside ICEFALL, because a social sign-in supplies a '
  'provider avatar before anybody has been asked anything — with the cost that the '
  'reader''s browser then contacts that host. Prefer the profile-media bucket.';

/* ========================================================================== */
/* 7. REGION — the mapping, which is a decision and not a rename              */
/* ========================================================================== */

/*
 * The app holds one field, `settings.region`, hinted "A town or region. Never an
 * address" and placeheld "Athens, Greece". The server holds two:
 * `location_label` and `country_code`. The honest mapping is NOT a split.
 *
 *   settings.region  ->  profiles.location_label, verbatim.
 *
 * The bound already on `location_label` (1-80 characters, trimmed) and the
 * comment already on it ("as typed. Never an address, never geocoded") are the
 * same rule the app's own hint states, so nothing needs to change for this half.
 *
 *   settings.region  ->  profiles.country_code: NOTHING. It stays NULL.
 *
 * Parsing "Athens, Greece" into `GR` is a guess dressed as a field. "Chamonix"
 * names no country. "Georgia" names a country and a US state, and picking one
 * silently files somebody on the wrong continent. "Vienna" is in Austria and
 * also in Virginia. This is precisely the reasoning 20260830100000 used when it
 * refused to geocode the label, and it applies with equal force one field over:
 * a country code inferred from free text is a measurement that never happened,
 * and it would go on to drive currency and regional filtering — decisions a
 * person would feel without ever being asked.
 *
 * So `country_code` is filled by a picker or it is NULL, and NULL renders as
 * not stated. That picker is client work, not a migration.
 */
comment on column public.profiles.country_code is
  'ISO 3166-1 alpha-2, set only by an explicit choice. NEVER parsed out of '
  'location_label — "Georgia" is a country and a state, "Chamonix" is neither, and a '
  'guessed code would go on to drive currency and filtering. NULL means not stated.';

/* ========================================================================== */
/* 8. updated_at — checked, present, and re-asserted                          */
/* ========================================================================== */

/*
 * CHECKED AGAINST THE LIVE DATABASE ON 2026-09-03 rather than assumed:
 *
 *   select tgname, pg_get_triggerdef(t.oid) from pg_trigger t
 *    where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal;
 *
 * answered with exactly one row, `profiles_touch BEFORE UPDATE ON
 * public.profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at()`, created by
 * 20260817120000. So nothing was missing and nothing needed inventing.
 *
 * It is re-asserted here anyway, because it is idempotent, because this file is
 * the one that makes `profiles` a table people actually write to, and because
 * a stale `updated_at` is the kind of failure that never announces itself — it
 * shows up months later as a cache that will not refresh and a sync that
 * decides nothing has changed.
 *
 * WHAT IT DOES NOT COVER: INSERT, which takes the column default. That is
 * correct — a row created a moment ago was not updated.
 */
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

/* ========================================================================== */
/* 9. A SUSPENDED ACCOUNT MAY NOT LIFT ITS OWN SUSPENSION                     */
/* ========================================================================== */

/*
 * THIS IS A STRENGTHENING, AND IT IS HERE BECAUSE THIS MIGRATION IS WHAT MAKES
 * IT REACHABLE.
 *
 * `profiles_update_self` pins two columns: `role`, and `username`. It pins
 * nothing else, which was harmless while no client ever issued an UPDATE
 * against this table. The whole point of this file is that one soon will — and
 * `account_status`, `suspended_reason` and `suspended_at` live on the same row.
 * As it stands, a suspended person can send
 *
 *   update profiles set account_status = 'active', suspended_reason = null
 *
 * against their own id, with the anon key and curl, and the policy allows it.
 * A suspension anybody can lift is not a suspension.
 *
 * A TRIGGER RATHER THAN AN EDIT TO THE POLICY, for the reason
 * `companies_banner_is_own_media` gives: a policy guards the API and a trigger
 * guards every path. It also leaves `profiles_update_self` exactly as it is,
 * which is what the brief for this file requires.
 *
 * WHO IS STILL ALLOWED THROUGH, and each is deliberate:
 *  · No JWT at all — a migration, the SQL editor, or staff tooling holding the
 *    service key. Those are ICEFALL's own hands and are not what this guards.
 *    Note that this is not a hole a client can crawl through: `profiles_update_self`
 *    is granted `to authenticated`, so an UPDATE with no session is refused
 *    before this trigger is ever reached.
 *  · Admins and staff, who are the people suspension exists for.
 *
 * `is true`, never `not ...`: `is_admin()` and `is_staff()` can answer NULL for
 * a profile row that is missing, and `not NULL` is NULL, which reads as "did
 * not fail" everywhere it is tested. This project has shipped that exact
 * NULL-bypass before. Fail closed by construction.
 */
create or replace function public.profiles_suspension_not_self_serviceable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The overwhelmingly common case: an ordinary profile edit that does not go
  -- near any of these columns. A PATCH that echoes them back unchanged is fine.
  if new.account_status   is not distinct from old.account_status
     and new.suspended_reason is not distinct from old.suspended_reason
     and new.suspended_at     is not distinct from old.suspended_at then
    return new;
  end if;

  if (select auth.uid()) is null then
    return new;
  end if;

  if public.is_admin() is true or public.is_staff() is true then
    return new;
  end if;

  raise exception 'account status is not self-serviceable'
    using hint = 'A suspension is lifted by ICEFALL, not by the suspended account. Contact support.';
end;
$$;

drop trigger if exists profiles_suspension_guard on public.profiles;
create trigger profiles_suspension_guard
  before update on public.profiles
  for each row execute function public.profiles_suspension_not_self_serviceable();

/* ========================================================================== */
/* 10. profile-media — where an avatar and a banner actually go               */
/* ========================================================================== */

do $$
begin
  -- Guarded because the PGlite test harness has no `storage` schema, matching
  -- 20260828130000 and 20260902160000. Locally this is a no-op; on Supabase it
  -- does the work.
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'no storage schema (PGlite?) — skipping the profile-media bucket and its policies';
    return;
  end if;

  /*
   * PUBLIC, WHICH IS THE OPPOSITE OF EVERY OTHER BUCKET IN THIS PROJECT, SO IT
   * HAS TO BE ARGUED RATHER THAN ASSUMED.
   *
   * `operator-media` and `post-media` are private for a stated reason: an
   * operator's rejected media is rejected precisely because it should not be
   * published, and a personal photo its author deletes should stop being
   * served. Neither reason describes an avatar. An avatar is the picture
   * somebody chose to show strangers; that is its entire function.
   *
   * WHY PRIVATE WOULD BE THE WRONG ANSWER HERE, concretely:
   *  · A signed URL is minted per object and expires. A feed of fifty posts is
   *    fifty avatars, so every screen becomes a round trip before it can draw a
   *    face.
   *  · A signed URL is DIFFERENT ON EVERY REQUEST, so the offline service
   *    worker can never match a cached response. This app is built for a hut at
   *    4am with no signal; an avatar that only exists when the network does is
   *    a feature that stops working exactly where the product claims to work.
   *  · A share link opened tomorrow shows a broken image, because the URL that
   *    was minted today has expired.
   *
   * THE COST, STATED AS A COST. A public bucket serves an object to anyone
   * holding the URL, for ever, with no session — including after the person
   * replaces their photo and until the old object is deleted. That is
   * acceptable for a picture chosen for strangers and it is NOT acceptable for
   * the other things people photograph, which is exactly why this bucket takes
   * avatars and banners and nothing else. `post-media` stays private.
   *
   * AND THE MITIGATION IS ENFORCED, NOT DESCRIBED. Every id in `profiles` is
   * readable by every signed-in account, so if the path were `<uid>/avatar.jpg`
   * then knowing who somebody is would BE knowing their photo URL, and "public"
   * would quietly mean "published to the open internet". The insert policy
   * below therefore requires the file name to be a fresh UUID: 122 bits, not
   * derivable from the uid, so the URL still has to come from the profile row —
   * which needs a session. Public-but-unguessable is the honest description,
   * and the regex is what keeps that sentence true rather than a comment
   * claiming it.
   *
   * WHAT THIS FILE CANNOT DO: make the client delete the old object when
   * somebody replaces their photo. Until it does, the previous picture stays
   * fetchable by anyone who kept its URL. The delete policy permits the
   * cleanup; only the client can perform it.
   *
   * 5 MB and an image allowlist. The app downscales before upload (256 px
   * square avatar, 1024x384 banner), so a real upload is tens of kilobytes; the
   * ceiling is for an original arriving by some other route. No SVG — an SVG is
   * a script that renders as a picture, and `media_assets` already excludes it
   * for that reason. No video path of any kind: this bucket holds stills.
   */
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('profile-media', 'profile-media', true, 5242880,
            array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update
      set public = true,
          file_size_limit = 5242880,
          allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  $sql$;

  /*
   * THE MIME ALLOWLIST IS ON THE BUCKET, NOT IN THE POLICY, AND THAT IS A
   * CORRECTION OF SOMETHING THIS PROJECT ALREADY TRIED.
   *
   * 20260902160000 reached for `metadata->>'mimetype'` inside an insert policy
   * and its own header records how that ended. The deeper problem with the
   * approach is that `metadata` is not reliably populated on the INSERT of the
   * object row, so a policy that requires a mime type can fail CLOSED and
   * reject every upload — a feature that is simply broken, with an error that
   * points at storage rather than at the policy.
   *
   * `allowed_mime_types` is enforced by the storage API before an object row
   * exists at all, so it cannot be in that race. The policy then pins the file
   * EXTENSION, which lives in the object name and is therefore always present.
   * Belt and braces, and neither strap depends on a field that may not be there
   * yet.
   *
   * PATH: <uid>/avatar/<uuid>.<ext> and <uid>/banner/<uuid>.<ext>. The uid
   * comes first because that is what the policies match on, exactly as
   * `operator-media` matches on the company id in the first segment.
   */

  /*
   * SELECT — YOUR OWN FOLDER, AND THIS GOVERNS LISTING RATHER THAN DOWNLOADING.
   *
   * Said precisely because the alternative is a comment claiming a guarantee
   * the code does not keep: the bucket is public, so a DOWNLOAD through the
   * public object endpoint never consults this policy or any other. Nothing
   * here restricts who can fetch an avatar, and nothing could. What it does
   * restrict is enumeration through the storage API — one person cannot list
   * another person's folder and read back the very file names the unguessable
   * path was chosen to protect.
   */
  execute $sql$ drop policy if exists profile_media_list on storage.objects $sql$;
  execute $sql$
    create policy profile_media_list on storage.objects
      for select to authenticated
      using (
        bucket_id = 'profile-media'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
  $sql$;

  /*
   * INSERT — your own folder, one of two names, and a filename with entropy in
   * it. The UUID may be written with or without its dashes; either way it is
   * 32 hex digits, which is what `crypto.randomUUID()` gives the client for
   * free.
   */
  execute $sql$ drop policy if exists profile_media_insert on storage.objects $sql$;
  execute $sql$
    create policy profile_media_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'profile-media'
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(avatar|banner)/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      )
  $sql$;

  /*
   * UPDATE — both halves written out. Postgres would reuse the USING expression
   * as the check if WITH CHECK were omitted, which is what `post_media_update`
   * relies on; spelling it out means the rule that a file cannot be MOVED into
   * somebody else's folder is visible to whoever reads this next rather than
   * inferred from a default.
   */
  execute $sql$ drop policy if exists profile_media_update on storage.objects $sql$;
  execute $sql$
    create policy profile_media_update on storage.objects
      for update to authenticated
      using (
        bucket_id = 'profile-media'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
      with check (
        bucket_id = 'profile-media'
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(avatar|banner)/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      )
  $sql$;

  /*
   * DELETE — the owner, and nobody else. Staff are absent for the reason
   * `post_media_delete` gives: removing somebody's picture is a moderation
   * action, and moderation goes through `reports` and leaves an audit row
   * rather than through direct storage access.
   */
  execute $sql$ drop policy if exists profile_media_delete on storage.objects $sql$;
  execute $sql$
    create policy profile_media_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'profile-media'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
  $sql$;
exception
  when insufficient_privilege then
    /*
     * HOSTED SUPABASE OFTEN REFUSES THIS, AND IT MUST NOT BLOCK THE PUSH.
     * `storage.objects` is owned by `supabase_storage_admin` rather than by the
     * role a migration runs as, so `create policy` on it raises 42501 on some
     * projects and succeeds on others depending on when the project was made.
     * Letting that abort the transaction would take the columns in sections 1-9
     * down with it, which is a far worse outcome than a bucket that needs five
     * minutes in the dashboard.
     *
     * Nothing half-works silently as a result: the client has no bucket name to
     * write to until somebody confirms this exists, and an app that cannot
     * confirm it must say the photo has nowhere to go rather than pretend an
     * upload succeeded.
     */
    raise warning 'profile-media bucket/policies NOT created: %', sqlerrm;
    raise warning 'Create it by hand: Supabase dashboard -> Storage -> New bucket, name "profile-media", PUBLIC, file size limit 5MB, allowed MIME types image/jpeg image/png image/webp. Then Storage -> Policies -> New policy on objects, all four to authenticated, each requiring bucket_id = ''profile-media'' AND (storage.foldername(name))[1] = auth.uid()::text; on INSERT and UPDATE additionally require the object name to match ''^<uuid>/(avatar|banner)/<uuid>.(jpg|jpeg|png|webp)$'' so the file name is unguessable.';
end $$;

/* ==========================================================================
 * WHAT IS STILL NOT SOLVED, so nobody reads this file as the finished feature.
 *
 * 1. The app still saves to localStorage. Every column above is unreachable
 *    until `Sections.tsx` writes to the server and reads the row back — and
 *    until then no screen may show a "Saved" tick, because nothing is.
 * 2. An edit made offline. The doctrine is that it must not be silently lost
 *    and must not be silently claimed as saved either, which is a queue and a
 *    pending state in the client. The database cannot supply either.
 * 3. `username` still moves only through `claim_username`, by design. The
 *    Edit-profile screen currently renders it as an ordinary text field, which
 *    will fail against the update policy the moment it is wired up.
 * 4. Nothing deletes the previous avatar object when a new one is uploaded.
 * ========================================================================== */
