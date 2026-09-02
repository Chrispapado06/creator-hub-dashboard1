/**
 * BLOCKING AND REPORTING — the two controls a person reaches for when ICEFALL
 * has stopped being a nice place to be, and the honest account of what each one
 * actually does today.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 *
 * Both controls were already drawn and neither worked.
 *
 *   REPORTING. `components/social/ReportDialog.tsx` inserts
 *   `{reporter_id, post_id, reason, detail}` into `public.reports`. MEASURED
 *   against the live database on 2 September 2026: THERE IS NO `post_id`
 *   COLUMN. The live table is `id, reporter_id, subject_id, thread_id, reason,
 *   detail, created_at, status`, and `subject_id` is a foreign key to
 *   `profiles` — a PERSON, not a post. So that insert has always failed, the
 *   dialog has always fallen into its catch branch, and its catch branch is
 *   honest ("kept on this device and has not reached moderation") — which is
 *   the only reason nobody was lied to. No post report has ever arrived.
 *
 *   BLOCKING. `public.blocks` exists, `blocks_own` grants the caller full
 *   control of the rows they created, and NOTHING IN `src/` HAS EVER WRITTEN A
 *   ROW. Worse, `posts_select` did not consult `blocks` at all, so even a
 *   written row hid nothing. A block button on top of that would have been a
 *   lie told by the UI: the tap succeeds, the harasser stays on the screen.
 *
 * `20260903010000_block_and_report.sql` fixes both on the server. THIS MODULE
 * IS THE HALF THAT CALLS IT, and it is written to be correct BEFORE and AFTER
 * that migration is pushed, with no redeploy in between.
 *
 * ── WHAT A BLOCK DOES, AND THE FOUR THINGS IT DOES NOT ───────────────────────
 *
 * A block is one row: `(blocker_id, blocked_id, created_at)`. Inserting it is
 * the block; deleting it is the unblock. Once the migration is live, the server
 * stops showing you that person's posts, stories, comments, likes, follows,
 * profile, highlights and group messages, and stops showing YOU to THEM — the
 * exclusion is symmetric, because a one-way block that still lets the blocker
 * talk at somebody is a mute with extra steps.
 *
 *   IT DOES NOT NOTIFY THEM. `blocks_own` is `using (blocker_id = auth.uid())`,
 *     so the blocked party cannot read the row and no message is sent. That is
 *     deliberate — telling somebody they have been blocked is how a block turns
 *     into an escalation. Nothing in this file may ever be built into a notice.
 *
 *   IT DOES NOT DELETE ANYTHING. Their posts, their comments and the messages
 *     they already sent all still exist; they stop being VISIBLE TO YOU.
 *     Unblocking restores every one of them. A screen must not say "removed".
 *
 *   IT IS NOT RETROACTIVE OVER ANYTHING ALREADY ON THE DEVICE. RLS filters the
 *     NEXT request. A feed, a thread or a profile already sitting in React state
 *     keeps whatever it was handed before the block existed, until something
 *     re-reads it. `useBlockedIds` exists to paper over exactly that window and
 *     is a CONVENIENCE, not the guarantee — see its own note.
 *
 *   IT DOES NOT HIDE DIRECT MESSAGES, and that is a decision rather than a gap.
 *     Blocking has stopped NEW messages since 20260818090000. Hiding the
 *     history would take receipts — dates, what was agreed, evidence of somebody
 *     asking to be paid off ICEFALL — away from the person who blocked, and the
 *     blocked party could never hand them back. The migration argues this at
 *     length; it is repeated here so a screen does not promise otherwise.
 *
 * ── THE ONE THING TO KNOW BEFORE THE MIGRATION IS PUSHED ─────────────────────
 *
 * `blocks` and `blocks_own` ARE ALREADY LIVE. So `block()` below writes a real
 * row TODAY — and today that row hides nothing at all, because the read
 * policies that consult it ship in the unpushed migration.
 *
 * A SCREEN MUST NOT SAY "THEIR POSTS ARE HIDDEN" ON THE STRENGTH OF A
 * SUCCESSFUL WRITE. `useBlocked().enforcement` is how it finds out, and it is
 * MEASURED rather than assumed: see `BlockEnforcement`.
 *
 * ── HOW REPORTING SURVIVES AN UNPUSHED MIGRATION ─────────────────────────────
 *
 * `publicProfile.ts` established the pattern this module is built on: A COLUMN
 * THE DEPLOYED SERVER DOES NOT HAVE GOES OUT IN A SEPARATE REQUEST THAT IS
 * ALLOWED TO FAIL, so the rest still answers. Here it takes two forms.
 *
 *   THE REPORT ITSELF always names the exact column for what is being reported
 *   — `post_id` for a post, `comment_id` for a comment, and so on. Five of those
 *   seven columns do not exist today, so five of the seven kinds fail with
 *   PGRST204 and are kept on the device. THE ATTEMPT IS NEVER CACHED AND NEVER
 *   SKIPPED: unlike `publicProfile.ts`, which remembers which rung of its
 *   ladder works, this module re-attempts the real insert every single time. A
 *   remembered "not provisioned" would be a report queued when it could have
 *   been delivered, and the whole point is that the moment `supabase db push`
 *   runs, reporting starts working on phones nobody has updated.
 *
 *   THE BLOCK LIST'S NAMES are read in a SECOND request beside the block rows,
 *   never as an embed. Two reasons, both load-bearing. `blocks` reaches
 *   `profiles` twice (blocker and blocked), so a bare embed is the `PGRST201`
 *   ambiguity refusal — and an `!inner` embed would be worse than a refusal:
 *   after the migration `profiles_select` hides the blocked person from you, so
 *   an inner join would drop the block row itself and TAKE YOUR OWN BLOCK LIST
 *   OFF THE SCREEN, leaving nothing to tap to unblock.
 *
 * ── THE CONSEQUENCE THAT SURPRISES EVERY READER ──────────────────────────────
 *
 * After the migration, YOU CANNOT READ THE NAME OF SOMEBODY YOU HAVE BLOCKED.
 * `profiles_select` becomes `id = auth.uid() or is_staff() or id not in
 * (blocked_ids())`, and `blocked_ids()` is symmetric, so the person you blocked
 * is gone from `profiles` for you as thoroughly as they are gone from the feed.
 * That is the feature working, not a fault.
 *
 * SO THE BLOCK LIST MAY HAVE NO NAME ON IT, AND THAT SPACE MUST SAY "BLOCKED" —
 * NEVER AN EM DASH. An em dash in this app means NOT MEASURED. This is measured:
 * the server answered, and the answer was "you have made this person invisible
 * to yourself". `blockedLabel()` exists so that no screen has to decide.
 *
 * ── WHAT THIS MODULE REFUSES TO ASK THE SERVER ───────────────────────────────
 *
 * `blocked_ids()` is granted to `authenticated` and would be one `.rpc()` call
 * away. IT IS NOT CALLED HERE AND MUST NOT BE. It returns both directions of the
 * symmetry, so calling it would hand the caller the list of people who have
 * blocked THEM — precisely the fact `blocks_own` is written to withhold, and
 * precisely the fact that turns a block into an escalation. Everything below
 * reads `blocks` filtered to `blocker_id = me`, so `useIsBlocked` answers "have
 * YOU blocked them", never "are you two in a block". The names are chosen to
 * keep that distinction visible at every call site.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { classifyBackendError, type BackendFailure } from "@/backend/pgErrors";
import { withTimeout } from "@/lib/netTimeout";
import { queueReport } from "./comments";

/**
 * `backend/types.ts` describes neither `blocks` nor `reports` — it predates the
 * chat migration and belongs to another session, so it is imported from rather
 * than edited. Every call below goes through an untyped view of the same
 * client, exactly as `highlights.ts`, `groupSpace.ts` and `publicProfile.ts` do.
 * The shapes were checked against the migrations by hand and the column names
 * are written out once, in `COLUMN_FOR`, so a typo has one place to live.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/* -------------------------------------------------------------------------- */
