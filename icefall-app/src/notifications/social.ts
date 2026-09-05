import { useCallback, useEffect, useMemo, useState } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { withTimeout } from "@/lib/netTimeout";
import type { MarkKind } from "@/components/ui/VerificationMark";

/**
 * SOCIAL NOTICES — who followed you, who liked your post, who commented.
 *
 * The owner, 2026-09-02: "notification tab is where you see who followed you,
 * who liked your post or commented".
 *
 * ── THIS IS THE HALF THAT COMES FROM A SERVER ────────────────────────────────
 *
 * `./feed.ts` computes its items from state already on this phone. Everything
 * here is the opposite: three tables, read live, each row written by somebody
 * else doing something to something of yours. Nothing below is derived,
 * inferred, or filled in.
 *
 * WHAT IS STILL TRUE OF BOTH HALVES: NOTHING IS PUSHED. There is a server now —
 * all 54 migrations are live — but there is no push certificate and no push
 * path, so these rows are FOUND WHEN YOU OPEN THE SCREEN and this screen will
 * not wake your phone. `NOTIFICATIONS_NOT_PUSHED` in `./feed.ts` is the one
 * sentence that says so, and it is deliberately not repeated here: two
 * constants would be two promises about the same thing.
 *
 * ── THE THREE READS, AND WHY THEY ARE ALLOWED ────────────────────────────────
 *
 * Checked against the live policies, not assumed:
 *
 *   `follows_select`        (20260831190000) — `follower_id = auth.uid() OR
 *                           followed_profile_id = auth.uid()`. The second arm
 *                           is this feature: you may see who followed YOU.
 *   `post_likes_select`     (20260902100000) — readable wherever the post is
 *                           readable.
 *   `post_comments_select`  (20260831190000) — the same rule.
 *
 * And `posts_select` opens with `author_id = auth.uid()`, so YOUR OWN POSTS ARE
 * ALWAYS VISIBLE TO YOU — including expired stories. That is what makes the two
 * post-shaped reads safe: the row you are being told about is always one you
 * can see, so a like never arrives attached to a post this module cannot name.
 *
 * ── AN EMPTY LIST HERE GENUINELY MEANS NOTHING HAPPENED ──────────────────────
 *
 * RLS FILTERS, IT DOES NOT ERROR — so on most surfaces in this app an empty
 * array is ambiguous between "nothing is there" and "you may not see it", and
 * several modules say so rather than claim the first. NOT HERE. Every row these
 * three queries can match is a row about the reader themselves, which the
 * policies above admit unconditionally. There is no hidden remainder.
 *
 * So: DO NOT ADD A "MAY BE MORE THAN THIS" BRANCH TO THE EMPTY CASE. `state:
 * "ready"` with no notices is a measured, honest zero — nobody has followed
 * you, liked a post or commented — and softening it into a maybe would be an
 * invented doubt, which is the same failure as an invented number.
 *
 * ── NEVER YOUR OWN ACTION ────────────────────────────────────────────────────
 *
 * Liking your own post, or commenting under it, must not notify you. That is
 * filtered IN THE QUERY (`.neq`) on all three reads rather than in the render:
 * a filter in a component is one refactor away from being dropped, and it also
 * wastes the page budget on rows that will be thrown away — twenty of your own
 * comments would push twenty real notices off the end of the window.
 */

/**
 * The typed client has never seen `follows`, `post_likes` or `post_comments` —
 * `backend/types.ts` predates all three migrations and belongs to another
 * session. Same untyped view, for the same reason, as `social/highlights.ts`,
 * `channels/store.ts` and `network/interest.ts`; every shape below was checked
 * by hand against `20260831190000` and `20260902100000`.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

export type SocialNoticeKind = "follow" | "like" | "comment";

/**
 * The person who did it — A REAL ACCOUNT, resolved from `profiles`.
 *
 * There is no display fallback in this module and there must never be one. An
 * actor whose profile row did not come back is DROPPED (see `build`), because
 * the alternative is a notification under a name nobody holds.
 *
 * `isOwner` and `identityVerified` are `boolean | null` and the null matters:
 * it means NOT MEASURED — the field was not asked for, or came back as
 * something other than a boolean — and a mark is drawn from `true` and from
 * nothing else. See `noticeMark`.
 */
