-- ICEFALL — the customer opens every conversation.
--
-- OWNER DECISION 19, 2026-08-29: a guide or operator may REPLY, but may never
-- send the FIRST message in a thread.
--
-- ── WHAT THIS REPLACES, AND WHY NOT THE THING THAT WAS DOCUMENTED ──────────
--
-- `20260818090000_chat.sql:188` carries a long note saying a paid-booking gate
-- "must live in messages_insert", deferred only because `public.bookings` did
-- not exist yet. It exists now, and an adversarial review correctly found that
-- the gate was never built.
--
-- It is not built here either, because building it verbatim would break the
-- marketplace. That comment was written for the PHONE APP, where a client books
-- a guide and the rule stops a guide cold-messaging strangers. The operator
-- model runs the other way: a customer enquires, an operator replies, and only
-- then is there a booking. `leads.status` goes new → contacted → qualified →
-- quoted → booked, and "contacted" MEANS the operator replied — three states
-- before a booking exists. A paid-booking gate freezes every lead at `new`.
--
-- Two artefacts disagreed and the older comment lost, which is the rule: a
-- specification is authoritative about what to build, not about what the
-- business does, and the owner is the tiebreak on the second.
--
-- The risk the old rule was protecting against is OFF-PLATFORM SOLICITATION — a
-- provider taking a client outside ICEFALL, where the client loses the record of
-- what was agreed and the refund terms with it. A paid booking is a poor proxy
-- for that: the risk is identical the day after one. Cold outreach is the actual
-- attack, and requiring the customer to open the thread blocks it exactly.
--
-- It is also cleaner than the documented version could have been. That one tested
-- `status <> 'awaiting_deposit'` — a GUIDE-stream status that does not appear in
-- the expedition vocabulary at all, so it would have mis-evaluated against every
-- expedition booking. This rule never has to reason about booking vocabulary.
--
-- UNAFFECTED, deliberately: party chat, two athletes talking to each other, and
-- ICEFALL staff. The gate bites only on a guide or an operator opening a thread.

/**
 * Has the customer said anything in this thread yet?
 *
 * DEFINER because it reads `messages`, which the caller may only read through
 * thread membership — and the answer is needed before deciding whether they may
 * write at all. It takes an id and returns a yes/no, so it cannot be used to
 * read anything but that.
 */
create or replace function public.customer_has_opened(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select true
    from public.messages m
    join public.profiles p on p.id = m.sender_id
    where m.thread_id = t and p.role = 'athlete'
    limit 1
  ), false);
$$;

/**
 * May the caller write into this thread at all?
 *
 * Every branch coalesces to false. A SQL function over a row that does not exist
 * returns NULL, and NULL in a WITH CHECK is not true — but written the other way
 * round a NULL sails straight through a negation, which is the trap the
 * foundation migration's header describes.
 */
create or replace function public.may_write_to_thread(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    -- Athletes and ICEFALL staff are not gated. The decision names guides and
    -- operators, and widening it to staff would stop Support answering anybody.
    when coalesce(public.my_role() in ('guide', 'operator'), false) is not true then true
    -- An expedition party talking among themselves is not a sales channel.
    when coalesce((select th.kind = 'group' from public.threads th where th.id = t), false) then true
    -- Otherwise: reply, never open.
    else public.customer_has_opened(t)
  end;
$$;

-- Recreated with the fourth conjunct. The first three are unchanged and still
-- carry their own reasons: you can only write as yourself, only into a thread
-- you are in, and not at somebody who has blocked you.
--
-- THERE IS STILL NO UPDATE AND NO DELETE POLICY ON `messages`, for anyone,
-- including admin. A message is a record of what was said.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_thread_participant(thread_id)
    and not public.blocked_in_thread(thread_id)
    and public.may_write_to_thread(thread_id)
  );

revoke all on function public.customer_has_opened(uuid)  from public, anon;
revoke all on function public.may_write_to_thread(uuid)  from public, anon;
grant execute on function public.customer_has_opened(uuid) to authenticated;
grant execute on function public.may_write_to_thread(uuid) to authenticated;