/* Copy — one place, so two surfaces cannot make different promises            */
/* -------------------------------------------------------------------------- */

/** No client in this build. DEMO and offline builds never construct one. */
export const SAFETY_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so nobody can be blocked here and nothing can be reported to anybody. What you do here stays on this phone.";

/** A session is required for both controls: a block and a report are both yours. */
export const SAFETY_SIGNED_OUT =
  "Blocking and reporting both need your account, so ICEFALL could not do either. Sign in and try again.";

/** The request went out and did not come back. Never dressed as a result. */
export const SAFETY_UNREACHABLE =
  "ICEFALL could not reach the server, so nothing was changed there. This is a lost connection rather than a refusal — trying again when you have signal is worth a go.";

/** The server answered and said no. A refusal is not a fact about the feature. */
export const SAFETY_REFUSED =
  "ICEFALL's server refused that. Nothing was changed. If you have been signed in a long while, signing out and back in is the usual fix.";

/**
 * The tables or columns this needs are not deployed.
 *
 * TRUE TODAY FOR REPORTS ABOUT CONTENT and false the moment
 * `20260903010000_block_and_report.sql` is pushed. It is never used for
 * blocking: `blocks` has been live since 20260818090000.
 */
export const SAFETY_NOT_PROVISIONED =
  "ICEFALL's server cannot take a report about this yet — the moderation queue does not have a place to put it. Nothing has reached anybody.";

/**
 * A block was written, and the server does not yet act on it.
 *
 * THE SENTENCE THAT KEEPS THE BUTTON HONEST BEFORE THE MIGRATION LANDS. The row
 * is real and it will start working with no further action from the person, but
 * saying "hidden" today would be a claim contradicted by the very next screen
 * they scroll.
 */
export const BLOCK_NOT_ENFORCED_YET =
  "This block is saved to your account, and ICEFALL's server is not yet hiding people you block — so you may still see them until that goes live. Nothing you do here needs repeating when it does.";

/**
 * Why a name is missing from the block list, in a climber's terms.
 *
 * Not an apology and not an error: it is the block doing its job.
 */
export const BLOCKED_NAME_HIDDEN =
  "You have blocked this person, so ICEFALL no longer shows you their name. Unblocking brings it back.";

/** What a block list entry is called when the name cannot be read. NEVER an em dash. */
export const BLOCKED_LABEL = "Blocked person";

/** The name request failed, so the name is genuinely unknown — different from hidden. */
export const BLOCKED_NAME_UNREAD =
  "ICEFALL could not read this person's name just now. The block itself is unaffected.";

/** Reached moderation. The id came back, so the row exists. */
export const REPORT_REACHED_MODERATION =
  "Your report is stored and open in ICEFALL's moderation queue. ICEFALL does not promise a review time, and you will not be told what was decided about somebody else's account.";

/**
 * Kept on the device. NEVER conflated with the sentence above.
 *
 * It promises a retry, not a delivery, because nothing in this build drains the
 * queue on its own — see `flushReports`.
 */
export const REPORT_KEPT_ON_DEVICE =
  "This report is kept on your phone and has NOT reached moderation. Nothing was lost — reporting it again when you have signal will send it.";

/**
 * The report cannot be filed at all, and saying "we'll try later" would be a
 * lie: there is nothing on ICEFALL's server for it to point at.
 *
 * Reached by demo content and by anything held only in this device's storage —
 * `social/comments.ts` comments have ids like `c:1a2b`, not uuids.
 */
export const REPORT_NOT_ON_SERVER =
  "This isn't something ICEFALL's server holds, so there is nothing for moderation to look at and nothing has been sent. It has been noted on this phone only.";

/** The device would not even keep it. The worst case, and it is stated plainly. */
export const REPORT_NOT_STORED =
  "ICEFALL could not send this report and could not store it on your phone either, so it is gone. Nothing has reached anybody. This phone's storage is full or unavailable.";

/* -------------------------------------------------------------------------- */
/* Reasons and kinds — the database's vocabulary, not this file's              */
/* -------------------------------------------------------------------------- */

/**
 * `reports.reason` carries
 * `check (reason in ('spam','harassment','off_platform_payment','safety',
 * 'impersonation','other'))` — 20260818090000, unchanged by the new migration.
 * A seventh value invented here would be a constraint violation at submit time,
 * i.e. a report a person believed they had filed.
 *
 * `ReportDialog.tsx` holds its own copy of these six with the labels beside
 * them. That file is not edited from here, so the values are repeated rather
 * than shared — character for character, deliberately.
 */
