import { supabase } from "@/backend/client";
import { classifyBackendError } from "@/backend/pgErrors";
import { refreshConversations, type Correspondent, type ServerMessage } from "./conversations";

/**
 * MESSAGING — the write half: opening a two-party conversation, sending into
 * one, and moving your own read mark.
 *
 * ── NOTHING HERE DECIDES WHO MAY TALK TO WHOM ────────────────────────────────
 *
 * Four rules govern a send, and all four live in `messages_insert`:
 *
 *     sender_id = auth.uid()                   you write as yourself
 *     is_thread_participant(thread_id)         into a thread you are in
 *     not blocked_in_thread(thread_id)         and not at somebody in a block
 *     may_write_to_thread(thread_id)           decision 19: reply, never open
 *
 * This module's job is to CARRY the refusal back honestly, not to predict it.
 * In particular it does NOT probe for a block first, and no future version
 * should: `blocked_ids()` and `blocked_between()` are symmetric, so asking them
 * would hand the caller the fact that somebody blocked THEM — precisely what
 * `blocks_own` is written to withhold, and precisely what turns a block into an
 * escalation. `social/safety.ts` refuses the same call for the same reason.
 *
 * THE CONSEQUENCE, AND IT IS THE POINT: a refused message IS NOT SHOWN AS SENT.
 * `send()` returns a failure, the composer keeps the words, and the screen says
 * the server refused it. There is no optimistic bubble anywhere in this
 * feature — an optimistic bubble is exactly how a blocked person ends up
 * believing they are talking to somebody.
 *
 * ── WHY THE COPY NEVER NAMES THE REASON ──────────────────────────────────────
 *
 * A refusal arrives as `42501` with no discrimination between the four
 * conjuncts. It could be a block in either direction, or decision 19, and
 * ICEFALL cannot tell. So `SEND_REFUSED` names both possibilities and asserts
 * neither. Guessing "they blocked you" would be a fabricated fact about another
 * person, shown to somebody already frustrated.
 */

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

export const SEND_NO_BACKEND =
  "This build of ICEFALL has no server, so nothing can be sent. What you wrote stays on this device.";

export const SEND_SIGNED_OUT =
  "Sign in to send this. Nothing was sent, and what you wrote is still here.";

export const SEND_UNREACHABLE =
  "ICEFALL could not reach the server, so this was not sent. It is still in the box — try again when you have signal.";

export const SEND_NOT_PROVISIONED =
  "Sending is not switched on for this ICEFALL server yet. Nothing was sent.";

/**
 * The refusal, said without guessing which rule bit.
 *
 * Read the module header before rewording this. It must not claim a block, and
 * it must not claim decision 19, because a `42501` says only that the row was
 * refused.
 */
export const SEND_REFUSED =
  "ICEFALL's server refused that message, so nothing was sent and nobody was notified. A conversation can be closed to you because of a block, or because ICEFALL lets a climber open a conversation with a guide or company and not the other way round. What you wrote is still here.";

export const SEND_EMPTY = "Write something first — an empty message is not sent.";

/** `messages_body_present`: 1..8000 characters after trimming. */
export const MESSAGE_MAX_LENGTH = 8000;

export const SEND_TOO_LONG = `That is longer than a single ICEFALL message can be (${MESSAGE_MAX_LENGTH.toLocaleString("en-GB")} characters). Nothing was sent — split it in two.`;

export const OPEN_NO_BACKEND =
  "This build of ICEFALL has no server, so there is nobody to write to.";

export const OPEN_SIGNED_OUT = "Sign in to message somebody on ICEFALL.";

export const OPEN_YOURSELF = "This is you.";

export const OPEN_UNREACHABLE =
  "ICEFALL could not reach the server, so this conversation could not be opened. Nothing was sent.";

/**
 * There is no conversation with this person yet, and this server cannot make
 * one.
 *
 * Not a refusal about them and not a lost connection: `open_direct_thread` is
 * the only thing that can create a two-party thread (see `openDirectThread`),
 * and this server does not have it. Writing INTO a conversation that already
 * exists is unaffected, which is why this sentence is about starting one.
 */
export const OPEN_NOT_PROVISIONED =
  "ICEFALL cannot start a new conversation on this server yet — the part of the server that opens one is not switched on. Nothing was sent, and nobody was notified.";

