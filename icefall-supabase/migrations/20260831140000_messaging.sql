-- ICEFALL — S1 messaging: the send path, read receipts, and two locks the
-- existing spine turned out to need.
--
-- The spine (threads / thread_participants / messages) has existed since the
-- foundation migration, with the posture that matters already in place:
-- membership-gated reads, block enforcement in the INSERT policy, decision 19
-- (a guide or operator may reply, never open), offline idempotency via
-- (sender_id, client_id), and NO update or delete on messages for anyone —
-- what was said is the record. This migration makes the spine usable by three
-- apps at once, and closes two holes found while reading it:
--
--   HOLE 1 — A PARTICIPANT ROW COULD BE MOVED. `thread_participants` grants
--   UPDATE, and `thread_participants_update_self` checks only
--   `profile_id = auth.uid()` — nothing pinned `thread_id`. Anyone could
--   UPDATE their own membership row to point at ANY thread id and become a
--   participant of a private conversation they were never invited to,
--   bypassing the deliberately narrow insert policy. Thread ids are
--   unguessable, but they are not secrets (bookings carry them). Closed by
--   trigger below: a membership row names its conversation forever.
--
--   HOLE 2 — THE OBJECTIVE WAS NOT ACTUALLY PINNED. The foundation's comment
--   on `threads_update` says "Nobody may rewrite what it was about", but the
--   policy checks only membership — any participant could UPDATE peak_name,
--   dates or group_size and change the record of what was asked underneath
--   the replies to it. Closed by trigger below; the comment is now true.
--
-- Both guards are triggers, not policies, and exempt NOBODY — staff included,
-- the same stance as enquiries and booking_agreements: an ICEFALL employee
-- rewriting a conversation's subject line is the same lie as a customer doing
-- it.

/* ========================================================================== */
/* Lock 1 — a membership row names its conversation forever                   */
/* ========================================================================== */

/**
 * Only `last_read_at` may change on a participant row, and only FORWARD.
 *
 * A read receipt is a timestamp, not a boolean (the product rule), and a
 * receipt that moves backwards is a lie about what somebody has seen — the
 * one thing the other party actually infers from it.
 */
create or replace function public.thread_participants_guard()
returns trigger
language plpgsql
as $$
begin
  if new.thread_id is distinct from old.thread_id
     or new.profile_id is distinct from old.profile_id
     or new.joined_at is distinct from old.joined_at then
    raise exception 'a participant row names its conversation forever — only last_read_at may change';
  end if;
  if new.last_read_at is distinct from old.last_read_at then
    -- Forward only, never before you joined, never into the future: each of
    -- those is a claim about what was seen that cannot be true.
    if new.last_read_at is null
       or new.last_read_at < coalesce(old.last_read_at, old.joined_at)
       or new.last_read_at > now() then
      raise exception 'a read receipt only moves forward';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists thread_participants_guard on public.thread_participants;
create trigger thread_participants_guard
  before update on public.thread_participants
  for each row execute function public.thread_participants_guard();

comment on column public.thread_participants.last_read_at is
  'Read receipt, per person: everything at or before this moment has been seen. '
  'A timestamp, never a boolean; trigger-enforced to only move forward.';

/* ========================================================================== */
/* Lock 2 — the objective is the record of what was asked                     */
/* ========================================================================== */

/**
 * What may change on a thread after creation: `status` (participants may close
 * or reopen), `title` (groups rename themselves), and `last_message_at` (the
 * inbox-ordering column the message trigger maintains). Everything else IS
 * the enquiry — the peak, the dates, the party size, who opened it — and an
 * edit to any of it would change what the replies were replying to.
 */
create or replace function public.threads_guard()
returns trigger
language plpgsql
as $$
begin
  if new.peak_name is distinct from old.peak_name
     or new.peak_elevation_m is distinct from old.peak_elevation_m
     or new.from_date is distinct from old.from_date
     or new.to_date is distinct from old.to_date
     or new.group_size is distinct from old.group_size
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.kind is distinct from old.kind then
    raise exception 'the objective is the record of what was asked — it does not change under the conversation';
  end if;
  -- Retitling is a group affordance. On a two-party or enquiry thread the
  -- title is derived from who is in it; a client writing one would be writing
  -- the other party's label.
  if new.title is distinct from old.title and old.kind <> 'group' then
    raise exception 'only a group thread can be retitled';
  end if;
  return new;