export const REPORT_REASONS = [
  "spam",
  "harassment",
  "off_platform_payment",
  "safety",
  "impersonation",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * EVERY REPORTABLE THING THE MIGRATION SUPPORTS, and nothing else.
 *
 * Checked against `reports_name_the_subject()`, which is the server's own list:
 * it stamps `subject_kind` from whichever reference column arrives and RAISES if
 * none did. These seven are that function's seven branches.
 *
 * A STORY IS A POST and a SUMMIT LOG IS A POST. Neither is a second table — a
 * story is a post with an `expires_at`, and `summit_logs.post_id` is `not null
 * unique` and cascades from the post. So both are reported as `"post"`, and the
 * migration explains why a `summit_log` kind was deliberately not added: two
 * ways to name one object is how two reports about the same claim end up
 * disagreeing about what was reported.
 *
 * NOT REPORTABLE, and worth knowing rather than discovering: a GROUP itself (you
 * can report a message in it, not the group), and a COMPANY (you can block and
 * report the human who posts for it — `posts.author_id` is always the person who
 * pressed send). Both are flagged in the migration as open questions for the
 * owner, not as oversights.
 */
export const REPORT_KINDS = [
  "profile",
  "thread",
  "post",
  "comment",
  "group_message",
  "channel_message",
  "message",
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

/**
 * Which column names each kind. THE ONLY PLACE THESE STRINGS APPEAR.
 *
 * `subject_id` and `thread_id` are live today. The other five ship in
 * 20260903010000 and are absent until it is pushed, which is the entire reason
 * this module has an on-device queue.
 *
 * NOTE WHAT IS NOT SENT: for a post, a comment or a message, the report names
 * ONLY the content. It never names the author, even when the caller knows who
 * they are. The server resolves `subject_id` from the content's author in
 * `reports_name_the_subject()`, overwriting anything a client sent, precisely so
 * that a report cannot be aimed at somebody who did not write the thing —
 * `subject_id` is what makes a repeat offender countable, and a count you can
 * aim at an innocent person is a weapon rather than a queue.
 */
const COLUMN_FOR: Record<ReportKind, string> = {
  profile: "subject_id",
  thread: "thread_id",
  post: "post_id",
  comment: "comment_id",
  group_message: "group_message_id",
  channel_message: "channel_message_id",
  message: "message_id",
};

export interface ReportInput {
  kind: ReportKind;
  /** The uuid of the thing being reported. See `isServerId`. */
  id: string;
  reason: ReportReason;
  /** Free text. Empty becomes `null` — the column is nullable and has no length rule. */
  detail?: string;
}

/** Why a report is sitting on the phone instead of in the queue. */
export type QueuedReason =
  | "no-backend"
  | "signed-out"
  | "offline"
  | "not-provisioned"
  | "refused"
  | "unreachable"
  | "unknown";

/** Why a report can never be filed, however many times it is tried. */
export type UnfilableReason = "not-on-server" | "unknown-kind" | "unknown-reason" | "not-stored";

/**
 * THE THREE OUTCOMES, AND THEY ARE NEVER COLLAPSED INTO TWO.
 *
 *   moderation — the row exists on ICEFALL's server and `id` is the proof. Only
 *                this outcome may be described to a person as reported.
 *   device     — kept here, reached nobody, and CAN be sent later.
 *   nowhere    — kept here or not at all, reached nobody, and CANNOT be sent
 *                later. Promising a retry for one of these would be the lie.
 *
 * `message` is always safe to print as-is. The `reason` is there for a screen
 * that wants to say something better, never for one that wants to say something
 * more optimistic.
 */
export type ReportOutcome =
  | { where: "moderation"; id: string; message: string }
  | { where: "device"; reason: QueuedReason; message: string }
  | { where: "nowhere"; reason: UnfilableReason; message: string };

/* -------------------------------------------------------------------------- */
/* Failures, classified in one place                                           */
/* -------------------------------------------------------------------------- */

/**
 * Postgres speaks to operators. `backend/pgErrors.ts` is the single classifier
 * in this codebase and it is used rather than re-derived — six modules once
 * hand-classified `42501` as "this feature is not deployed", which told people
 * whose session had merely lapsed a confident, checkable, false thing about
 * ICEFALL's server.
 *
 * ONE ADDITION, AND IT IS NOT A RECLASSIFICATION. `classifyBackendError` reports
 * "unknown" for an error with no code and no recognisable message, which is
 * what a dropped fetch looks like on some engines. This module keeps that as
 * "unknown" and does NOT promote it to "unreachable": guessing that a failure
 * was the network is how a refusal ends up described as bad signal.
 */
function failureSentence(failure: BackendFailure): string {
  switch (failure) {
    case "not-provisioned":
      return SAFETY_NOT_PROVISIONED;
    case "refused":
      return SAFETY_REFUSED;
    case "unreachable":
      return SAFETY_UNREACHABLE;
    default:
      return "ICEFALL's server did not complete that, and did not say why. Nothing was changed there.";
  }
}

/** `BackendFailure` as the queue's own vocabulary. Same four cases, no rounding. */
function queuedReason(failure: BackendFailure): QueuedReason {
  switch (failure) {
    case "not-provisioned":
      return "not-provisioned";
    case "refused":
      return "refused";
    case "unreachable":
      return "unreachable";
    default:
      return "unknown";
  }
}

/**
 * Every id this module sends is a uuid column on the server — `posts.id`,
 * `post_comments.id`, `group_messages.id`, `channel_messages.id`,
 * `messages.id`, `threads.id`, `profiles.id`.
 *
 * CHECKING THE SHAPE HERE IS NOT TIDINESS. Two real id spaces in this app are
 * not uuids and would otherwise reach Postgres: `social/comments.ts` mints
 * `c:1a2b3c` for a device-local comment, and `social/highlights.ts` mints
 * `highlight:demo-…` for demo content. Sent as a uuid either would come back
 * `22P02 invalid input syntax`, which every classifier reads as "the server
 * could not answer" — the opposite of the truth, which is that no row can hold
 * that value and this function knows it without asking anybody.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isServerId = (value: string): boolean => UUID.test(value.trim());

/* -------------------------------------------------------------------------- */
/* The session gate                                                            */
/* -------------------------------------------------------------------------- */

type GateFailure = "no-backend" | "signed-out" | "unreachable";
type Gate =
  | { ok: true; uid: string; client: SupabaseClient }
  | { ok: false; message: string; failure: GateFailure };

/**
 * Nothing here touches the network without going through this.
 *
 * It also narrows `untyped` for the caller, so every call site reads
 * `gate.client` rather than carrying a `!` that a later edit can get wrong.
 *
 * `getSession()` gets its own deadline because it can refresh a token over the
 * network and it runs BEFORE the query — so the `.abortSignal()` on the query
 * cannot protect it. Same reasoning and same number as `publicProfile.ts`.
 */
const SESSION_TIMEOUT_MS = 3_000;
const READ_TIMEOUT_MS = 6_000;
const WRITE_TIMEOUT_MS = 8_000;

/** Race work that has no cancellation of its own against the clock. Returns a
    sentinel rather than throwing, so a timeout has to be handled deliberately
    instead of being caught by accident beside real errors. Copied from
    `publicProfile.ts` rather than imported: it is a private helper in a file
    this module does not own. */
const TIMED_OUT = Symbol("timed-out");
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function gate(): Promise<Gate> {
  if (!supabase || !untyped) {
    return { ok: false, message: SAFETY_NO_BACKEND, failure: "no-backend" };
  }
  const session = await withDeadline(supabase.auth.getSession(), SESSION_TIMEOUT_MS);
  // A session refresh that never answered is NOT a signed-out person, and it
  // gets its own failure for that reason. Reported as signed-out it would send
  // somebody to a sign-in screen they are already past; reported honestly it is
  // a lost connection, and the report they just filed says "no signal".
  if (session === TIMED_OUT) {
    return { ok: false, message: SAFETY_UNREACHABLE, failure: "unreachable" };
  }
  const uid = session.data.session?.user.id ?? null;
  if (!uid) return { ok: false, message: SAFETY_SIGNED_OUT, failure: "signed-out" };
  return { ok: true, uid, client: untyped };
}

/* ========================================================================== */
/* BLOCKING                                                                   */
/* ========================================================================== */

/**
 * Whether the SERVER is acting on blocks yet, MEASURED rather than assumed.
 *
 *   live     — at least one person you have blocked has become unreadable to
 *              you in `profiles`. That can only happen through the new
 *              `profiles_select`, so the migration is pushed and the read
 *              policies are in force.
 *   not-live — the name request succeeded and every person you have blocked
 *              still came back. The exclusion is not deployed.
 *   unknown  — nothing to measure with (no blocks, no client, nobody signed in)
 *              or the name request failed. NOT the same as `not-live`, and a
 *              screen must not treat it as one.
 *
 * TWO HONEST CAVEATS, because a comment claiming a guarantee the code does not
 * keep is worse than no comment.
 *
 *   A STAFF ACCOUNT WILL ALWAYS READ `not-live`. `profiles_select` keeps an
 *   `is_staff()` arm, so the desk can still see everybody by design and this
 *   probe cannot tell that apart from an unpushed migration. Staff are not the
 *   audience for the sentence it drives; nothing else depends on it.
 *
 *   IT MEASURES `profiles_select` AND INFERS THE REST. The migration changes ten
 *   policies in one transaction, so in practice one being live means all are.
 *   If somebody ever applies half of it by hand, this will say `live` while a
 *   feed still shows the blocked person. That is why it drives a sentence and
 *   never a filter.
 */
export type BlockEnforcement = "live" | "not-live" | "unknown";

/** Why a blocked person's name is missing, when it is. */
export type BlockedNameState =
  /** The server returned their profile row. */
  | "read"
  /** The server answered and withheld them — the block, working. MEASURED. */
  | "hidden-by-block"
  /** The name request failed. Genuinely unknown; the block is unaffected. */
  | "not-read";

export interface BlockedPerson {
  /** `blocks.blocked_id`. Always present — it is what `unblock()` needs. */
  profileId: string;
  /** `blocks.created_at`, as it came, an ISO instant. */
  since: string;
  /**
   * `null` IS ORDINARY HERE AND IS NOT A GAP. After the migration this is null
   * for everybody on the list, because blocking somebody removes them from
   * `profiles` for you. Render `blockedLabel()`, never an em dash.
   */
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  /** Which of the two kinds of missing this is. */
  nameState: BlockedNameState;
}

/**
 * What to put where the name goes. ONE PLACE, so no screen has to decide, and
 * so no screen reaches for the em dash that in this app means NOT MEASURED.
 */
export function blockedLabel(person: BlockedPerson): string {
  return person.displayName ?? BLOCKED_LABEL;
}

/** The sentence under the label, or null when the name is simply there. */
export function blockedNameNote(person: BlockedPerson): string | null {
  switch (person.nameState) {
    case "hidden-by-block":
      return BLOCKED_NAME_HIDDEN;
    case "not-read":
      return BLOCKED_NAME_UNREAD;
    default:
      return null;
  }
}

export interface BlockListState {
  /** Newest block first. Empty AND `state: "ready"` means you have blocked nobody. */
  people: BlockedPerson[];
  state: "loading" | "ready" | "unavailable";
  /** Present whenever the list is empty for a reason other than "nobody". */
  message: string | null;
  enforcement: BlockEnforcement;
  reload(): void;
}

/** The write paths' answer. `ok` is witnessed by a row, never by a missing error. */
export type BlockResult = { ok: true; enforcement: BlockEnforcement } | { ok: false; message: string };

/* ---- The shared read ------------------------------------------------------ */

/**
 * ONE READ, SHARED BY EVERY HOOK, and re-run on every write this module makes.
 *
 * `useIsBlocked` deliberately does not query per profile: the whole list is one
 * small request, a person's block list is not long, and a per-id query on every
 * card in a feed would be a request per card. No polling and no realtime
 * subscription — the same posture `highlights.ts` and `interest.ts` take, and
 * for the same reason: a block only changes because of something the person
 * just did on this phone.
 */
interface Loaded {
  people: BlockedPerson[];
  state: "ready" | "unavailable";
  message: string | null;
  enforcement: BlockEnforcement;
}

let cache: Loaded | null = null;
let inflight: Promise<Loaded> | null = null;
let revision = 0;
const listeners = new Set<() => void>();

/**
 * WHICH ANSWER IS STILL THE CURRENT QUESTION.
 *
 * Without this, a read that was already in flight when somebody blocked
 * somebody would land AFTER the block and write its pre-block list into the
 * cache — so the person tapped Block, the row was really written, and the list
 * came back without them on it. That is the exact shape of bug that makes a
 * safety control look like it did nothing.
 *
 * A read stamps the generation it started in; only a read from the current
 * generation may fill the cache or be handed to a caller.
 */
let generation = 0;

function changed() {
  revision += 1;
  generation += 1;
  cache = null;
  // The in-flight read belongs to the previous generation. Dropping the handle
  // means the next `readBlocks()` starts a fresh one rather than awaiting an
  // answer to a question nobody is asking any more.
  inflight = null;
  listeners.forEach((l) => l());
}

function useRevision(): number {
  const [value, setValue] = useState(revision);
  useEffect(() => {
    const listener = () => setValue(revision);
    listeners.add(listener);
    // A write between the render and this effect would otherwise be missed.
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}

const unavailable = (message: string): Loaded => ({
  people: [],
  state: "unavailable",
  message,
  enforcement: "unknown",
});

async function loadBlocks(): Promise<Loaded> {
  const session = await gate();
  if (!session.ok) return unavailable(session.message);

  const deadline = withTimeout(READ_TIMEOUT_MS);
  const rows = session.client
    .from("blocks")
    .select("blocked_id, created_at")
    .eq("blocker_id", session.uid)
    .order("created_at", { ascending: false });

  const { data, error } = await (deadline ? rows.abortSignal(deadline) : rows);

  if (error) {
    return unavailable(failureSentence(classifyBackendError(error as PostgrestError)));
  }

  const blocks = (Array.isArray(data) ? data : [])
    .map((row) => row as { blocked_id?: unknown; created_at?: unknown })
    .filter(
      (row): row is { blocked_id: string; created_at: string } =>
        typeof row.blocked_id === "string" && typeof row.created_at === "string",
    );

  if (blocks.length === 0) {
    // A MEASURED EMPTY LIST. The server answered and named nobody, which is not
    // the same as any of the `unavailable` branches and must not share a
    // sentence with them.
    return { people: [], state: "ready", message: null, enforcement: "unknown" };
  }

  /*
   * THE NAMES, IN A SECOND REQUEST THAT IS ALLOWED TO FAIL.
   *
   * Not an embed. `blocks` reaches `profiles` twice — `blocker_id` and
   * `blocked_id` — so a bare embed is `PGRST201`, and an `!inner` embed would
   * be actively harmful: once `profiles_select` hides the blocked person, the
   * inner join drops the BLOCK ROW, and the list somebody opened in order to
   * unblock is empty. The block rows above are already in hand and nothing
   * below can take them away.
   *
   * The select list is the privacy boundary, exactly as it is in
   * `publicProfile.ts`: `role`, `account_status` and `suspended_reason` are all
   * on this row and all readable, and they are absent here so that no screen
   * built on this module can render them.
   */
  const ids = blocks.map((b) => b.blocked_id);
  const namesDeadline = withTimeout(READ_TIMEOUT_MS);
  const namesQuery = session.client
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .in("id", ids);

  const names = await (namesDeadline ? namesQuery.abortSignal(namesDeadline) : namesQuery);

  const found = new Map<string, { display_name?: unknown; username?: unknown; avatar_url?: unknown }>();
  const namesRead = !names.error;
  if (namesRead && Array.isArray(names.data)) {
    for (const row of names.data as Record<string, unknown>[]) {
      if (typeof row.id === "string") found.set(row.id, row);
    }
  }

  const people: BlockedPerson[] = blocks.map((b) => {
    const row = found.get(b.blocked_id);
    const displayName =
      row && typeof row.display_name === "string" && row.display_name.trim().length > 0
        ? row.display_name.trim()
        : null;
    /*
     * A MISSING ROW ON A SUCCESSFUL REQUEST IS THE BLOCK, not a deleted account
     * and not a fault. `blocks.blocked_id` is `references profiles(id) on delete
     * cascade`, so if the account were gone the block row would be gone with it
     * — the existence of the block is proof the profile exists. The only thing
     * that can withhold it is `profiles_select`, and the only arm of that policy
     * which can apply to a person you blocked is the block itself.
     */
    const nameState: BlockedNameState = !namesRead
      ? "not-read"
      : row
        ? "read"
        : "hidden-by-block";

    return {
      profileId: b.blocked_id,
      since: b.created_at,
      displayName: nameState === "read" ? displayName : null,
      username:
        nameState === "read" && row && typeof row.username === "string" && row.username.length > 0
          ? row.username
          : null,
      avatarUrl:
        nameState === "read" && row && typeof row.avatar_url === "string" && row.avatar_url.length > 0
          ? row.avatar_url
          : null,
      nameState,
    };
  });

  const enforcement: BlockEnforcement = !namesRead
    ? "unknown"
    : people.some((p) => p.nameState === "hidden-by-block")
      ? "live"
      : "not-live";

  return { people, state: "ready", message: null, enforcement };
}

/** One in-flight read at a time, whatever asks, and never an answer from before
    the last write. */
function readBlocks(): Promise<Loaded> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    const startedIn = generation;
    const running = loadBlocks()
      .catch(
        // Nothing above is expected to throw — postgrest-js reports through
        // `error` — but an unhandled rejection here would strand every hook on
        // "loading" for ever, which is the one state with no honest sentence.
        (): Loaded => unavailable(SAFETY_UNREACHABLE),
      )
      .then((loaded) => {
        // Superseded by a block or an unblock while it was in the air. Neither
        // cached nor returned: `readBlocks()` is called again below and by the
        // hooks' effect, and the fresh read is the one that answers.
        if (startedIn !== generation) return readBlocks();
        cache = loaded;
        inflight = null;
        return loaded;
      });
    inflight = running;
  }
  return inflight;
}

/* ---- Writing -------------------------------------------------------------- */

/**
 * Block somebody.
 *
 * ONE ROW, AND IT IS READ BACK. `blocks` has no `id` column — its primary key is
 * `(blocker_id, blocked_id)` — so the read-back names both halves. A missing
 * error is not evidence a row exists; the returned row is.
 *
 * ALREADY BLOCKED IS A SUCCESS. The primary key collides on a second tap, and
 * "this person is blocked" is true either way, so `23505` returns `ok` rather
 * than an error a person cannot act on. Same reasoning `highlights.addPost`
 * gives for the same code.
 *
 * IT RETURNS `enforcement`, and a screen must use it. Before the migration is
 * pushed the row is written and hides nothing; `BLOCK_NOT_ENFORCED_YET` is the
 * sentence for that case. `"unknown"` is not permission to claim the block is
 * working — it means the probe had nothing to measure.
 */
export async function block(profileId: string): Promise<BlockResult> {
  const target = profileId.trim();
  if (!isServerId(target)) {
    return {
      ok: false,
      message:
        "ICEFALL does not recognise that as an account, so nobody has been blocked. This can happen with sample content, which has no account behind it.",
    };
  }

  const session = await gate();
  if (!session.ok) return { ok: false, message: session.message };

  // `blocks_not_self` would refuse this at the table with a constraint
  // violation. Refusing it here costs no request and says something a person
  // can read.
  if (target === session.uid) {
    return { ok: false, message: "You cannot block your own account." };
  }

  const deadline = withTimeout(WRITE_TIMEOUT_MS);
  const insert = session.client
    .from("blocks")
    // `blocker_id` is sent because the INSERT needs a value; `blocks_own` then
    // requires it to equal `auth.uid()`, so a client sending somebody else's is
    // refused rather than believed.
    .insert({ blocker_id: session.uid, blocked_id: target })
    .select("blocker_id, blocked_id");

  const { data, error } = await (deadline ? insert.abortSignal(deadline) : insert).maybeSingle();

  if (error && error.code !== "23505") {
    return { ok: false, message: failureSentence(classifyBackendError(error as PostgrestError)) };
  }
  // Neither a returned row nor the duplicate-key refusal: the request came back
  // saying nothing at all, and "blocked" would be a claim about a row nobody
  // saw.
  if (!error && !data) {
    return {
      ok: false,
      message:
        "ICEFALL could not confirm that block was saved, so it is not being reported as done. Trying again is safe — blocking twice changes nothing.",
    };
  }

  changed();
  const loaded = await readBlocks();
  return { ok: true, enforcement: loaded.enforcement };
}

/**
 * Unblock somebody. The row is deleted; nothing else changes.
 *
 * A DELETE THAT MATCHED NOTHING IS A SUCCESS, and the reason is worth stating
 * because it is the sort of thing that gets "fixed" later. The filter is always
 * `blocker_id = my own uid`, which is exactly what `blocks_own` permits, so RLS
 * cannot be silently removing rows from under it: nothing matched because there
 * was no such block, and "this person is not blocked" is the end state that was
 * asked for.
 *
 * WHAT THIS RESTORES: their posts, stories, comments, likes, follows, profile,
 * highlights and group messages become visible again on the next read. Nothing
 * was deleted while they were blocked, so nothing has to be recovered.
 */
export async function unblock(profileId: string): Promise<BlockResult> {
  const target = profileId.trim();
  // Every id on the list is a uuid, so this should be unreachable. It is here
  // because the alternative failure is `22P02 invalid input syntax`, which
  // classifies as "unknown" and would tell somebody ICEFALL did not say why —
  // when the truth is that no block row could hold that value.
  if (!isServerId(target)) {
    return {
      ok: false,
      message: "ICEFALL does not recognise that as an account, so no block was removed.",
    };
  }

  const session = await gate();
  if (!session.ok) return { ok: false, message: session.message };

  const deadline = withTimeout(WRITE_TIMEOUT_MS);
  const remove = session.client
    .from("blocks")
    .delete()
    .eq("blocker_id", session.uid)
    .eq("blocked_id", target)
    .select("blocked_id");

  const { error } = await (deadline ? remove.abortSignal(deadline) : remove);

  if (error) {
    return { ok: false, message: failureSentence(classifyBackendError(error as PostgrestError)) };
  }

  changed();
  const loaded = await readBlocks();
  return { ok: true, enforcement: loaded.enforcement };
}

/* ---- The hooks ------------------------------------------------------------ */

/**
 * The signed-in person's own block list — the people THEY have blocked.
 *
 * NOT "everyone you are in a block with". `blocks_own` shows a caller only the
 * rows they created, and that is deliberate: the server's `blocked_ids()` sees
 * both directions and is not called from here, because its answer would tell
 * somebody who has blocked THEM. See the module header.
 */
export function useBlocked(): BlockListState {
  const rev = useRevision();
  const [loaded, setLoaded] = useState<Loaded | null>(cache);

  useEffect(() => {
    let live = true;
    // Cleared rather than kept: showing the previous list while the next loads
    // would mean a name the person has just unblocked staying on a screen that
    // says it is their block list.
    setLoaded(cache);
    void readBlocks().then((next) => {
      if (live) setLoaded(next);
    });
    return () => {
      live = false;
    };
  }, [rev]);

  const reload = useCallback(() => {
    changed();
  }, []);

  if (!loaded) {
    return { people: [], state: "loading", message: null, enforcement: "unknown", reload };
  }
  return { ...loaded, reload };
}

/**
 * Have YOU blocked this person?
 *
 * `null` MEANS NOT MEASURED AND MUST NOT RENDER AS `false`. It is what a screen
 * gets before the list arrives, in a build with no client, signed out, or when
 * the read failed. `false` means the list was read and this person is not on it.
 * A "Block" button is a safe thing to draw for either, but "not blocked" is a
 * sentence only `false` earns.
 *
 * IT CANNOT ANSWER THE OTHER DIRECTION, and no version of it ever should — see
 * the module header on `blocked_ids()`.
 */
export interface IsBlockedState {
  blocked: boolean | null;
  state: "loading" | "ready" | "unavailable";
  message: string | null;
}

export function useIsBlocked(profileId: string): IsBlockedState {
  const { people, state, message } = useBlocked();
  if (state !== "ready") {
    return { blocked: null, state, message };
  }
  return {
    blocked: people.some((p) => p.profileId === profileId),
    state: "ready",
    message: null,
  };
}

/**
 * The ids you have blocked, as a set, FOR CONVENIENCE ONLY.
 *
 * READ THIS BEFORE USING IT. Blocking is enforced by row-level security on
 * ICEFALL's server. This set is NOT that enforcement and is not a substitute
 * for it: it is a client-side filter over data the device already holds, it can
 * be empty when the list has not loaded, and anything that filters on it will
 * pass everything through in exactly the states where it knows least. Nothing
 * that matters may depend on it.
 *
 * It exists for one honest job. A block filters the NEXT request; a feed, a
 * thread or a profile already sitting in React state keeps whatever it was
 * handed before the block existed. Without this, tapping "Block" leaves the
 * person's posts on the screen until something re-fetches — which reads as the
 * button having done nothing. Filtering the list in memory closes that window.
 *
 * It also only knows the blocks THIS person made. Somebody who blocked YOU is
 * absent from it, and the server hides them anyway.
 */
export function useBlockedIds(): ReadonlySet<string> {
  const { people, state } = useBlocked();
  // Keyed on the ids rather than on the array, so a re-read that returns the
  // same people does not hand back a new Set and re-run every memo downstream.
  const key = state === "ready" ? people.map((p) => p.profileId).sort().join(",") : "";
  return useMemo(() => new Set(key.length > 0 ? key.split(",") : []), [key]);
}

/* ========================================================================== */
/* REPORTING                                                                  */
/* ========================================================================== */

/**
 * THE ON-DEVICE QUEUE, AND HOW IT RELATES TO THE ONE THAT WAS ALREADY HERE.
 *
 * `social/comments.ts` has kept an on-device report ledger since long before
 * there was anywhere to send one: `queueReport(subjectId, reason)` appends
 * `{subjectId, reason, at}` to `icefall.reports.v1`. This module CALLS it rather
 * than re-implementing it, so that ledger keeps recording every report this
 * device could not deliver, in the one function that owns it.
 *
 * It cannot be the drainable queue, and the reason is structural rather than a
 * preference: it records three fields, and sending a report needs FIVE — which
 * kind of thing was reported (a post and a comment with the same id are
 * different reports), and what the person actually wrote. It also has no removal
 * path, so an entry cannot be marked delivered.
 *
 * So the two answer different questions and each is written by the code that can
 * answer it: `reportQueue()` in `comments.ts` is "every report this phone could
 * not send, as it happened", and `pendingReports()` here is "what is still
 * outstanding". An entry drained from here stays in that ledger, which nothing
 * currently reads (`reportQueue` has no callers). WHOEVER BUILDS THAT SCREEN
 * MUST READ `pendingReports()` — it is the one that knows what was sent.
 */
const OUTBOX_KEY = "icefall.safety.outbox.v1";

export interface PendingReport {
  kind: ReportKind;
  id: string;
  reason: ReportReason;
  detail: string | null;
  /** When the person filed it, not when it will be sent. ISO. */
  at: string;
}

function readOutbox(): PendingReport[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PendingReport => {
      const e = entry as Partial<PendingReport>;
      return (
        typeof e.id === "string" &&
        typeof e.at === "string" &&
        typeof e.kind === "string" &&
        (REPORT_KINDS as readonly string[]).includes(e.kind) &&
        typeof e.reason === "string" &&
        (REPORT_REASONS as readonly string[]).includes(e.reason)
      );
    });
  } catch {
    return [];
  }
}

