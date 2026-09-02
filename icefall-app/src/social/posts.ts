import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { classifyBackendError } from "@/backend/pgErrors";
import { withTimeout } from "@/lib/netTimeout";
import { haversine } from "@/tracking/filters";
import type { RecordedActivity } from "@/tracking/types";
import { fetchPublicProfile } from "./publicProfile";
import { useSummitLogs, type SummitLog } from "./summitLog";
import type { Post, PostAuthorKind, PostMedia } from "./types";

/**
 * The athlete's own posts — the general half of the social layer.
 *
 * `summitLog.ts` holds the structured summit record; this holds everything
 * else a mountaineer shares: a photo from the hill, a line of text, a training
 * session, an objective. One store, one shape, every kind — the feed and the
 * profile both read it, and the day Supabase exists it becomes the publish
 * queue without changing shape.
 *
 * Attachments REFERENCE existing entities rather than copying them: an
 * activity attachment is the recording's id, a mountain attachment is a peak
 * id + name. Rule 42 of the social spec, and also just correct — a post must
 * not hold a second copy of a track that the recording already owns.
 */

export type OwnPostKind =
  | "photo"
  | "text"
  | "activity"
  | "objective"
  | "route";

export const OWN_POST_KIND_LABEL: Record<OwnPostKind, string> = {
  photo: "Post",
  text: "Post",
  activity: "Activity",
  objective: "Objective",
  route: "Route",
};

/** Who may see it — once there is anyone to see it. Stored now, honest now. */
export type PostPrivacy = "public" | "connections" | "group";

export const PRIVACY_LABEL: Record<PostPrivacy, string> = {
  public: "Public",
  connections: "Connections",
  group: "Group only",
};

export interface MountainRef {
  name: string;
  /** `osm:…` or a curated id — the key to the mountain's own page. */
  peakId?: string;
  elevationM?: number;
}

export interface OwnPost {
  id: string;
  kind: OwnPostKind;
  caption: string;
  /** Banner-sized JPEG data URLs. Capped — localStorage is a shared 5 MB. */
  photos: string[];
  mountain?: MountainRef;
  /** A recorded activity's id — metrics are read live from the recording. */
  activityId?: string;
  /** A saved trail's osmId. */
  routeOsmId?: number;
  /** An objective (goal) name + target date, copied small. */
  objective?: { name: string; when: string };
  privacy: PostPrivacy;
  createdAt: string;
}

const KEY = "icefall.posts.v1";
/** Photos are the storage hog; two per post keeps a long history affordable. */
export const MAX_POST_PHOTOS = 2;

function read(): OwnPost[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as OwnPost[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let current = read();
const listeners = new Set<(posts: OwnPost[]) => void>();

function write(next: OwnPost[]) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota — the post lives for the session */
  }
  listeners.forEach((l) => l(current));
}

export const ownPosts = (): OwnPost[] => current;

