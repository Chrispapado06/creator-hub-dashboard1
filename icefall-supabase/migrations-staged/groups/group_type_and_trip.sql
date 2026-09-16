/* ==========================================================================
 * Group type and trip — file 3 of the groups rebuild.
 *
 * STAGED, NOT APPLIED. Plan: icefall-app/docs/groups-structure-plan.md §6.2,
 * file 3, with OWNER RULING 2 of 16 Sep 2026 ("when you create a group it
 * doesn't have to be mountain related"). D12: no timestamp here, the owner's
 * `mv` gives it one. No gate of any kind (D10).
 *
 * Apply AFTER groups_hardening.sql and group_roles.sql.
 *
 * ── WHAT A GROUP IS, AFTER THIS FILE ────────────────────────────────────────
 *
 * Until now a group was one row that HAD TO be about a mountain in ICEFALL's
 * catalogue: `destination_id` was NOT NULL and a trigger refused anything whose
 * `destinations.kind` was not 'mountain'. The owner has said a group may be
 * about a trek, a region, an identity ("women who climb") or nothing in
 * particular, so:
 *
 *   - `destination_id` becomes NULLABLE. A group with one is filed against that
 *     catalogue row exactly as before; a group without one carries a `topic`,
 *     which is 80 characters of the group's own words.
 *   - `about` says which of the five a group is, and it is DERIVED from the
 *     destination when there is one. It cannot disagree with it.
 *   - `kind` is 'team' (one objective, dates, a plan) or 'community' (an open
 *     room). Every existing row is a team, which is what Q9 confirmed.
 *
 * THE TOPIC IS NOT A PLACE AND IS NEVER TREATED AS ONE. It is a label somebody
 * typed. Nothing joins on it, nothing resolves it to coordinates, and no screen
 * may draw a mountain page link, an elevation or a cover photograph from it.
 *
 * ── THE REST OF THE TRIP ────────────────────────────────────────────────────
 *
 * `ends_on`, `capacity`, `experience`, `route_label`, `language`,
 * `description`, `cover_path` and `cover_credit`. EVERY ONE IS NULLABLE and
 * null means NOT SET — never "unknown, so assume the usual". The app renders
 * nothing where a field is null; it does not fill one in.
 *
 * `origin_ref` is how a group that began on somebody's phone says so, and it is
 * what makes the move in file S6 safe to repeat.
 *
 * ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
 *
 *   A. The columns, their checks and their indexes.
 *   B. `destination_id` becomes nullable; the "is a mountain" trigger becomes
 *      "the subject is coherent", which also derives and pins `about`, and
 *      keeps `official` a staff-only claim.
 *   C. `groups_guard` restated: `kind`, `official` and `origin_ref` are facts
 *      once written, and `official` moves only under a staff account.
 *   D. `groups_update` moves from the creator to the ORGANISER (file 2 left it
 *      here deliberately, because this is the file that gives them something to
 *      edit).
 *   E. A capacity trigger on `group_members` that takes the group's row lock
 *      before it counts, so two joins at once cannot overfill a group.
 *   F. `group_import_device(...)` — the one write path for a phone group, and
 *      idempotent, so a tap that is repeated returns the same group.
 *   G. `group_discover(...)` — the Discover list, paged, counted with the
 *      DEFINER `member_count`, and hiding groups nobody is in (D16).
 *
 * ── THE ONE ASSUMPTION, WRITTEN DOWN ────────────────────────────────────────
 *
 * The SECURITY DEFINER code below reads `group_members`, a FORCE ROW LEVEL
 * SECURITY table whose select policy is members-only. It works because the
 * owning role holds BYPASSRLS — the assumption 20260911200000, groups_hardening
 * and group_roles already record for this schema. The capacity test therefore
 * asserts that a join is REFUSED rather than that a trigger exists.
 *
 * Safe to run twice: every statement replaces or skips what it creates, and the
 * backfill only fills a row that has nothing in it.
 *
 * APPLY BY HAND, ONE FILE AT A TIME (plan §6.3). Nothing here applies itself.
 * ========================================================================== */

