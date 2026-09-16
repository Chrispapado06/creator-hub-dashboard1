/* ==========================================================================
 * Group roles — file 2 of the groups rebuild.
 *
 * STAGED, NOT APPLIED. Plan: icefall-app/docs/groups-structure-plan.md §6.2,
 * file 2, decision D3 (organiser is a role, and it is handed on), D14 (an
 * organiser may remove a post in their group) and D12 (no timestamp here; the
 * owner's `mv` gives it one). No gate of any kind (D10).
 *
 * Apply AFTER groups_hardening.sql.
 *
 * ── WHAT IS WRONG TODAY ─────────────────────────────────────────────────────
 *
 * Every power over a group is `is_group_founder(group_id)`, which is
 * `groups.created_by = auth.uid()`. Three consequences, none of them intended:
 *
 *   1. A founder who LEAVES keeps every power. They are off the roster, out of
 *      the conversation, and still the only person who can accept a request,
 *      remove a member or delete a message.
 *   2. A founder who DELETES THEIR ACCOUNT takes the powers with them.
 *      `created_by` goes null, and a private group is then a room whose door
 *      nobody can open: people ask, and there is nobody the ask reaches.
 *   3. NOBODY WHO HAS STARTED A GROUP CAN DELETE THEIR ACCOUNT AT ALL. The
 *      column is `on delete set null`, and `groups_guard` (20260902100000)
 *      raises on ANY change to `created_by` — including that one. The cascade
 *      hits the trigger and the whole delete fails. Fixed below.
 *
 * ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
 *
 *   A. `group_members.role` — 'organiser' or 'member', one organiser per group.
 *   B. The client can never write it: INSERT is granted column by column, and
 *      there is still no UPDATE grant or policy on the table at all. The role
 *      is set by two triggers and one RPC, all SECURITY DEFINER, and by nothing
 *      else.
 *   C. The founder-based policies become organiser-based.
 *   D. `group_transfer_organiser` hands the group on deliberately.
 *   E. Leaving, or being removed, or deleting the account, promotes the
 *      earliest-joined remaining member (D3).
 *   F. `groups_guard` lets `created_by` go null — and only null — so an account
 *      can be deleted.
 *   G. `has_organiser(groups)` so a stranger can be told whether a private
 *      group has anybody who could answer a request, without reading a roster
 *      they are not allowed to read.
 *
 * ── WHAT IS DELIBERATELY NOT CHANGED ────────────────────────────────────────
 *
 *   - `groups_update` and `groups_delete` stay with `created_by` and staff.
 *     Moving the group's own row to the organiser belongs with the columns
 *     file 3 adds for them to edit, and deleting a group other people joined is
 *     not a power to widen in passing.
 *   - `group_members_insert` keeps its creation seat, and it is the ONE place
 *     that still asks who MADE the group rather than who runs it: the seat is
 *     written by `groups_creator_joins` in the same transaction as the group,
 *     before any member row and therefore before any role exists. It now calls
 *     `is_group_creator` so the two questions have two names.
 *   - `group_messages.author_id` stays RESTRICT (owner question Q8), so anyone
 *     who has spoken in a group chat still cannot delete their account. Fix F
 *     removes the other blocker, not that one.
 *
 * ── THE ONE ASSUMPTION, WRITTEN DOWN ────────────────────────────────────────
 *
 * The SECURITY DEFINER code below writes `group_members`, a FORCE ROW LEVEL
 * SECURITY table with no UPDATE policy. That works because the owning role
 * holds BYPASSRLS, which is the assumption 20260911200000 and groups_hardening
 * already record for this schema. If it ever stops being true, the promotion
 * trigger silently promotes nobody — so `groups-roles.test.mjs` asserts the
 * promotion happens rather than asserting the trigger exists.
 *
 * Safe to run twice: every statement replaces or skips what it creates, and the
 * backfill only fills a group that has no organiser.
 *
 * APPLY BY HAND, ONE FILE AT A TIME (plan §6.3). Nothing here applies itself.
 * ========================================================================== */