export const OPEN_REFUSED =
  "ICEFALL's server would not open a conversation with this person. Nothing was sent and nobody was notified.";

/* -------------------------------------------------------------------------- */
/* The device's own id for a message                                           */
/* -------------------------------------------------------------------------- */

/**
 * A `client_id`, minted here, BEFORE the first send attempt and kept across
 * every retry of the same words.
 *
 * 20260818090000_chat.sql explains why in the product's own terms: a guide
 * writes from a hut at 3,800 m and the message leaves the phone hours later. A
 * partial unique index on `(sender_id, client_id)` makes the second attempt a
 * conflict instead of a duplicate, and `send_message` turns that conflict back
 * into the original row — so a retry RETURNS THE MESSAGE THAT ALREADY ARRIVED
 * rather than sending it twice. Without it, every retried message doubles,
 * which is the failure that makes people stop trusting a chat.
 *
 * The caller must therefore mint ONE id per draft and pass the same one to
 * every retry of that draft. Minting inside `send()` would defeat the whole
 * mechanism, which is why this is exported and that is not.
 */
export function newClientId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Old WebViews. `client_id` is a uuid column, so the shape has to hold even
  // when the platform will not mint one; uniqueness here only has to survive
  // one device's retries.
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Outcomes                                                                    */
/* -------------------------------------------------------------------------- */

export type SendRefusal =
  | "no-backend"
  | "signed-out"
  | "unreachable"
  | "not-provisioned"
  | "refused"
  | "empty"
  | "too-long";

export type SendOutcome =
  | { ok: true; message: ServerMessage }
  | { ok: false; reason: SendRefusal; message: string };

export type OpenRefusal =
  | "no-backend"
  | "signed-out"
  | "yourself"
  | "unreachable"
  | "not-provisioned"
  | "refused";

export type OpenOutcome =
  /**
   * `created` is ALWAYS FALSE and stays on the type for one reason: only
   * `open_direct_thread` creates a thread, and it does not report which branch
   * it took — a pair that already had a conversation and a pair that did not
   * both get one thread id back. Nothing may draw "new conversation" on the
   * strength of this field, and nothing does; it is here so the day the
   * function does report it, the shape does not have to change under callers.
   */
  | { ok: true; threadId: string; created: boolean }
  | { ok: false; reason: OpenRefusal; message: string };

function copyForSend(reason: SendRefusal): string {
  switch (reason) {
    case "no-backend":
      return SEND_NO_BACKEND;
    case "signed-out":
      return SEND_SIGNED_OUT;
    case "unreachable":
      return SEND_UNREACHABLE;
    case "not-provisioned":
      return SEND_NOT_PROVISIONED;
    case "empty":
      return SEND_EMPTY;
    case "too-long":
      return SEND_TOO_LONG;
    default:
      return SEND_REFUSED;
  }
}

function copyForOpen(reason: OpenRefusal): string {
  switch (reason) {
    case "no-backend":
      return OPEN_NO_BACKEND;
    case "signed-out":
      return OPEN_SIGNED_OUT;
    case "yourself":
      return OPEN_YOURSELF;
    case "unreachable":
      return OPEN_UNREACHABLE;
    case "not-provisioned":
      return OPEN_NOT_PROVISIONED;
    default:
      return OPEN_REFUSED;
  }
}

function sendFailure(reason: SendRefusal): SendOutcome {
  return { ok: false, reason, message: copyForSend(reason) };
}

function openFailure(reason: OpenRefusal): OpenOutcome {
  return { ok: false, reason, message: copyForOpen(reason) };
}

/** A PostgREST error, as one of our refusals. Never rethrown at a screen. */
function refusalFor(error: { code?: string | null; message?: string | null }): SendRefusal {
  switch (classifyBackendError(error)) {
    case "not-provisioned":
      return "not-provisioned";
    case "refused":
      return "refused";
    default:
      return "unreachable";
  }
}

async function myId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/* -------------------------------------------------------------------------- */
/* Opening a two-party conversation                                            */
/* -------------------------------------------------------------------------- */

