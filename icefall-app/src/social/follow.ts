import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { withTimeout } from "@/lib/netTimeout";

/**
 * FOLLOWING SOMEBODY — the one write path, and now the only copy of it.
 *
 * WHY THIS FILE EXISTS. This hook lived as a module-private function inside
 * `screens/explore/AthleteProfile.tsx` and was the only follow write in the
 * app. On 2026-09-06 the Notifications screen gained a second place to follow
 * from — the "Follow back" on a follow row, and the suggestions under it — and
 * the alternative was a second copy of the same rules. Two copies is how one of
 * them ends up treating `23505` as a failure, or showing a disabled pill where
 * the other shows none. So it moved here whole, comments included, and the
 * screen now imports it.
 *
 * NOTHING ABOUT ITS BEHAVIOUR CHANGED IN THE MOVE. If you are comparing against
 * git history: the body is the same, the timeout is the same, the error codes
 * are the same, and the three copy constants came with it because a second
 * screen making a different promise about what following does is the same
 * failure in a different place.
 *
 * WHAT FOLLOWING ACTUALLY DOES TODAY, SAID ON THE SCREEN.
 *
 * The row is real, durable and server-side. What it is NOT, yet, is an input to
 * anything: no feed in this app reads `follows` — `community.ts`'s "Following"
 * filter reads the on-device saved-cards list in `profile/following.ts`, which
 * is a different thing entirely. Shipping the pill without this sentence would
 * let somebody believe they had subscribed to a person's climbing.
 *
 * The last clause is not a courtesy either. `follows_select` includes
 * `followed_profile_id = auth.uid()`, so the person you follow can read the
 * row. Nobody is PUSHED anything — there is no push certificate and no push
 * path — but the follow does now surface on their Notifications screen the next
 * time they open it (`notifications/social.ts`), and this is not a private
 * bookmark. That difference matters to somebody deciding whether to follow a
 * stranger.
 */
export const FOLLOW_MEANING =
  "Kept on your ICEFALL account. No feed reads this list yet — following somebody does not change what you see. They are not sent anything, but it appears on their notifications when they next open ICEFALL, so this is not a private bookmark.";

export const FOLLOW_FAILED =
  "ICEFALL did not save that. You are not following them: the server either refused the write or did not answer, and nothing was recorded.";

export const UNFOLLOW_FAILED =
  "ICEFALL did not save that. You are still following them — nothing was removed.";

/**
 * `follows` is not in `backend/types.ts` — that file predates the social
 * migrations and belongs to another session, so it is read around rather than
 * edited. Same untyped view `notifications/social.ts`, `social/highlights.ts`
 * and `network/interest.ts` opened for the same reason; the shapes below were
 * checked against `20260831190000_social.sql` by hand.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/**
 * Short. This is one row by primary-key-shaped lookup, and the pill it feeds
 * simply does not appear until it answers — so a long budget buys nothing but a
 * control that arrives late enough to be tapped by accident.
 */
const FOLLOW_TIMEOUT_MS = 5_000;

/**
 * Following, or nothing at all.
 *
 * THE UNAVAILABLE STATE RENDERS NO PILL, and that is the rule made structural:
 * a disabled Follow reads as unfinished and invites the next person to "just
 * wire it up", which is exactly how a control that cannot work ends up
 * shipping. Four things put it out of reach — no client, no session, a read
 * that did not come back, and your own profile (`follows_not_self` is a CHECK
 * constraint, so the database would refuse it) — and all four draw the same
 * nothing, because in every one of them there is no true statement a button
 * could make.
 */
export type FollowState = { kind: "unavailable" } | { kind: "ready"; following: boolean };

export interface Follow {
  state: FollowState;
  busy: boolean;
  error: string | null;
  follow(): Promise<void>;
  unfollow(): Promise<void>;
}

export function useFollow(profileId: string | null, myId: string | null): Follow {
  const [state, setState] = useState<FollowState>({ kind: "unavailable" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Writes are fired from a tap and cannot be cancelled; this keeps them quiet
      after the screen has gone. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    setState({ kind: "unavailable" });
    setError(null);
    setBusy(false);

    if (!untyped || !profileId || !myId || myId === profileId) return;

    const controller = new AbortController();
    void (async () => {
      const deadline = withTimeout(FOLLOW_TIMEOUT_MS, controller.signal);
      const query = untyped
        .from("follows")
        .select("id")
        .eq("follower_id", myId)
        .eq("followed_profile_id", profileId);

      // `.abortSignal()` before `.maybeSingle()`: it is declared on
      // PostgrestTransformBuilder and returns `this`, while `maybeSingle()`
      // returns a PostgrestBuilder with no such method. At most one row exists
      // by `follows_profile_key`, the partial unique index on the pair.
      const { data, error: readError } = await (
        deadline ? query.abortSignal(deadline) : query
      ).maybeSingle();

      if (controller.signal.aborted || !alive.current) return;
      // A FAILED READ LEAVES THE PILL HIDDEN rather than showing "Follow".
      // Offering to follow somebody you may already follow would produce a
      // duplicate the unique index refuses, and the tap would report a failure
      // for a state that was already correct.
      if (readError) return;
      setState({ kind: "ready", following: data !== null });
    })();

    return () => controller.abort();
  }, [profileId, myId]);

  const follow = useCallback(async () => {
    if (!untyped || !profileId || !myId) return;
    setBusy(true);
    setError(null);

    const { error: writeError } = await untyped
      .from("follows")
      .insert({ follower_id: myId, followed_profile_id: profileId });

    if (!alive.current) return;
    setBusy(false);
    // 23505 is the unique index catching a row that already exists — which is
    // not a failure, it is the outcome the tap was asking for. Anything else
    // (a refusal from `follows_insert`, which also covers `blocked_between`, or
    // a request that never landed) is reported without guessing which: this
    // screen cannot tell them apart and must not pretend to.
    if (writeError && writeError.code !== "23505") {
      setError(FOLLOW_FAILED);
      return;
    }
    setState({ kind: "ready", following: true });
  }, [profileId, myId]);

  const unfollow = useCallback(async () => {
    if (!untyped || !profileId || !myId) return;
    setBusy(true);
    setError(null);

    // `follows_delete` is `using (follower_id = auth.uid())`, so this can only
    // ever remove your own row. Deleting a row that is not there is not an
    // error, which makes a double tap harmless.
    const { error: writeError } = await untyped
      .from("follows")
      .delete()
      .eq("follower_id", myId)
      .eq("followed_profile_id", profileId);

    if (!alive.current) return;
    setBusy(false);
    if (writeError) {
      setError(UNFOLLOW_FAILED);
      return;
    }
    setState({ kind: "ready", following: false });
  }, [profileId, myId]);

  return { state, busy, error, follow, unfollow };
}
