-- ICEFALL — repair: the identity objects, and the promotion columns the live
-- database never received.
--
-- WHY THIS FILE EXISTS. Two facts established by OBSERVATION on 2026-09-02
-- (`supabase migration list`, twice, plus PostgREST probes), after an evening in
-- which four sessions including this one worked from the opposite assumption:
--
--   1. THE 20260831 MIGRATIONS WERE ALREADY LIVE. They were pushed earlier and
--      were never pending. Every "fix" edited into those files afterwards is an
--      edit to history: the file will never run again, so the change never
--      reached the database. Anything still wanted must arrive as a NEW file.
--      That is the whole lesson of this migration's existence.
--
--   2. `20260831160000_identity_verification` is RECORDED AS APPLIED, but its
--      objects do not answer: `public.identity_verified(public.profiles)` fails
--      to resolve with SQLSTATE 42883 (twice, from two different call sites),
--      and `public.identity_checks` returns PGRST205 through PostgREST while
--      every other table from every other applied migration returns 401.
--
-- ON (2), TWO EXPLANATIONS WERE OFFERED AND THIS FILE NEEDS NEITHER TO BE
-- SETTLED FIRST. Either the objects are absent despite the recorded version, or
-- they exist and are invisible to `anon`. The distinction matters for the
-- post-mortem, not for the remedy: the body below is the original file verbatim
-- and every statement in it is idempotent (`create table if not exists`,
-- `create or replace function`, `drop trigger/policy if exists`), so it is
-- correct under both readings — it creates what is missing and rewrites what is
-- merely present. Re-running an idempotent body is cheaper than another guess.
--
-- ONE PIECE OF EVIDENCE WORTH RECORDING, because it narrows the post-mortem: a
-- stale PostgREST schema cache CANNOT explain the 42883. That error was raised
-- by Postgres itself while executing a migration, and PostgREST is not in that
-- path. A cache would explain the PGRST205 alone, so the two symptoms together
-- point at absent objects rather than hidden ones. `notify pgrst` at the foot of
-- this file settles the cache half either way.
--
-- WHAT (1) BROKE, CONCRETELY: the CRM's rebuilt campaign builder writes
-- audience_mode, countries, daily_budget_cents and creative_path to
-- promoted_placements. Those four columns were added to the social migration
-- AFTER it had been applied, so they exist in the file, in the test suite, and
-- nowhere else. Creating a campaign against the live database would fail on a
-- missing column. They are added properly below.

-- ICEFALL — identity verification: the GREY mark's source of truth.
--
-- OWNER RULING (31 Aug, the three-marks decision): three different claims,
-- three different marks, and none may borrow another's colour.
--
--   GOLD  credentials checked by ICEFALL (guides only — guide_verification).
--   GREY  identity verified: "this person is who they say". Nothing more.
--   BLUE  paid member: a billing fact (its own system).
--
-- This table is the grey mark's evidence. Same standards as the credential
-- record: a named checker, a stated document reference, an audited trail, and
-- NO BARE BOOLEAN — the mark is DERIVED from the record by a function, so a
-- stored TRUE can never outlive its evidence.
--
-- ONE DELIBERATE DIFFERENCE from the credential record: no expiry. A
-- qualification lapses with its insurance; who somebody IS does not. The
-- guides app states the same semantics ("it is either established or it is
-- not") — identity is established once and stands until deliberately revoked.

create table if not exists public.identity_checks (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  checked_by uuid not null references public.profiles (id) on delete set null,
  checked_at timestamptz not null default now(),
  -- WHAT was seen — a reference ("passport, CY, ending 483"), never the
  -- document itself. No document store exists and none is smuggled in here.
  document_ref text not null check (length(trim(document_ref)) between 3 and 200),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  revoke_reason text,
  constraint identity_revoke_coherent check (
    (revoked_at is null and revoked_by is null and revoke_reason is null)
    or (revoked_at is not null and revoked_by is not null
        and length(trim(revoke_reason)) >= 3)
  )
);

comment on table public.identity_checks is
  'Evidence behind the GREY mark: ICEFALL confirmed this person is who they say. '
  'A separate claim from credentials (gold) and from membership (blue) — the '
  'owner ruled the three may never share a symbol. Written only through '
  'record_identity_check / revoke_identity_check; the mark itself is derived.';

/* ---- The mark is derived, never stored ----------------------------------- */

/**
 * PostgREST computed field: `profiles?select=*,identity_verified` — and the
 * one server-side answer every app reads. DEFINER so the boolean is readable
 * without being able to read the evidence table.
 */
create or replace function public.identity_verified(p public.profiles)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select ic.revoked_at is null
    from public.identity_checks ic
    where ic.profile_id = p.id
  ), false);