/**
 * Returns whether the write happened. THE CALLER MUST NOT CLAIM THE REPORT WAS
 * KEPT UNLESS THIS SAID SO — a swallowed quota error and a cheerful "saved on
 * your phone" is the same class of lie as a swallowed insert error and "sent".
 */
function writeOutbox(entries: PendingReport[]): boolean {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/** What is still waiting on this phone, oldest first. A count is not a list. */
export function pendingReports(): PendingReport[] {
  return readOutbox();
}

/* ---- The insert ----------------------------------------------------------- */

type SendResult = { ok: true; id: string } | { ok: false; failure: BackendFailure };

/**
 * One report, one insert, and the id read back.
 *
 * `.select("id").single()` for the same reason the composer does it: the id is
 * the only evidence the row exists. Without it a missing error would be read as
 * a delivery, which is exactly how the current dialog would have behaved if the
 * insert had ever half-succeeded.
 *
 * NO LADDER AND NO MEMO. `publicProfile.ts` remembers which rung of its select
 * ladder the server supports, because the worst case of being wrong there is a
 * follower count that stays an em dash. Here the worst case is a report that
 * sat on a phone when it could have reached moderation, so the real column is
 * named on every attempt, for ever. That is what makes reporting start working
 * the moment `supabase db push` runs, on phones nobody has updated.
 */
async function sendReport(
  client: SupabaseClient,
  uid: string,
  input: { kind: ReportKind; id: string; reason: ReportReason; detail: string | null },
): Promise<SendResult> {
  const row: Record<string, unknown> = {
    reporter_id: uid,
    reason: input.reason,
    detail: input.detail,
  };
  // The one column for this kind, and nothing else. The server stamps
  // `subject_kind` and resolves `subject_id` from the content's author itself.
  row[COLUMN_FOR[input.kind]] = input.id;

  const deadline = withTimeout(WRITE_TIMEOUT_MS);
  const insert = client.from("reports").insert(row).select("id");
  const { data, error } = await (deadline ? insert.abortSignal(deadline) : insert).maybeSingle();

  if (error) return { ok: false, failure: classifyBackendError(error as PostgrestError) };

  const id = (data as { id?: unknown } | null)?.id;
  // A response we cannot read an id out of is NOT a success. Saying "reported"
  // here would be the precise failure this module was written to end.
  if (typeof id !== "string") return { ok: false, failure: "unknown" };
  return { ok: true, id };
}

/* ---- The public call ------------------------------------------------------ */

/**
 * Report something, and say truthfully where it went.
 *
 * THE THREE OUTCOMES ARE NEVER COLLAPSED. `"moderation"` is the only one a
 * screen may describe as reported, and it is returned only when the server sent
 * back a row id. `"device"` means it is on the phone and reached nobody, and can
 * be sent later. `"nowhere"` means it reached nobody and never can — a demo post,
 * a device-local comment, a reason the CHECK constraint does not accept.
 *
 * WHAT HAPPENS TODAY, before the migration is pushed: `profile` and `thread`
 * reports go through (those columns are live), and `post`, `comment`,
 * `group_message`, `channel_message` and `message` come back
 * `{where: "device", reason: "not-provisioned"}`. After the push all seven go
 * through, with no change to this file and no new build on anybody's phone.
 */
export async function report(input: ReportInput): Promise<ReportOutcome> {
  const kind = input.kind;
  const id = (input.id ?? "").trim();
  const reason = input.reason;
  const detail = (input.detail ?? "").trim();
  const detailOrNull = detail.length > 0 ? detail : null;

  // Validated here rather than left to the CHECK constraint, so a caller that
  // got it wrong is told what is wrong instead of the person being told their
  // report failed.
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) {
    return {
      where: "nowhere",
      reason: "unknown-kind",
      message: "ICEFALL cannot report that kind of thing, so nothing has been sent.",
    };
  }
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) {
    return {
      where: "nowhere",
      reason: "unknown-reason",
      message: "ICEFALL does not have that as a reason to report something, so nothing has been sent.",
    };
  }
  if (!isServerId(id)) {
    // The person still did something; the existing ledger records that they did.
    // It is NOT put in the outbox, because nothing could ever drain it and the
    // queued sentence promises a retry.
    queueReport(id, reason);
    return { where: "nowhere", reason: "not-on-server", message: REPORT_NOT_ON_SERVER };
  }

  /** Kept here, and told honestly which kind of "here" that is. */
  const keep = (why: QueuedReason, message: string): ReportOutcome => {
    // The existing on-device ledger, written by the function that owns it.
    queueReport(id, reason);
    const stored = writeOutbox([...readOutbox(), { kind, id, reason, detail: detailOrNull, at: new Date().toISOString() }]);
    if (!stored) {
      return { where: "nowhere", reason: "not-stored", message: REPORT_NOT_STORED };
    }
    return { where: "device", reason: why, message };
  };

  const session = await gate();
  if (!session.ok) {
    // Each of the three says something different about what would make it
    // sendable, and only one of them is "get signal". A build with no client
    // deliberately promises nothing about a retry: in a DEMO or offline build
    // there is no client to retry WITH, and "try again when you have signal"
    // would be a promise the build cannot keep however good the signal gets.
    const message =
      session.failure === "no-backend"
        ? `${SAFETY_NO_BACKEND} This report is kept on this phone and has reached nobody; only a build connected to ICEFALL's server can send it.`
        : session.failure === "signed-out"
          ? "A report carries who made it, so it needs your account. This one is kept on this phone and has reached nobody — sign in and report it again to send it."
          : `${SAFETY_UNREACHABLE} ${REPORT_KEPT_ON_DEVICE}`;
    return keep(session.failure === "unreachable" ? "unreachable" : session.failure, message);
  }

  // Checked before the call so an attempt with no network says "no signal"
  // rather than whatever a dropped fetch happens to look like. `navigator.onLine`
  // is honest about exactly this one thing: there is no network interface at all.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return keep("offline", REPORT_KEPT_ON_DEVICE);
  }

  const sent = await sendReport(session.client, session.uid, {
    kind,
    id,
    reason,
    detail: detailOrNull,
  });

  if (!sent.ok) {
    const message =
      sent.failure === "not-provisioned"
        ? `${SAFETY_NOT_PROVISIONED} It is kept on your phone, and reporting it again once ICEFALL's moderation queue can take it will send it.`
        : `${failureSentence(sent.failure)} ${REPORT_KEPT_ON_DEVICE}`;
    return keep(queuedReason(sent.failure), message);
  }

  // The server just proved it takes reports, which is the only moment this
  // module has evidence that a drain is worth attempting. Fire and forget: the
  // report the person is waiting on has already succeeded and must not be held
  // up by older ones.
  void flushReports();

  return { where: "moderation", id: sent.id, message: REPORT_REACHED_MODERATION };
}