/* -------------------------------------------------------------------------- */
/* A. The column                                                              */
/* -------------------------------------------------------------------------- */

alter table public.group_members
  add column if not exists role text not null default 'member';

alter table public.group_members drop constraint if exists group_members_role_known;
alter table public.group_members
  add constraint group_members_role_known check (role in ('organiser', 'member'));

comment on column public.group_members.role is
  'organiser = the person who runs this group: they answer requests to join, '
  'remove members, and remove messages and posts. member = everybody else. '
  'DEFAULT member, and a client cannot write this column at all — the INSERT '
  'privilege is granted column by column below and there is no UPDATE policy. '
  'It changes through group_transfer_organiser or the promotion trigger, and '
  'nowhere else.';

/*
 * ONE ORGANISER PER GROUP, enforced by the schema rather than by the three
 * places that write the column agreeing with each other.
 *
 * It also makes "the last organiser left" a question with one answer, which is
 * what the promotion trigger below has to be sure of. A co-organiser feature,
 * if it is ever wanted, drops this index in its own migration and says so.
 */
create unique index if not exists group_members_one_organiser
  on public.group_members (group_id)
  where role = 'organiser';

/* -------------------------------------------------------------------------- */
/* B. A client cannot write the role                                          */
/* -------------------------------------------------------------------------- */

/*
 * WHY A COLUMN GRANT AND NOT A POLICY. The obvious guard — `and role =
 * 'member'` in `group_members_insert` — cannot work: a WITH CHECK is evaluated
 * AFTER before-row triggers, so it would see the 'organiser' that the seating
 * trigger below has just set on the founder's own row and refuse the creation
 * of every group. A privilege is checked against the columns the statement
 * NAMES, before any of that, so it stops `insert (..., role) values (...,
 * 'organiser')` from any client, in any group, without touching the seat.
 *
 * Without this, anyone holding the anon key could make themselves the organiser
 * of any public group with one insert — and organiser is a moderation power.
 *
 * `joined_at` is not granted either. It was never written by the app (both
 * inserts name exactly these two columns) and when somebody joined is a fact,
 * like `requested_at` next door.
 */
revoke insert on public.group_members from anon, authenticated;
grant insert (group_id, profile_id) on public.group_members to authenticated;

/* -------------------------------------------------------------------------- */
/* C. Who is who                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The person who runs this group. DEFINER for the same reason
 * `is_group_member` is: a non-member must be able to be told "no" without
 * being able to read the roster to work it out.
 */
create or replace function public.is_group_organiser(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.group_members m
     where m.group_id = g
       and m.profile_id = (select auth.uid())
       and m.role = 'organiser'
  );
$$;

revoke all on function public.is_group_organiser(uuid) from public, anon;
grant execute on function public.is_group_organiser(uuid) to authenticated;

/**
 * The person who MADE this group — `groups.created_by`, which is the old
 * `is_group_founder` body under the name of the question it actually asks.
 *
 * It has exactly one caller: the creation seat in `group_members_insert`.
 * Nothing else should use it, because "made it" stops being "runs it" the
 * moment the group is handed on.
 */
create or replace function public.is_group_creator(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.groups gr
     where gr.id = g and gr.created_by = (select auth.uid())
  );
$$;

revoke all on function public.is_group_creator(uuid) from public, anon;
grant execute on function public.is_group_creator(uuid) to authenticated;

/**
 * `is_group_founder` is KEPT, as a wrapper over `is_group_organiser`.
 *
 * Every policy that ever called it meant "the person who runs this group", and
 * that person is now the organiser — so an older file re-run (groups_hardening
 * restates `group_members_delete` with this name), or any caller written
 * against it, keeps asking the question it meant to ask rather than quietly
 * asking a different one.
 *
 * New code calls `is_group_organiser` or `is_group_creator`. This name is not
 * used anywhere in the schema after this file.
 */
