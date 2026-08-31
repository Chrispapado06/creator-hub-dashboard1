-- ICEFALL — S4: enquiry delivery to operators.
--
-- The enquiry queue lands in the CRM and ICEFALL staff answer (owner ruling,
-- 31 Aug — the CRM is the desk of record). This migration adds the LATER
-- phase that ruling named: an operator can see enquiries about their own
-- company — but only the ones ICEFALL has deliberately HANDED OFF, stamped on
-- the row by a named staff member. Nothing flows to a company automatically;
-- the desk decides per enquiry.
--
-- WHY A VIEW AND NOT A POLICY ON THE BASE TABLE. `authenticated` holds a
-- full-column SELECT grant on `enquiries` (staff need every column), so an
-- operator SELECT policy on the base table would row-gate but not
-- column-gate: any company member could read `sender_email` off their rows.
-- The customer wrote to ICEFALL, not to the company — their contact details
-- stay at the desk. The view below hands the operator the commercial content
-- (what was asked, about what, when, and ICEFALL's answer) and nothing else;
-- `origin_screen` stays behind too (triage data for the desk, per the support
-- contract).
--
-- The view runs with its owner's privileges (the migration role, which
-- bypasses RLS — the standard Supabase definer-view behaviour) and its WHERE
-- clause IS the access rule; `security_barrier` keeps caller-supplied
-- functions from being pushed below it.

/* ========================================================================== */
/* The stamp                                                                  */
/* ========================================================================== */

alter table public.enquiries
  add column if not exists handed_off_at timestamptz,
  add column if not exists handed_off_by uuid references public.profiles (id) on delete set null;

-- Dropping the constraint first keeps the migration re-runnable.
alter table public.enquiries drop constraint if exists enquiries_handoff_coherent;
alter table public.enquiries add constraint enquiries_handoff_coherent check (
  (handed_off_at is null and handed_off_by is null)
  or (handed_off_at is not null and handed_off_by is not null)
);

comment on column public.enquiries.handed_off_at is
  'When ICEFALL deliberately passed this enquiry to the company it names. Set once, '
  'by a named staff member, never automatically. Until it is set, no operator sees '
  'the row. The sender can see it too — being passed on is not a secret from them.';

/**
 * Guard, extended: the hand-off is stamped once, by the actor themselves, and
 * only on an enquiry that actually names a company — an enquiry about a bare
 * mountain has nobody to hand off to, and stamping it would file the
 * customer's words with whichever company someone guessed.
 *
 * (CREATE OR REPLACE of the same function the existing trigger calls — the
 * immutability rules above it are unchanged and still enforced.)
 */
create or replace function public.enquiries_guard()
returns trigger
language plpgsql
as $$
begin
  if new.body is distinct from old.body
     or new.sender_id is distinct from old.sender_id
     or new.sender_kind is distinct from old.sender_kind
     or new.sender_email is distinct from old.sender_email
     or new.sender_name is distinct from old.sender_name
     or new.origin_app is distinct from old.origin_app
     or new.origin_screen is distinct from old.origin_screen
     or new.product_id is distinct from old.product_id
     or new.destination_id is distinct from old.destination_id
     or new.company_id is distinct from old.company_id
     or new.object_label is distinct from old.object_label
     or new.created_at is distinct from old.created_at then
    raise exception 'an enquiry''s message and provenance are immutable — only seen, answer and hand-off may change';
  end if;
  if old.seen_at is not null and new.seen_at is distinct from old.seen_at then
    raise exception 'seen cannot be unseen or re-dated';
  end if;
  if old.answered_at is not null and (new.answered_at is distinct from old.answered_at
      or new.answer is distinct from old.answer) then
    raise exception 'an answer, once given, is the record — it does not change silently';
  end if;
  if old.handed_off_at is not null
     and (new.handed_off_at is distinct from old.handed_off_at
       or new.handed_off_by is distinct from old.handed_off_by) then
    raise exception 'a hand-off is stamped once — it is not re-dated or re-attributed';
  end if;
  if old.handed_off_at is null and new.handed_off_at is not null then
    if new.company_id is null then
      raise exception 'an enquiry that names no company has nobody to hand off to';
    end if;
    if new.handed_off_by is distinct from auth.uid() then
      raise exception 'a hand-off is stamped by the person doing it, in their own name';
    end if;
  end if;
  return new;
end;
$$;

/**
 * Handing a customer's words to a third party is a disclosure, and it leaves
 * a trace — same posture as deleting one. DEFINER because staff do not hold
 * an insert grant on audit_events.
 */
create or replace function public.enquiries_handoff_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_events
    (actor_id, actor_role, action, entity_type, entity_id, previous, next, company_id)
  values
    (auth.uid(), coalesce(public.my_role()::text, 'service'), 'enquiry.handed_off',
     'enquiry', old.id::text, null,
     jsonb_build_object('handed_off_at', new.handed_off_at, 'company_id', new.company_id),
     new.company_id);
  return new;
end;
$$;

drop trigger if exists enquiries_handoff_audit on public.enquiries;
create trigger enquiries_handoff_audit
  after update on public.enquiries
  for each row
  when (old.handed_off_at is null and new.handed_off_at is not null)
  execute function public.enquiries_handoff_audit();

/* ========================================================================== */
/* What an operator sees                                                      */
/* ========================================================================== */

-- Recreated wholesale on re-run: a view's column list is its contract, and
-- ALTERs that widen it should be deliberate edits to this statement.
drop view if exists public.operator_enquiries;
create view public.operator_enquiries
with (security_barrier)
as
  select
    e.id,
    e.created_at,
    e.company_id,
    e.product_id,
    e.destination_id,
    e.object_label,
    e.body,
    -- A first name to address; never the address to reach around ICEFALL.
    e.sender_name,
    e.origin_app,
    (e.seen_at is not null) as seen,
    e.answered_at,
    e.answer,
    e.handed_off_at
  from public.enquiries e
  where e.handed_off_at is not null
    and public.is_company_member(e.company_id);

comment on view public.operator_enquiries is
  'Enquiries ICEFALL has handed off to the caller''s company — the operator portal '
  'reads this, never the base table. Deliberately excludes sender_email/sender_id '
  '(the customer wrote to ICEFALL; contact stays at the desk) and origin_screen '
  '(desk triage data). The WHERE clause is the access rule; the CRM remains the '
  'desk of record and staff keep working the row after hand-off.';

revoke all on public.operator_enquiries from public, anon;
grant select on public.operator_enquiries to authenticated;