/**
 * The one thread between you and this person: the existing one, or the server
 * creating it.
 *
 * ── ONLY THE SERVER MAY CREATE ONE, AND THAT IS NOT A PREFERENCE ─────────────
 *
 * `open_direct_thread(p_other)` — SECURITY DEFINER, in
 * `icefall-supabase/migrations/20260908090000_direct_threads.sql` — finds or
 * creates the pair in one statement, under an advisory lock on the unordered
 * pair, refusing when the two are in a block. This module calls it and, when
 * the server does not have it, LOOKS FOR AN EXISTING CONVERSATION AND STOPS.
 *
 * AN EARLIER VERSION OF THIS FUNCTION CREATED THE THREAD ITSELF WHEN THE RPC
 * WAS ABSENT — search, insert the thread, seat both people. It is written out
 * here because it looks obviously right and is three separate kinds of wrong,
 * and the next person to reach for it deserves the measurements rather than a
 * bare "don't":
 *
 *   IT CANNOT RUN. `.insert(…).select("id")` is `INSERT … RETURNING`, and
 *     Postgres applies the SELECT policy to a row it returns. `threads_select`
 *     (20260828120000_crm_commercial.sql) is participant / admin / company
 *     member — there is no `created_by` arm — and at the instant of the
 *     RETURNING the thread has no participants, so its own creator cannot see
 *     it and the statement raises 42501. The participant insert fails for the
 *     same reason one step later: `thread_participants_insert` reaches
 *     `threads` through an EXISTS, and a table referenced inside a policy is
 *     filtered by its own policies — which is exactly why
 *     `is_thread_participant` is SECURITY DEFINER.
 *
 *   IT WOULD BLAME THE OTHER PERSON. That 42501 arrives here as "refused", and
 *     the refusal copy names a block or decision 19 — a fabricated fact about
 *     somebody, printed to a person who is already frustrated, for what is
 *     actually a gap in a SELECT policy.
 *
 *   AND IF IT DID RUN IT WOULD BE WORSE. The thread and both seats are written
 *     BEFORE `messages_insert` gets to refuse the message, `threads` has no
 *     DELETE policy for anybody, and `threads_select` shows the row to the
 *     other party — so a blocked person, or a guide who may reply but never
 *     open, would leave a permanent empty conversation at the top of a
 *     stranger's inbox. Worse still, seating them makes their read receipt
 *     readable: the moment the recipient opens the thread to see what it is,
 *     `mark_thread_read` stamps a row the sender can select.
 *
 * So: WITHOUT THE FUNCTION, A NEW CONVERSATION CANNOT BE STARTED, and this says
 * so (`OPEN_NOT_PROVISIONED`) instead of half-starting one. Writing into a
 * conversation that already exists never needed the function and is unaffected.
 *
 * It decides nothing about who may talk. `messages_insert` does, with all four
 * of its conjuncts, and the function borrows `blocked_between()` and
 * `may_write_to_thread()` rather than restating either.
 */
export async function openDirectThread(otherProfileId: string): Promise<OpenOutcome> {
  if (!supabase) return openFailure("no-backend");
  const me = await myId();
  if (!me) return openFailure("signed-out");
  if (me === otherProfileId) return openFailure("yourself");

  /* ---- 1. the function, if this server has it ----------------------------- */

  const rpc = await supabase.rpc("open_direct_thread", { p_other: otherProfileId });
  if (!rpc.error) {
    const id = typeof rpc.data === "string" ? rpc.data : null;
    if (id) {
      refreshConversations();
      return { ok: true, threadId: id, created: false };
    }
    // The function answered and declined to name a thread — which it does when
    // the two are in a block. Refused, not broken.
    return openFailure("refused");
  }
  if (classifyBackendError(rpc.error) !== "not-provisioned") {
    return openFailure(refusalFor(rpc.error) === "unreachable" ? "unreachable" : "refused");
  }

  /* ---- 2. the conversation you already have, and nothing more -------------- */

  const existing = await findDirectThread(otherProfileId);
  if (existing.error) return openFailure(existing.error);
  if (existing.threadId) return { ok: true, threadId: existing.threadId, created: false };
  return openFailure("not-provisioned");
}

function mapOpen(error: { code?: string | null; message?: string | null }): OpenRefusal {
  const r = refusalFor(error);
  if (r === "not-provisioned") return "not-provisioned";
  if (r === "unreachable") return "unreachable";
  return "refused";
}

