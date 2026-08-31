-- Let people actually open a support ticket.
--
-- WHAT WAS WRONG. ICEFALL has a complete support schema — tickets, threaded
-- messages, an `internal` flag that keeps staff notes off the customer's screen,
-- a resolution the status CHECK refuses to close without. All of it correct, and
-- **nobody outside ICEFALL could raise a ticket**, two ways at once:
--
--   1. `support_tickets_write` requires `has_staff_role(['support'])` for ALL
--      commands including INSERT. A climber, a guide and a company user were
--      equally refused.
--   2. `reference` is `not null unique` with no default and no trigger, so even
--      a permitted INSERT failed unless it invented its own reference.
--
-- The message policies were already right and are untouched: a requester may
-- reply to their own ticket while `internal = false`, and internal notes are
-- visible to staff only.
--
-- TWO NEW COLUMNS, AND THE DISTINCTION BETWEEN THEM IS THE POINT.
--
-- `requester_kind` is STAMPED, not joined. Whether somebody is a guide or acts
-- for a company is derivable from their profile today — the owner's point, and
-- correct. It is stamped anyway for three reasons, any one sufficient:
--
--   · `requester_id` is `on delete set null`. Delete a profile and a derived
--     segment vanishes, moving that person's whole support history into an
--     "unknown" bucket.
--   · A person can be more than one thing. A guide is also a climber; a
--     company's staff member has an athlete profile too. The ticket needs the
--     hat they were wearing when they wrote, not the union of their roles.
--   · Roles change. `accept_invitations` turns a climber into a guide or a
--     company user. Derived segments would silently re-file every old ticket
--     that person ever raised. A support history that reorganises its own past
--     is the same defect as recomputing a price a customer already agreed.
--
-- `origin_app` is RECORDED because it cannot be derived at all: the same climber
-- on the phone and on the web is one person, and a bug report is worth much less
-- without knowing where they were standing.
--
-- REQUESTER_KIND IS NEVER ACCEPTED FROM THE CLIENT. `open_support_ticket`
-- computes it from the caller's real identity. A client that could send
-- `requester_kind = 'company'` could put an ordinary climber's ticket into the
-- queue that carries a contract and money behind it — the same class as a draft
-- setting `realBusiness`, or signup metadata setting `role`.

begin;

/* ========================================================================== */
/* 1. A reference nobody has to invent                                        */
/* ========================================================================== */

create sequence if not exists public.support_reference_seq;

