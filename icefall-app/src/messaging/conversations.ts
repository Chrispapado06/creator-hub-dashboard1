import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { classifyBackendError } from "@/backend/pgErrors";
import { withTimeout } from "@/lib/netTimeout";

/**
 * MESSAGING — the read half. The first line of this app that has ever asked
 * ICEFALL's server what anybody said to anybody.
 *
 * ── WHAT WAS ALREADY THERE, AND WHY NOTHING NEW IS INVENTED HERE ─────────────
 *
 * `threads` / `thread_participants` / `messages` have existed since
 * 20260817120000_icefall_foundation.sql, with the whole posture already
 * decided: membership-gated reads, blocking enforced in the INSERT policy
 * (20260818090000_chat.sql), decision 19 enforced in the same policy
 * (20260829160000_crm_first_message_gate.sql), and one `send_message` RPC that
 * every ICEFALL app is meant to call (20260831140000_messaging.sql). The app
 * read none of it: `screens/chat/useConversations.ts` mapped `AppState.threads`
 * — enquiries typed into this device, whose own messages are marked "unsent"
 * because nothing delivers them — and appended invented demo rows.
 *
 * So this module adds no rules. Every judgement about who may see what is made
 * by Postgres; there is nothing here to defeat, because the checks are not
 * here.
 *
 * ── THE UNREAD COUNT IS THE ONE FIGURE THIS FILE COMPUTES ────────────────────
 *
 * `thread_participants.last_read_at` is a real, per-person, trigger-guarded
 * timestamp ("a read receipt only moves forward"). Unread is therefore
 * derivable and honest: messages in this thread, from somebody else, after that
 * stamp. It is the ONLY count in this module, and where it cannot be proved
 * exact it says so — see `unreadExact` and THE WINDOW below. There is no
 * delivery receipt, no "seen by them", no typing indicator and no presence
 * anywhere in this module, because the schema records none of those and a
 * plausible one is worse than none.
 *
 * ── IT IS A SNAPSHOT, NOT A LIVE FEED ────────────────────────────────────────
 *
 * 20260831140000 puts `messages` and `thread_participants` in the realtime
 * publication, and this module deliberately does not subscribe. The reason is
 * the one `notifications/social.ts` already gives: a socket held open is a
 * radio kept awake on a phone that may be on a mountain for a week. The list
 * loads on first use and re-reads when something this app did could have
 * changed it — sending, marking read, opening a thread. A reply that lands
 * while ICEFALL is open therefore does not appear until the next read, and
 * `MESSAGING_IS_A_SNAPSHOT` says exactly that on screen rather than leaving
 * somebody staring at a thread waiting for a bubble to arrive.
 *
 * ── ONE STORE, NOT ONE FETCH PER SCREEN ──────────────────────────────────────
 *
 * `AppTopBar` is mounted for the whole app and needs the unread total;
 * `Messages` needs the same rows a moment later. Two hooks over one
 * module-level snapshot means one request, and — more importantly — one answer:
 * a badge saying three over a list showing two is the kind of small lie that
 * makes people stop trusting a chat.
 */

/* -------------------------------------------------------------------------- */
/* What the server can and cannot tell us                                      */
/* -------------------------------------------------------------------------- */

/**
 * Why the list is what it is. Every value except `ready` means the
 * conversations array is EMPTY FOR A REASON, and the reason is never "you have
 * no messages" — that is `ready` with nothing in it, which is a measured fact
 * and a different sentence.
 */
export type MessagingState =
  | "loading"
  | "no-backend"
  | "signed-out"
  | "unreachable"
  | "not-provisioned"
  | "refused"
  | "ready";

export const MESSAGING_NO_BACKEND =
  "This build of ICEFALL has no server, so there are no conversations to load and nothing you write can be sent.";

export const MESSAGING_SIGNED_OUT =
  "Sign in to see your conversations. Messages belong to an account, not to this device.";

export const MESSAGING_UNREACHABLE =
  "ICEFALL could not reach the server, so this list may be out of date or empty. Nothing has been lost — it is on the server, not on this phone.";

export const MESSAGING_NOT_PROVISIONED =
  "Messaging is not switched on for this ICEFALL server yet. Nothing can be read or sent until it is.";

export const MESSAGING_REFUSED =
  "ICEFALL's server refused to hand over your conversations. If you have been signed out for a while, signing in again is the usual fix.";

/** `ready` with nothing in it. A measured zero, and it reads like one. */
export const MESSAGING_NONE =
  "No conversations yet. Open somebody's profile and write to them, or send an enquiry to an expedition company.";

/**
 * Said wherever a list or a thread is drawn, because both are stills.
 *
 * This is NOT the old `BACKEND_NOT_CONNECTED`, which said nothing is ever
 * delivered. Messages now genuinely arrive. What does not happen is a push:
 * ICEFALL has no notification certificate and no live socket, so the other
 * person learns you wrote when they next open the app.
 */
