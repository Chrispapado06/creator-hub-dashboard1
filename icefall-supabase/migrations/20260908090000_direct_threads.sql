-- ICEFALL — two people, one conversation.
--
-- THE OWNER, 2026-09-08: "an option to message someone if you see their profile".
--
-- The schema has supported person-to-person messaging since the foundation
-- migration — `threads.kind = 'direct'` has been a legal value since
-- 20260818090000 — and no app has ever created one. Building that button
-- surfaced exactly one thing the existing policies cannot do, and this file is
-- only that thing.
--
-- ── THE PROBLEM: OPEN-OR-CREATE IS TWO ROUND TRIPS ──────────────────────────
--
-- A client CAN do this today, entirely under the current policies, and
-- `icefall-app/src/messaging/send.ts` does exactly that when this function is
-- absent:
--
--   · `thread_participants_select` shows you your own memberships and the
--     rosters of threads you are in — enough to find the pair.
--   · `threads_insert` (`created_by = auth.uid()`) lets you make one.
--   · `thread_participants_insert` lets the CREATOR of a thread seat anybody
--     in it — enough to put both of you in it.
--
-- What it cannot do is make those atomic. Two people tapping "Message" on each
-- other inside the same second both search, both find nothing, and both create
-- — and the conversation splits in two. Nobody loses a message; both threads
-- are real and readable. But each person answers in a different one and neither
-- sees the other's reply, which is indistinguishable from the app being broken.
--
-- ── WHY A FUNCTION AND NOT A CONSTRAINT ─────────────────────────────────────
--
-- The obvious alternative is a unique index on "the pair". There is nowhere to
-- put one: the pair lives in `thread_participants` as two rows, and the thread
-- exists before either of them. Expressing it would mean a denormalised
-- `direct_key` column on `threads`, maintained by a trigger over a second
-- table, which is a heavier and more fragile thing than one advisory lock.
--
-- ── WHAT THIS FUNCTION DOES NOT DECIDE ──────────────────────────────────────
--
-- It does not decide who may talk to whom. `messages_insert` does, with all
-- four of its conjuncts, and this function adds no fifth rule and restates
-- none of the four. Two checks appear here and both are borrowed rather than
-- re-implemented:
--
--   · `blocked_between(p_other)` — the same helper `messages_insert` calls
--     through `blocked_in_thread`. Refusing here means a blocked pair never
--     even gets an empty thread; without it the thread would be created and
--     only the first message refused, leaving an empty conversation in a
--     stranger's inbox that they cannot reply in and did not ask for.
--
--   · `may_write_to_thread(v_thread)` — DECISION 19 ITSELF, called on the row
--     just inserted rather than paraphrased. A guide or operator may reply but
--     may never open, so if the thread they just created is one they may not
--     write into, the whole function raises and the insert rolls back. Writing
--     `if my_role() in ('guide','operator')` here instead would have been a
--     second copy of decision 19, and the two would drift the day the decision
--     is refined — the failure this schema keeps finding.
--
-- SECURITY DEFINER, and it earns it: it must read `thread_participants` rows
-- belonging to the OTHER person to know whether the pair already exists, which
-- `thread_participants_select` will not show a caller for a thread they are not
-- yet in. It takes one profile id and returns one thread id, so it cannot be
-- used to read anything else — and every branch that is not "here is your
-- conversation" returns NULL, saying nothing about why.

/**
 * The one `direct` thread between the caller and `p_other`, creating it only
 * if there is none.
 *
 * Returns NULL — deliberately without saying which — when there is no session,
 * when `p_other` is the caller or does not exist, or when the two are in a
 * block. A caller cannot use the answer to learn that somebody blocked them:
 * every refusal looks the same, which is the whole point of `blocks_own`
 * withholding the block in the first place.
 */
create or replace function public.open_direct_thread(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := (select auth.uid());
  v_thread uuid;
begin
  if v_me is null or p_other is null or p_other = v_me then
    return null;
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_other) then
    return null;
  end if;

  -- Symmetric, and checked before anything is written. See the header.
  if public.blocked_between(p_other) is not false then
    return null;
  end if;

  /*
   * THE LOCK IS THE WHOLE REASON THIS FUNCTION EXISTS.
   *
   * Keyed on the UNORDERED pair, so A→B and B→A take the same lock and the
   * second caller waits for the first to finish creating rather than creating
   * a second conversation. Transaction-scoped, so it is released when the
   * statement ends whether this succeeds or raises — there is no path that
   * leaves it held.
   */
  perform pg_advisory_xact_lock(
    hashtextextended(
      least(v_me, p_other)::text || '/' || greatest(v_me, p_other)::text, 0
    )
  );

  /*
   * An existing pair: a `direct` thread containing both of us and NOBODY else.
   * The roster size test matters — without it, a three-person group that
   * happens to contain the two of us would be returned as "your conversation
   * with them", and a private message would land in front of a third party.
   */
  select t.id into v_thread
    from public.threads t
   where t.kind = 'direct'
     and exists (
       select 1 from public.thread_participants a
        where a.thread_id = t.id and a.profile_id = v_me
     )
     and exists (
       select 1 from public.thread_participants b
        where b.thread_id = t.id and b.profile_id = p_other
     )
     and (
       select count(*) from public.thread_participants tp where tp.thread_id = t.id
     ) = 2
   -- Oldest wins, so a pair that was split before this function existed
   -- converges on the conversation that has the history in it.
   order by t.created_at
   limit 1;

  if v_thread is not null then
    return v_thread;
  end if;

  insert into public.threads (created_by, kind)
  values (v_me, 'direct')
  returning id into v_thread;

  insert into public.thread_participants (thread_id, profile_id)
  values (v_thread, v_me), (v_thread, p_other);

  /*
   * DECISION 19, asked rather than restated. If the caller may not write into
   * the thread they just made — a guide or an operator opening a conversation
   * — this raises, and the two inserts above roll back with it. The client
   * sees the same 42501 a refused message produces and says so in the same
   * words.
   */
  if public.may_write_to_thread(v_thread) is not true then
    raise exception 'a guide or operator may reply, but may never open a conversation'
      using errcode = '42501';
  end if;

  return v_thread;
end;
$$;

comment on function public.open_direct_thread(uuid) is
  'Find-or-create the two-party thread between the caller and one other person, '
  'under an advisory lock on the unordered pair so two simultaneous taps cannot '
  'split the conversation. Decides nothing about who may talk: it borrows '
  'blocked_between() and may_write_to_thread() rather than restating them.';

-- Default privileges hand EXECUTE to PUBLIC — which includes `anon` — so the
-- revoke is not decoration. The lesson is recorded in
-- 20260828150000_crm_fixes.sql and every definer function in this schema
-- follows it.
revoke all on function public.open_direct_thread(uuid) from public, anon;
grant execute on function public.open_direct_thread(uuid) to authenticated;