/* -------------------------------------------------------------------------- */
/* A. The columns                                                             */
/* -------------------------------------------------------------------------- */

alter table public.groups add column if not exists kind text not null default 'team';
alter table public.groups drop constraint if exists groups_kind_known;
alter table public.groups
  add constraint groups_kind_known check (kind in ('team', 'community'));

comment on column public.groups.kind is
  'team = a party going to one objective on one set of dates: it has a plan, a '
  'kit list and a size. community = an open room about a subject, with no plan '
  'and no dates. DEFAULT team, which is what every row created before this file '
  'is. A group cannot change from one to the other — see groups_guard.';

/*
 * `official` is ICEFALL's own claim about a group, so only ICEFALL can make it.
 * The insert arm is in the coherence trigger below and the update arm is in the
 * guard; a column default of false means a client that never mentions it can
 * never set it by accident.
 */
alter table public.groups add column if not exists official boolean not null default false;

comment on column public.groups.official is
  'TRUE means ICEFALL runs this group, not a member. Staff-only, on the way in '
  'and afterwards, and at most one per destination. It is a claim about who is '
  'speaking, so it is never something a member can set about their own group.';

/*
 * THE SUBJECT. `topic` is free text and `about` says what sort of thing it is.
 *
 * `about` is nullable in the column and NOT NULL by the time a row exists: the
 * coherence trigger fills it from the destination when a client did not send
 * one, which is what keeps every client written before this file working. A
 * DEFAULT could not do that — a default is applied BEFORE the trigger runs, so
 * "not supplied" and "supplied as 'mountain'" would be the same thing.
 */
alter table public.groups add column if not exists topic text;
alter table public.groups drop constraint if exists groups_topic_length;
alter table public.groups
  add constraint groups_topic_length check (topic is null or length(trim(topic)) between 1 and 80);

comment on column public.groups.topic is
  'What the group is about, in its own words, when that is not a catalogue row '
  '("Women who climb", "Chamonix locals", or a peak ICEFALL has no record of). '
  'A LABEL AND NOT A PLACE: nothing joins on it, nothing resolves it to a '
  'mountain, and no screen may draw an elevation or a cover photograph from it.';

alter table public.groups add column if not exists about text;
alter table public.groups drop constraint if exists groups_about_known;
alter table public.groups
  add constraint groups_about_known
  check (about is null or about in ('mountain', 'region', 'trek', 'identity', 'other'));

comment on column public.groups.about is
  'Which sort of subject: mountain, region, trek, identity or other. Where the '
  'group is filed against a destination this EQUALS that destination''s kind — '
  'the coherence trigger derives it and refuses a disagreement — so a group '
  'cannot say it is about a mountain while pointing at a trek.';

alter table public.groups add column if not exists ends_on date;

alter table public.groups drop constraint if exists groups_dates_ordered;
alter table public.groups
  add constraint groups_dates_ordered
  check (ends_on is null or intended_on is null or ends_on >= intended_on);

comment on column public.groups.ends_on is
  'The last day of the window. NULL means not set, exactly as intended_on does; '
  'a group with a start and no end has not decided, and nothing may render the '
  'start twice to fill the gap.';

alter table public.groups add column if not exists capacity smallint;
alter table public.groups drop constraint if exists groups_capacity_range;
alter table public.groups
  add constraint groups_capacity_range check (capacity is null or capacity between 2 and 50);

comment on column public.groups.capacity is
  'How many places the group has, counting the organiser. NULL = no limit set, '
  'which is not the same as a limit of nobody. The floor is 2 because a group '
  'of one is not a group; the trigger below enforces the number on the way in.';

alter table public.groups add column if not exists experience text;
alter table public.groups drop constraint if exists groups_experience_known;
alter table public.groups
  add constraint groups_experience_known
  check (experience is null or experience in ('beginner', 'intermediate', 'advanced', 'expert'));

