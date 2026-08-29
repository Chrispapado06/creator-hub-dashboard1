-- ICEFALL — chat.
--
-- Builds on the messaging spine from the foundation migration. Three things are
-- added here, and each exists for a reason particular to this product.
--
--   1. SENDING FROM A PLACE WITH NO SIGNAL. A guide writes from a hut at
--      3,800 m and the message leaves the phone hours later, when they drop into
--      the valley. The client's device does the same. So a message carries a
--      `client_id` minted on the device before it is ever sent, and a unique
--      index makes a retry idempotent — a queued message that sends twice
--      inserts once. Without this the offline queue duplicates every message
--      that was retried, which is the failure that makes people distrust a chat.
--
--   2. GROUPS. An expedition party talks as a group, and the participants table
--      already supported it — this adds the thread kind and title so a group can
--      be told apart from a two-party enquiry.
--
--   3. BEING ABLE TO STOP SOMEONE TALKING TO YOU. Any app where strangers can
--      message each other needs blocking and reporting on day one, not after the
--      first incident. The block is enforced in the INSERT policy, not in the
--      UI, so it holds no matter which client is talking to the API.

/* ========================================================================== */
/* Threads gain a kind                                                        */
/* ========================================================================== */

alter table public.threads
  add column if not exists kind text not null default 'enquiry'
    check (kind in ('direct', 'group', 'enquiry'));

-- Groups have a name; a two-party thread is titled by who is in it.
alter table public.threads add column if not exists title text;

comment on column public.threads.kind is
  'direct = two people, group = expedition party, enquiry = a client approaching a guide or company.';

/* ========================================================================== */
/* Messages gain kind, attachments and an idempotency key                     */
/* ========================================================================== */

alter table public.messages
  add column if not exists kind text not null default 'text'
    check (kind in ('text', 'image', 'voice', 'file', 'system'));

/**
 * The device's own id for this message.
 *
 * Minted before the first send attempt and kept across retries. The partial
 * unique index below is what actually makes offline sending safe: the second
 * attempt hits a conflict instead of creating a duplicate.
 */
alter table public.messages add column if not exists client_id uuid;

alter table public.messages add column if not exists attachment_path text;
alter table public.messages add column if not exists attachment_meta jsonb;

-- Scoped to the sender: two people can't collide, and a null stays unconstrained
-- so a server-generated system message needs no client id.
create unique index if not exists messages_sender_client_id_key
  on public.messages (sender_id, client_id)
  where client_id is not null;

-- A message body is required for text, but an image or voice note has none.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_present check (
    (kind = 'text' and length(trim(body)) between 1 and 8000)
    or (kind <> 'text' and attachment_path is not null)
    or (kind = 'system' and length(trim(body)) between 1 and 8000)
  );

/* ========================================================================== */
/* Blocking                                                                   */
/* ========================================================================== */

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

/**
 * Is there a block in EITHER direction between the caller and this thread's
 * other participants?
 *
 * Symmetric on purpose. If A blocks B, neither should be able to keep the
 * conversation going — a one-way block that still lets the blocker talk at
 * somebody is not a block, it is a mute with extra steps.
 */
create or replace function public.blocked_in_thread(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select true
    from public.thread_participants tp
    join public.blocks b
      on (b.blocker_id = tp.profile_id and b.blocked_id = auth.uid())
      or (b.blocker_id = auth.uid() and b.blocked_id = tp.profile_id)
    where tp.thread_id = t and tp.profile_id <> auth.uid()
    limit 1
  ), false);
$$;

/* ========================================================================== */
/* Reporting                                                                  */
/* ========================================================================== */

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid references public.profiles (id) on delete set null,
  thread_id uuid references public.threads (id) on delete set null,
  reason text not null check (
    reason in ('spam', 'harassment', 'off_platform_payment', 'safety', 'impersonation', 'other')
  ),
  detail text,
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed'))
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

comment on column public.reports.reason is
  'off_platform_payment is listed because it is the failure that costs a client the '
  'most: paid outside ICEFALL, they lose held funds, the refund terms and any record '
  'of what was agreed.';

/* ========================================================================== */
/* Row-level security                                                         */
/* ========================================================================== */

alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.blocks force row level security;
alter table public.reports force row level security;

-- You can see and manage only the blocks you created. Deliberately NOT readable
-- by the blocked party: telling someone they have been blocked is how a block
-- turns into an escalation.
drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks
  for all to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

-- A reporter can see that their report exists; staff can see all of them.
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists reports_admin_update on public.reports;
create policy reports_admin_update on public.reports
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

/* ---- Blocking is enforced on INSERT, not in the UI ----------------------- */

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_thread_participant(thread_id)
    and not public.blocked_in_thread(thread_id)
  );

grant select, insert, update, delete on public.blocks to authenticated;
grant select, insert on public.reports to authenticated;
grant update on public.reports to authenticated;
revoke all on public.blocks from anon;
revoke all on public.reports from anon;

/* ========================================================================== */
/* RULE (server-side, pending the bookings table)                             */
/* ========================================================================== */

-- SUPERSEDED — see 20260829160000_crm_first_message_gate.sql.
--
-- This block used to instruct the next reader to add a paid-booking conjunct to
-- `messages_insert` once `public.bookings` existed. That instruction is now
-- WRONG and is removed rather than left to be followed: the rule it described
-- was written for the phone app's book-then-talk flow, and the operator
-- marketplace runs the other way — a customer enquires, an operator replies, and
-- only then is there a booking. Applying it verbatim would have frozen every
-- lead at `new`, because "contacted" means the operator replied.
--
-- The owner settled it as decision 19: A GUIDE OR OPERATOR MAY REPLY, BUT MAY
-- NEVER SEND THE FIRST MESSAGE IN A THREAD. That blocks the actual risk — cold
-- off-platform solicitation — at no cost to the enquiry flow, and it never has
-- to reason about booking status vocabulary, which the old version got wrong
-- anyway (it tested `awaiting_deposit`, a guide-stream status that does not
-- exist on an expedition booking).
--
-- A stale instruction in a migration is worse than no instruction: somebody
-- would have implemented it, and the tests would have gone green while the
-- marketplace stopped working.