create or replace function public.support_tickets_reference()
returns trigger
language plpgsql
as $$
begin
  if new.reference is null or btrim(new.reference) = '' then
    new.reference := 'ICE-' || lpad(nextval('public.support_reference_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_reference on public.support_tickets;
create trigger support_tickets_reference
  before insert on public.support_tickets
  for each row execute function public.support_tickets_reference();

-- Start the sequence past anything already there, so a seeded reference and a
-- generated one cannot collide on the unique index.
select setval('public.support_reference_seq',
  greatest(1, (select count(*) from public.support_tickets)) + 100, true);

/* ========================================================================== */
/* 2. Who asked, and from where                                               */
/* ========================================================================== */

alter table public.support_tickets
  add column if not exists requester_kind text,
  add column if not exists origin_app     text,
  add column if not exists origin_screen  text,
  add column if not exists requester_email text,
  add column if not exists requester_name  text;

-- Existing rows were all raised by staff, because until now nothing else could.
update public.support_tickets set requester_kind = 'staff' where requester_kind is null;
update public.support_tickets set origin_app = 'crm' where origin_app is null;

alter table public.support_tickets
  alter column requester_kind set default 'athlete',
  alter column requester_kind set not null,
  alter column origin_app set default 'crm',
  alter column origin_app set not null;

alter table public.support_tickets drop constraint if exists support_tickets_requester_kind_known;
alter table public.support_tickets add constraint support_tickets_requester_kind_known check (
  requester_kind in ('athlete', 'guide', 'company', 'visitor', 'staff')
);

alter table public.support_tickets drop constraint if exists support_tickets_origin_app_known;
alter table public.support_tickets add constraint support_tickets_origin_app_known check (
  origin_app in ('phone_app', 'web', 'guide_app', 'operator_portal', 'crm')
);

-- A ticket from somebody with no account must carry a way to answer them; one
-- from a signed-in person must not need to, because we already know who they are.
alter table public.support_tickets drop constraint if exists support_tickets_visitor_reachable;
alter table public.support_tickets add constraint support_tickets_visitor_reachable check (
  requester_kind <> 'visitor' or requester_email is not null
);

comment on column public.support_tickets.requester_kind is
  'What the requester was WHEN THEY WROTE. Stamped by open_support_ticket from the caller''s real identity, never accepted from a client, and never recomputed — roles change and a support history must not re-file itself.';
comment on column public.support_tickets.origin_app is
  'Which app the request came from. Not derivable: the same climber on the phone and on the web is one person.';

/* Widen `type`: a guide's two commonest problems were both landing in `content`. */
alter table public.support_tickets drop constraint if exists support_tickets_type_check;
alter table public.support_tickets add constraint support_tickets_type_check check (
  type in ('account','booking','payment','content','operator','safety','technical',
           'verification','listing','other')
);

create index if not exists idx_support_tickets_requester_kind
  on public.support_tickets (requester_kind, opened_at desc);

/* ========================================================================== */
/* 3. Opening a ticket — the only sanctioned path for a signed-in person      */
/* ========================================================================== */

/**
 * Returns the new ticket's id and reference.
 *
 * The caller supplies what they know — subject, body, type, where they were.
 * The FUNCTION decides who they are. That split is the whole security design:
 * everything a client could lie about to change how the ticket is treated is
 * computed here from `auth.uid()`.
 */
create or replace function public.open_support_ticket(
  p_subject text,
  p_body text,
  p_type text default 'other',
  p_origin_app text default 'phone_app',
  p_origin_screen text default null
)
returns jsonb
language plpgsql volatile security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_company uuid;
  v_id uuid;
  v_ref text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_subject is null or length(btrim(p_subject)) = 0 then
    raise exception 'a support request needs a subject';
  end if;
  if p_body is null or length(btrim(p_body)) < 10 then
    raise exception 'please describe the problem in a little more detail';
  end if;
  if p_origin_app not in ('phone_app','web','guide_app','operator_portal','crm') then
    raise exception 'unknown origin app';
  end if;

  -- WHO THEY ARE, decided here and not by the caller. Company first: someone
  -- acting for an operator has a contract behind their question, and that is
  -- the hat that matters even though they are also a climber.
  select cu.company_id into v_company
    from public.company_users cu
   where cu.profile_id = v_uid and cu.status = 'active'
   limit 1;

  if v_company is not null then
    v_kind := 'company';
  elsif exists (select 1 from public.guide_profiles g where g.id = v_uid) then
    v_kind := 'guide';
  elsif public.is_staff() then
    v_kind := 'staff';
  else
    v_kind := 'athlete';
  end if;

  insert into public.support_tickets
    (subject, type, priority, status, requester_id, company_id,
     requester_kind, origin_app, origin_screen, opened_at)
  values
    (left(btrim(p_subject), 200), p_type, 'normal', 'open', v_uid, v_company,
     v_kind, p_origin_app, left(coalesce(p_origin_screen, ''), 200), now())
  returning id, reference into v_id, v_ref;

  insert into public.support_ticket_messages (ticket_id, author_id, body, internal)
  values (v_id, v_uid, btrim(p_body), false);

  return jsonb_build_object('ok', true, 'id', v_id, 'reference', v_ref, 'kind', v_kind);
end;
$$;

revoke all on function public.open_support_ticket(text, text, text, text, text) from public, anon;
grant execute on function public.open_support_ticket(text, text, text, text, text) to authenticated;

/* ========================================================================== */
/* 4. Anonymous visitors — a separate table, the waitlist's exact shape       */
/* ========================================================================== */

/**
 * A visitor on the public site has no account and cannot get one, so they
 * cannot appear in `support_tickets`: `support_ticket_messages.author_id` is NOT
 * NULL and every read policy keys on `requester_id = auth.uid()`.
 *
 * WHY A SEPARATE TABLE RATHER THAN RELAXING THOSE. Granting `anon` insert on
 * `support_tickets` would open a table full of customers' free text — and the
 * staff-only `internal` notes threaded beside it — to the internet, on the
 * strength of one policy being written correctly forever. This mirrors
 * `waitlist` instead: insert-only, no select policy, nothing readable by the
 * writer. Staff triage from here into a real ticket.
 */
create table if not exists public.support_intake (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  name text,
  subject text not null,
  body text not null,
  origin_app text not null default 'web',
  origin_screen text,
  handled_at timestamptz,
  ticket_id uuid,

  constraint support_intake_email_shape check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint support_intake_subject_len check (length(btrim(subject)) between 1 and 200),
  -- The DATABASE is the real limit, not a JavaScript maxlength anybody can edit.
  constraint support_intake_body_len check (length(btrim(body)) between 20 and 4000)
);

alter table public.support_intake enable row level security;

-- BELT AND BRACES, as the waitlist does it. Either half alone is insufficient:
-- Supabase's default privileges hand `anon` access to every new table in public,
-- so the revoke matters as much as the policy.
revoke all on public.support_intake from anon, authenticated;
grant insert on public.support_intake to anon;

drop policy if exists support_intake_insert on public.support_intake;
create policy support_intake_insert on public.support_intake
  for insert to anon with check (true);

-- No select policy for anon, deliberately: whoever can write must not be able
-- to read what anybody else wrote.
drop policy if exists support_intake_staff_read on public.support_intake;
create policy support_intake_staff_read on public.support_intake
  for select to authenticated using (public.is_staff());

grant select, update on public.support_intake to authenticated;

drop policy if exists support_intake_staff_update on public.support_intake;
create policy support_intake_staff_update on public.support_intake
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create index if not exists idx_support_intake_unhandled
  on public.support_intake (created_at desc) where handled_at is null;

comment on table public.support_intake is
  'Support requests from people with no account. Insert-only for anon with no select policy — the waitlist''s shape. Staff triage these into real tickets; nothing here is a ticket yet.';

commit;
