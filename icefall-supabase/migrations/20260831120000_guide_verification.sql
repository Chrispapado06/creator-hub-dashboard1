-- Guide document checking — the pin lifted, and replaced by something harder.
--
-- Owner ruling 2026-08-31 (08-TRUST-RECORDS-CONTRACT.md): ICEFALL will read
-- guides' certification documents and record that it did. THAT IS ALL. Not an
-- attestation by IFMGA or any association; the product's sentence stays:
-- "Documents checked by ICEFALL on [date]. We have not contacted the issuing
-- association." — never "Verified guide".
--
-- ── WHY THE BOOLEAN COLUMN IS REMOVED, NOT UNPINNED ────────────────────────
--
-- `credentials_verified boolean check (= false)` existed so the claim could
-- not become true while no checking process existed. Lifting the CHECK and
-- keeping the boolean would recreate the trap one layer up: a stored TRUE
-- that stays true after the certificate expires. This project has already
-- shipped that bug once — lapsed insurance rendering as valid because an
-- expiry check failed open. A safety check that fails open is worse than
-- none, because it is trusted.
--
-- So the column is DROPPED and the state is DERIVED, every time, from the
-- record: who checked, when, which document, and when the document itself
-- expires. Expiry revokes the claim automatically because the claim is
-- computed against current_date — there is no boolean for anyone to forget
-- to clear. Consumers of the old column break loudly and adopt the derived
-- state: fail-closed by construction.
--
-- ── WRITES: FUNCTION-ONLY, NAMED, AUDITED ──────────────────────────────────
--
-- guide_profiles_write lets a guide update their OWN row (self-serve profile)
-- and admins update any — which means a policy alone cannot keep these
-- columns safe: a guide could name themselves checked. A trigger therefore
-- refuses ANY change to the credentials columns unless the write comes
-- through the definer functions below (which set a transaction-local flag).
-- The test that proves it is a REFUSED direct update — by a guide AND by an
-- admin.

begin;

alter table public.guide_profiles
  drop constraint if exists guide_profiles_credentials_verified_check;
alter table public.guide_profiles drop column if exists credentials_verified;

alter table public.guide_profiles
  add column if not exists credentials_checked_by uuid references public.profiles (id) on delete restrict,
  add column if not exists credentials_checked_at timestamptz,
  add column if not exists credentials_document_ref text,
  add column if not exists credentials_expire_at date,
  -- Some carnets carry no printed expiry. That is a deliberate statement, not
  -- an omitted field — the function demands one or the other explicitly.
  add column if not exists credentials_no_expiry boolean not null default false;

alter table public.guide_profiles drop constraint if exists guide_credentials_coherent;
alter table public.guide_profiles add constraint guide_credentials_coherent check (
  (credentials_checked_by is null and credentials_checked_at is null
   and credentials_document_ref is null and credentials_expire_at is null
   and credentials_no_expiry = false)
  or
  (credentials_checked_by is not null and credentials_checked_at is not null
   and credentials_document_ref is not null
   and (credentials_expire_at is not null or credentials_no_expiry))
);

comment on column public.guide_profiles.credentials_checked_by is
  'The staff member who READ the documents. A verification with no name attached is an anonymous assertion. Written only by record_guide_document_check.';

/**
 * The one place the claim's state is computed — a PostgREST computed field
 * (select=*,guide_credentials_state) so every app derives it identically and
 * none stores a boolean that can go stale.
 *
 * 'expired' the day after the document's own date, automatically.
 */
create or replace function public.guide_credentials_state(g public.guide_profiles)
returns text
language sql
stable
as $$
  select case
    when g.credentials_checked_by is null then 'unchecked'
    when not g.credentials_no_expiry and g.credentials_expire_at < current_date then 'expired'
    else 'checked'
  end;
$$;

/* ---- The guard: these columns move only through the functions ------------ */

create or replace function public.guide_credentials_guard()
returns trigger
language plpgsql
as $$
begin
  if (new.credentials_checked_by  is distinct from old.credentials_checked_by
   or new.credentials_checked_at  is distinct from old.credentials_checked_at
   or new.credentials_document_ref is distinct from old.credentials_document_ref
   or new.credentials_expire_at   is distinct from old.credentials_expire_at
   or new.credentials_no_expiry   is distinct from old.credentials_no_expiry)
     and coalesce(current_setting('icefall.credentials_write', true), '') <> '1' then
    raise exception 'credential columns move only through record_guide_document_check / revoke_guide_document_check';
  end if;
  return new;
end;
$$;

drop trigger if exists guide_credentials_guard on public.guide_profiles;
create trigger guide_credentials_guard
  before update on public.guide_profiles
  for each row execute function public.guide_credentials_guard();

/* ---- Recording a check --------------------------------------------------- */

create or replace function public.record_guide_document_check(
  p_guide_id uuid,
  p_document_ref text,
  p_expires_at date default null,
  p_no_expiry boolean default false
)
returns void
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_staff_role(array['operations']) then
    raise exception 'only ICEFALL operations staff may record a document check';
  end if;
  if p_document_ref is null or length(btrim(p_document_ref)) = 0 then
    raise exception 'name the document that was read — a check with no document is an assertion';
  end if;
  -- One or the other, explicitly: an expiry date from the document, or the
  -- deliberate statement that the document carries none.
  if (p_expires_at is null) = (p_no_expiry = false) then
    raise exception 'state the document''s expiry date, or explicitly that it has none — not neither, not both';
  end if;
  if not exists (select 1 from public.guide_profiles where id = p_guide_id) then
    raise exception 'no such guide';
  end if;

  perform set_config('icefall.credentials_write', '1', true);
  update public.guide_profiles
     set credentials_checked_by = auth.uid(),
         credentials_checked_at = now(),
         credentials_document_ref = btrim(p_document_ref),
         credentials_expire_at = p_expires_at,
         credentials_no_expiry = p_no_expiry
   where id = p_guide_id;

  perform public.record_audit_event(
    'guide.documents_checked', 'guide', p_guide_id::text, null,
    jsonb_build_object('document_ref', btrim(p_document_ref),
                       'expires_at', p_expires_at, 'no_expiry', p_no_expiry),
    null, null);
end;
$$;

create or replace function public.revoke_guide_document_check(
  p_guide_id uuid,
  p_reason text
)
returns void
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_prev jsonb;
begin
  if not public.has_staff_role(array['operations']) then
    raise exception 'only ICEFALL operations staff may revoke a document check';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'revoking a recorded check requires a stated reason';
  end if;

  select jsonb_build_object('checked_by', credentials_checked_by,
                            'document_ref', credentials_document_ref,
                            'expires_at', credentials_expire_at)
    into v_prev from public.guide_profiles where id = p_guide_id;
  if v_prev is null then raise exception 'no such guide'; end if;

  perform set_config('icefall.credentials_write', '1', true);
  update public.guide_profiles
     set credentials_checked_by = null, credentials_checked_at = null,
         credentials_document_ref = null, credentials_expire_at = null,
         credentials_no_expiry = false
   where id = p_guide_id;

  perform public.record_audit_event(
    'guide.documents_check_revoked', 'guide', p_guide_id::text, v_prev, null, p_reason, null);
end;
$$;

revoke all on function public.record_guide_document_check(uuid, text, date, boolean) from public, anon;
revoke all on function public.revoke_guide_document_check(uuid, text) from public, anon;
grant execute on function public.record_guide_document_check(uuid, text, date, boolean) to authenticated;
grant execute on function public.revoke_guide_document_check(uuid, text) to authenticated;
grant execute on function public.guide_credentials_state(public.guide_profiles) to anon, authenticated;

commit;