export const MESSAGING_IS_A_SNAPSHOT =
  "Messages are read when you open ICEFALL, not pushed. Nobody is alerted when you send one — they see it the next time they look — and a reply that arrives while this screen is open will not appear until it is reloaded.";

/**
 * Where a name should be and is not.
 *
 * TWO CAUSES, AND ICEFALL CANNOT TELL THEM APART: after
 * 20260903010000_block_and_report.sql, `profiles_select` hides anybody you are
 * in a block with — in EITHER direction — so a withheld name may be the block
 * working exactly as intended; or the profile read simply did not answer. This
 * label never guesses which, and in particular never says "they blocked you":
 * telling somebody that is how a block turns into an escalation, which is the
 * reason `blocks_own` withholds it in the first place.
 */
export const PARTICIPANT_NAME_UNAVAILABLE = "Name unavailable";

/** A message with an attachment and no words. ICEFALL cannot open one yet. */
export const ATTACHMENT_PREVIEW = "Attachment";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

export type ServerThreadKind = "direct" | "group" | "enquiry";

export interface Correspondent {
  id: string;
  /** Null when the profile row did not come back — see `PARTICIPANT_NAME_UNAVAILABLE`. */
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export interface ServerMessage {
  id: string;
  threadId: string;
  senderId: string;
  mine: boolean;
  /** Null on an attachment-only message; the schema allows one. */
  body: string | null;
  at: string;
  kind: "text" | "image" | "voice" | "file" | "system";
}

export interface ServerConversation {
  threadId: string;
  kind: ServerThreadKind;
  /** Groups name themselves; a two-party thread is titled by who is in it. */
  title: string | null;
  peakName: string | null;
  status: "open" | "closed";
  /** The other party on a two-party thread. Null on a group, or if unreadable. */
  other: Correspondent | null;
  /** Including you. */
  participantCount: number;
  lastMessage: ServerMessage | null;
  /** `threads.last_message_at`, which the message trigger maintains. */
  lastMessageAt: string;
  /**
   * Messages from somebody else since your `last_read_at`.
   *
   * `null` MEANS NOT MEASURED and must never be drawn as a zero — the same rule
   * the notifications bell already follows. See THE WINDOW.
   */
  unread: number | null;
  /**
   * False when `unread` is a FLOOR rather than a total: the scan below reached
   * its limit before it reached your last-read mark. Render it with a "+".
   */
  unreadExact: boolean;
}

export interface ConversationsResult {
  state: MessagingState;
  /** Present whenever the list is empty for a reason. Null when it is just full. */
  message: string | null;
  conversations: ServerConversation[];
  /** The signed-in profile id, or null. Handy for callers that need "is this me". */
  me: string | null;
  reload(): void;
}

/* -------------------------------------------------------------------------- */
/* Budgets                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One inbox page. Nobody scrolls past this, and every extra row costs a join.
 *
 * THERE IS NO SECOND PAGE, and that is a limitation rather than a bug to be
 * discovered: nothing consumes an offset, so the forty most recently active
 * conversations are the whole of what this screen can show. It is stated here
 * because the number looks like a page size and behaves like a ceiling.
 */
const THREAD_PAGE = 40;

/**
 * THE WINDOW.
 *
 * One request fetches the newest N messages across ALL your threads at once,
 * newest first, and both the preview line and the unread count are derived from
 * it. That is one round trip instead of two per thread — but it can be
 * truncated, and truncation would silently under-count. So:
 *
 *   · If fewer than N rows came back, nothing was cut and every count is exact.
 *   · If exactly N came back, the oldest row is the window's FLOOR. A thread
 *     whose `last_read_at` is at or after that floor still has all of its
 *     unread messages inside the window, so its count is exact. Any other
 *     thread's count is a floor, and `unreadExact` says so.
 *   · A thread with no rows at all in a truncated window is not empty — it is
 *     STARVED by a chattier neighbour. Those are repaired with a query each,
 *     because "no messages yet" about a conversation that has some is the worst
 *     lie this screen could tell.
 */
const MESSAGE_WINDOW = 400;

/** How many starved threads are worth repairing before the phone gives up. */
const REPAIR_LIMIT = 8;

/**
 * How many ids may go into one `in(…)`.
 *
 * PostgREST puts an `in` list in the URL, so this is a URL-length budget rather
 * than a row budget: a uuid plus its separator is about 37 characters, and 80
 * of them is roughly 3 KB — comfortably inside the 8 KB request line every
 * gateway in front of PostgREST allows, with room for the rest of the query.
 * Past that the gateway answers 414 and the whole read fails as "unreachable"
 * on a server that is perfectly well.
 */
const IN_BATCH = 80;

/** The ids, in pieces small enough to survive the query string. */
function inBatches(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_BATCH) out.push(ids.slice(i, i + IN_BATCH));
  return out;
}