comment on column public.groups.experience is
  'The standing the group is looking for, on the network scale in '
  'icefall-app/src/network/types.ts. SELF-DECLARED BY THE GROUP and never '
  'measured: it is not read from anybody''s training, and it admits nobody and '
  'refuses nobody on its own.';

alter table public.groups add column if not exists route_label text;
alter table public.groups drop constraint if exists groups_route_label_length;
alter table public.groups
  add constraint groups_route_label_length
  check (route_label is null or length(trim(route_label)) between 1 and 120);

alter table public.groups add column if not exists language text;
alter table public.groups drop constraint if exists groups_language_known;
alter table public.groups
  add constraint groups_language_known
  check (language is null or language in ('en', 'fr', 'de', 'es', 'it', 'other'));

comment on column public.groups.language is
  'The language the group talks in, as the group says. Five plus "other" — the '
  'list ICEFALL''s own surfaces are written in. NULL means they have not said, '
  'which is not English.';

alter table public.groups add column if not exists description text;
alter table public.groups drop constraint if exists groups_description_length;
alter table public.groups
  add constraint groups_description_length
  check (description is null or length(trim(description)) between 1 and 1000);

alter table public.groups add column if not exists cover_path text;
alter table public.groups add column if not exists cover_credit text;
alter table public.groups drop constraint if exists groups_cover_credit_length;
alter table public.groups
  add constraint groups_cover_credit_length
  check (cover_credit is null or length(trim(cover_credit)) between 1 and 200);

comment on column public.groups.cover_credit is
  'Who took the photograph at cover_path. A picture whose source ICEFALL cannot '
  'name is a picture it should not be showing, so this travels with the path '
  'rather than being looked up later.';

alter table public.groups add column if not exists origin_ref text;
alter table public.groups drop constraint if exists groups_origin_ref_length;
alter table public.groups
  add constraint groups_origin_ref_length
  check (origin_ref is null or length(trim(origin_ref)) between 1 and 120);

comment on column public.groups.origin_ref is
  'The id this group had on the phone it was made on, for a group moved up by '
  'group_import_device. It exists to make that move REPEATABLE: with the unique '
  'index below, a second tap returns the group the first one made instead of a '
  'second copy. Never shown to anybody.';

/*
 * ONE GROUP PER PHONE-GROUP, PER ACCOUNT. Partial, because every group made in
 * the app has a null here and null is not equal to null.
 */
create unique index if not exists groups_origin_ref_once
  on public.groups (created_by, origin_ref)
  where origin_ref is not null;

/* One official group per destination (Q3 is still open about who makes them). */
create unique index if not exists groups_one_official_per_destination
  on public.groups (destination_id)
  where official and destination_id is not null;

create index if not exists groups_kind_idx on public.groups (kind, created_at desc);
create index if not exists groups_about_idx on public.groups (about, created_at desc);

/* -------------------------------------------------------------------------- */
/* B. A group does not have to be about a mountain                            */
/* -------------------------------------------------------------------------- */

/*
 * The column was NOT NULL with a comment saying a group is a mountain. Both go.
 * The foreign key stays exactly as it was — RESTRICT, so tidying the catalogue
 * cannot silently take other people's plans with it.
 */
alter table public.groups alter column destination_id drop not null;

comment on column public.groups.destination_id is
  'The catalogue row this group is filed against, or NULL when it is not about '
  'a place ICEFALL holds — a region, an identity, or a peak the catalogue has '
  'no record of. When it is set, `about` equals that row''s kind.';

/*
 * The subject is coherent, and `official` is ICEFALL''s word.
 *
 * REPLACES `groups_destination_is_a_mountain` (20260902100000:194-212), which
 * raised on every destination whose kind was not 'mountain'. Three jobs:
 *
 *   1. A destination that is given must EXIST. The foreign key says so too, but
 *      it is checked at the end of the statement and this runs first, so the
 *      message is about a catalogue rather than about a constraint.
 *   2. `about` is derived from that row's kind when the client did not send
 *      one, and refused when it disagrees with it. This is what stops a group
 *      calling itself a mountain while pointing at a trek, and it is also what
 *      keeps every client written before this file working: they send a
 *      mountain and no `about`, and get 'mountain'.
 *   3. `official` cannot be claimed on the way in by anybody but staff.
 *
 * A group with NO destination may be about anything, 'mountain' included: that
 * is a peak ICEFALL has no catalogue row for, which is exactly what a phone
 * group moved up by file F may be.
 */