create or replace function public.is_group_founder(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_group_organiser(g);
$$;

revoke all on function public.is_group_founder(uuid) from public, anon;
grant execute on function public.is_group_founder(uuid) to authenticated;

/**
 * PostgREST computed field: `groups?select=*,has_organiser`.
 *
 * DEFINER, exactly like `member_count`, and for the same reason: the question
 * is asked by people who cannot read the roster. A stranger looking at a
 * private group needs to know whether an ask would reach anybody, and the
 * alternative the app had to use — `created_by is null` — stops being the same
 * question the moment this file is applied, because an unowned group now has a
 * promoted organiser.
 *
 * It answers a BOOLEAN and never a name: who runs a group is in the roster,
 * which is members-only, and this must not become a way round that.
 */
create or replace function public.has_organiser(g public.groups)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.group_members m
     where m.group_id = g.id and m.role = 'organiser'
  );
$$;

revoke all on function public.has_organiser(public.groups) from public, anon;
grant execute on function public.has_organiser(public.groups) to authenticated;

/* -------------------------------------------------------------------------- */
/* D. Seating the creator as the organiser                                    */
/* -------------------------------------------------------------------------- */

/**
 * BEFORE INSERT on `group_members`: the person who made the group is its
 * organiser, if it has not got one.
 *
 * `groups_creator_joins` (20260902100000) is INVOKER by a deliberate decision
 * recorded there, and a client cannot name `role` (B), so the seat could not
 * carry the role with it. This trigger puts it on.
 *
 * "IF IT HAS NOT GOT ONE" is what stops it being a back door: a creator who
 * left a group that has since promoted somebody else rejoins as an ordinary
 * member. Anyone else joining any group is always a member.
 *
 * DEFINER because it reads `group_members` and `groups` to decide, and a
 * stranger joining a public group can read neither.
 */
create or replace function public.group_members_seat_the_organiser()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role = 'organiser' then
    return new;
  end if;
  if exists (
    select 1 from public.group_members m
     where m.group_id = new.group_id and m.role = 'organiser'
  ) then
    return new;
  end if;
  if exists (
    select 1 from public.groups g
     where g.id = new.group_id and g.created_by = new.profile_id
  ) then
    new.role := 'organiser';
  end if;
  return new;
end;
$$;

drop trigger if exists group_members_seat_the_organiser on public.group_members;
create trigger group_members_seat_the_organiser
  before insert on public.group_members
  for each row execute function public.group_members_seat_the_organiser();

/* -------------------------------------------------------------------------- */
/* E. Handing the group on when the organiser goes (D3)                       */
/* -------------------------------------------------------------------------- */

/**
 * AFTER DELETE on `group_members`: if the organiser has gone, the
 * earliest-joined remaining member takes over.
 *
 * It covers all three ways they can go — leaving, being removed, and their
 * account being deleted (`profile_id` cascades) — because all three are the
 * same delete.
 *
 * THE GROUP MAY BE GOING TOO. When a group is deleted its member rows cascade,
 * and the parent row is already gone by the time this runs, so the existence
 * test below leaves a group that is being deleted alone rather than promoting
 * somebody into it on the way out.
 *
 * Ties are broken by `profile_id`, so two people who joined in the same
 * transaction give one answer and not two.
 */
create or replace function public.group_members_promote_next_organiser()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_id uuid;
begin
  if old.role is distinct from 'organiser' then
    return old;
  end if;
  if not exists (select 1 from public.groups g where g.id = old.group_id) then
    return old;
  end if;
  if exists (
    select 1 from public.group_members m
     where m.group_id = old.group_id and m.role = 'organiser'
  ) then
    return old;
  end if;

  select m.profile_id
    into next_id
    from public.group_members m
   where m.group_id = old.group_id
   order by m.joined_at asc, m.profile_id asc
   limit 1;

  if next_id is null then
    /* Nobody left. The group keeps its row and has no organiser, which
       `has_organiser` reports honestly and the app draws as "nobody to ask". */
    return old;
  end if;

  update public.group_members
     set role = 'organiser'
   where group_id = old.group_id and profile_id = next_id;

  return old;