/** Long enough for a hut connection, short enough that a dead one is admitted. */
const MESSAGING_TIMEOUT_MS = 9_000;

/**
 * `backend/types.ts` now describes the messaging tables, but every select below
 * is built as a STRING that varies at runtime (see the column-fallback), and a
 * dynamic select defeats supabase-js's row inference entirely. An untyped view
 * is honest about that rather than casting a wrong shape onto a typed call —
 * the same choice `social/follow.ts` and `social/safety.ts` made, for the same
 * reason. Every shape below was checked against the migrations by hand.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/**
 * A PostgREST answer with the row type erased.
 *
 * supabase-js parses the select STRING at compile time, so a select built from
 * a conditional — which every column-fallback below is — comes back as a parser
 * error rather than a row type. Erasing it here, once, is honest about what the
 * client can actually infer; each `as` at a call site below then names the
 * hand-checked shape from the migration.
 */
interface Raw {
  data: unknown;
  error: { code?: string | null; message?: string | null } | null;
  count?: number | null;
}

/** Await a query and hand back its answer with the row type erased. */
async function ask(query: unknown): Promise<Raw> {
  return (await (query as PromiseLike<Raw>)) satisfies Raw;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                   */
/* -------------------------------------------------------------------------- */

interface Snapshot {
  state: MessagingState;
  message: string | null;
  conversations: ServerConversation[];
  me: string | null;
}

const EMPTY: ServerConversation[] = [];

let snapshot: Snapshot = { state: "loading", message: null, conversations: EMPTY, me: null };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let everLoaded = false;
/** A forced read asked for while another was in flight. See `loadConversations`. */
let restartWhenIdle = false;

function publish(next: Snapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

function failure(state: MessagingState, message: string, me: string | null): Snapshot {
  // The rows go with the reason. Keeping the previous list alongside a failure
  // would leave a stale inbox on screen under a sentence saying it could not be
  // read, and the reader would believe the list.
  return { state, message, conversations: EMPTY, me };
}

function messageFor(state: MessagingState): string {
  switch (state) {
    case "no-backend":
      return MESSAGING_NO_BACKEND;
    case "signed-out":
      return MESSAGING_SIGNED_OUT;
    case "unreachable":
      return MESSAGING_UNREACHABLE;
    case "not-provisioned":
      return MESSAGING_NOT_PROVISIONED;
    case "refused":
      return MESSAGING_REFUSED;
    default:
      return MESSAGING_NONE;
  }
}

/** A PostgREST failure, turned into one of our states. Never a thrown error. */
function stateForError(error: { code?: string | null; message?: string | null }): MessagingState {
  switch (classifyBackendError(error)) {
    case "not-provisioned":
      return "not-provisioned";
    case "refused":
      return "refused";
    default:
      return "unreachable";
  }
}

/* -------------------------------------------------------------------------- */
/* The read                                                                    */
/* -------------------------------------------------------------------------- */

interface ParticipantRow {
  thread_id: string;
  profile_id: string;
  last_read_at: string | null;
  joined_at: string;
}

interface ThreadRow {
  id: string;
  status: string;
  created_by: string;
  peak_name: string | null;
  last_message_at: string;
  kind?: string | null;
  title?: string | null;
}

interface MessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  kind?: string | null;
}

function toMessage(row: MessageRow, me: string): ServerMessage {
  const kind = (row.kind ?? "text") as ServerMessage["kind"];
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    mine: row.sender_id === me,
    body: row.body,
    at: row.created_at,
    kind,
  };
}

/**
 * Read everything, or say why not.
 *
 * FIVE REQUESTS AT MOST, and each one exists because the one before it cannot
 * answer the next question:
 *
 *   1. my participant rows      — which threads, and my read mark on each
 *   2. the threads themselves   — ordering, kind, subject, status
 *   3. everyone else in them    — who a thread is WITH
 *   4. their profiles           — a name to put on the row
 *   5. the message window       — the preview line and the unread count
 *
 * There is no embed/join in any of them. `threads_select`,
 * `thread_participants_select` and `profiles_select` are three different
 * policies, and an `!inner` embed that trips one of them drops the row
 * altogether rather than dropping the field — the lesson `social/safety.ts`
 * records after its block list took itself off the screen.
 */