export function addPost(post: Omit<OwnPost, "id" | "createdAt">): OwnPost {
  const entry: OwnPost = {
    ...post,
    photos: post.photos.slice(0, MAX_POST_PHOTOS),
    id: `post:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  write([entry, ...current]);
  return entry;
}

export function removePost(id: string) {
  write(current.filter((p) => p.id !== id));
}

export const postsForMountain = (name: string, peakId?: string): OwnPost[] =>
  current.filter(
    (p) =>
      p.mountain &&
      ((peakId && p.mountain.peakId === peakId) ||
        p.mountain.name.toLowerCase() === name.toLowerCase()),
  );

export function useOwnPosts(): OwnPost[] {
  const [posts, setPosts] = useState(current);
  useEffect(() => {
    listeners.add(setPosts);
    setPosts(current);
    return () => {
      listeners.delete(setPosts);
    };
  }, []);
  return posts;
}

/* -------------------------------------------------------------------------- */
/* Summit verification                                                         */
/* -------------------------------------------------------------------------- */

/** How close a recorded track must pass to the summit to count as reaching it. */
const SUMMIT_TOLERANCE_M = 75;

/**
 * The one verification ICEFALL can honestly perform.
 *
 * `SUMMIT_VERIFIED_MEANING` has said it from the start: verified means an
 * activity recorded in ICEFALL carried a track that reached the summit — a
 * claim about the TRACK, never about the person. So the check is exactly that:
 * a real (non-simulated) recording whose GPS line passes within 75 metres of
 * the summit's coordinates. No recording, or a simulated one, or a track that
 * stops below the top: not verified, and the card simply carries no tick —
 * an unverified log is a normal log, not an accusation.
 */
export function trackReachedSummit(
  activity: RecordedActivity | undefined,
  summit: { lat: number; lon: number },
): boolean {
  if (!activity || activity.simulated) return false;
  return activity.points.some(
    (p) => haversine({ lat: p.lat, lon: p.lon }, summit) <= SUMMIT_TOLERANCE_M,
  );
}

/* -------------------------------------------------------------------------- */
/* Leaderboard-grade totals — VERIFIED ONLY                                    */
/* -------------------------------------------------------------------------- */

export interface VerifiedTotals {
  /** Metres of elevation gained across real (non-simulated) recordings. */
  verticalM: number;
  /** Real recordings counted. */
  activities: number;
}

/**
 * What the leaderboard may count for this athlete: recorded, non-simulated
 * effort and nothing else. Self-reported summits and logs stay on the profile
 * and the passport — they are records, not rankings — and no invented number
 * ever enters a table that compares people.
 */
export function verifiedTotals(recorded: RecordedActivity[]): VerifiedTotals {
  const real = recorded.filter((r) => !r.simulated);
  return {
    verticalM: Math.round(real.reduce((m, r) => m + r.elevationGainM, 0)),
    activities: real.length,
  };
}

/* ========================================================================== */
/* ONE POST, BY ID, FOR ANYBODY                                               */
/* ========================================================================== */

/**
 * Everything above this line is THIS DEVICE'S OWN STORE: posts the phone owner
 * wrote, held in `localStorage`, with ids this module mints (`post:…`, and
 * `log:…` in `summitLog.ts`). Everything below reads ONE ROW of `public.posts`
 * — somebody else's post, off a link.
 *
 * ── THE BUG THIS CLOSES ──────────────────────────────────────────────────────
 *
 * `/social/post/:id` resolved through `useOwnPosts()` alone, so it could only
 * ever open a post the phone owner had written HERE. Every other link into it
 * hit `<Navigate to="/explore/social" replace />` and the reader was dropped on
 * the feed with no explanation. Two of those links are already shipped and both
 * carry SERVER uuids:
 *
 *   · `screens/Notifications.tsx` — "somebody liked your post" opens
 *     `/social/post/<uuid>`; the rows come from `post_likes`/`post_comments`.
 *   · `components/social/PublishSummit.tsx` — the stranded-post link, which is
 *     the one place a climber is sent to look at a post ICEFALL could not
 *     finish writing.
 *
 * ── FIVE ANSWERS, AND THE TWO THAT MUST NEVER BE CONFUSED ────────────────────
 *
 *   loading      nothing decided yet.
 *   ready        the post, with its author on it.
 *   gone         no post can be behind this link. A REAL ANSWER, and only ever
 *                given where it is certain — see `postIdKind`.
 *   withheld     the server answered and did not hand the post over.
 *   unreachable  ICEFALL could not ask, or asked and got no usable answer.
 *   no-backend   this build has no client, so nothing was asked at all.
 *
 * `gone` AND `unreachable` ARE THE PAIR WITH TEETH. "This post does not exist"
 * and "ICEFALL could not find out" are different claims and only the first is
 * something the app can know; collapsing them tells a climber their partner's
 * conditions report was deleted every time the hut wifi goes quiet.
 *
 * ── WHY `withheld` DOES NOT SPLIT INTO "DELETED" AND "HIDDEN" ────────────────
 *
 * The owner's brief asks for those as two sentences. THE SERVER CANNOT TELL
 * THEM APART FOR US, and this is a property of row-level security rather than a
 * gap in this file. `posts_select` (as amended by 20260903010000) admits a row
 * that is yours, or staff's, or non-expiring, or unexpired, or in a highlight,
 * and only where its author is not blocked. A row failing any of those is
 * FILTERED, not refused: PostgREST returns 200 with zero rows — byte for byte
 * what a deleted row returns. Nothing on the client can see past that, and
 * nothing should try:
 *
 *   · `post_likes_select` and `post_comments_select` are both
 *     `exists (select 1 from posts p where p.id = post_id)`, and that subquery
 *     runs as the caller — so they are gated by the same policy and leak
 *     nothing.
 *   · `highlight_items` IS `using (true)`, and its `post_id` is a foreign key
 *     with `on delete cascade`, so a row there does prove a post exists. Using
 *     that to infer the existence of a row RLS has just hidden is an end-run
 *     around the policy, and it would answer for the narrow slice of posts that
 *     happen to be in a highlight and no others.
 *
 * So one honest sentence names both possibilities and says ICEFALL will not
 * guess. FOR WHOEVER OWNS THE MIGRATIONS: splitting this needs a `security
 * definer` function — `post_visibility(uuid)` returning 'gone' | 'expired' |
 * 'blocked' — and it needs an owner ruling first, because "this post exists and
 * you may not see it" is itself a disclosure about somebody who blocked you.
 * Do not add a heuristic here in the meantime.
 */

/**
 * A device id or a server id — and the whole reason a `gone` can ever be
 * honest.
 *
 * THE TWO SHAPES CANNOT OVERLAP. `addPost` mints `post:<base36>` and
 * `addSummitLog` mints `log:<base36>`; `posts.id` is a uuid column. A uuid
 * contains hyphens and is 36 characters, and neither prefix can produce one.
 *
 * A DEVICE ID IS ANSWERABLE WITHOUT ASKING ANYBODY, which is what makes it a
 * fact rather than a guess: posts written here have never left the phone, so
 * this phone's own store is the entire universe of places one could be. An
 * `unknown` shape is the same kind of certainty from the other end — the demo
 * feed's `p-summit-1`, a truncated paste, a link from another app — no post on
 * the server and no post on this device could hold it, so nothing is asked and
 * nothing is claimed about the network.
 */
export type PostIdKind = "device" | "server" | "unknown";

/** Canonical 8-4-4-4-12. `posts.id` is a uuid column, so nothing else matches. */
const POST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** What `addPost` and `addSummitLog` mint, and nothing else. */
const DEVICE_ID = /^(?:post|log):[a-z0-9]+$/i;

export function postIdKind(raw: string): PostIdKind {
  const id = raw.trim();
  if (POST_UUID.test(id)) return "server";
  if (DEVICE_ID.test(id)) return "device";
  return "unknown";
}

/* -------------------------------------------------------------------------- */
/* Copy — one place, so the module and the screen cannot promise different     */
/* things about the same empty page                                            */
/* -------------------------------------------------------------------------- */

/** No answer yet. Said out loud, because a blank page reads as an empty post. */
export const POST_LOADING =
  "ICEFALL is reading this post from its server. Nothing on this page has been decided yet — an empty space here means the answer has not arrived, not that there is nothing to show.";

/**
 * The link cannot belong to any post, in any build, connected or not. Decided
 * without a request, and the screen says so rather than implying a round trip.
 */
export const POST_LINK_MALFORMED =
  "That link does not point at a post ICEFALL can open: it is neither a post on ICEFALL's server nor one written on this phone. Nothing was asked of the server, because no post could hold an id of that shape.";

/**
 * A device post that is not in the device's store. THE ONE PLACE "IT IS GONE"
 * IS CERTAIN, and the sentence still declines to say which way it went: a
 * `post:…` link shared from somebody else's phone lands here too, and that is
 * not a deletion.
 */
export const POST_DEVICE_GONE =
  "Nothing on this phone holds that post. Posts and summit logs written in ICEFALL stay on the device that wrote them, so this one has either been deleted here or was never on this phone — there is no server copy to fall back on.";

/**
 * THE SENTENCE THIS MODULE EXISTS TO GET RIGHT. A real answer — the server was
 * asked and replied — that names every reason it could be and settles on none,
 * because row-level security hands back the same empty result for all of them.
 */
export const POST_WITHHELD =
  "ICEFALL's server answered and did not hand this post over. That happens when a post has been deleted, when a story has passed its 24 hours, or when a block sits between you and whoever wrote it — and the server answers all three the same way, so ICEFALL will not guess which one this is.";

/** The request did not come back. NEVER dressed up as an answer about the post. */
export const POST_UNREACHABLE =
  "ICEFALL could not reach its server, so this post has not been checked at all. That is different from finding nothing: the post may be perfectly fine and this phone simply could not ask.";

/**
 * A refusal, kept apart from every other empty page.
 *
 * `backend/pgErrors.ts` measured what 42501 actually means on this project and
 * it is NOT a deployment fact: every grant in the schema is `to authenticated`,
 * so a lapsed token is served as `anon` and refused by a perfectly healthy
 * server. Signing in again is the thing to try, and the sentence says so.
 */
export const POST_READ_REFUSED =
  "ICEFALL's server refused that read, so it cannot show this post. That is a refusal rather than an answer — most often a session that has quietly expired, so signing in again is the thing to try. Nothing here says whether the post exists.";

/** The tables are genuinely absent. A fact about the build, never about the post. */
export const POST_NOT_PROVISIONED =
  "This build's server does not have the feed tables, so there was nothing to read this post from. That is a fact about the deployment rather than about the post or the person who wrote it.";

/**
 * Signed out. UNREACHABLE, NOT GONE — `posts_select` grants `to authenticated`,
 * so an anonymous request is not refused, it simply matches no rows. Reporting
 * that as "no such post" would be a confident false statement built on an
 * expired token. `AppShell` gates on a real session, so this should be
 * unreachable in a shipped build; it is handled because of what it would cost.
 */
export const POST_SIGNED_OUT =
  "ICEFALL only shows posts to signed-in accounts, so it could not read this one. This is not “no such post” — no post at all is visible from here.";

/** DEMO and offline builds construct no client. Nothing was asked; nobody was invented. */
export const POST_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so it could not look this post up. Nothing is missing from this page — nothing was asked for, and no post has been invented to fill the space.";

/**
 * The post read, but the person did not.
 *
 * `posts.author_id references profiles(id) on delete cascade`, so a readable
 * post whose author cannot be found is a contradiction rather than an ordinary
 * state — which is why this is a failure and not a card with a blank byline. A
 * post needs a name on it and ICEFALL does not put one there itself.
 */
export const POST_AUTHOR_UNREADABLE =
  "ICEFALL found the post but could not read who wrote it, so it is not shown. A post is somebody's words and ICEFALL will not draw one without a name on it — this is a read that failed, not a post that is missing.";

/** A row came back that cannot be read as a post. A fault at ICEFALL's end. */
export const POST_UNREADABLE =
  "ICEFALL's server answered, but the post it sent back cannot be read as one. Nothing is drawn rather than half a post — this is a fault at ICEFALL's end rather than anything to do with the link.";

/* -------------------------------------------------------------------------- */
/* Shape                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * WHAT WAS OPENED, discriminated — because the three are rendered by three
 * different cards and the screen must not have to guess which.
 *
 * A device post and a device log are the existing behaviour, unchanged. The
 * server post is the new one, and it is a plain `Post` so that the SAME CARD
 * THE FEED RENDERS can draw it.
 */
export type PostSubject =
  | { kind: "device-post"; post: OwnPost }
  | { kind: "device-log"; log: SummitLog }
  | { kind: "server"; post: Post };

export type PostLookupState =
  | "loading"
  | "ready"
  | "gone"
  | "withheld"
  | "unreachable"
  | "no-backend";

export interface PostLookup {
  subject: PostSubject | null;
  state: PostLookupState;
  /** Present whenever an empty page needs explaining. Always one of the constants above. */
  message?: string;
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The typed client has never seen `posts` — `backend/types.ts` predates the
 * social migration and belongs to another session. The same untyped view
 * `Composer.tsx`, `Comments.tsx`, `highlights.ts` and `AthleteProfile.tsx` all
 * open, for the same reason, with every field re-checked below because nothing
 * about these rows is type-checked.
 */
const untypedPosts = supabase as unknown as SupabaseClient | null;

/** Matches `AthleteProfile`'s budget: past about six seconds the reader has decided. */
const POST_TIMEOUT_MS = 6_000;
/** `getSession()` can refresh a token BEFORE the query, so `.abortSignal()` cannot cover it. */
const POST_SESSION_TIMEOUT_MS = 3_000;

/**
 * `expires_at` IS FETCHED AND IT MATTERS. A story is a post with an expiry
 * (`social/types.ts`), a highlight makes an expired one readable again, and
 * `PostCard` draws "Story ended" off exactly this field. Without it an expired
 * story opened from a highlight would render as an ordinary post that everyone
 * else mysteriously cannot see.
 *
 * `company_id` is NOT fetched, and the company's name is therefore not claimed
 * — the same call `AthleteProfile` makes. The human who pressed the button is
 * the byline, which is the schema's own accountability rule.
 */
const POST_SELECT =
  "id, author_id, author_kind, body, media_path, media_meta, created_at, expires_at";

/** `post-media`, private since 20260902160000 — an attachment is signed, never linked. */
const POST_DETAIL_MEDIA_BUCKET = "post-media";
/** Long enough to read a post and scroll its thread; short enough not to be a link. */
const POST_DETAIL_MEDIA_TTL_SECONDS = 60 * 60;
/**
 * Shorter than the post's own budget, deliberately: by the time this runs the
 * post is already in hand, and a photograph is not worth making a climber wait
 * for words that have arrived.
 */
const POST_MEDIA_TIMEOUT_MS = 4_000;

const lookupFailed = (state: PostLookupState, message: string): PostLookup => ({
  subject: null,
  state,
  message,
});

/** `posts.author_kind` is CHECK-constrained; anything else is a person. */
function postAuthorKind(value: unknown): PostAuthorKind {
  return value === "company" || value === "guide" ? value : "profile";
}

/**
 * Race a promise with no cancellation of its own against the clock. Returns a
 * sentinel rather than throwing, so a timeout has to be handled deliberately
 * instead of being caught by accident alongside a real error. Copied from
 * `publicProfile.ts` rather than imported — it is a private helper in a file
 * this module does not own.
 */
const POST_TIMED_OUT = Symbol("post-timed-out");
async function withPostDeadline<T>(
  work: Promise<T>,
  ms: number,
): Promise<T | typeof POST_TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<typeof POST_TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(POST_TIMED_OUT), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * One attachment, signed — or nothing at all.
 *
 * FAILURE IS NOT AN ERROR STATE. A path that cannot be signed leaves the post
 * as its words, which is a real post; an `<img>` pointed at a storage path is a
 * broken frame where type would have been fine. `AthleteProfile` states the
 * same rule over its batch signer.
 */
async function signOnePostMedia(path: string): Promise<string | null> {
  if (!untypedPosts) return null;
  try {
    /*
     * ON ITS OWN CLOCK, because supabase-js storage takes no abort signal and
     * this call happens AFTER the post has already been read successfully. A
     * hung signing request on hut wifi would hold back a post whose words are
     * sitting in memory, ready to draw — so the budget is short and a miss
     * costs the photograph rather than the post.
     */
    const signed = await withPostDeadline(
      untypedPosts.storage
        .from(POST_DETAIL_MEDIA_BUCKET)
        .createSignedUrl(path, POST_DETAIL_MEDIA_TTL_SECONDS),
      POST_MEDIA_TIMEOUT_MS,
    );
    if (signed === POST_TIMED_OUT || signed.error) return null;
    const url = (signed.data as { signedUrl?: unknown } | null)?.signedUrl;
    return typeof url === "string" && url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

/** `media_meta` as `PostMedia`, every field re-checked, nothing coerced. */
function mediaFrom(url: string, path: string, meta: Record<string, unknown> | null): PostMedia {
  const kind = meta?.kind === "video" ? "video" : meta?.kind === "image" ? "image" : undefined;
  const num = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
  const alt = typeof meta?.alt === "string" && meta.alt.trim().length > 0 ? meta.alt.trim() : undefined;
  return {
    url,
    path,
    kind,
    // Only where the uploader actually recorded them: `PostCard` reserves the
    // right box from these and falls back to a fixed band without them, which
    // is better than a guessed aspect ratio.
    width: num(meta?.width),
    height: num(meta?.height),
    // Absent means decorative and is rendered as such. An invented description
    // of a photograph nobody has read is worse for a screen reader than no
    // description at all.
    alt,
  };
}

/**
 * ONE POST FROM THE SERVER, BY ID. Outside React, so a loader or a test can
 * call it as easily as the hook.
 *
 * TWO REQUESTS, IN ORDER, BECAUSE THE SECOND NEEDS THE FIRST'S ANSWER. The
 * obvious single-request version is a PostgREST embed, and it is refused here:
 * `notifications/social.ts` measured it — `posts` reaches `profiles` twice (as
 * `author_id`, and as a junction through `post_likes`), so a bare
 * `author:profiles(…)` embed comes back `PGRST201`. Going through
 * `fetchPublicProfile` instead also buys the marks ladder for free: the grey
 * identity mark is a computed field, an unpushed computed field fails a whole
 * select, and that module already knows how to lose the mark without losing the
 * name.
 *
 * RETURNS `state: "loading"` TO MEAN "you cancelled me". The caller's own
 * signal is the only thing that separates an abandoned request from an expired
 * budget — both raise the same AbortError — and `netTimeout.ts` records what
 * conflating them costs.
 */
export async function fetchServerPost(id: string, signal?: AbortSignal): Promise<PostLookup> {
  // Checked before the client, deliberately: a link no post could hold is
  // nobody's in every build, and saying so costs no request.
  if (postIdKind(id) !== "server") return lookupFailed("gone", POST_LINK_MALFORMED);
  if (!untypedPosts) return lookupFailed("no-backend", POST_NO_BACKEND);
  const client = untypedPosts;

  const session = await withPostDeadline(client.auth.getSession(), POST_SESSION_TIMEOUT_MS);
  if (signal?.aborted) return { subject: null, state: "loading" };
  if (session === POST_TIMED_OUT || session.error) {
    return lookupFailed("unreachable", POST_UNREACHABLE);
  }
  // See `POST_SIGNED_OUT`: no session means no rows rather than an error, and
  // an empty result there must never become "this post is gone".
  if (!session.data.session) return lookupFailed("unreachable", POST_SIGNED_OUT);

  const deadline = withTimeout(POST_TIMEOUT_MS, signal);
  // `.abortSignal()` MUST come before `.maybeSingle()`: it is declared on
  // PostgrestTransformBuilder and `maybeSingle()` returns a builder without it,
  // so the other order is a compile error rather than a lost deadline.
  const query = client.from("posts").select(POST_SELECT).eq("id", id);
  const { data, error } = await (deadline ? query.abortSignal(deadline) : query).maybeSingle();

  // OUR OWN CANCELLATION IS A NON-EVENT — whatever replaced this request has
  // already set its own state.
  if (signal?.aborted) return { subject: null, state: "loading" };

  if (error) {
    /*
     * AN ABORT IS NOT A POSTGRES ERROR AND `classifyBackendError` CANNOT SEE
     * IT. postgrest-js reports an aborted fetch through the `error` field with
     * no SQLSTATE, and the caller's signal is already known not to have fired —
     * so an abort here is the deadline expiring, which is a request that did
     * not come back. Everything with a code goes to the shared classifier
     * below; six modules once each had their own and they disagreed.
     */
    const text = `${error.message ?? ""}`.toLowerCase();
    if (text.includes("abort")) return lookupFailed("unreachable", POST_UNREACHABLE);

    switch (classifyBackendError(error)) {
      case "not-provisioned":
        return lookupFailed("unreachable", POST_NOT_PROVISIONED);
      case "refused":
        return lookupFailed("unreachable", POST_READ_REFUSED);
      default:
        // "unreachable" and "unknown" alike. Both are ICEFALL failing to get an
        // answer, and neither is permitted to become a claim about the post.
        return lookupFailed("unreachable", POST_UNREACHABLE);
    }
  }

  // THE ANSWER THE `withheld` SENTENCE EXISTS FOR. The server was asked, it
  // replied, and it replied with nothing — deleted, expired or blocked, and it
  // will not say which. See the section header.
  if (!data) return lookupFailed("withheld", POST_WITHHELD);

  const row = data as unknown as Record<string, unknown>;
  const rowId = typeof row.id === "string" ? row.id : "";
  const authorId = typeof row.author_id === "string" ? row.author_id : "";
  const body = typeof row.body === "string" ? row.body : "";
  const createdAt = typeof row.created_at === "string" ? row.created_at : "";
  // `body` is NOT NULL 1–4000 and `created_at` NOT NULL, so a row missing
  // either is a fault rather than a post. Nothing is coerced into place.
  if (!rowId || !authorId || !body || !createdAt) {
    return lookupFailed("unreachable", POST_UNREADABLE);
  }

  /*
   * THE AUTHOR READ IS CAPPED FROM OUTSIDE, AND IT HAS TO BE.
   *
   * The obvious way to bound it is to hand `fetchPublicProfile` a deadline
   * signal. IT WOULD HANG THIS PAGE FOR EVER. That function reads an aborted
   * signal as "the CALLER withdrew the question" and answers `state: "loading"`
   * — correctly, for an unmount — and `usePostSubject` never writes a `loading`
   * result, so an expired budget arriving in that shape would leave the screen
   * on its spinner with no sentence attached. The caller's own signal still
   * goes through, because an unmount genuinely is a withdrawn question; the
   * TIME limit is applied out here instead.
   *
   * The underlying request may outlive the cap. Its answer is simply discarded,
   * which is what `withPostDeadline` is for, and the page says it could not
   * finish rather than waiting for a reply nobody is holding a page open for.
   */
  const author = await withPostDeadline(fetchPublicProfile(authorId, signal), POST_TIMEOUT_MS);
  if (signal?.aborted) return { subject: null, state: "loading" };
  if (author === POST_TIMED_OUT) return lookupFailed("unreachable", POST_UNREACHABLE);
  if (author.state === "loading") return { subject: null, state: "loading" };
  if (author.state === "no-backend") return lookupFailed("no-backend", POST_NO_BACKEND);
  if (!author.profile) return lookupFailed("unreachable", POST_AUTHOR_UNREADABLE);

  const mediaPath =
    typeof row.media_path === "string" && row.media_path.length > 0 ? row.media_path : null;
  const signedUrl = mediaPath ? await signOnePostMedia(mediaPath) : null;
  if (signal?.aborted) return { subject: null, state: "loading" };

  const post: Post = {
    id: rowId,
    author: {
      id: author.profile.id,
      name: author.profile.displayName,
      handle: author.profile.username ?? undefined,
      avatarUrl: author.profile.avatarUrl ?? undefined,
      location: author.profile.locationLabel ?? undefined,
      // The row's own `author_kind`, carried as what it is. No company object:
      // the company's name is not fetched, so it is not claimed.
      kind: postAuthorKind(row.author_kind),
      /*
       * THREE VALUES CARRIED AS THREE, not flattened to a boolean. `true` is
       * the server saying ICEFALL confirmed who they are; `false` is the server
       * saying not; `null` is the extras ladder never having landed — an
       * unpushed computed field, or a failed second request — and `undefined`
       * is how `Author` spells that. `false` and `undefined` draw the same
       * nothing, so the distinction costs the card nothing and keeps this line
       * from turning "nobody asked" into "we checked, and no".
       */
      identityVerified: author.profile.identityVerified ?? undefined,
    },
    body,
    createdAt,
    // Carried exactly as it came, including null. `isStory` tests this field
    // and nothing else, because it is the field that makes a story a story.
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    media:
      mediaPath && signedUrl
        ? mediaFrom(signedUrl, mediaPath, (row.media_meta ?? null) as Record<string, unknown> | null)
        : undefined,
    // NO `likeCount`, `likedByMe` OR `commentCount`, and that is deliberate
    // rather than unfinished. `like_count` and `liked_by_me` exist as computed
    // fields (20260902100000) but NOTHING IN THIS APP WRITES A LIKE — so a real
    // total beside a heart that only marks the session would be the app
    // disagreeing with itself on one card. `undefined` means NOT COUNTED and
    // `PostCard` prints nothing for it, which is the honest render. The same
    // call `AthleteProfile` makes, for the same reason.
  };

  return { subject: { kind: "server", post }, state: "ready" };
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

const LOOKING_UP_POST: PostLookup = { subject: null, state: "loading", message: POST_LOADING };

/**
 * WHATEVER IS BEHIND `/social/post/:id`, resolved in one place so the screen is
 * a renderer rather than a router.
 *
 * NO REQUEST IS MADE FOR A DEVICE ID OR A MALFORMED ONE. Both are answered from
 * what this build already knows — see `postIdKind` — so opening your own post
 * costs nothing, cannot fail, and cannot sit on a spinner when the phone is in
 * a valley. It also means the two states that say "there is no post here" are
 * only ever reached where that is certain.
 *
 * ONE FETCH PER ID, no subscription and no poll. A post that changed while it
 * is open is not news this screen can act on — there is no update path on
 * `posts` at all (no UPDATE grant, no UPDATE policy), so the only thing that
 * can happen to an open post is deletion, and re-reading on a timer to discover
 * that would be a request per reader per minute to find out nothing.
 */
export function usePostSubject(idFromRoute: string): PostLookup {
  const id = idFromRoute.trim();
  const kind = postIdKind(id);
  const own = useOwnPosts();
  const logs = useSummitLogs();
  const [remote, setRemote] = useState<PostLookup>(LOOKING_UP_POST);

  useEffect(() => {
    if (kind !== "server") return;
    const controller = new AbortController();
    setRemote(LOOKING_UP_POST);

    void fetchServerPost(id, controller.signal)
      .then((next) => {
        // `fetchServerPost` answers "loading" when it noticed our abort.
        // Writing it would strand the screen on a spinner belonging to a post
        // it has already navigated away from.
        if (controller.signal.aborted || next.state === "loading") return;
        setRemote(next);
      })
      // Nothing above is expected to throw — postgrest-js turns an aborted
      // fetch into an `error` field rather than a rejection. But an unhandled
      // rejection here does not merely log: it leaves the page on "loading" for
      // ever, which is the one outcome with no honest sentence attached to it.
      .catch(() => {
        if (controller.signal.aborted) return;
        setRemote(lookupFailed("unreachable", POST_UNREACHABLE));
      });

    return () => controller.abort();
  }, [id, kind]);

  return useMemo<PostLookup>(() => {
    if (kind === "unknown") return lookupFailed("gone", POST_LINK_MALFORMED);
    if (kind === "server") return remote;

    // A device id, answered from this device. Synchronous — the stores are read
    // at module load — so your own post never flashes a loading state.
    const post = own.find((p) => p.id === id);
    if (post) return { subject: { kind: "device-post", post }, state: "ready" };
    const log = logs.find((l) => l.id === id);
    if (log) return { subject: { kind: "device-log", log }, state: "ready" };
    return lookupFailed("gone", POST_DEVICE_GONE);
  }, [kind, id, own, logs, remote]);
}
