/* ==========================================================================
 * The owner mark — WHITE, and the app cannot award it to itself.
 *
 * The owner, 2026-09-02: "the owners of the app get a full white verification
 * tag. so me and one more person".
 *
 * A FOURTH CLAIM, IN A SYSTEM THAT ALREADY FORBIDS BORROWING COLOURS.
 * D4 (answered 2026-08-31) fixed three marks and the rule governing them:
 *   GOLD  — credentials ICEFALL checked (guides)
 *   GREY  — identity verified (any user who verified ID), small
 *   BLUE  — paid member
 *   "Three different claims, three different marks, and none may borrow
 *    another's colour."
 * WHITE is the fourth: this person runs ICEFALL. It says nothing about their
 * climbing, their identity check or their subscription, and it must never be
 * reachable by paying, by verifying ID, or by being a guide.
 *
 * WHY THIS IS THE ONE MARK THAT CANNOT LIVE IN THE CLIENT.
 * Gold, grey and blue make claims about the person wearing them. White makes a
 * claim about AUTHORITY OVER EVERYONE ELSE — somebody wearing it can ask another
 * climber for anything and be believed. A client-side flag would make
 * impersonating the founder a one-line edit in devtools.
 *
 * ── WHY ITS OWN TABLE, AND NOT `staff_members` ─────────────────────────────
 * The first draft of this file put 'owner' into `staff_members`. Three things
 * were wrong with that, and all three were found by reading the schema rather
 * than trusting the draft:
 *   1. the column is `staff_role`, not `role`;
 *   2. it is an ENUM (`icefall_staff_role`), not a text CHECK — so the draft's
 *      constraint-rewriting block would simply have failed;
 *   3. and fatally: `alter type ... add value` cannot be used in the SAME
 *      transaction that then writes the new value, and Supabase runs each
 *      migration file in one transaction. Adding 'owner' and granting it here
 *      would raise "unsafe use of new value of enum type".
 * Beyond the mechanics it is also the wrong home: a staff role is a DESK
 * (sales, finance, support). Ownership is not a desk, and giving an owner a
 * staff row would enrol them in every `is_staff()` check written for desks.
 *
 * NOT CAPPED AT TWO, DELIBERATELY. "me and one more person" is a fact about
 * today, not a constraint for ever, and `check (count = 2)` would make a founder
 * joining or leaving an emergency migration. The control that matters is not a
 * number: ONLY AN EXISTING OWNER MAY CREATE ANOTHER, every grant is audited, and
 * an owner cannot remove themselves.
 * ========================================================================== */

create table if not exists public.app_owners (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  /* Who let them in. `set null` rather than cascade: the record that a grant
     happened must outlive the account that made it. NULL on the first owner,
     who is necessarily seeded by hand — see the note at the bottom. */
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now()
);

comment on table public.app_owners is
  'The WHITE mark: people who run ICEFALL. Not a staff desk and not a subscription '
  'tier — see D4, no mark may borrow another''s colour. Only an existing owner can '
  'add one, and nobody can remove themselves.';

alter table public.app_owners enable row level security;

/*
 * READABLE BY ANY SIGNED-IN USER, on purpose. The mark is worn in public — a
 * white tag beside a name in a feed is the whole feature — so the fact of
 * ownership is not a secret. What is protected is WRITING it.
 */
drop policy if exists app_owners_select on public.app_owners;
create policy app_owners_select on public.app_owners
  for select to authenticated
  using (true);

/* No INSERT, UPDATE or DELETE policy exists, and that is the enforcement. Every
   write goes through the definer functions below, which check the caller is
   already an owner. There is no path a client can take to grant itself this. */

revoke all on public.app_owners from anon, authenticated;
grant select on public.app_owners to authenticated;

/* -------------------------------------------------------------------------- */
/* Reading the mark                                                           */
/* -------------------------------------------------------------------------- */

/*
 * uuid argument, NOT a whole `profiles` row.
 * `identity_verified(p public.profiles)` takes a composite and it cost this
 * project two failed pushes today: the type would not resolve from inside a
 * policy created by a `do $$` block, because the role `supabase db push` runs as
 * does not have `public` on its search_path there. A uuid has nothing to resolve.
 */
create or replace function public.is_app_owner(u uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.app_owners o where o.profile_id = u);
$$;

revoke all on function public.is_app_owner(uuid) from public, anon;
grant execute on function public.is_app_owner(uuid) to authenticated;

/* The PostgREST computed field, so a profile arrives WITH its mark in one
   request: `profiles?select=id,display_name,app_owner`. Delegates to the uuid
   function, so there is exactly one definition of what an owner is. */
create or replace function public.app_owner(p public.profiles)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_app_owner(p.id);
$$;

revoke all on function public.app_owner(public.profiles) from public, anon;
grant execute on function public.app_owner(public.profiles) to authenticated;

/* -------------------------------------------------------------------------- */
/* Granting and removing — owner only, audited                                */
/* -------------------------------------------------------------------------- */

create or replace function public.grant_app_owner(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  /*
   * `is not true`, not `not (...)`. `is_app_owner` cannot return NULL as
   * written, but the negative reading is the one that survives somebody later
   * rewriting the function to return NULL for an unknown id — and `not NULL` is
   * NULL, which an `if` treats as false. Fail closed by construction, not by
   * luck (constitution §6ag).
   */
  if public.is_app_owner((select auth.uid())) is not true then
    raise exception 'only an owner can make another owner';
  end if;

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'no such profile';
  end if;

  insert into public.app_owners (profile_id, granted_by)
  values (p_profile_id, (select auth.uid()))
  on conflict (profile_id) do nothing;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, next)
  values ((select auth.uid()), 'app_owner.granted', 'profile', p_profile_id::text,
          jsonb_build_object('granted_by', (select auth.uid())));
end;
$$;

revoke all on function public.grant_app_owner(uuid) from public, anon;
grant execute on function public.grant_app_owner(uuid) to authenticated;

create or replace function public.revoke_app_owner(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_app_owner((select auth.uid())) is not true then
    raise exception 'only an owner can remove an owner';
  end if;

  /* You cannot remove yourself. Not paternalism: the last owner removing
     themselves leaves a platform on which ownership can never be granted again,
     because grant_app_owner requires an existing owner to call it. */
  if p_profile_id = (select auth.uid()) then
    raise exception 'an owner cannot remove themselves — ask the other owner';
  end if;

  delete from public.app_owners where profile_id = p_profile_id;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, previous)
  values ((select auth.uid()), 'app_owner.revoked', 'profile', p_profile_id::text,
          jsonb_build_object('revoked_by', (select auth.uid())));
end;
$$;

revoke all on function public.revoke_app_owner(uuid) from public, anon;
grant execute on function public.revoke_app_owner(uuid) to authenticated;

/* ==========================================================================
 * SEEDING THE FIRST OWNER — deliberately not done here.
 *
 * `grant_app_owner` requires an existing owner, so the first one cannot be made
 * by the app. That is the point: it is a chicken-and-egg by design rather than
 * an oversight, and it means no code path can mint the first white mark.
 *
 * The first owner is seeded once, by hand, by somebody with database access,
 * against a REAL account that has already signed up:
 *
 *   insert into public.app_owners (profile_id)
 *   select id from public.profiles where username = '<the owner''s handle>';
 *
 * They then grant the second from inside the app. No account ids are written
 * into this migration, because a uuid in a migration is a guess about a row
 * that may not exist yet, and a wrong one would silently mark a stranger.
 * ========================================================================== */