async function read(signal: AbortSignal): Promise<Snapshot> {
  if (!untyped || !supabase) return failure("no-backend", MESSAGING_NO_BACKEND, null);

  const { data: sess } = await supabase.auth.getSession();
  const me = sess.session?.user.id ?? null;
  if (!me) return failure("signed-out", MESSAGING_SIGNED_OUT, null);

  const deadline = withTimeout(MESSAGING_TIMEOUT_MS, signal);
  const bounded = <T extends { abortSignal(s: AbortSignal): T }>(q: T): T =>
    deadline ? q.abortSignal(deadline) : q;

  /* ---- 1. my memberships ------------------------------------------------- */

  const mine = await ask(
    bounded(
      untyped
        .from("thread_participants")
        .select("thread_id, profile_id, last_read_at, joined_at")
        .eq("profile_id", me),
    ),
  );
  if (mine.error)
    return failure(stateForError(mine.error), messageFor(stateForError(mine.error)), me);

  const myRows = (mine.data ?? []) as ParticipantRow[];
  if (myRows.length === 0) {
    return { state: "ready", message: MESSAGING_NONE, conversations: EMPTY, me };
  }

  /*
   * THE FLOOR IS `last_read_at`, OR `joined_at` WHEN THERE IS NONE.
   *
   * Not null. The schema itself defines it this way — `thread_participants_guard`
   * refuses a receipt earlier than `coalesce(old.last_read_at, old.joined_at)` —
   * and the difference is not academic on a group: an athlete added to an
   * expedition party with four hundred messages in it has read none of them, but
   * they were not sent TO them either. Counting the whole backlog as unread
   * would put a 9+ on the icon for a conversation nobody has said anything new
   * in.
   */
  const lastReadBy = new Map<string, string>();
  for (const r of myRows) lastReadBy.set(r.thread_id, r.last_read_at ?? r.joined_at);

  /* ---- 2. the threads ----------------------------------------------------- */

  /*
   * `kind` and `title` arrived on `threads` in 20260818090000, later than the
   * table itself. A select naming a column the server does not have does not
   * come back partially satisfied — Postgres raises 42703 and NOTHING comes
   * back, so one unpushed migration would cost the whole inbox. The same split
   * `social/promoted.ts` uses: ask for everything, and if the answer is
   * "no such column", ask again for the columns that have always existed.
   */
  /*
   * THE IDS GO OUT IN BATCHES, AND THE LIMIT ABOVE IS WHY.
   *
   * PostgREST writes `in` as a literal list in the QUERY STRING, so this
   * request's URL grows with the number of conversations the athlete is in —
   * about 37 characters each. `.limit(THREAD_PAGE)` bounds what comes BACK and
   * not what goes out, so a heavy inbox built a URL of several kilobytes, the
   * gateway answered 414, `classifyBackendError` could not place it, and the
   * athlete was shown MESSAGING_UNREACHABLE and an empty list on a healthy
   * server — permanently, since every reload rebuilt the same URL.
   *
   * Each batch is ordered and limited on its own and the merge below takes the
   * newest `THREAD_PAGE` across all of them, which is the same answer one
   * request would have given.
   */
  const threadIds = [...lastReadBy.keys()];
  const baseCols = "id, status, created_by, peak_name, last_message_at";
  const askThreads = async (cols: string): Promise<Raw> => {
    const rows: ThreadRow[] = [];
    for (const batch of inBatches(threadIds)) {
      const res = await ask(
        bounded(
          untyped
            .from("threads")
            .select(cols)
            .in("id", batch)
            .order("last_message_at", { ascending: false })
            .limit(THREAD_PAGE),
        ),
      );
      if (res.error) return res;
      rows.push(...((res.data ?? []) as ThreadRow[]));
    }
    return { data: rows, error: null };
  };
  let threadRes = await askThreads(`${baseCols}, kind, title`);
  if (threadRes.error && classifyBackendError(threadRes.error) === "not-provisioned") {
    threadRes = await askThreads(baseCols);
  }
  if (threadRes.error) {
    const s = stateForError(threadRes.error);
    return failure(s, messageFor(s), me);
  }

  const threads = ((threadRes.data ?? []) as ThreadRow[])
    .slice()
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
    .slice(0, THREAD_PAGE);
  if (threads.length === 0) {
    return { state: "ready", message: MESSAGING_NONE, conversations: EMPTY, me };
  }
  const ids = threads.map((t) => t.id);

  /* ---- 3. who else is in them --------------------------------------------- */

  const others = await ask(
    bounded(
      untyped
        .from("thread_participants")
        .select("thread_id, profile_id, last_read_at, joined_at")
        .in("thread_id", ids),
    ),
  );
  // A failed roster costs the NAME, never the conversation: the thread is real
  // and readable without knowing who else is in it.
  const rosterRows = (others.error ? [] : ((others.data ?? []) as ParticipantRow[])).filter(
    Boolean,
  );

  const roster = new Map<string, string[]>();
  for (const r of rosterRows) {
    const list = roster.get(r.thread_id) ?? [];
    list.push(r.profile_id);
    roster.set(r.thread_id, list);
  }

  /* ---- 4. their names ----------------------------------------------------- */

  const otherIds = [...new Set(rosterRows.map((r) => r.profile_id))].filter((id) => id !== me);
  const people = new Map<string, Correspondent>();
  if (otherIds.length > 0) {
    const profiles = await ask(
      bounded(
        untyped
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", otherIds),
      ),
    );
    for (const p of (profiles.error ? [] : (profiles.data ?? [])) as {
      id: string;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
    }[]) {
      people.set(p.id, {
        id: p.id,
        displayName: p.display_name,
        username: p.username,
        avatarUrl: p.avatar_url,
      });
    }
  }

  /* ---- 5. the message window ---------------------------------------------- */

  const msgCols = "id, thread_id, sender_id, body, created_at";
  const askWindow = (cols: string) =>
    ask(
      bounded(
        untyped
          .from("messages")
          .select(cols)
          .in("thread_id", ids)
          .order("created_at", { ascending: false })
          .limit(MESSAGE_WINDOW),
      ),
    );
  let msgRes = await askWindow(`${msgCols}, kind`);
  if (msgRes.error && classifyBackendError(msgRes.error) === "not-provisioned") {
    msgRes = await askWindow(msgCols);
  }
  if (msgRes.error) {
    const s = stateForError(msgRes.error);
    return failure(s, messageFor(s), me);
  }

  const rows = (msgRes.data ?? []) as MessageRow[];
  const truncated = rows.length >= MESSAGE_WINDOW;
  const windowFloor = truncated ? (rows[rows.length - 1]?.created_at ?? null) : null;

  const latest = new Map<string, MessageRow>();
  const unreadCount = new Map<string, number>();
  for (const row of rows) {
    // Rows arrive newest first, so the first one seen for a thread is its last.
    if (!latest.has(row.thread_id)) latest.set(row.thread_id, row);
    if (row.sender_id === me) continue;
    const mark = lastReadBy.get(row.thread_id) ?? null;
    if (mark === null || row.created_at > mark) {
      unreadCount.set(row.thread_id, (unreadCount.get(row.thread_id) ?? 0) + 1);
    }
  }

  /* Threads the window starved. Repaired one at a time, and only a few — past
     `REPAIR_LIMIT` the honest answer is "not measured", which the row draws as
     nothing rather than as a zero. */
  const starved = truncated ? ids.filter((id) => !latest.has(id)) : [];
  const repaired = new Map<string, { last: MessageRow | null; unread: number | null }>();
  await Promise.all(
    starved.slice(0, REPAIR_LIMIT).map(async (id) => {
      const mark = lastReadBy.get(id) ?? null;
      const lastQ = bounded(
        untyped
          .from("messages")
          .select(msgCols)
          .eq("thread_id", id)
          .order("created_at", { ascending: false })
          .limit(1),
      );
      let countQ = untyped
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", id)
        .neq("sender_id", me);
      if (mark !== null) countQ = countQ.gt("created_at", mark);

      const [lastRes, countRes] = await Promise.all([lastQ, bounded(countQ)]);
      repaired.set(id, {
        last: lastRes.error ? null : (((lastRes.data ?? [])[0] as MessageRow | undefined) ?? null),
        unread: countRes.error ? null : (countRes.count ?? null),
      });
    }),
  );

  /* ---- assemble ----------------------------------------------------------- */

  const conversations: ServerConversation[] = threads.map((t) => {
    const members = roster.get(t.id) ?? [me];
    const otherIdsHere = members.filter((p) => p !== me);
    const kind = normaliseKind(t.kind, members.length);

    const fix = repaired.get(t.id);
    const lastRow = latest.get(t.id) ?? fix?.last ?? null;
    const mark = lastReadBy.get(t.id) ?? null;

    let unread: number | null;
    let unreadExact: boolean;
    if (latest.has(t.id)) {
      unread = unreadCount.get(t.id) ?? 0;
      // Exact when nothing was cut, or when this thread's read mark is inside
      // the window — everything after it is therefore in hand.
      unreadExact = !truncated || (mark !== null && windowFloor !== null && mark >= windowFloor);
    } else if (fix) {
      unread = fix.unread;
      unreadExact = fix.unread !== null;
    } else if (!truncated) {
      // The window was complete and held nothing for this thread: it is empty.
      unread = 0;
      unreadExact = true;
    } else {
      unread = null;
      unreadExact = false;
    }

    return {
      threadId: t.id,
      kind,
      title: t.title ?? null,
      peakName: t.peak_name,
      status: t.status === "closed" ? "closed" : "open",
      other:
        otherIdsHere.length === 1
          ? (people.get(otherIdsHere[0]) ?? bareCorrespondent(otherIdsHere[0]))
          : null,
      participantCount: members.length,
      lastMessage: lastRow ? toMessage(lastRow, me) : null,
      lastMessageAt: t.last_message_at,
      unread,
      unreadExact,
    };
  });

  return {
    state: "ready",
    message: conversations.length === 0 ? MESSAGING_NONE : null,
    conversations,
    me,
  };
}