$$;

revoke all on function public.identity_verified(public.profiles) from public, anon;
grant execute on function public.identity_verified(public.profiles) to authenticated;

/* ---- Columns move only through the functions ----------------------------- */

create or replace function public.identity_checks_guard()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('icefall.identity_write', true), '') <> '1' then
    raise exception 'identity records move only through record_identity_check / revoke_identity_check';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists identity_checks_guard on public.identity_checks;
create trigger identity_checks_guard
  before insert or update or delete on public.identity_checks
  for each row execute function public.identity_checks_guard();

/* ---- The two doors ------------------------------------------------------- */

/**
 * Operations desk records that they checked a person's identity document.
 * Re-checking (a new document, or after a revocation) overwrites the check
 * and clears any revocation — the record is the CURRENT basis for the mark,
 * and the audit trail keeps the history.
 */
create or replace function public.record_identity_check(
  p_profile_id uuid,
  p_document_ref text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_staff_role(array['operations']) then
    raise exception 'identity checks are recorded by the operations desk';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'no such profile';
  end if;

  perform set_config('icefall.identity_write', '1', true);
  insert into public.identity_checks (profile_id, checked_by, checked_at, document_ref)
  values (p_profile_id, auth.uid(), now(), p_document_ref)
  on conflict (profile_id) do update
    set checked_by = excluded.checked_by,
        checked_at = excluded.checked_at,
        document_ref = excluded.document_ref,
        revoked_at = null, revoked_by = null, revoke_reason = null;

  insert into public.audit_events
    (actor_id, actor_role, action, entity_type, entity_id, previous, next, company_id)
  values
    (auth.uid(), coalesce(public.my_role()::text, 'service'), 'identity.checked',
     'profile', p_profile_id::text, null,
     jsonb_build_object('document_ref', p_document_ref), null);
end;
$$;

/** Revoking needs a reason — an unexplained removal of "this person is who
 * they say" is itself a claim, and it must say what happened. */
create or replace function public.revoke_identity_check(
  p_profile_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_staff_role(array['operations']) then
    raise exception 'identity checks are revoked by the operations desk';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'a revocation states its reason';
  end if;

  perform set_config('icefall.identity_write', '1', true);
  update public.identity_checks
     set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = trim(p_reason)
   where profile_id = p_profile_id and revoked_at is null;
  if not found then
    raise exception 'no current identity check to revoke';
  end if;

  insert into public.audit_events
    (actor_id, actor_role, action, entity_type, entity_id, previous, next, company_id)
  values
    (auth.uid(), coalesce(public.my_role()::text, 'service'), 'identity.revoked',
     'profile', p_profile_id::text, null,
     jsonb_build_object('reason', trim(p_reason)), null);
end;
$$;

revoke all on function public.record_identity_check(uuid, text) from public, anon;
revoke all on function public.revoke_identity_check(uuid, text) from public, anon;
grant execute on function public.record_identity_check(uuid, text) to authenticated;
grant execute on function public.revoke_identity_check(uuid, text) to authenticated;

/* ---- RLS + grants (§6v) --------------------------------------------------- */

alter table public.identity_checks enable row level security;
alter table public.identity_checks force row level security;

-- Staff see the evidence; the person sees their own record (what was checked,
-- by name, and why it was revoked if it was). Everyone else gets only the
-- derived boolean through the function above.
drop policy if exists identity_checks_select on public.identity_checks;
create policy identity_checks_select on public.identity_checks
  for select to authenticated
  using (public.is_staff() or profile_id = auth.uid());

revoke all on public.identity_checks from anon, authenticated;
grant select on public.identity_checks to authenticated;
-- No INSERT/UPDATE/DELETE grant for anyone: the functions are the only doors,
-- and the guard trigger backstops even a future grant mistake.

/* ========================================================================== */
/* A contradiction the original carried, found by audit                       */
/* ========================================================================== */

/*
 * `identity_checks.checked_by` was declared `uuid NOT NULL REFERENCES
 * public.profiles (id) ON DELETE SET NULL`. Those two halves cannot both hold.
 * Postgres accepts the declaration at CREATE TABLE and raises only when a
 * referenced profile is actually deleted, at which point the cascade tries to
 * write NULL into a NOT NULL column and the DELETE fails with a not-null
 * violation — in production, on an operation nobody would connect to this
 * table. It has been latent since 20260831160000 and the repair above copied
 * it forward verbatim, which is exactly what a verbatim copy is for and
 * exactly why it needed auditing.
 *
 * WHICH HALF IS RIGHT: the NOT NULL. The column's own comment is
 * "A verification with no name attached is an anonymous assertion" — an
 * identity check that has forgotten who performed it is worse than no record,
 * so the name must stay. That rules out making the column nullable.
 *
 * THE FIX IS TO DROP THE FOREIGN KEY, not to swap SET NULL for RESTRICT. This
 * follows the precedent already set for `audit_events` in this codebase: a
 * historical record must OUTLIVE THE THING IT REFERENCES. RESTRICT would keep
 * integrity at the cost of making a staff profile undeletable for as long as
 * any identity check names them — which turns an ordinary leaver, or a
 * right-to-erasure request, into a schema problem. Dropping the constraint
 * keeps the uuid as an opaque historical reference: the check still names who
 * performed it, and the profile can go.
 *
 * The write path is unaffected — `record_identity_check` sets checked_by from
 * auth.uid(), so the value is always a real profile at the moment it is
 * written; what changes is only what happens to old rows afterwards.
 *
 * Idempotent and correct in both of this file's states: if the table was just
 * created above, this drops the constraint it came with; if the table already
 * existed, this drops the one it has been carrying.
 */
alter table public.identity_checks
  drop constraint if exists identity_checks_checked_by_fkey;

comment on column public.identity_checks.checked_by is
  'The staff member who read the documents. NOT NULL — a verification with no name attached is an anonymous assertion. Deliberately carries NO foreign key: this is a historical record and must outlive the profile it names, the same stance audit_events takes.';

/* ========================================================================== */
/* The promotion columns the live table never received                        */
/* ========================================================================== */

-- Added here rather than in 20260831190000_social.sql, which has already run.
-- `if not exists` on every one: this file must be safe on a database that has
-- them (a fresh environment built from the full migration set) and on the live
-- one that does not.
alter table public.promoted_placements
  add column if not exists audience_mode text not null default 'general',
  add column if not exists countries text[] not null default '{}',
  add column if not exists daily_budget_cents int,
  add column if not exists creative_path text;

-- Constraints dropped before adding so the file re-runs; both are stated in
-- their own terms rather than inherited from the column definitions above.
alter table public.promoted_placements drop constraint if exists promoted_audience_mode_known;
alter table public.promoted_placements
  add constraint promoted_audience_mode_known
  check (audience_mode in ('targeted', 'general'));

alter table public.promoted_placements drop constraint if exists promoted_daily_budget_positive;
alter table public.promoted_placements
  add constraint promoted_daily_budget_positive
  check (daily_budget_cents is null or daily_budget_cents > 0);

comment on column public.promoted_placements.audience_mode is
  'targeted = people whose declared goals name the promoted mountain or trek; general = everyone the feed reaches. Premium members are excluded from delivery in both cases — that exclusion is a feed rule in the reading apps, not a column here.';
comment on column public.promoted_placements.countries is
  'ISO-3166 alpha-2 focus countries; empty means worldwide. Matched against profiles.country_code, which people set themselves and many have not.';
comment on column public.promoted_placements.daily_budget_cents is
  'Integer cents, per day. The campaign total is days x daily and is DERIVED wherever it is shown — never stored, so it cannot drift from the dates beside it.';
comment on column public.promoted_placements.creative_path is
  'The image the promotion carries: a destination photo path or the promoted post''s own media. A reference, never an upload.';

/* ========================================================================== */
/* Tell PostgREST                                                             */
/* ========================================================================== */

-- The schema cache is reloaded on DDL by the platform, but not reliably when a
-- migration is applied out of band. Cheap, idempotent, and it is the half of
-- the identity anomaly a cache could actually explain.
notify pgrst, 'reload schema';
