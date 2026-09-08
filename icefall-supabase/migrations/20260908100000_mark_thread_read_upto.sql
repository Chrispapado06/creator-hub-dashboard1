-- ICEFALL — a read receipt says what was READ, not what o'clock it was.
--
-- `mark_thread_read(p_thread_id)` (20260831140000_messaging.sql) stamps
-- `last_read_at = now()`. That is right for a client that is streaming and
-- wrong for the one ICEFALL actually ships.
--
-- ── THE MESSAGE THIS LOSES, AND IT LOSES IT FOR GOOD ────────────────────────
--
-- The app is a snapshot: it reads a thread when the screen opens and holds no
-- socket (a radio kept awake on a phone that may be on a mountain). So opening
-- a conversation is two round trips — fetch the transcript, then mark it read
-- — and a message that lands between them is:
--
--   · not drawn, because the transcript query had already returned; and
--   · not unread, because `now()` is later than its `created_at`, and the
--     unread count is derived strictly as "from somebody else, after the mark"
--     (icefall-app/src/messaging/conversations.ts).
--
-- The guard makes that permanent rather than merely racy: `last_read_at` only
-- ever moves FORWARD, so no later read can lower the mark back over it. The
-- athlete's only route to that message is pressing reload on a conversation
-- that gives them no reason to think anything is there.
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────
--
-- `p_upto` — the `created_at` of the newest message the screen actually drew.
-- The client claims exactly what it can witness ("I have seen everything up to
-- this row") and anything that arrived afterwards stays correctly unread.
--
-- `greatest()` rather than a bare assignment, and it is load-bearing: the
-- trigger RAISES on a receipt earlier than the stored one, and a thread already
-- marked by the old `now()` holds a stamp LATER than its newest message — so
-- every second open of an already-read conversation would throw. Taking the
-- greater of the two makes an older `p_upto` write back what is already there,
-- which the guard passes without looking.
--
-- `null` keeps the old behaviour exactly, so a phone that has not been updated
-- calls this and gets `now()` as before.
--
-- ── WHY THE OLD SIGNATURE IS DROPPED RATHER THAN LEFT BESIDE THIS ───────────
--
-- A second function with a defaulted parameter does not replace the first: a
-- one-argument call would then match BOTH and Postgres would refuse it as
-- ambiguous — which would break every client in the field, including the ones
-- this migration exists to keep working. Dropping and recreating inside the one
-- transaction leaves no window in which neither exists.

drop function if exists public.mark_thread_read(uuid);

/**
 * Mark a thread read up to a given moment, or up to now.
 *
 * Returns the stamp, or NULL when the caller is not a participant — their
 * UPDATE matches no row, which says nothing about whether the thread exists.
 */
create or replace function public.mark_thread_read(
  p_thread_id uuid,
  p_upto timestamptz default null
)
returns timestamptz
language plpgsql
as $$
declare
  v_at timestamptz;
  -- Never the future: a receipt for a message that has not been written is not
  -- a thing a client gets to claim, and the trigger refuses it anyway.
  v_upto timestamptz := least(coalesce(p_upto, now()), now());
begin
  /*
   * NO "only if it moves" FILTER, deliberately. `greatest()` already makes a
   * stale `p_upto` write the value that is already there — which the guard
   * passes, because `last_read_at is distinct from old.last_read_at` is false
   * and it never looks further. Filtering instead would make the function
   * return NULL for a thread that is simply already read, and NULL here means
   * "you are not in this conversation". One meaning per answer.
   */
  update public.thread_participants
     set last_read_at = greatest(coalesce(last_read_at, v_upto), v_upto)
   where thread_id = p_thread_id
     and profile_id = auth.uid()
  returning last_read_at into v_at;
  return v_at;
end;
$$;

comment on function public.mark_thread_read(uuid, timestamptz) is
  'Move the caller''s own read receipt on one thread forward, to p_upto (the '
  'newest message they were actually shown) or to now(). Monotonic: greatest() '
  'makes a stale stamp a no-op rather than an error.';

-- Default privileges hand EXECUTE to PUBLIC, which includes `anon`. The revoke
-- is not decoration; every function in this schema follows the lesson recorded
-- in 20260828150000_crm_fixes.sql.
revoke all on function public.mark_thread_read(uuid, timestamptz) from public, anon;
grant execute on function public.mark_thread_read(uuid, timestamptz) to authenticated;