/**
 * Try to send everything waiting on this phone.
 *
 * NOTHING CALLS THIS ON A TIMER, ON RECONNECT, OR AT STARTUP, and no sentence in
 * this file promises that it does. It runs after a report that succeeded — the
 * one moment the server has demonstrated it will take one — and it is exported
 * so a settings screen can offer "try again" as something the person chooses.
 * A queue that claimed to drain itself and did not would be worse than no queue.
 *
 * IT STOPS EARLY ON A FAILURE THAT IS NOT ABOUT ONE REPORT. No signal, no
 * session, or a queue that cannot take this kind of report yet applies to every
 * entry equally, so hammering the rest buys nothing on a phone that may be on a
 * battery in a hut.
 */
export async function flushReports(): Promise<{ sent: number; pending: number }> {
  const queued = readOutbox();
  if (queued.length === 0) return { sent: 0, pending: 0 };

  const session = await gate();
  if (!session.ok) return { sent: 0, pending: queued.length };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { sent: 0, pending: queued.length };
  }

  const remaining: PendingReport[] = [];
  let sent = 0;
  let stop = false;

  for (const entry of queued) {
    if (stop) {
      remaining.push(entry);
      continue;
    }
    const result = await sendReport(session.client, session.uid, {
      kind: entry.kind,
      id: entry.id,
      reason: entry.reason,
      detail: entry.detail,
    });
    if (result.ok) {
      sent += 1;
      continue;
    }
    remaining.push(entry);
    // "refused" is left to retry rather than discarded: a lapsed session is a
    // refusal, and throwing somebody's report away because their token expired
    // is not a thing this app gets to do. Nothing here ever drops an entry.
    if (result.failure !== "unknown") stop = true;
  }

  /*
   * NOTHING IS EVER DROPPED, and the one bad case is chosen deliberately. If
   * this write fails — a full or unavailable storage — the delivered entries
   * stay queued and a later flush files them a second time. Two identical
   * reports about the same post is a nuisance for the desk; a report thrown
   * away because a phone's storage was full is a person who believes they
   * reported somebody and did not.
   */
  if (sent > 0) writeOutbox(remaining);
  return { sent, pending: remaining.length };
}