/**
 * Do we already have a two-party thread with this person?
 *
 * THE INTERSECTION IS COMPUTED BY THE POLICY, NOT BY THIS FILE. Asking for the
 * OTHER person's membership rows looks like it would return every conversation
 * they are in; `thread_participants_select` is
 * `profile_id = auth.uid() or is_thread_participant(thread_id) or is_admin()`,
 * so their row is visible only where I am in the thread too — which makes the
 * answer exactly the threads we share. The earlier version asked for my own
 * memberships first and then filtered theirs with `.in(everything I am in)`,
 * which put every thread id I hold into a GET query string; past a couple of
 * hundred conversations that URL exceeds the gateway's limit and the whole
 * search fails on a healthy server.
 *
 * The `kind` filter is applied in memory rather than in the query so that a
 * server predating 20260818090000 — where the column does not exist — still
 * finds the pair instead of erroring the whole search.
 */
async function findDirectThread(
  other: string,
): Promise<{ threadId: string | null; error: OpenRefusal | null }> {
  if (!supabase) return { threadId: null, error: "no-backend" };

  const theirs = await supabase
    .from("thread_participants")
    .select("thread_id")
    .eq("profile_id", other);
  if (theirs.error) return { threadId: null, error: mapOpen(theirs.error) };
  const shared = [...new Set((theirs.data ?? []).map((r) => r.thread_id))];
  if (shared.length === 0) return { threadId: null, error: null };

  /*
   * THE ROSTER SIZE TEST IS NOT OPTIONAL. Without it a three-person group that
   * happens to contain the two of us would be returned as "your conversation
   * with them", and a private message would land in front of a third party.
   * `open_direct_thread` makes the same test in SQL for the same reason.
   */
  const rosters = await supabase
    .from("thread_participants")
    .select("thread_id")
    .in("thread_id", shared);
  const size = new Map<string, number>();
  for (const r of rosters.error ? [] : (rosters.data ?? [])) {
    size.set(r.thread_id, (size.get(r.thread_id) ?? 0) + 1);
  }

  const threads = await supabase.from("threads").select("id, kind, created_at").in("id", shared);
  if (threads.error) {
    // The column may not exist on an older server; fall back to the pair test
    // alone, which is the property that actually matters.
    const pair = shared.find((id) => (size.get(id) ?? 0) === 2);
    return { threadId: pair ?? null, error: null };
  }
  const direct = ((threads.data ?? []) as { id: string; kind: string | null; created_at: string }[])
    .filter((t) => (t.kind ?? "direct") === "direct" && (size.get(t.id) ?? 0) === 2)
    /*
     * OLDEST WINS, AND IT IS THE `created_at` THAT DECIDES — the same order
     * `open_direct_thread` uses (`order by t.created_at limit 1`), so the two
     * paths name the same conversation and applying the migration cannot move
     * a pair off the thread their history is in. Sorting the ids instead is a
     * lexicographic sort over `gen_random_uuid()`, which is stable but carries
     * no age at all: it agreed with itself and disagreed with the server.
     */
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { threadId: direct[0]?.id ?? null, error: null };
}

/* -------------------------------------------------------------------------- */
/* Sending                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Send one message into an existing thread.
 *
 * `send_message` is the RPC every ICEFALL app is meant to call. It is SECURITY
 * INVOKER, so the insert inside it passes through `messages_insert` with all
 * four conjuncts exactly as a raw insert would — it adds idempotence and stamps
 * the sender's own read receipt, and it decides nothing. If this server does
 * not have the function yet, the plain insert below is the same write without
 * those two conveniences, and it is still fully governed by the policy.
 *
 * `ok: true` IS WITNESSED BY A ROW. A missing error is not enough: the caller
 * gets the stored message back, with the server's own id and timestamp, and
 * that is what the screen draws.
 */
