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