end;
$$;

drop trigger if exists group_members_promote_next_organiser on public.group_members;
create trigger group_members_promote_next_organiser
  after delete on public.group_members
  for each row execute function public.group_members_promote_next_organiser();

/**
 * Handing it on deliberately, while still in the group.
 *
 * DEFINER, because `group_members` has no UPDATE policy and no UPDATE grant —
 * that is the point: this function and the trigger above are the only two ways
 * the column moves. It therefore checks the caller itself, first.
 *
 * Demote, then promote: the unique index allows one organiser at a time, and
 * one statement doing both would collide with itself.
 */
create or replace function public.group_transfer_organiser(p_group uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'sign in to hand a group on' using errcode = '28000';
  end if;
  if not (public.is_group_organiser(p_group) or public.is_staff()) then
    raise exception 'only the organiser can hand this group on'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.group_members m
     where m.group_id = p_group and m.profile_id = p_profile
  ) then
    raise exception 'that person is not in this group'
      using errcode = 'foreign_key_violation';
  end if;

  update public.group_members
     set role = 'member'
   where group_id = p_group and role = 'organiser' and profile_id <> p_profile;

  update public.group_members
     set role = 'organiser'
   where group_id = p_group and profile_id = p_profile;
end;
$$;

revoke all on function public.group_transfer_organiser(uuid, uuid) from public, anon;
grant execute on function public.group_transfer_organiser(uuid, uuid) to authenticated;

/* -------------------------------------------------------------------------- */
/* F. An account with a group behind it can be deleted                        */
/* -------------------------------------------------------------------------- */

/*
 * `groups_guard` (20260902100000) is restated in full, because a trigger
 * function cannot be amended either. ONE ARM CHANGES: `created_by` may go from
 * somebody to NOBODY, and only in that direction.
 *
 * That is the `on delete set null` the column was declared with. Without this
 * the cascade raises and the account deletion fails — so today, in production,
 * anybody who has ever started a group cannot delete their ICEFALL account.
 *
 * Everything else the guard said still holds: the mountain does not move, the
 * id and the creation time are facts, and nobody can be written INTO
 * `created_by`, so a group cannot be handed to a person by rewriting its
 * origin. Handing it on is `group_transfer_organiser`.
 *
 * The destination arm is unchanged here; file 3 rewrites it for groups that
 * are not about a peak.
 */
create or replace function public.groups_guard()
returns trigger
language plpgsql
as $$
begin
  if new.destination_id is distinct from old.destination_id then
    raise exception 'a group is about its mountain — make a new group for a different one';
  end if;
  if new.created_by is distinct from old.created_by
     and not (old.created_by is not null and new.created_by is null) then
    raise exception 'a group''s origin is a fact, not a field';
  end if;
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'a group''s origin is a fact, not a field';
  end if;
  return new;
end;
$$;

/* The trigger itself is unchanged; restated so this file is safe to run on a
   database where it was dropped by hand. */
drop trigger if exists groups_guard on public.groups;
create trigger groups_guard
  before update on public.groups
  for each row execute function public.groups_guard();

/* -------------------------------------------------------------------------- */
/* G. The policies follow the role                                            */
/* -------------------------------------------------------------------------- */

/*
 * A policy cannot be amended, only replaced, so each of these is a full copy of
 * what the last file to touch it left in place, with `is_group_founder` read as
 * `is_group_organiser` and nothing else moved. Dropping an arm here would undo
 * somebody's decision silently — the block rule (20260903010000) and the staff
 * arms are each one of those.
 */

/* ---- the creation seat: the one place that means "made it" ---------------- */

/*
 * From 20260902220000, with `is_group_founder` replaced by `is_group_creator`.
 * The meaning is unchanged: it is what lets `groups_creator_joins` seat the
 * creator of a PRIVATE group, which has no accepted request to ride in on.
 */
drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (
      public.is_group_creator(group_id)
      or exists (
        select 1 from public.groups g
         where g.id = group_id and g.visibility = 'public'
      )
      or exists (
        select 1 from public.group_join_requests r
         where r.group_id = group_members.group_id
           and r.profile_id = (select auth.uid())
           and r.accepted_at is not null
      )
    )
  );

/* ---- removing a member: from groups_hardening, now organiser-based -------- */

drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members
  for delete to authenticated
  using (
    profile_id = (select auth.uid())
    or public.is_group_organiser(group_id)
    or public.is_staff()
  );

/* ---- requests: the organiser reads them and the organiser answers --------- */

drop policy if exists group_join_requests_select on public.group_join_requests;
create policy group_join_requests_select on public.group_join_requests
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or public.is_group_organiser(group_id)
  );

/*
 * The WITH CHECK repeats the organiser test for the reason 20260902220000 gives:
 * a USING clause alone would let the decision be handed to somebody else by
 * rewriting the row. The freeze trigger from groups_hardening stops the other
 * half — moving the ask to another group.
 */
drop policy if exists group_join_requests_update on public.group_join_requests;
create policy group_join_requests_update on public.group_join_requests
  for update to authenticated
  using (public.is_group_organiser(group_id))
  with check (
    public.is_group_organiser(group_id)
    and decided_by = (select auth.uid())
  );

/* ---- the conversation: from 20260903010000, staff arm kept ---------------- */

drop policy if exists group_messages_delete on public.group_messages;
create policy group_messages_delete on public.group_messages
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or public.is_group_organiser(group_id)
    or public.is_staff()
  );

/* ---- posts: D14, one rule for the room ------------------------------------ */

/*
 * From 20260831190000, plus the group arm. An organiser can already remove a
 * MESSAGE in their group; a post written into the same group, readable by the
 * same eleven people, could be removed by nobody but its author. D14 makes the
 * two one rule.
 *
 * `group_id is not null and is_group_organiser(group_id)` — the null test is
 * not decoration: without it every ordinary post on the platform would be
 * offered to `is_group_organiser(null)`, which answers false, but the arm would
 * be evaluated for every row in every feed read for no reason.
 *
 * ONE DELIBERATE DEVIATION FROM THE 20260831190000 TEXT: `auth.uid()` is
 * wrapped as `(select auth.uid())`, the hoist 20260829210000 applied across the
 * schema and 20260912090000 applied to `posts_insert`. It changes no outcome.
 */
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or (company_id is not null and public.is_company_admin(company_id))
    or (group_id is not null and public.is_group_organiser(group_id))
    or public.is_staff()
  );

/* -------------------------------------------------------------------------- */
/* H. The backfill                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Every group that has no organiser gets one: the person who made it if they
 * are still a member, and otherwise the earliest-joined member.
 *
 * WRITTEN AS A FUNCTION, not as a bare UPDATE, for two reasons: it is called
 * again at the bottom of this file so a re-run is harmless, and
 * `groups-roles.test.mjs` can build a group as it looked BEFORE this file and
 * then call it — which is the only way to test a backfill on a database the
 * migration has already run against.
 *
 * Not granted to anon or authenticated: it is the owner's tool, not an API.
 */
create or replace function public.group_roles_backfill()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n int := 0;
begin
  with without_one as (
    select g.id, g.created_by
      from public.groups g
     where not exists (
       select 1 from public.group_members m
        where m.group_id = g.id and m.role = 'organiser'
     )
  ),
  pick as (
    select w.id as group_id,
           coalesce(
             (select m.profile_id from public.group_members m
               where m.group_id = w.id and m.profile_id = w.created_by),
             (select m.profile_id from public.group_members m
               where m.group_id = w.id
               order by m.joined_at asc, m.profile_id asc
               limit 1)
           ) as profile_id
      from without_one w
  )
  update public.group_members m
     set role = 'organiser'
    from pick p
   where m.group_id = p.group_id and m.profile_id = p.profile_id;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.group_roles_backfill() from public, anon, authenticated;

select public.group_roles_backfill();