export async function sendMessage(
  threadId: string,
  body: string,
  clientId: string,
): Promise<SendOutcome> {
  if (!supabase) return sendFailure("no-backend");
  const me = await myId();
  if (!me) return sendFailure("signed-out");

  const text = body.trim();
  if (text.length === 0) return sendFailure("empty");
  if (text.length > MESSAGE_MAX_LENGTH) return sendFailure("too-long");

  const rpc = await supabase.rpc("send_message", {
    p_thread_id: threadId,
    p_body: text,
    p_client_id: clientId,
  });

  if (!rpc.error && rpc.data) {
    refreshConversations();
    return { ok: true, message: rowToMessage(rpc.data, me) };
  }
  if (rpc.error && classifyBackendError(rpc.error) !== "not-provisioned") {
    return sendFailure(refusalFor(rpc.error));
  }

  /* The same write, without the function. A retry of the same `client_id`
     hits `messages_sender_client_id_key` and comes back as 23505 — which is
     not a failure: it means this exact message is already stored. */
  const direct = await supabase
    .from("messages")
    .insert({ thread_id: threadId, sender_id: me, body: text, client_id: clientId })
    .select("id, thread_id, sender_id, body, created_at")
    .maybeSingle();

  if (direct.error?.code === "23505") {
    const already = await supabase
      .from("messages")
      .select("id, thread_id, sender_id, body, created_at")
      .eq("sender_id", me)
      .eq("client_id", clientId)
      .maybeSingle();
    if (already.data) {
      refreshConversations();
      return { ok: true, message: rowToMessage(already.data, me) };
    }
  }
  if (direct.error || !direct.data) {
    return sendFailure(direct.error ? refusalFor(direct.error) : "unreachable");
  }

  refreshConversations();
  return { ok: true, message: rowToMessage(direct.data, me) };
}

/**
 * Open a conversation with somebody and say the first thing in one go.
 *
 * The order matters and is the reason this exists rather than being left to the
 * screen: NOTHING IS CREATED UNTIL SOMETHING IS SAID. Tapping "Message" on a
 * profile creates no thread, so backing out of a conversation you thought
 * better of leaves no empty conversation sitting in a stranger's inbox.
 *
 * That sentence is now true without qualification, and it was not before. It
 * held only as far as the tap: the old fallback opened the thread and seated
 * both people BEFORE `messages_insert` was asked, so a refused first message —
 * a block, or decision 19 — left a permanent empty conversation in the other
 * person's inbox. `openDirectThread` no longer creates anything; the server's
 * function does, in one statement that rolls both inserts back when the
 * message may not be written. Its header records the rest.
 */
export async function sendToProfile(
  otherProfileId: string,
  body: string,
  clientId: string,
): Promise<SendOutcome & { threadId?: string }> {
  const text = body.trim();
  if (text.length === 0) return sendFailure("empty");
  if (text.length > MESSAGE_MAX_LENGTH) return sendFailure("too-long");

  const opened = await openDirectThread(otherProfileId);
  if (!opened.ok) {
    // The open refusals map one-to-one onto the send refusals except
    // "yourself", which no composer can reach — you cannot open your own
    // profile's Message control (see `canMessage`).
    const reason: SendRefusal =
      opened.reason === "yourself" ? "refused" : (opened.reason as SendRefusal);
    // THE OPEN'S OWN SENTENCE, not the send's. They are not the same failure:
    // "this server cannot start a conversation yet" and "sending is not
    // switched on" would send somebody looking for two different faults, and
    // only one of them is real.
    return { ok: false, reason, message: opened.message };
  }

  const sent = await sendMessage(opened.threadId, text, clientId);
  return { ...sent, threadId: opened.threadId };
}

interface MessageRowLike {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  kind?: string | null;
}

function rowToMessage(row: MessageRowLike, me: string): ServerMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    mine: row.sender_id === me,
    body: row.body,
    at: row.created_at,
    kind: (row.kind ?? "text") as ServerMessage["kind"],
  };
}