export interface NoticeActor {
  /** `profiles.id`. */
  id: string;
  /** `profiles.display_name`. Required — a nameless actor is not rendered. */
  name: string;
  /** `profiles.username`, absent where the account has not claimed one. */
  handle?: string;
  /**
   * `profiles.avatar_url`. ABSENT IS THE ORDINARY CASE and the caller draws
   * initials through `Avatar` — never a stock face, never a generated portrait.
   */
  avatarUrl?: string;
  /** `app_owner`, the server-computed WHITE mark. Never a client condition. */
  isOwner: boolean | null;
  /** `identity_verified`, the server-computed GREY mark. */
  identityVerified: boolean | null;
}

/** The post a like or a comment was about. Always one of the reader's own. */
export interface NoticePost {
  /** `posts.id`. */
  id: string;
  /**
   * WHAT STANDS WHERE A TITLE WOULD, AND IT IS NOT A TITLE. `posts` has no
   * title column — a post is a body — so this is the post's own opening line,
   * trimmed to `TITLE_MAX`. Nothing here summarises, paraphrases or generates:
   * it is the author's words, cut, or it is absent.
   *
   * It is called `title` because that is the slot it fills in a notice row
   * ("liked <title>"), and `Notifications.tsx` already reads that name.
   *
   * Optional only because a body that somehow arrives unreadable must not cost
   * the reader a real notification: the like happened either way, and "liked
   * your post" without it is still entirely true.
   */
  title?: string;
}

export interface SocialNotice {
  /** Stable and kind-prefixed, so two tables cannot collide on one uuid. */
  id: string;
  kind: SocialNoticeKind;
  actor: NoticeActor;
  /** ISO, from the row's own `created_at`. Never `now()`, never estimated. */
  at: string;
  /** Set for "like" and "comment". Absent for "follow". */
  post?: NoticePost;
  /** The comment's own words. Set for "comment" only. */
  body?: string;
}

/**
 * WHICH MARK GOES BESIDE A NAME — the whole rule, in one place.
 *
 * `app_owner` wins, then `identity_verified`, then nothing. Both are computed
 * fields served by the database (`20260902250000`, `20260831160000`) and
 * neither is reachable from the client, which is the point: a white mark is a
 * claim about authority over everybody else, and the day it can be decided in a
 * component is the day impersonating the founder is a one-line edit.
 *
 * GOLD and BLUE are deliberately not returned here. Gold is guiding credentials
 * (`guide_profiles`) and blue is a subscription; neither is in these queries, so
 * this module cannot and must not guess at them.
 */
export function noticeMark(actor: NoticeActor): MarkKind | null {
  if (actor.isOwner === true) return "owner";
  if (actor.identityVerified === true) return "identity";
  return null;
}

/**
 * The three separate facts a caller has to keep apart, plus the two ordinary
 * ones. Each is a DIFFERENT sentence and only one of them is "nothing
 * happened".
 *
 *   loading      the request is out.
 *   ready        the server answered. An empty list means nothing happened —
 *                see the header; there is no hidden remainder here.
 *   no-backend   this build never constructed a client (DEMO / offline). It did
 *                not fail; it did not ask.
 *   signed-out   no session. `AppShell` gates on one so this should be
 *                unreachable — it exists so that a signed-out reader is never
 *                handed an empty list that reads as "nobody follows you".
 *   not-live     a table or a grant is missing on the server.
 *   unreachable  asked, nothing came back.
 *   refused      the server answered, and said no.
 *
 * `not-live` and `refused` are separate on purpose. `highlights.ts` records
 * what folding them together cost: a malformed query came back as a refusal,
 * fell through to the deployment sentence, and every profile then claimed a
 * feature was not deployed while it was live and working.
 */
export type SocialNoticeState =
  | "loading"
  | "ready"
  | "no-backend"
  | "signed-out"
  | "not-live"
  | "unreachable"
  | "refused";

/** The states that mean ICEFALL asked and did not get an answer it could use. */
type Failure = "not-live" | "unreachable" | "refused";