create or replace function public.groups_subject_is_coherent()
returns trigger
language plpgsql
as $$
declare
  v_kind text;
begin
  if new.destination_id is not null then
    select kind into v_kind from public.destinations where id = new.destination_id;
    if v_kind is null then
      raise exception 'ICEFALL has no destination called % — a group is filed against the catalogue or against nothing', new.destination_id;
    end if;
    if new.about is null then
      new.about := v_kind;
    elsif new.about is distinct from v_kind then
      raise exception 'a group filed against % cannot be about a % — that destination is a %', new.destination_id, new.about, v_kind;
    end if;
  elsif new.about is null then
    new.about := 'other';
  end if;

  if tg_op = 'INSERT' and new.official and not public.is_staff() then
    raise exception 'official is ICEFALL''s own mark, and only staff can set it'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists groups_destination_kind on public.groups;
/* The old function has no caller once that trigger is gone. Dropped rather than
   left behind, so nothing can be pointed back at it by accident. Re-running
   20260902100000 would restore both, which is why that file is never re-run. */
drop function if exists public.groups_destination_is_a_mountain();

drop trigger if exists groups_subject on public.groups;
create trigger groups_subject
  before insert or update on public.groups
  for each row execute function public.groups_subject_is_coherent();

/* Existing rows: every one of them is a mountain team, because that is the only
   thing the schema allowed until now. Only fills what is empty, so a second run
   changes nothing. */
update public.groups set about = 'mountain' where about is null and destination_id is not null;
update public.groups set about = 'other' where about is null;

alter table public.groups alter column about set not null;

/* -------------------------------------------------------------------------- */
/* C. What is a fact, and what is a field                                     */
/* -------------------------------------------------------------------------- */

/*
 * `groups_guard` restated in full for the third time (20260902100000, then
 * group_roles, now here) because a trigger function cannot be amended. What is
 * ADDED here:
 *
 *   - `kind` cannot change. A team is a party with a plan, a kit list and a
 *     size; turning one into a community would take the plan away from the
 *     people who joined it, and turning a community into a team would give a
 *     room full of strangers a shared kit list.
 *   - `official` moves only under a staff account, in either direction.
 *   - `origin_ref` cannot change. It is where the group came from, and the
 *     unique index that makes the phone move repeatable rests on it.
 *
 * `destination_id` STAYS IMMUTABLE, in both directions, including from NULL.
 * People joined the subject on the card; attaching a mountain to a group they
 * joined as "Chamonix locals" changes what it is. A group for a different
 * subject is a different group. `about` and `topic` may be corrected, and the
 * coherence trigger above still has to agree with them.
 */
create or replace function public.groups_guard()
returns trigger
language plpgsql
as $$
begin
  if new.destination_id is distinct from old.destination_id then
    raise exception 'a group is about its subject — make a new group for a different one';
  end if;
  if new.created_by is distinct from old.created_by
     and not (old.created_by is not null and new.created_by is null) then
    raise exception 'a group''s origin is a fact, not a field';
  end if;
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'a group''s origin is a fact, not a field';
  end if;
  if new.kind is distinct from old.kind then
    raise exception 'a team and a community are different things — make the other one';
  end if;
  if new.origin_ref is distinct from old.origin_ref then
    raise exception 'a group''s origin is a fact, not a field';
  end if;
  if new.official is distinct from old.official and not public.is_staff() then
    raise exception 'official is ICEFALL''s own mark, and only staff can set it'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists groups_guard on public.groups;
create trigger groups_guard
  before update on public.groups
  for each row execute function public.groups_guard();

/* -------------------------------------------------------------------------- */
/* D. The organiser edits the group                                           */
/* -------------------------------------------------------------------------- */