/** Somebody we know is in the thread but whose profile row did not come back. */
function bareCorrespondent(id: string): Correspondent {
  return { id, displayName: null, username: null, avatarUrl: null };
}

/**
 * `kind` when the column answered, and a derivation when it did not.
 *
 * The derivation is deliberately coarse — more than two people is a group,
 * otherwise assume the two-party case — and it is only ever reached on a server
 * that predates 20260818090000. It never invents an `enquiry`: that one carries
 * a commercial meaning the participant count cannot witness.
 */
function normaliseKind(raw: string | null | undefined, members: number): ServerThreadKind {
  if (raw === "direct" || raw === "group" || raw === "enquiry") return raw;
  return members > 2 ? "group" : "direct";
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One read at a time, app-wide.
 *
 * Concurrent callers (the top bar mounting at the same moment as the Messages
 * screen) share the in-flight promise rather than racing two identical
 * requests, whose answers would arrive in an arbitrary order and could publish
 * the older one last.
 */
export function loadConversations(force = false): Promise<void> {
  if (inflight) {
    /*
     * A FORCED READ THAT ARRIVES MID-FLIGHT IS NOT DROPPED.
     *
     * `refreshConversations()` is called the instant a message is stored, and
     * the read already running may have started BEFORE that write — so handing
     * back its promise would quietly answer with a list that predates the
     * message just sent, and the sender's own words would be missing from their
     * inbox until something else happened to reload it. The flag makes the
     * loader run once more when the current one lands.
     */
    if (force) restartWhenIdle = true;
    return inflight;
  }
  if (everLoaded && !force) return Promise.resolve();

  const controller = new AbortController();
  inflight = (async () => {
    try {
      const next = await read(controller.signal);
      everLoaded = true;
      publish(next);
    } catch {
      // An abort or a thrown fetch error is still an answer the screen has to
      // draw. Nothing from this module ever reaches a screen as an exception.
      everLoaded = true;
      publish(failure("unreachable", MESSAGING_UNREACHABLE, snapshot.me));
    } finally {
      inflight = null;
      if (restartWhenIdle) {
        restartWhenIdle = false;
        void loadConversations(true);
      }
    }
  })();
  return inflight;
}

/** Called by the write paths after anything that could change the list. */
export function refreshConversations(): void {
  void loadConversations(true);
}

/**
 * Wipe what is held and start again — for sign-out, where the next person to
 * open this app must not see the last one's inbox for even one frame.
 */
export function forgetConversations(): void {
  everLoaded = false;
  restartWhenIdle = false;
  publish({ state: "loading", message: null, conversations: EMPTY, me: null });
}

/**
 * WHOSE INBOX THIS IS CHANGES WITH THE SESSION, and the store is module-level.
 *
 * `AppTopBar` mounts once for the whole app and reads this store on the way up
 * — often before anybody has signed in. Without this subscription the snapshot
 * would sit on `signed-out` for the rest of the session and the athlete's
 * conversations would simply never appear. The other direction matters more:
 * signing out must empty the store immediately, so the next person to use this
 * phone cannot see the last one's correspondence for even one frame.
 *
 * DEFERRED BY A TIMEOUT, and that is not a style choice. auth-js fires this
 * callback while holding its own lock, and `read()` calls `getSession()` — a
 * synchronous call into that lock deadlocks, which is the trap `auth/session.ts`
 * already documents and works around the same way.
 *
 * `INITIAL_SESSION` is skipped: it describes the session that already existed,
 * so acting on it would repeat the load every mounted hook has already asked
 * for. `TOKEN_REFRESHED` and `USER_UPDATED` are skipped for the reason
 * `auth/useMyProfile.ts` and `components/social/Composer.tsx` both state in the
 * same words: THE TOKEN CHANGED, THE PERSON DID NOT. A refresh happens roughly
 * hourly and again whenever the app is brought back to the foreground, and
 * emptying the store on one is visible — `Thread.tsx` reads `serverThreadId`
 * out of it, so an open conversation is replaced by "Opening…" and its
 * transcript is thrown away and refetched mid-sentence.
 *
 * AND THE WIPE IS PAID ONLY WHEN THE PERSON ACTUALLY CHANGED. `forgetConversations`
 * is what keeps the guarantee — the next person to open this phone must not see
 * the last one's inbox for even one frame — so it runs when the session's user
 * id differs from the one the store was built for, and a re-authentication as
 * the same climber just reloads.
 */
const authClient = supabase;
authClient?.auth.onAuthStateChange((event) => {
  if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
    return;
  }
  setTimeout(() => {
    void (async () => {
      const { data } = await authClient.auth.getSession();
      const who = data.session?.user.id ?? null;
      if (who !== snapshot.me) forgetConversations();
      void loadConversations(true);
    })();
  }, 0);
});

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Every conversation on ICEFALL's server, for the signed-in athlete.
 *
 * Loads once per cold start and on `reload()`. Not live — see the header.
 */