export interface SocialNotices {
  /** Newest first, merged from the three sources. */
  notices: SocialNotice[];
  state: SocialNoticeState;
  /** Set for every state except `loading` and `ready`. */
  message?: string;
  reload(): void;
  /**
   * Widen the window by one page and read again. See `PAGE` for the cap.
   * A no-op once `canLoadMore` is false.
   */
  loadMore(): void;
  /**
   * Whether there MAY be older notices behind the window — true when a source
   * filled its page, which means rows were left on the server. It is not a
   * count and it is not a promise that the next page has anything in it.
   */
  canLoadMore: boolean;
  /**
   * Whether asking again could produce a different answer.
   *
   * TRUE only for the three `Failure` states — ICEFALL asked and did not get an
   * answer it could use. FALSE for `no-backend` and `signed-out`, where nothing
   * was asked in the first place: a demo build has no client to ask with, and
   * offering "Try again" directly beneath the sentence "nothing was asked for"
   * invites the reader to retry a request that was never made and cannot be.
   *
   * THE BUTTON ITSELF IS REAL and must not be deleted: on a build with a server
   * it re-runs the three queries. What was wrong is where it appeared, not what
   * it does. See `RETRYABLE`.
   *
   * It lives here rather than as a condition on the screen because the screen
   * would then be restating a rule this module already owns, and the two would
   * drift the first time a state is added.
   */
  canRetry: boolean;
  /**
   * How many of the notices on screen arrived after this device last marked
   * them seen, or `null` for NOT MEASURED. See `readSeen` — the timestamp is
   * genuinely stored, and `null` is returned rather than a guessed zero
   * whenever it is not.
   */
  unseen: number | null;
  /**
   * Record that these notices were actually on screen. The caller decides when,
   * and the contract is the same one `channels/store.ts` puts on
   * `recordChannelView`: on the list genuinely being looked at, not on a
   * component mounting somewhere off-screen.
   */
  markSeen(): void;
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

/** No client in this build. Not a failure — nothing was asked for. */
export const NOTICES_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so it cannot see who followed you, who liked a post or who commented. Nothing is missing from this screen — nothing was asked for.";

/**
 * Should be unreachable: `AppShell` requires a session. It exists so that the
 * day something slips past that gate, the reader is told ICEFALL cannot look
 * rather than shown a blank screen that says nobody is there.
 */
export const NOTICES_SIGNED_OUT =
  "These come from your account, so ICEFALL has to be signed in to read them. This is not an empty list — it is a list nobody asked for.";

/** A missing table or a missing grant. Never softened into "nothing yet". */
export const NOTICES_NOT_LIVE =
  "Follows, likes and comments are not live on ICEFALL's server yet. Nothing is shown here rather than a guess — nobody has been hidden from you and no number has been invented.";

/** Asked, and nothing came back. Emphatically not an empty list. */
export const NOTICES_UNREACHABLE =
  "ICEFALL could not reach the server, so it does not know who followed you or what happened to your posts. This is a failed request rather than an answer — there may well be something here.";

/**
 * The server answered and said no. MUST NOT REACH FOR `NOTICES_NOT_LIVE`: a
 * refusal says nothing whatever about what is deployed, and a sentence naming a
 * cause the app has not established is the same lie as an invented number.
 */
export const NOTICES_REFUSED =
  "ICEFALL's server refused that read, so it cannot say who followed you or what happened to your posts. This is a refusal rather than an answer — the list may not be empty.";

const MESSAGES: Record<Exclude<SocialNoticeState, "loading" | "ready">, string> = {
  "no-backend": NOTICES_NO_BACKEND,
  "signed-out": NOTICES_SIGNED_OUT,
  "not-live": NOTICES_NOT_LIVE,
  unreachable: NOTICES_UNREACHABLE,
  refused: NOTICES_REFUSED,
};

/* -------------------------------------------------------------------------- */
/* The cap                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * IT IS LIMITED AND PAGED, and this is which.
 *
 * Each of the three queries takes the newest `PAGE * pages` rows and no more,
 * server-side, ordered by `created_at desc`. The three results are merged, re-
 * sorted, and cut back to the same number — which is exactly the newest N of
 * the union, because anything dropped is older than N rows already held. A
 * profile with ten thousand likes therefore reads thirty rows to render thirty.
 *
 * `loadMore` widens the window by one page and re-reads. That is a re-fetch
 * rather than a keyset cursor, deliberately: three streams merged by time need
 * three cursors kept in step, and a notifications list that goes four pages
 * deep is already an unusual session. `MAX_PAGES` is the hard ceiling, so the
 * worst case any one read can cost is 120 rows per source.
 */
const PAGE = 30;
const MAX_PAGES = 4;

/**
 * A `.in()` list rides in the URL, so the actor lookup is chunked rather than
 * sent as one 360-uuid query string that PostgREST would refuse on length.
 */
const ACTOR_CHUNK = 100;

/**
 * A phone on a mountain gets connections that are accepted and then never
 * answered — see `lib/netTimeout.ts`. Without this the screen spins for as long
 * as the OS allows; with it, it says "unreachable", which the reader can act on.
 */
const NOTICES_TIMEOUT_MS = 8_000;

/** How much of a post's opening line stands in for it in a notice row. */
const TITLE_MAX = 90;

/* -------------------------------------------------------------------------- */
/* Reading a refusal                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which honest absence a PostgREST error is.
 *
 * `PGRST205` is "no such table in the schema cache" and `42P01` the same thing
 * from Postgres. Those two, and only those two, license the sentence that names
 * the DEPLOYMENT as the cause. A transport failure carries no code and says
 * `fetch`; an expired deadline says `abort`. Everything else is a refusal.
 *
 * `42501` IS DELIBERATELY NOT "NOT LIVE", and it is the one place this file
 * departs from `highlights.ts`. Measured against the live project on 2 Sep: an
 * unauthenticated request to `follows`, `post_likes`, `post_comments` and
 * `profiles` returns `42501 permission denied` on all four — because every
 * grant in these migrations is `to authenticated`, and a request whose JWT did
 * not resolve is served as `anon`. So `42501` is exactly what a ROLE problem
 * looks like against a correctly deployed server, and mapping it to "not live"
 * would print a confident, checkable, false claim about the deployment on the
 * strength of an error that says nothing about it. That is the precise bug
 * `highlights.ts` records at `HIGHLIGHTS_READ_REFUSED`, and a permission denial
 * is in any case literally a refusal. It falls through to `refused` below.
 *
 * Repeated rather than imported from `highlights.ts` or `interest.ts` for the
 * reason both of those give about each other: they own their copies, and
 * reaching into a private helper in a file this module does not own is how two
 * sessions end up editing one line.
 */
function classify(error: PostgrestError | null): Failure {
  if (!error) return "unreachable";
  const code = error.code ?? "";
  if (code === "PGRST205" || code === "42P01") return "not-live";
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("fetch") || message.includes("abort") || message.includes("network")) {
    return "unreachable";
  }
  return "refused";
}