/*
 * Until this file there was nothing on the row worth editing but the name and
 * the date, so `groups_update` stayed with `created_by` and file 2 said it
 * would move here. It moves now: the person who RUNS the group keeps its dates,
 * its description and its cover current, and a founder who handed it on and
 * walked away does not.
 *
 * `groups_delete` is NOT touched, and deliberately: deleting a group other
 * people joined is not a power to widen in passing. It stays with the creator
 * and staff, as 20260902100000 wrote it.
 */
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update to authenticated
  using (public.is_group_organiser(id) or public.is_staff())
  with check (public.is_group_organiser(id) or public.is_staff());

/* -------------------------------------------------------------------------- */
/* E. A group cannot be overfilled                                            */
/* -------------------------------------------------------------------------- */

/*
 * SECURITY DEFINER, and it has to be: `group_members_select` is members-only,
 * so a person joining — who is not a member yet — would count zero rows as
 * themselves and always find room.
 *
 * `select ... for update` ON THE GROUP ROW FIRST, then the count. Two people
 * taking the last place at the same moment serialise on that lock, so the
 * second one counts the first one's row and is refused. Counting first and
 * locking afterwards would let both through, which is the bug this shape
 * exists to prevent.
 *
 * The creator's own seat cannot be refused by it: capacity is at least 2, and
 * `groups_creator_joins` writes the first row.
 */
create or replace function public.group_members_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_capacity smallint;
  v_taken int;
begin
  select g.capacity into v_capacity
    from public.groups g
   where g.id = new.group_id
     for update;

  if v_capacity is null then
    return new;
  end if;

  select count(*) into v_taken
    from public.group_members m
   where m.group_id = new.group_id;

  if v_taken >= v_capacity then
    raise exception 'group_full — every place in this group is taken'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists group_members_capacity on public.group_members;
create trigger group_members_capacity
  before insert on public.group_members
  for each row execute function public.group_members_capacity();

/* -------------------------------------------------------------------------- */
/* F. Moving a group up from a phone                                          */
/* -------------------------------------------------------------------------- */

/*
 * One group, made by the person whose phone it was on, and SAFE TO CALL TWICE.
 *
 * INVOKER, not definer. It inserts a row the caller could insert themselves —
 * `groups_insert` pins `created_by` to `auth.uid()` — so nothing here is a
 * privilege the caller does not already have. It exists for the idempotence and
 * for the one place the mapping lives, not to get round a policy.
 *
 * WHAT IT DOES NOT TAKE, and this list is the promise the move makes (plan D5):
 * no members, no notes, no sessions, no messages and no checklist. A phone
 * group's `memberIds` are ids on that phone; seating them here would put people
 * in a group who never asked to be in it, and `group_members_insert` refuses it
 * anyway. The private writing stays private, on the phone.
 *
 * A peak the catalogue has no record of does NOT stop the move (owner ruling
 * 2): it comes up with no destination and its name as the topic. The caller
 * decides that — this function just files what it is given.
 */
create or replace function public.group_import_device(
  p_origin_ref text,
  p_name text,
  p_destination_id text default null,
  p_topic text default null,
  p_about text default null,
  p_visibility text default 'public',
  p_intended_on date default null,
  p_ends_on date default null,
  p_capacity smallint default null,
  p_experience text default null,
  p_description text default null
)
returns uuid
language plpgsql
as $$
declare
  me uuid := (select auth.uid());
  v_ref text := nullif(trim(p_origin_ref), '');
  v_id uuid;