export function useServerConversations(): ConversationsResult {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void loadConversations();
  }, []);

  const reload = useCallback(() => {
    void loadConversations(true);
  }, []);

  return { ...snap, reload };
}

/**
 * One conversation out of the same store, without a second request.
 *
 * `undefined` means the store has no such thread — which on a `ready` snapshot
 * means it is not one of yours, and on any other means ICEFALL has not looked
 * yet. The caller must tell those apart by reading `state`.
 */
export function useServerConversation(threadId: string | null | undefined): {
  conversation: ServerConversation | undefined;
  state: MessagingState;
  message: string | null;
  me: string | null;
  reload(): void;
} {
  const { conversations, state, message, me, reload } = useServerConversations();
  return {
    conversation: threadId ? conversations.find((c) => c.threadId === threadId) : undefined,
    state,
    message,
    me,
    reload,
  };
}

/**
 * The existing two-party thread with this person, if there is one.
 *
 * Read from the store, so opening a profile costs no request. `undefined` means
 * "no thread with them in the list" — which is the ordinary state before the
 * first message and is NOT an error.
 */
export function useDirectConversation(profileId: string | null | undefined): {
  conversation: ServerConversation | undefined;
  state: MessagingState;
  message: string | null;
  me: string | null;
  reload(): void;
} {
  const { conversations, state, message, me, reload } = useServerConversations();
  return {
    conversation: profileId
      ? conversations.find((c) => c.kind === "direct" && c.other?.id === profileId)
      : undefined,
    state,
    message,
    me,
    reload,
  };
}

