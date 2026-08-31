-- Enquiries — a climber writes to an expedition company; it lands in the CRM.
--
-- Owner ruling 2026-08-31 (07-ENQUIRY-CONTRACT.md): the inbound queue lives in
-- the Company CRM and ICEFALL staff answer. Operator delivery is a later phase.
-- This is what makes the phone app's Send button honest.
--
-- THE LIFECYCLE IS TIMESTAMPS, NOT A STATUS COLUMN. Contract rule 4: the
-- sender sees only states something actually records. So the row carries
-- created_at / seen_at / answered_at and a state is DERIVED — there is no
-- status field to drift from the facts, and "seen" can never be un-seen by an
-- edit because a trigger refuses to unset it.
--
-- THE SENDER IS DERIVED, NEVER SENT (rule 1) — same shape as
-- open_support_ticket. And THE CUSTOMER'S WORDS ARE IMMUTABLE: nobody, staff
-- included, edits a body after it is written. The workflow columns (seen,
-- answer) are the only things an update may touch, enforced by trigger rather
-- than by trust.
--
-- RETENTION, DECIDED NOW (rule 6, learning from support_intake's open
-- question): rows are kept until a SUPER ADMIN deletes one, and a deletion
-- writes an audit event carrying the removed row — destroying a commercial
-- record leaves a trace. That is the retention policy, stated here.

begin;

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Who asked. Stamped by the function for signed-in senders; the anon insert
  -- policy forces the visitor shape and nothing else.
  sender_id uuid references public.profiles (id) on delete set null,
  sender_kind text not null default 'visitor'
    check (sender_kind in ('athlete', 'guide', 'company', 'visitor', 'staff')),
  sender_email text,
  sender_name text,
  origin_app text not null default 'web'
    check (origin_app in ('phone_app', 'web', 'guide_app', 'operator_portal', 'crm')),
  origin_screen text,

  -- What it is about (rule 2). At least one object, or it is a support
  -- message and belongs in the other queue. Object deletion never erases the
  -- enquiry — the trail outlives the referent.
  product_id uuid references public.products (id) on delete set null,
  destination_id text references public.destinations (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  -- The object's NAME at the time of writing, so "set null on delete" cannot
  -- turn an old enquiry into "about nothing".
  object_label text not null check (length(btrim(object_label)) between 1 and 200),

  body text not null check (length(btrim(body)) between 10 and 4000),

  -- The lifecycle facts. Coherent or absent, never half-set.
  seen_at timestamptz,
  seen_by uuid references public.profiles (id) on delete set null,
  answered_at timestamptz,
  answered_by uuid references public.profiles (id) on delete set null,
  answer text check (answer is null or length(btrim(answer)) between 1 and 8000),

  constraint enquiries_has_object check (
    product_id is not null or destination_id is not null or company_id is not null
  ),
  constraint enquiries_visitor_reachable check (
    sender_kind <> 'visitor' or sender_email is not null
  ),
  constraint enquiries_seen_coherent check (
    (seen_at is null and seen_by is null) or (seen_at is not null and seen_by is not null)
  ),
  constraint enquiries_answered_coherent check (
    (answered_at is null and answered_by is null and answer is null)
    or (answered_at is not null and answered_by is not null and answer is not null)
  )
);

create index if not exists idx_enquiries_waiting
  on public.enquiries (created_at asc) where answered_at is null;
create index if not exists idx_enquiries_sender
  on public.enquiries (sender_id, created_at desc);

comment on table public.enquiries is
  'Commercial enquiries landing in the CRM (owner ruling 2026-08-31). Lifecycle is timestamps, never a status column; the body is immutable; retention = kept until a super admin deletes, audited.';

/* ---- The object is resolved by the TABLE, not trusted from any client ---- */

/**
 * Session 02 caught the near-miss in review, before this ever shipped: the
 * first draft resolved the object inside `open_enquiry` and left the anonymous
 * insert path unguarded — and the anonymous path is the ONLY one the public
 * web app can use, so the guarantee held exactly where nobody needed it and a
 * visitor could attach a real destination with any label they liked, rendered
 * straight into the staff queue.
 *
 * So the resolution lives HERE, on the table, where every write path passes
 * (§6s: where you put the check decides whether it is complete — the same move
 * as the guide-listing pin). Whatever a client sends as `object_label` or a
 * mismatched `company_id` is OVERWRITTEN from the records; a nonexistent
 * object is refused. SECURITY DEFINER because anon holds no select on the
 * catalogue tables and must not need it to be corrected by them.
 */
create or replace function public.enquiries_resolve_object()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_label text;
  v_company uuid;
begin
  if new.product_id is not null then
    select p.name, p.company_id into v_label, v_company
      from public.products p where p.id = new.product_id;
    if v_label is null then raise exception 'no such trip'; end if;
    new.company_id := v_company;  -- a product names its own company
  elsif new.destination_id is not null then
    select d.name into v_label from public.destinations d where d.id = new.destination_id;
    if v_label is null then raise exception 'no such mountain or trek'; end if;
  elsif new.company_id is not null then
    select c.name into v_label from public.companies c where c.id = new.company_id;
    if v_label is null then raise exception 'no such company'; end if;
  else
    raise exception 'an enquiry is about a trip, a mountain or a company — with none it belongs in support';
  end if;
  new.object_label := v_label;
  return new;
