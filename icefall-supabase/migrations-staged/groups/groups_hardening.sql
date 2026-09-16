/* ==========================================================================
 * Groups hardening — file 1 of the groups rebuild.
 *
 * STAGED, NOT APPLIED. Plan: icefall-app/docs/groups-structure-plan.md §6.2,
 * file 1, and decision D12. This file has no timestamp on purpose. It gets a
 * fresh one when the owner moves it into migrations/ (plan §6.3), so a date
 * fixed today can never block a later push.
 *
 * Four fixes to 20260902220000_group_privacy_and_chat.sql, and nothing else.
 * No gate of any kind (D10).
 *
 *   1. FORCE row level security on `group_join_requests` and `group_messages`.
 *      `groups` and `group_members` have been forced since 20260902100000;
 *      these two were only enabled, so the table owner skipped their policies.
 *
 *   2. A declined person could delete their own request and ask again.
 *      `group_join_requests_delete` was `profile_id = auth.uid()` with no
 *      outcome test, so "declined" lasted one delete. Now only an UNDECIDED
 *      request can be withdrawn. A decided row stays, as the table's own
 *      comment always said it should.
 *
 *   3. A founder could redirect a request. `group_join_requests_update` checks
 *      that the founder owns the group, and nothing else, so an update could
 *      rewrite `profile_id` to admit somebody who never asked, or move the row
 *      to another group they founded. A policy cannot compare old and new
 *      values, so a trigger freezes `group_id`, `profile_id` and
 *      `requested_at`. The decision columns stay writable, so changing your
 *      mind still works.
 *
 *   4. The staff arm on `group_members` delete is restored. 20260902100000
 *      had it ("Staff can remove a member (moderation)"); 20260902220000
 *      replaced the whole policy to add the founder and did not carry it over,
 *      and its own comment does not say the power was withdrawn.
 *
 * WHAT IS DELIBERATELY NOT CHANGED
 *   - `group_members_select` and `group_messages_select` keep the block rule
 *     and staff arm from 20260903010000. This file does not touch them.
 *   - Founder powers stay founder powers. File 2 (group_roles) moves them to
 *     the organiser role.
 *   - `group_messages.author_id` stays RESTRICT (owner question Q8).
 *
 * ONE ASSUMPTION, WRITTEN DOWN. Under FORCE the owner obeys the policies
 * unless it holds BYPASSRLS. The SECURITY DEFINER code that reads these two
 * tables (`reports_name_the_subject` reads `group_messages`) relies on the
 * migration role holding BYPASSRLS, which is the same assumption
 * 20260911200000_readiness_to_operators.sql records for `enquiries`.
 *
 * Safe to run twice: every statement replaces what it creates.
 *
 * APPLY BY HAND, ONE FILE AT A TIME (plan §6.3). Nothing in this repository
 * applies migrations.
 * ========================================================================== */

/* -------------------------------------------------------------------------- */
/* 1. FORCE row level security                                                */
/* -------------------------------------------------------------------------- */

alter table public.group_join_requests enable row level security;
alter table public.group_join_requests force row level security;
alter table public.group_messages enable row level security;
alter table public.group_messages force row level security;

/* -------------------------------------------------------------------------- */
/* 2. Only an undecided request can be withdrawn                              */
/* -------------------------------------------------------------------------- */

/*
 * BEFORE: profile_id = auth.uid()
 * AFTER:  the same, and only while neither outcome is set.
 *
 * The primary key is (group_id, profile_id), so a kept decided row is what
 * stops a second ask. Deleting it was the way round that.
 *
 * An ACCEPTED request is kept too. It is the standing admission that lets
 * somebody who left a private group come back without asking again, which
 * `useGroupActions().leave` in the app already relies on.
 */
drop policy if exists group_join_requests_delete on public.group_join_requests;
create policy group_join_requests_delete on public.group_join_requests
  for delete to authenticated
  using (
    profile_id = (select auth.uid())
    and accepted_at is null
    and declined_at is null
  );

/* -------------------------------------------------------------------------- */
/* 3. A request's identity is frozen                                          */
/* -------------------------------------------------------------------------- */

/*
 * Who asked, which group they asked, and when they asked are facts, so an
 * update may only answer the question (accepted_at, declined_at, decided_by).
 *
 * INVOKER, like `groups_guard`: it only compares OLD with NEW and reads no
 * table, so it needs no rights of its own. It fires for every role, including
 * the service role, because no caller has a reason to change these fields.
 *
 * `decided_by ... on delete set null` still works when the decider's account
 * is deleted: that update changes none of the three frozen columns.
 */
create or replace function public.group_join_requests_freeze_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.group_id is distinct from old.group_id
     or new.profile_id is distinct from old.profile_id then
    raise exception 'a join request belongs to the person who asked and the group they asked'
      using errcode = 'check_violation';
  end if;
  if new.requested_at is distinct from old.requested_at then
    raise exception 'when somebody asked is a fact, not a field'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists group_join_requests_freeze_identity on public.group_join_requests;
create trigger group_join_requests_freeze_identity
  before update on public.group_join_requests
  for each row execute function public.group_join_requests_freeze_identity();

/* -------------------------------------------------------------------------- */
/* 4. Staff can remove a member again                                         */
/* -------------------------------------------------------------------------- */

/*
 * BEFORE (20260902220000): profile_id = auth.uid() or is_group_founder(group_id)
 * AFTER: the same, plus staff.
 *
 * Without it an unwanted member of an unowned group (`created_by` null, which
 * is what a deleted founder account leaves behind) can be removed by nobody
 * but themselves.
 */
drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members
  for delete to authenticated
  using (
    profile_id = (select auth.uid())
    or public.is_group_founder(group_id)
    or public.is_staff()
  );