end;
$$;

drop trigger if exists threads_guard on public.threads;
create trigger threads_guard
  before update on public.threads
  for each row execute function public.threads_guard();

/* ========================================================================== */
/* Sending                                                                    */
/* ========================================================================== */

/**
 * The one send path all three apps call.
 *
 * SECURITY INVOKER, deliberately: the INSERT inside passes through the
 * `messages_insert` policy with all four conjuncts (self, membership, blocks,
 * decision 19) exactly as a raw insert would. A DEFINER copy of that logic
 * would be a second implementation of the send rules, and the two would
 * drift (§6u). What the function adds is what a policy cannot:
 *
 *   - IDEMPOTENT RESEND. A client retrying `p_client_id` gets the original
 *     row back instead of a duplicate or a unique-violation error — the
 *     offline queue's contract, now honoured at the API instead of making
 *     every client handle the conflict themselves.
 *   - SENDING IS READING. The sender's own read receipt is stamped in the
 *     same transaction, so your own message can never sit "unread" at you.
 */
create or replace function public.send_message(
  p_thread_id uuid,
  p_body text,
  p_client_id uuid default null,
  p_kind text default 'text',
  p_attachment_path text default null,
  p_attachment_meta jsonb default null
)
returns public.messages
language plpgsql
as $$
declare
  v_row public.messages;
begin
  if p_client_id is not null then
    select * into v_row from public.messages
     where sender_id = auth.uid() and client_id = p_client_id;
    if found then
      return v_row; -- the retry of a message that already arrived
    end if;
  end if;

  begin
    insert into public.messages
      (thread_id, sender_id, body, kind, client_id, attachment_path, attachment_meta)
    values
      (p_thread_id, auth.uid(), p_body, p_kind, p_client_id, p_attachment_path, p_attachment_meta)
    returning * into v_row;
  exception when unique_violation then
    -- Two devices raced the same client_id; the first one won and its row is
    -- the message. Return it.
    select * into v_row from public.messages
     where sender_id = auth.uid() and client_id = p_client_id;
    return v_row;
  end;

  update public.thread_participants
     set last_read_at = greatest(coalesce(last_read_at, v_row.created_at), v_row.created_at)
   where thread_id = p_thread_id and profile_id = auth.uid();

  return v_row;
end;
$$;

/**
 * Mark everything in a thread as read, now. Returns the stamp, or NULL when
 * the caller is not a participant (their UPDATE matches no row — saying
 * nothing about whether the thread exists).
 *
 * Monotonic by construction; the trigger above backstops it.
 */
create or replace function public.mark_thread_read(p_thread_id uuid)
returns timestamptz
language plpgsql
as $$
declare
  v_at timestamptz;
begin
  update public.thread_participants
     set last_read_at = now()
   where thread_id = p_thread_id
     and profile_id = auth.uid()
     and (last_read_at is null or last_read_at < now())
  returning last_read_at into v_at;
  return v_at;
end;
$$;

-- Default privileges would hand these to anon via PUBLIC (the definer-fn
-- lesson applies to every function): revoke first, grant deliberately.
revoke all on function public.send_message(uuid, text, uuid, text, text, jsonb) from public, anon;
revoke all on function public.mark_thread_read(uuid) from public, anon;
grant execute on function public.send_message(uuid, text, uuid, text, text, jsonb) to authenticated;
grant execute on function public.mark_thread_read(uuid) to authenticated;

/* ========================================================================== */
/* Realtime                                                                   */
/* ========================================================================== */

-- Messages and receipts stream; RLS gates who receives what. Guarded because
-- the publication belongs to the platform, not this schema, and re-running
-- must not fail on either its absence or a prior add.
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null; when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.thread_participants;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end;
$$;