/* -------------------------------------------------------------------------- */
/* Marking read                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Move your own read mark to the newest message you have actually been shown.
 *
 * ── WHY THIS TAKES A TIMESTAMP AND NOT JUST A THREAD ─────────────────────────
 *
 * `mark_thread_read(p_thread_id)` stamps `now()`. This app is a snapshot and
 * never pushes, so a reply that lands BETWEEN the transcript query and this
 * call was never drawn — and stamping the clock marks it read anyway. The mark
 * is monotonic by trigger, so nothing can ever count it again: it is not on the
 * badge, it is not in the transcript, and the only route back to it is a reload
 * the athlete has no reason to press.
 *
 * So the caller passes the `created_at` of the last message on their screen and
 * this claims exactly that: I have seen everything up to this row. Anything
 * that arrived afterwards stays unread, which is true.
 *
 * `p_upto` ships in 20260908100000_mark_thread_read_upto.sql. Until that is
 * pushed the two-argument call comes back PGRST202 and this falls to the
 * one-argument form — the old behaviour, no worse than it was — and then to the
 * plain UPDATE for a server without the function at all.
 *
 * `mark_thread_read` returns the stamp, or NULL when the caller is not a
 * participant — saying nothing about whether the thread exists.
 *
 * Returns true only when the server confirmed a stamp. A false is not worth
 * telling the reader about — a read receipt that did not save costs them an
 * unread badge, not a message — so no copy constant exists for it, and callers
 * refresh the list either way.
 */
export async function markThreadRead(threadId: string, upTo?: string | null): Promise<boolean> {
  if (!supabase) return false;
  const me = await myId();
  if (!me) return false;

  if (upTo) {
    const upToRpc = await supabase.rpc("mark_thread_read", {
      p_thread_id: threadId,
      p_upto: upTo,
    });
    if (!upToRpc.error) {
      refreshConversations();
      return upToRpc.data !== null;
    }
    // Anything but "this server has no such function" is a real failure and is
    // not worth retrying as the older call — it would fail the same way.
    if (classifyBackendError(upToRpc.error) !== "not-provisioned") return false;
  }

  const rpc = await supabase.rpc("mark_thread_read", { p_thread_id: threadId });
  if (!rpc.error) {
    refreshConversations();
    return rpc.data !== null;
  }
  if (classifyBackendError(rpc.error) !== "not-provisioned") return false;

  /*
   * Without the function: the same update, which
   * `thread_participants_update_self` permits on your own row.
   *
   * STILL `now()`, DELIBERATELY, even when the caller named a row. The guard
   * RAISES on a receipt earlier than the stored one rather than clamping it,
   * and an existing mark was written by a `now()` that is later than the newest
   * message — so passing `upTo` here would throw on every thread already read.
   * `greatest()` is what makes the timestamp safe, and it lives in the
   * function.
   */
  const now = new Date().toISOString();
  const res = await supabase
    .from("thread_participants")
    .update({ last_read_at: now })
    .eq("thread_id", threadId)
    .eq("profile_id", me)
    .select("thread_id")
    .maybeSingle();
  if (res.error || !res.data) return false;
  refreshConversations();
  return true;
}

/* -------------------------------------------------------------------------- */
/* Can this person be messaged at all?                                         */
/* -------------------------------------------------------------------------- */

/**
 * Whether a Message control may be DRAWN — the same rule `useFollow` applies to
 * its pill, and for the same reason: a control that cannot work must not
 * appear, because a disabled one reads as unfinished and invites the next
 * person to "just wire it up".
 *
 * It answers from what this device already knows and asks the server nothing.
 * It is deliberately NOT a prediction of whether the message will be accepted:
 * a block is only discovered when the insert is refused, and the module header
 * says why it must stay that way.
 *
 * THE ONE THING IT CANNOT SEE, said here rather than discovered on a phone:
 * whether this server has `open_direct_thread`. A server without it can carry
 * on a conversation that exists and cannot start a new one, and finding that
 * out costs a round trip — which is the one thing this must not spend, because
 * it runs on every profile that is drawn. So the control IS drawn, the thread
 * screen asks, and `OPEN_NOT_PROVISIONED` is what the athlete reads. That is a
 * button that says something true, not a button that does nothing.
 */
export function canMessage(profileId: string | null, myProfileId: string | null): boolean {
  return (
    supabase !== null && myProfileId !== null && profileId !== null && profileId !== myProfileId
  );
}

/**
 * Where the Message control goes.
 *
 * ONE ROUTE, AND NO ASYNC ON THE TAP. `/messages/with/:profileId` resolves to
 * the existing conversation if there is one and to an empty one if there is
 * not — so the caller neither waits for a round trip before navigating nor has
 * to know which case it is in.
 */
export function messageRouteFor(profileId: string): string {
  return `/messages/with/${profileId}`;
}

/** Re-exported so a caller needs one import to render a correspondent. */
export type { Correspondent };