/**
 * Is this "the server does not have that field", rather than "the server would
 * not answer"? Only this steps the actor ladder down — a timeout or a refusal
 * says nothing about what columns exist, and the next read deserves the full
 * attempt. The same test, and the same code list, as `publicProfile.ts`.
 */
function isMissingField(error: PostgrestError): boolean {
  const code = error.code ?? "";
  if (
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST202" ||
    code === "42883" ||
    code === "42P01" ||
    code === "PGRST205"
  ) {
    return true;
  }
  const message = (error.message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("schema cache");
}

/**
 * When more than one of the three reads fails, which sentence the reader gets.
 *
 * Unreachable first because it explains all three at once; a deployment claim
 * last but one, and a bare refusal last, so the most specific true statement
 * wins over the most alarming one.
 */
const FAILURE_ORDER: Failure[] = ["unreachable", "not-live", "refused"];

/**
 * Which states a "Try again" is honest under — and it is a `Record<Failure, …>`
 * rather than three strings in a condition, so a state added to `Failure` is a
 * compile error here rather than a retry button that silently appears or
 * silently does not.
 *
 * Only the failures. `no-backend` and `signed-out` mean nothing was asked in
 * the first place, and a control offering to ask again sits directly under a
 * sentence saying nothing was asked for.
 */
const RETRYABLE: Record<Failure, true> = {
  "not-live": true,
  unreachable: true,
  refused: true,
};

/* -------------------------------------------------------------------------- */
/* Row reading                                                                 */
/* -------------------------------------------------------------------------- */

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/** A time that cannot be parsed is not a time; it sorts nowhere and renders wrong. */
const when = (value: unknown): string | null => {
  const raw = str(value);
  return raw && Number.isFinite(Date.parse(raw)) ? raw : null;
};

/**
 * PostgREST serves a to-one embed as an object; some versions and some
 * relationship shapes hand back a one-element array. Both are read — the same
 * note `Comments.tsx` and `highlights.ts` carry.
 */
function one(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

/** The author's own opening line. Never a title this module made up. */
function openingLine(value: unknown): string | undefined {
  const body = str(value);
  if (!body) return undefined;
  const line = body
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  if (!line) return undefined;
  return line.length <= TITLE_MAX ? line : `${line.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

/* -------------------------------------------------------------------------- */
/* Actors                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The actor select, as a ladder — the shape `publicProfile.ts` arrived at.
 *
 *   [0] everything, including `app_owner` (20260902250000).
 *   [1] without it, keeping `identity_verified` (20260831160000, live and read
 *       exactly this way by `Comments.tsx` and `highlights.ts`), so a server
 *       missing the newer computed field loses the WHITE mark rather than the
 *       GREY one AS WELL.
 *   [2] names and faces alone. A notification with no mark is still true.
 *
 * The rungs exist because ONE MISSING COLUMN MUST NOT COST THE WHOLE SCREEN. A
 * `42703` on `app_owner` would otherwise take every follow, like and comment
 * down with it, and the reader would be told the feature was not deployed.
 */
const ACTOR_SELECTS = [
  "id, display_name, username, avatar_url, app_owner, identity_verified",
  "id, display_name, username, avatar_url, identity_verified",
  "id, display_name, username, avatar_url",
] as const;

/**
 * Which rung this session has settled on. It can only change how many requests
 * are made — never what any of them returns, and never what is drawn. It moves
 * in one direction and only on a missing-FIELD error; the worst case if it is
 * ever wrong is a mark that stays absent for one session, which is honest.
 */
let actorRung = 0;

type ActorResult =
  | { ok: true; actors: Map<string, NoticeActor> }
  | { ok: false; failure: Failure };

function toActor(row: Record<string, unknown>): NoticeActor | null {
  const id = str(row.id);
  const name = str(row.display_name)?.trim();
  // No id or no name means nobody this notice could be attributed to. Dropped,
  // never coerced into "Someone" — an invented actor is an invented event.
  if (!id || !name) return null;

  return {
    id,
    name,
    handle: str(row.username) ?? undefined,
    avatarUrl: str(row.avatar_url) ?? undefined,
    // Strictly `boolean`. A field that came back as a string or a number was
    // NOT MEASURED rather than coerced into a claim about somebody's authority.
    isOwner: typeof row.app_owner === "boolean" ? row.app_owner : null,
    identityVerified:
      typeof row.identity_verified === "boolean" ? row.identity_verified : null,
  };
}

/**
 * Every actor in one lookup, rather than an embed on each of the three queries.
 *
 * Two reasons, and the first is the one that matters: `follows` reaches
 * `profiles` TWICE (`follower_id` and `followed_profile_id`), so an embed there
 * needs a foreign-key hint spelled exactly right or PostgREST refuses the whole
 * select — the `PGRST201` trap `highlights.ts` documents at length. A separate
 * read on `profiles` has nothing to disambiguate and cannot acquire the problem
 * later. The second: somebody who followed you AND liked a post resolves once.
 *
 * `profiles_select` is `using (true)` for any signed-in reader, so this asks for
 * nothing the reader could not already open by tapping the name.
 */
async function readActors(
  db: SupabaseClient,
  ids: string[],
  deadline: AbortSignal | undefined,
): Promise<ActorResult> {
  const actors = new Map<string, NoticeActor>();
  if (ids.length === 0) return { ok: true, actors };

  for (let start = 0; start < ids.length; start += ACTOR_CHUNK) {
    const chunk = ids.slice(start, start + ACTOR_CHUNK);

    // The ladder, walked at most once per chunk: a rung that fails on a missing
    // field steps down and retries; anything else is a real failure.
    for (let rung = actorRung; rung < ACTOR_SELECTS.length; rung++) {
      const select = ACTOR_SELECTS[rung] ?? ACTOR_SELECTS[ACTOR_SELECTS.length - 1]!;
      const query = db.from("profiles").select(select).in("id", chunk);

      let data: unknown = null;
      let error: PostgrestError | null = null;
      try {
        const result = await (deadline ? query.abortSignal(deadline) : query);
        data = result.data;
        error = result.error;
      } catch {
        // A thrown fetch — an aborted deadline, or no network at all.
        return { ok: false, failure: "unreachable" };
      }

      if (error) {
        if (isMissingField(error) && rung + 1 < ACTOR_SELECTS.length) {
          actorRung = rung + 1;
          continue;
        }
        return { ok: false, failure: classify(error) };
      }

      const rows = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
      for (const row of rows) {
        const actor = toActor(row);
        if (actor) actors.set(actor.id, actor);
      }
      break;
    }
  }

  return { ok: true, actors };
}

/* -------------------------------------------------------------------------- */
/* The three reads                                                             */
/* -------------------------------------------------------------------------- */

interface Rows {
  rows: Record<string, unknown>[];
  failure: Failure | null;
}

/**
 * One query, with its failure turned into a fact rather than an exception.
 *
 * The untyped client hands back `any`, so nothing below trusts a field: every
 * value is re-checked in `build`, which is the price of not asserting a schema
 * the type generator has not seen.
 */
async function run(
  query: PromiseLike<{ data: unknown; error: PostgrestError | null }>,
): Promise<Rows> {
  try {
    const { data, error } = await query;
    if (error) return { rows: [], failure: classify(error) };
    return {
      rows: Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [],
      failure: null,
    };
  } catch {
    return { rows: [], failure: "unreachable" };
  }
}

type ReadResult =
  | { kind: "ready"; notices: SocialNotice[]; more: boolean; uid: string }
  | { kind: Exclude<SocialNoticeState, "loading" | "ready">; uid: string | null };

async function read(limit: number, signal: AbortSignal): Promise<ReadResult> {
  if (!supabase || !untyped) return { kind: "no-backend", uid: null };

  const { data: auth } = await supabase.auth.getSession();
  const me = auth.session?.user.id ?? null;
  // `AppShell` gates on a session, so this is a guard rather than a state to
  // design for. It is here so that nothing can report an empty list for it.
  if (!me) return { kind: "signed-out", uid: null };

  const db = untyped;
  const deadline = withTimeout(NOTICES_TIMEOUT_MS, signal);
  const bound = <T extends { abortSignal(s: AbortSignal): T }>(query: T): T =>
    deadline ? query.abortSignal(deadline) : query;

  /*
   * 1. WHO FOLLOWED YOU. The `followed_profile_id` arm of `follows_select`.
   *
   * `.neq("follower_id", me)` is redundant against the `follows_not_self` check
   * constraint, which makes a self-follow impossible at the table. It is
   * written anyway so that all three reads carry the same rule in the same
   * place — the day somebody relaxes that constraint, this query does not
   * quietly start telling people they followed themselves.
   *
   * Company follows cannot appear: `followed_profile_id = me` is the profile
   * arm, and `follows_one_target` allows exactly one of the two.
   */
  const follows = bound(
    db
      .from("follows")
      .select("id, follower_id, created_at")
      .eq("followed_profile_id", me)
      .neq("follower_id", me)
      .order("created_at", { ascending: false })
      .limit(limit),
  );

  /*
   * 2. WHO LIKED YOUR POST, and 3. WHO COMMENTED.
   *
   * `posts!inner(...)` with `.eq("post.author_id", me)` does the ownership test
   * SERVER-SIDE, which is the whole reason the cap works: the alternative is
   * reading your own post ids first and sending them back as an `.in()`, which
   * for a prolific author is a query string measured in kilobytes.
   *
   * The embed is unambiguous — `post_likes` and `post_comments` each reach
   * `posts` exactly once — so no foreign-key hint is needed and none is
   * invented. The post's own author is NOT embedded, deliberately: `posts`
   * reaches `profiles` twice (directly, and as a junction through `post_likes`)
   * and a bare embed there is the `PGRST201` refusal. It is also not wanted —
   * the author is the reader.
   *
   * `body` is fetched only to excerpt it. Nothing here counts likes: the count
   * on a post is `like_count`, a server-side aggregate, and a length taken from
   * a capped page would be a smaller number wearing the same clothes.
   */
  const likes = bound(
    db
      .from("post_likes")
      .select("post_id, profile_id, created_at, post:posts!inner(id, body, author_id)")
      .eq("post.author_id", me)
      .neq("profile_id", me)
      .order("created_at", { ascending: false })
      .limit(limit),
  );

  const comments = bound(
    db
      .from("post_comments")
      .select("id, post_id, author_id, body, created_at, post:posts!inner(id, body, author_id)")
      .eq("post.author_id", me)
      .neq("author_id", me)
      .order("created_at", { ascending: false })
      .limit(limit),
  );

  const [followRows, likeRows, commentRows] = await Promise.all([
    run(follows),
    run(likes),
    run(comments),
  ]);

  /*
   * ANY FAILURE FAILS THE WHOLE READ, and that is the honest choice rather than
   * the convenient one. Three streams merge into one list with nowhere on a row
   * to say which source is missing, so a list drawn without its follows looks
   * exactly like a complete list with no follows in it. Losing the screen for a
   * moment is recoverable; "nobody followed you" when three people did is not.
   */
  const failures = [followRows, likeRows, commentRows]
    .map((r) => r.failure)
    .filter((f): f is Failure => f !== null);
  if (failures.length > 0) {
    const kind = FAILURE_ORDER.find((f) => failures.includes(f)) ?? "refused";
    return { kind, uid: me };
  }

  const actorIds = new Set<string>();
  for (const row of followRows.rows) {
    const id = str(row.follower_id);
    if (id) actorIds.add(id);
  }
  for (const row of likeRows.rows) {
    const id = str(row.profile_id);
    if (id) actorIds.add(id);
  }
  for (const row of commentRows.rows) {
    const id = str(row.author_id);
    if (id) actorIds.add(id);
  }

  const resolved = await readActors(db, [...actorIds], deadline);
  // A notice needs a name, so an actor lookup that failed fails the read for the
  // same reason a missing source does — the alternative is a shorter list that
  // claims to be the whole one.
  if (!resolved.ok) return { kind: resolved.failure, uid: me };

  const notices = build(followRows.rows, likeRows.rows, commentRows.rows, resolved.actors);

  return {
    kind: "ready",
    // Newest N of the union: anything cut here is older than N rows already
    // held, so the slice cannot hide a recent notice.
    notices: notices.slice(0, limit),
    // A source that filled its page left rows on the server. Not a count.
    more:
      followRows.rows.length >= limit ||
      likeRows.rows.length >= limit ||
      commentRows.rows.length >= limit,
    uid: me,
  };
}

/**
 * Rows to notices, newest first.
 *
 * EVERY DROP BELOW IS DELIBERATE. A row without a parseable time, without an
 * id, or whose actor did not resolve is left out rather than rendered with
 * something filled in — the rule `highlights.ts` states as "a coerced value is
 * an invented one". None of these branches should fire against the live schema;
 * they are guards, not cases.
 */
function build(
  followRows: Record<string, unknown>[],
  likeRows: Record<string, unknown>[],
  commentRows: Record<string, unknown>[],
  actors: Map<string, NoticeActor>,
): SocialNotice[] {
  const out: SocialNotice[] = [];

  for (const row of followRows) {
    const id = str(row.id);
    const at = when(row.created_at);
    const actor = actors.get(str(row.follower_id) ?? "");
    if (!id || !at || !actor) continue;
    out.push({ id: `follow:${id}`, kind: "follow", actor, at });
  }

  for (const row of likeRows) {
    const at = when(row.created_at);
    const actor = actors.get(str(row.profile_id) ?? "");
    const post = one(row.post);
    const postId = str(post?.id) ?? str(row.post_id);
    if (!at || !actor || !postId) continue;
    // `post_likes` has no id of its own — the primary key IS the pair, so this
    // is the row's real identity rather than a synthesised one.
    out.push({
      id: `like:${postId}:${actor.id}`,
      kind: "like",
      actor,
      at,
      post: { id: postId, title: openingLine(post?.body) },
    });
  }

  for (const row of commentRows) {
    const id = str(row.id);
    const at = when(row.created_at);
    const actor = actors.get(str(row.author_id) ?? "");
    const post = one(row.post);
    const postId = str(post?.id) ?? str(row.post_id);
    const body = str(row.body);
    if (!id || !at || !actor || !postId || !body) continue;
    out.push({
      id: `comment:${id}`,
      kind: "comment",
      actor,
      at,
      post: { id: postId, title: openingLine(post?.body) },
      // The comment whole, not excerpted: a reply is the thing the reader is
      // being notified about, and half of it is a different message.
      body,
    });
  }

  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/* -------------------------------------------------------------------------- */
/* Last seen — the only thing an unread count is allowed to come from          */
/* -------------------------------------------------------------------------- */

/**
 * NOTHING ON THE SERVER RECORDS WHEN YOU LAST LOOKED AT THIS SCREEN. There is
 * no `notifications_seen` table in any of the 54 migrations, and this module
 * does not add one — it owns no schema.
 *
 * So the mark is stored HERE, on this device, and the count derived from it is
 * true of exactly what it says: how many of these arrived since this phone last
 * had the list on screen. Open ICEFALL on a second device and that device has
 * its own mark, or none. THAT IS THE WHOLE CLAIM. It must not be labelled "3
 * new" in a way that implies a server knows anything about it, and it must
 * never be shown as a global badge that two devices would disagree about
 * without saying why.
 *
 * NOTHING STORED IS `null`, NOT ZERO. A first open, a private window, a browser
 * with site data blocked — the app does not know when you last looked, and an
 * em dash is reserved for exactly that. A measured zero (`0`) means the mark is
 * stored and nothing has happened since.
 *
 * Keyed per account, because two people sharing a phone must not inherit each
 * other's mark.
 */
const SEEN_PREFIX = "icefall.social-notices.seen.v1:";

let seenRevision = 0;
const seenListeners = new Set<() => void>();

function seenChanged(): void {
  seenRevision += 1;
  seenListeners.forEach((listener) => listener());
}

function readSeen(uid: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${SEEN_PREFIX}${uid}`);
    // A stored value that is not a time is not a mark. Treated as absent.
    return raw && Number.isFinite(Date.parse(raw)) ? raw : null;
  } catch {
    return null;
  }
}