/**
 * The number on the messages icon, or NOTHING.
 *
 * `null` means NOT MEASURED and must be drawn as nothing at all — never as a
 * zero, and never as a dot. It is null whenever the list has not loaded, there
 * is no server, nobody is signed in, or a count could not be proved. `exact` is
 * false when at least one thread contributed a floor rather than a total; the
 * caller may then draw a "+", and `AppTopBar`'s 9+ cap already does.
 */
export function useUnreadTotal(): { count: number | null; exact: boolean } {
  const { state, conversations } = useServerConversations();
  if (state !== "ready") return { count: null, exact: false };

  let total = 0;
  let measured = false;
  let exact = true;
  for (const c of conversations) {
    if (c.unread === null) {
      // One unmeasured thread does not make the others unmeasured — it makes
      // the TOTAL a floor, which is what `exact` is for.
      exact = false;
      continue;
    }
    measured = true;
    total += c.unread;
    if (!c.unreadExact) exact = false;
  }
  if (!measured && conversations.length > 0) return { count: null, exact: false };
  return { count: total, exact };
}

/**
 * One person's name and picture, for the head of a conversation that does not
 * exist yet.
 *
 * A CONVERSATION WITH NOBODY IN IT STILL HAS SOMEBODY AT THE TOP OF IT. When
 * the athlete opens `/messages/with/:profileId` and has never written to that
 * person, there is no thread to take a name from — so this reads the one row
 * `profiles_select` allows, and nothing else. It is deliberately not
 * `usePublicProfile`, which fetches an entire public profile (posts, summits,
 * counts, verification) to satisfy a header that needs a name.
 *
 * A missing answer is not an error here: after 20260903010000 a blocked person
 * is simply absent from `profiles`, and the header falls back to
 * `PARTICIPANT_NAME_UNAVAILABLE` without asserting why.
 */
export function useCorrespondent(profileId: string | null | undefined): Correspondent | null {
  const [person, setPerson] = useState<Correspondent | null>(null);

  useEffect(() => {
    setPerson(null);
    if (!untyped || !profileId) return;
    const controller = new AbortController();

    void (async () => {
      const q = untyped
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .eq("id", profileId);
      const deadline = withTimeout(MESSAGING_TIMEOUT_MS, controller.signal);
      const res = await ask(deadline ? q.abortSignal(deadline).maybeSingle() : q.maybeSingle());
      if (controller.signal.aborted || res.error || !res.data) return;
      const row = res.data as {
        id: string;
        display_name: string | null;
        username: string | null;
        avatar_url: string | null;
      };
      setPerson({
        id: row.id,
        displayName: row.display_name,
        username: row.username,
        avatarUrl: row.avatar_url,
      });
    })();

    return () => controller.abort();
  }, [profileId]);

  return person;
}

/* -------------------------------------------------------------------------- */
/* Reading one thread                                                          */
/* -------------------------------------------------------------------------- */

/** What one thread's own read holds, before the list's state is folded in. */
interface ThreadSnapshot {
  state: MessagingState;
  message: string | null;
  messages: ServerMessage[];
  people: Map<string, Correspondent>;
}

export interface ThreadMessages {
  state: MessagingState;
  message: string | null;
  messages: ServerMessage[];
  /** Everyone else in the thread, by id — a group needs a name per bubble. */
  people: ReadonlyMap<string, Correspondent>;
  me: string | null;
  reload(): void;
}