end;
$$;

drop trigger if exists enquiries_resolve_object on public.enquiries;
create trigger enquiries_resolve_object
  before insert on public.enquiries
  for each row execute function public.enquiries_resolve_object();

/* ---- The customer's words cannot be edited; seen cannot be unseen -------- */

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
    raise exception 'an enquiry''s message and provenance are immutable — only seen and answer may change';
  end if;
  if old.seen_at is not null and new.seen_at is distinct from old.seen_at then
    raise exception 'seen cannot be unseen or re-dated';
  end if;
  if old.answered_at is not null and (new.answered_at is distinct from old.answered_at
      or new.answer is distinct from old.answer) then
    raise exception 'an answer, once given, is the record — it does not change silently';
  end if;
  return new;
end;
$$;

drop trigger if exists enquiries_guard on public.enquiries;
create trigger enquiries_guard
  before update on public.enquiries
  for each row execute function public.enquiries_guard();

/* ---- Deleting one is audited --------------------------------------------- */

create or replace function public.enquiries_delete_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_events
    (actor_id, actor_role, action, entity_type, entity_id, previous, next, company_id)
  values
    (auth.uid(), coalesce(public.my_role()::text, 'service'), 'enquiry.deleted',
     'enquiry', old.id::text, to_jsonb(old) - 'answer', null, null);
  return old;
end;
$$;

drop trigger if exists enquiries_delete_audit on public.enquiries;
create trigger enquiries_delete_audit
  after delete on public.enquiries
  for each row execute function public.enquiries_delete_audit();

/* ---- Opening one, signed in — the only authenticated write path ---------- */

create or replace function public.open_enquiry(
  p_body text,
  p_product_id uuid default null,
  p_destination_id text default null,
  p_company_id uuid default null,
  p_origin_app text default 'phone_app',
  p_origin_screen text default null
)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_company uuid := p_company_id;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_body is null or length(btrim(p_body)) < 10 then
    raise exception 'tell the operator a little more — ten characters at least';
  end if;
  if p_product_id is null and p_destination_id is null and p_company_id is null then
    raise exception 'an enquiry is about a trip, a mountain or a company — with none it belongs in support';
  end if;

  -- The object is resolved by the table's BEFORE INSERT trigger — one
  -- resolution for every path, so this function and the anonymous insert can
  -- never diverge about what an enquiry is "about".

  -- Who they are — decided here, exactly as open_support_ticket does.
  if exists (select 1 from public.company_users cu
             where cu.profile_id = v_uid and cu.status = 'active') then
    v_kind := 'company';
  elsif exists (select 1 from public.guide_profiles g where g.id = v_uid) then
    v_kind := 'guide';
  elsif public.is_staff() then
    v_kind := 'staff';
  else
    v_kind := 'athlete';
  end if;

  insert into public.enquiries
    (sender_id, sender_kind, origin_app, origin_screen,
     product_id, destination_id, company_id, body)
  values
    (v_uid, v_kind, p_origin_app, left(coalesce(p_origin_screen, ''), 200),
     p_product_id, p_destination_id, v_company, btrim(p_body))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

/* ---- RLS + grants — written together, §6v ------------------------------- */

alter table public.enquiries enable row level security;
alter table public.enquiries force row level security;

-- Staff read the queue; a sender reads their own, including its real state
-- and the answer when one exists (rule 4 — that is how the reply arrives).
drop policy if exists enquiries_select on public.enquiries;
create policy enquiries_select on public.enquiries
  for select to authenticated
  using (public.is_staff() or sender_id = auth.uid());

-- Anonymous visitors: insert-only, forced into the visitor shape with a way
-- to answer them. The support precedent exactly.
drop policy if exists enquiries_anon_insert on public.enquiries;
create policy enquiries_anon_insert on public.enquiries
  for insert to anon
  with check (
    sender_id is null and sender_kind = 'visitor' and sender_email is not null
  );

-- Staff work the queue (seen, answer). The trigger keeps everything else out
-- of reach, so this policy can stay row-shaped.
drop policy if exists enquiries_staff_update on public.enquiries;
create policy enquiries_staff_update on public.enquiries
  for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Retention: a super admin may delete; the trigger writes the trace.
drop policy if exists enquiries_delete on public.enquiries;
create policy enquiries_delete on public.enquiries
  for delete to authenticated
  using (public.has_staff_role(array['super_admin']));

revoke all on public.enquiries from anon, authenticated;
grant insert on public.enquiries to anon;
grant select, update, delete on public.enquiries to authenticated;
-- NOTE: authenticated has NO INSERT grant — a signed-in sender goes through
-- open_enquiry, which derives who they are. That absence is the enforcement.

revoke all on function public.open_enquiry(text, uuid, text, uuid, text, text) from public, anon;
grant execute on function public.open_enquiry(text, uuid, text, uuid, text, text) to authenticated;

commit;
