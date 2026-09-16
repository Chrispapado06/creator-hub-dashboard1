/**
 * "Waiting to send" or "kept on this phone" — the one place that decides which
 * sentence a save gets (brief rule 5, plan §2.6).
 *
 * Everything a screen saves offline goes through here, and the answer comes
 * from the sync queue's KIND, never from the screen. A kind with no server
 * table is refused by name and the answer is "kept on this phone"; a kind with
 * a destination is queued and the answer is "waiting to send".
 *
 * WHY IT MATTERS THAT NO SCREEN DECIDES THIS: today nothing the Body tab or the
 * tracker writes has a server table. If each screen hard-coded that sentence,
 * the day a table appeared the app would keep promising "kept on this phone"
 * while uploading — the exact dishonesty rule 5 forbids. Here, one name moving
 * out of `KEPT_ON_PHONE_KINDS` changes every sentence at once.
 */

import {
  dequeueSync,
  enqueueSync,
  isKeptOnPhoneKind,
  KEPT_ON_THIS_PHONE,
  SENDS_WHEN_OPEN,
} from "./syncQueue";

/** Short form, for a row. `KEPT_ON_THIS_PHONE` is the long form for a section. */
export const KEPT_HERE = "Kept on this phone. Not uploaded.";

export const NOT_KEPT =
  "This phone did not keep that. It may be gone next time you open ICEFALL.";

/** Saved on the phone, but the waiting list itself could not be written. */
export const NOT_QUEUED =
  "Saved on this phone. It could not be added to the things waiting to send, so it will not go on its own.";

export type SavedState = "kept-on-phone" | "waiting" | "not-kept";

export interface SavedHere {
  state: SavedState;
  /** One short line for the screen that just saved something. */
  sentence: string;
  /** The longer explanation, where a section has room for it. Null when there is none to add. */
  detail: string | null;
  /** The queue row, so an undo can take it back out. Null when nothing was queued. */
  queueId: string | null;
}

export const SAVED_ON_PHONE: SavedHere = {
  state: "kept-on-phone",
  sentence: KEPT_HERE,
  detail: KEPT_ON_THIS_PHONE,
  queueId: null,
};

export const NOT_SAVED: SavedHere = {
  state: "not-kept",
  sentence: NOT_KEPT,
  detail: null,
  queueId: null,
};

/**
 * What a save of this kind will be able to claim, known before anything is
 * written — for a screen that has to render its line synchronously.
 */
export function savedSentenceFor(kind: string): string {
  return isKeptOnPhoneKind(kind) ? KEPT_HERE : SENDS_WHEN_OPEN;
}

/**
 * Takes a queued row back out, for an undo. A mis-tap that is undone must not
 * still be in the waiting list.
 */
export async function forgetOffline(where: SavedHere | null): Promise<void> {
  if (!where?.queueId) return;
  try {
    await dequeueSync(where.queueId);
  } catch {
    // Nothing to tell the athlete: the row they undid is already gone from the screen.
  }
}

export interface SaveOfflineInput<P> {
  kind: string;
  payload: P;
  /** Same kind + same key = the same thing saved twice. Null never merges. */
  dedupeKey?: string | null;
}

/**
 * Offers a saved thing to the sync queue and reports back in plain words.
 *
 * Never throws: a phone with no database still saved the thing in its own
 * store, and a screen must not show an error over a save that worked.
 */
export async function saveOffline<P>(
  input: SaveOfflineInput<P>,
  now: number = Date.now(),
): Promise<SavedHere> {
  try {
    const result = await enqueueSync(input, now);
    if (result.status === "kept-on-phone") return SAVED_ON_PHONE;
    return { state: "waiting", sentence: SENDS_WHEN_OPEN, detail: null, queueId: result.item.id };
  } catch {
    // The queue could not be written to. For a kind that was never going
    // anywhere, nothing is different. For one that was, the athlete has to be
    // told it is not in the waiting list, or it waits for ever in silence.
    if (isKeptOnPhoneKind(input.kind)) return SAVED_ON_PHONE;
    return { state: "not-kept", sentence: NOT_QUEUED, detail: null, queueId: null };
  }
}