/** The newest slice of one conversation. Older messages are not paged in yet. */
const THREAD_MESSAGE_LIMIT = 200;

/**
 * The messages in one thread, newest slice first and then reversed for display.
 *
 * A SEPARATE REQUEST FROM THE LIST, deliberately: the list holds one preview
 * line per thread and this needs two hundred. Sharing one query would either
 * make the inbox enormous or make a conversation a single bubble.
 */
export function useThreadMessages(threadId: string | null | undefined): ThreadMessages {
  const { me, state: listState } = useServerConversations();
  const [snap, setSnap] = useState<ThreadSnapshot>({
    state: "loading",
    message: null,
    messages: [],
    people: new Map(),
  });

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!untyped || !supabase) {
        setSnap({
          state: "no-backend",
          message: MESSAGING_NO_BACKEND,
          messages: [],
          people: new Map(),
        });
        return;
      }
      if (!threadId) {
        // Not a failure: a conversation that has not been started yet has no
        // messages, and saying so is different from failing to read some.
        setSnap({ state: "ready", message: null, messages: [], people: new Map() });
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id ?? null;
      if (!uid) {
        setSnap({
          state: "signed-out",
          message: MESSAGING_SIGNED_OUT,
          messages: [],
          people: new Map(),
        });
        return;
      }

      const deadline = withTimeout(MESSAGING_TIMEOUT_MS, signal);
      const cols = "id, thread_id, sender_id, body, created_at";
      const build = (withKind: boolean): Promise<Raw> => {
        const q = untyped
          .from("messages")
          .select(withKind ? `${cols}, kind` : cols)
          .eq("thread_id", threadId)
          .order("created_at", { ascending: false })
          .limit(THREAD_MESSAGE_LIMIT);
        return ask(deadline ? q.abortSignal(deadline) : q);
      };

      let res = await build(true);
      if (res.error && classifyBackendError(res.error) === "not-provisioned")
        res = await build(false);
      if (signal.aborted) return;
      if (res.error) {
        const s = stateForError(res.error);
        setSnap({ state: s, message: messageFor(s), messages: [], people: new Map() });
        return;
      }

      const rows = ((res.data ?? []) as MessageRow[]).slice().reverse();
      const authorIds = [...new Set(rows.map((r) => r.sender_id))].filter((id) => id !== uid);
      const people = new Map<string, Correspondent>();
      if (authorIds.length > 0) {
        const profiles = await untyped
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", authorIds);
        for (const p of (profiles.error ? [] : (profiles.data ?? [])) as {
          id: string;
          display_name: string | null;
          username: string | null;
          avatar_url: string | null;
        }[]) {
          people.set(p.id, {
            id: p.id,
            displayName: p.display_name,
            username: p.username,
            avatarUrl: p.avatar_url,
          });
        }
      }
      if (signal.aborted) return;
      // An empty thread carries no message of its own: "nothing has been said
      // yet" is a fact the screen states in its own words, not a failure.
      setSnap({
        state: "ready",
        message: null,
        messages: rows.map((r) => toMessage(r, uid)),
        people,
      });
    },
    [threadId, setSnap],
  );

  useEffect(() => {
    const controller = new AbortController();
    /*
     * CLEARED ON THE WAY IN, NOT ON THE WAY BACK.
     *
     * `/messages/:id` renders one element for every thread, so React keeps this
     * state across a change of parameter. Setting the messages only when the
     * new fetch resolves left the PREVIOUS conversation's transcript on screen
     * under the new person's name and avatar — those come from the shared
     * store, which updates synchronously — for the length of a round trip. In
     * the app today every route out of a thread goes back to the inbox and
     * unmounts this, so the two were consistent by luck; browser history in the
     * installed PWA is not luck, and this is private correspondence attributed
     * to the wrong person.
     */
    setSnap({ state: "loading", message: null, messages: [], people: new Map() });
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const reload = useCallback(() => {
    const controller = new AbortController();
    void load(controller.signal);
    refreshConversations();
  }, [load]);

  /*
   * The list's own failure states (no client, signed out, unreachable) are the
   * same failure here, and a thread that says "loading" under an inbox that
   * says "sign in" is two answers to one question.
   *
   * THE SENTENCE TRAVELS WITH THE STATE. Substituting only the state left
   * `message` as this thread's own — which for a thread that was never read is
   * null — and the screen's fallback for a null message is "nothing has been
   * said yet". So a failed inbox read made the thread ASSERT that a
   * conversation is empty when ICEFALL had not managed to look at it.
   */
  const substituted =
    snap.state === "ready" && listState !== "ready" && listState !== "loading" ? listState : null;

  return {
    ...snap,
    state: substituted ?? snap.state,
    message: substituted ? messageFor(substituted) : snap.message,
    me,
    reload,
  };
}