function writeSeen(uid: string, iso: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`${SEEN_PREFIX}${uid}`, iso);
  } catch {
    // Storage refused (private mode, quota). The count then reports NOT
    // MEASURED for ever, which is honest; it does not fall back to zero.
    return;
  }
  seenChanged();
}

function useSeenRevision(): number {
  const [value, setValue] = useState(seenRevision);
  useEffect(() => {
    const listener = () => setValue(seenRevision);
    seenListeners.add(listener);
    // A write between the render and this effect would otherwise be missed.
    listener();
    return () => {
      seenListeners.delete(listener);
    };
  }, []);
  return value;
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Who followed you, who liked your post, who commented — newest first.
 *
 * Re-read on mount, on `reload`, and on `loadMore`. NO POLLING AND NO REALTIME
 * SUBSCRIPTION, the same posture `highlights.ts` and `interest.ts` take: a
 * socket held open is a radio kept awake on a phone that may be on a mountain,
 * and nothing here is urgent — by construction, since none of it is pushed.
 */
export function useSocialNotices(): SocialNotices {
  const [pages, setPages] = useState(1);
  const [manual, setManual] = useState(0);
  const [state, setState] = useState<SocialNoticeState>("loading");
  const [notices, setNotices] = useState<SocialNotice[]>([]);
  const [more, setMore] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const seenNonce = useSeenRevision();

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setState("loading");

    void read(PAGE * pages, controller.signal).then((result) => {
      if (!alive) return;
      setUid(result.uid);

      if (result.kind === "ready") {
        setNotices(result.notices);
        setMore(result.more);
        setState("ready");
        return;
      }

      // A failure shows NOTHING, not the last good list: a stale list under a
      // failure sentence is a screen making two contradictory claims at once.
      setNotices([]);
      setMore(false);
      setState(result.kind);
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [pages, manual]);

  const unseen = useMemo<number | null>(() => {
    // Recomputed when the mark moves; the value itself is read from storage.
    void seenNonce;
    if (state !== "ready" || !uid) return null;
    const mark = readSeen(uid);
    if (mark === null) return null;

    const cut = Date.parse(mark);
    const count = notices.filter((n) => Date.parse(n.at) > cut).length;

    /*
     * THE WINDOW IS CAPPED, SO A FULL WINDOW IS NOT A TOTAL. If everything
     * fetched is newer than the mark and there are older rows behind it, the
     * real number is larger than this and unknown — an em dash rather than a
     * floor presented as a count. The ordinary case (some notices older than
     * the mark) proves the window reaches back past it, and the count is exact.
     */
    if (count === notices.length && more) return null;
    return count;
  }, [notices, uid, state, more, seenNonce]);

  const markSeen = useCallback(() => {
    if (!uid) return;
    // `notices` is sorted newest first, so this is the high-water mark of what
    // was actually on screen — not `now()`, which would silently swallow
    // anything that arrived between the read and the tap.
    const newest = notices[0]?.at;
    if (!newest) return;
    const mark = readSeen(uid);
    if (mark !== null && Date.parse(mark) >= Date.parse(newest)) return;
    writeSeen(uid, newest);
  }, [uid, notices]);

  const reload = useCallback(() => setManual((n) => n + 1), []);
  const loadMore = useCallback(() => setPages((n) => Math.min(n + 1, MAX_PAGES)), []);

  return {
    notices,
    state,
    message: state === "loading" || state === "ready" ? undefined : MESSAGES[state],
    reload,
    loadMore,
    canLoadMore: state === "ready" && more && pages < MAX_PAGES,
    canRetry: RETRYABLE[state as Failure] === true,
    unseen,
    markSeen,
  };
}
