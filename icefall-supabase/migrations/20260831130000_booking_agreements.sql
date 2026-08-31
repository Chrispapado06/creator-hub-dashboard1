-- What the customer agreed to — pinned, named, dated, immutable.
--
-- Owner ruling 2026-08-31 (08-TRUST-RECORDS-CONTRACT.md §3). This is the
-- record that answers "what were they told?" when somebody is hurt, and its
-- one failure mode is a boolean: `terms_accepted = true` proves nothing in a
-- dispute, because the terms have changed since and nobody can say what the
-- customer saw. So the record pins:
--
--   · the exact TERMS TEXT and its version — what was on the screen, not a
--     pointer to whatever the policy says today;
--   · the CANCELLATION POLICY as it stood — the owner's own mockup heads this
--     "(AGREED AT TIME OF BOOKING)", rate-preservation in their handwriting;
--   · the DISCLOSURES shown — difficulty, maximum altitude, what is included
--     and not, "emergency evacuation not included": material facts about a
--     trip that can kill somebody;
--   · when, and by whom.
--
-- IMMUTABLE INCLUDING TO STAFF, by trigger — the same shape as the customer's
-- words on enquiries, for higher stakes. NO BACK-FILL: existing bookings have
-- no record because none was captured; screens render "not recorded" rather
-- than assuming today's terms applied. A fabricated agreement record is worse
-- than a missing one.
--
-- ONLY THE CUSTOMER RECORDS THEIR OWN ACCEPTANCE. The function binds
-- accepted_by to auth.uid() and requires it to be the booking's customer —
-- staff cannot manufacture an acceptance on someone's behalf, which is the
-- entire evidentiary value of the row. Enforcement-by-absence: authenticated
-- holds no INSERT grant on the table at all.

begin;

create table if not exists public.booking_agreements (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT: an agreement record blocks deletion of the booking it belongs
  -- to. The record must outlive everything except a deliberate, audited
  -- removal of itself.
  booking_id uuid not null unique references public.bookings (id) on delete restrict,
  accepted_by uuid not null references public.profiles (id) on delete restrict,
  accepted_at timestamptz not null default now(),
  origin_app text not null default 'phone_app'
    check (origin_app in ('phone_app', 'web', 'guide_app', 'operator_portal', 'crm')),

  terms_version text not null check (length(btrim(terms_version)) between 1 and 60),
  terms_text text not null check (length(btrim(terms_text)) >= 20),
  cancellation_policy text not null check (length(btrim(cancellation_policy)) >= 10),
  /** What was shown, as an array of plain statements. Stored, not referenced. */
  disclosures jsonb not null default '[]'::jsonb
    check (jsonb_typeof(disclosures) = 'array')
);

comment on table public.booking_agreements is
  'What the customer accepted AT BOOKING TIME, pinned verbatim. Immutable including to staff (trigger). One per booking. Never back-filled. Only the customer records their own acceptance (record_booking_agreement).';

/* ---- Immutable once written; deletion super-admin-only and traced -------- */

create or replace function public.booking_agreements_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'UPDATE' then
    raise exception 'an agreement record is immutable — it is what the customer saw, and what they saw does not change';
  end if;
  -- DELETE: the audit row is the trace that survives.
  insert into public.audit_events
    (actor_id, actor_role, action, entity_type, entity_id, previous, next, company_id)
  values
    (auth.uid(), coalesce(public.my_role()::text, 'service'), 'booking_agreement.deleted',
     'booking_agreement', old.id::text, to_jsonb(old), null, null);
  return old;
end;
$$;

drop trigger if exists booking_agreements_no_update on public.booking_agreements;
create trigger booking_agreements_no_update
  before update on public.booking_agreements
  for each row execute function public.booking_agreements_guard();

drop trigger if exists booking_agreements_delete_audit on public.booking_agreements;
create trigger booking_agreements_delete_audit
  after delete on public.booking_agreements
  for each row execute function public.booking_agreements_guard();

/* ---- The only write path ------------------------------------------------- */

create or replace function public.record_booking_agreement(
  p_booking_id uuid,
  p_terms_version text,
  p_terms_text text,
  p_cancellation_policy text,
  p_disclosures jsonb default '[]'::jsonb,
  p_origin_app text default 'phone_app'
)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_customer uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  select customer_id into v_customer from public.bookings where id = p_booking_id;
  if not found then raise exception 'no such booking'; end if;
  -- THE EVIDENTIARY RULE: only the person who agreed can record that they
  -- agreed. Staff recording it for them would make every row worthless.
  if v_customer is distinct from v_uid then
    raise exception 'only the booking''s own customer records their acceptance';
  end if;

  insert into public.booking_agreements
    (booking_id, accepted_by, origin_app, terms_version, terms_text,
     cancellation_policy, disclosures)
  values
    (p_booking_id, v_uid, p_origin_app, btrim(p_terms_version), p_terms_text,
     p_cancellation_policy, coalesce(p_disclosures, '[]'::jsonb))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

/* ---- RLS + grants, §6v pairs --------------------------------------------- */

alter table public.booking_agreements enable row level security;
alter table public.booking_agreements force row level security;

-- Staff read every record (it is the desk's evidence); the customer reads
-- their own (rule 4's shape: they can see what they agreed to, always).
drop policy if exists booking_agreements_select on public.booking_agreements;
create policy booking_agreements_select on public.booking_agreements
  for select to authenticated
  using (public.is_staff() or accepted_by = auth.uid());

drop policy if exists booking_agreements_delete on public.booking_agreements;
create policy booking_agreements_delete on public.booking_agreements
  for delete to authenticated
  using (public.has_staff_role(array['super_admin']));

revoke all on public.booking_agreements from anon, authenticated;
grant select, delete on public.booking_agreements to authenticated;
-- NO INSERT grant for authenticated: the function is the only door.
-- NO UPDATE grant for anyone: with the trigger, two locks on one door.

revoke all on function public.record_booking_agreement(uuid, text, text, text, jsonb, text) from public, anon;
grant execute on function public.record_booking_agreement(uuid, text, text, text, jsonb, text) to authenticated;

commit;