begin
  if me is null then
    raise exception 'sign in to move a group to your account' using errcode = '28000';
  end if;
  if v_ref is null then
    raise exception 'a group moved from a phone needs the id it had there';
  end if;

  -- Already moved. The answer is the group the first tap made, every time.
  select g.id into v_id
    from public.groups g
   where g.created_by = me and g.origin_ref = v_ref;
  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.groups (
      destination_id, name, created_by, visibility, intended_on,
      kind, topic, about, ends_on, capacity, experience, description, origin_ref
    ) values (
      p_destination_id, p_name, me, coalesce(p_visibility, 'public'), p_intended_on,
      'team', nullif(trim(p_topic), ''), p_about, p_ends_on, p_capacity,
      p_experience, nullif(trim(p_description), ''), v_ref
    )
    returning id into v_id;
  exception when unique_violation then
    -- Two taps at once. One of them made it; both get that group.
    select g.id into v_id
      from public.groups g
     where g.created_by = me and g.origin_ref = v_ref;
    if v_id is null then
      raise;
    end if;
  end;

  return v_id;
end;
$$;

revoke all on function public.group_import_device(text, text, text, text, text, text, date, date, smallint, text, text)
  from public, anon;
grant execute on function public.group_import_device(text, text, text, text, text, text, date, date, smallint, text, text)
  to authenticated;

/* -------------------------------------------------------------------------- */
/* G. Discover                                                                */
/* -------------------------------------------------------------------------- */

/*
 * The list a person browses, filtered by the chips the app shows.
 *
 * INVOKER. It returns rows `groups_select` already shows this reader, and it
 * must stay that way: a DEFINER list would be a way round a policy that a later
 * file might tighten. The two counts it carries are the DEFINER computed fields
 * the table already has, so a stranger gets the true size of a group rather
 * than a count filtered by what they may read.
 *
 * GROUPS NOBODY IS IN ARE NOT LISTED (D16). A group whose every member has left
 * is a name with nothing behind it — asking to join it reaches nobody. The row
 * is kept; it is not shown.
 *
 * Paging is by `created_at`, newest first, with `p_before` as the cursor. The
 * limit is capped here as well as passed, so a client cannot ask for the table.
 */
create or replace function public.group_discover(
  p_query text default null,
  p_kind text default null,
  p_about text default null,
  p_from date default null,
  p_to date default null,
  p_experience text default null,
  p_language text default null,
  p_visibility text default null,
  p_limit int default 20,
  p_before timestamptz default null
)
returns table (
  id uuid,
  name text,
  kind text,
  about text,
  topic text,
  destination_id text,
  destination_name text,
  destination_kind text,
  visibility text,
  intended_on date,
  ends_on date,
  capacity smallint,
  experience text,
  language text,
  description text,
  cover_path text,
  cover_credit text,
  official boolean,
  created_at timestamptz,
  member_count int,
  joined_by_me boolean
)
language sql
stable
as $$
  select
    g.id, g.name, g.kind, g.about, g.topic,
    g.destination_id, d.name, d.kind,
    g.visibility, g.intended_on, g.ends_on, g.capacity,
    g.experience, g.language, g.description,
    g.cover_path, g.cover_credit, g.official, g.created_at,
    public.member_count(g), public.joined_by_me(g)
  from public.groups g
  left join public.destinations d on d.id = g.destination_id
  where (
      p_query is null
      or trim(p_query) = ''
      or g.name ilike '%' || trim(p_query) || '%'
      or coalesce(g.topic, '') ilike '%' || trim(p_query) || '%'
      or coalesce(d.name, '') ilike '%' || trim(p_query) || '%'
    )
    and (p_kind is null or g.kind = p_kind)
    and (p_about is null or g.about = p_about)
    and (p_from is null or (g.intended_on is not null and g.intended_on >= p_from))
    and (p_to is null or (g.intended_on is not null and g.intended_on <= p_to))
    and (p_experience is null or g.experience = p_experience)
    and (p_language is null or g.language = p_language)
    and (p_visibility is null or g.visibility = p_visibility)
    and (p_before is null or g.created_at < p_before)
    and public.member_count(g) > 0
  order by g.created_at desc, g.id desc
  limit least(coalesce(p_limit, 20), 50);
$$;

revoke all on function public.group_discover(text, text, text, date, date, text, text, text, int, timestamptz)
  from public, anon;
grant execute on function public.group_discover(text, text, text, date, date, text, text, text, int, timestamptz)
  to authenticated;
