import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { classifyBackendError } from "@/backend/pgErrors";
import { exampleFeedSource, exampleRefusal, isExampleGroupId } from "@/groups/demo/exampleSource";
import type { GroupSpaceStatus } from "./groupSpace";
import type { Author, Post, PostAuthorKind, PostGroupRef, PostMedia } from "./types";

/**
 * A GROUP'S FEED — the posts written into one group, and the ability to write
 * one.
 *
 * The owner, 2026-09-11:
 *   "when you click on a group and join there should be the feed and chat"
 *
 * The chat half shipped in `groupSpace.ts` on 2026-09-02. This is the other
 * half. It needs `20260912090000_post_group_id.sql` on the server; where that
 * column is missing, the feed reports that rather than an empty group.
 *
 * ── WHERE A GROUP POST LIVES, AND WHY NOT ON THE DEVICE ──────────────────────
 *
 * ICEFALL has two post stores. `posts.ts` holds `OwnPost` in localStorage — the
 * athlete's own, never leaving the phone — and `public.posts` holds the server
 * rows that `PostCard` renders. A GROUP POST IS A SERVER POST, and the device
 * store gains nothing.
 *
 * That is not a shrug at the easier option, it is the whole point. A group is
 * other people. A "feed" built on the device store could only ever show the
 * phone owner their own posts, in a room they share with eleven others, with no
 * sentence on screen explaining why nobody else has ever said anything — which
 * is precisely the invented fact this codebase spends its comments preventing.
 * `posts.ts` now carries `DEVICE_POST_HAS_NO_GROUP` saying so out loud.
 *
 * DEMO BUILDS construct no client (`backend/client.ts`), so a real group's feed
 * answers `no-backend` with `GROUP_FEED_NO_BACKEND`. This file still holds no
 * fixture and never draws a plausible invented feed. What a demo build shows
 * instead is the labelled examples from `groups/demo/exampleSource.ts`: an
 * example id is read through the same seam below (`readGroupFeedFrom`), and a
 * post to one is refused with `EXAMPLE_READ_ONLY` (structure plan §3.3).
 *
 * ── THE MEMBERSHIP RULE, AND WHY IT IS HERE AND NOT IN THE SCREEN ────────────
 *
 * The feed appears when you join. That rule is enforced in three places, and it
 * needs all three:
 *
 *   1. `posts_select`, in the database (20260912090000). THE ONLY ONE THAT IS A
 *      SECURITY BOUNDARY. Everything else is manners.
 *   2. `readGroupFeedFrom` below, which establishes membership BEFORE reading
 *      any post — because RLS FILTERS RATHER THAN REFUSING. A non-member's
 *      query returns `[]` with no error, byte for byte what an empty group
 *      returns, and rendering that would tell a stranger "nobody has posted
 *      here" about a group that has been busy for a month. The same trap, and
 *      the same head-check, as `readMessages` in `groupSpace.ts`.
 *   3. `composeGroupPost` below, which refuses to compose an insert for a
 *      non-member — so the person typing gets a sentence rather than a raw
 *      Postgres refusal.
 *
 * A rule that lives only in a component is one refactor from gone. A rule that
 * lives only in the database gives a stranger an empty room instead of a locked
 * door. Hence both, with this module owning the honest half.
 *
 * ── IS A GROUP POST VISIBLE OUTSIDE THE GROUP? NO. ───────────────────────────
 *
 * Decided in the migration's header and repeated here because it is the kind of
 * decision that gets re-litigated by accident: `posts_select` now carries
 * `group_id is null or is_group_member(group_id)`, so a group post is invisible
 * to a non-member EVERYWHERE — the feed, the author's profile grid, a shared
 * link, a comment thread, a summit claim. The conservative direction, chosen
 * because opening it later is one policy arm and closing it later un-reads
 * nothing.
 *
 * The one gap, stated rather than hidden: the ATTACHMENT is in `post-media`,
 * whose read policy is `bucket_id = 'post-media'` for any signed-in caller and
 * deliberately does not join to `posts` (20260902160000). A group post's
 * photograph is therefore unfindable rather than gated — its path is written
 * down only in the row that is now hidden. `GROUP_POST_MEDIA_CAVEAT` below
 * carries the sentence, and the fix is a storage-path change, not a screen.
 *
 * ── NOTHING IS MIRRORED, QUEUED OR COUNTED LOCALLY ───────────────────────────
 *
 * No outbox, no optimistic row, no cached page. A post that could not be
 * written does not exist and the person is told so. A count that did not arrive
 * is `null` and a screen draws nothing — never a `0`, because a `0` says a
 * group nobody could count is a group nobody has posted in.
 */

/**
 * The typed client has never seen `posts` or `groups` — `backend/types.ts`
 * predates every social migration. The same untyped view `posts.ts`,
 * `highlights.ts`, `groupSpace.ts` and `Composer.tsx` all open, for the same
 * reason, with every field below re-checked by hand because nothing about these
 * rows is type-checked.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/* -------------------------------------------------------------------------- */
/* Limits — each one a database rule repeated, never invented                  */
/* -------------------------------------------------------------------------- */

/** `posts.body check (length(trim(body)) between 1 and 4000)`. */
export const MAX_GROUP_POST_BODY = 4000;

/**
 * How much of a feed is read at once.
 *
 * `posts_group_idx` is `(group_id, created_at desc)`, so newest-first is the
 * cheap end and this is a page off the front of it. The COUNT is asked for
 * separately and exactly (see `GroupFeedPage.count`), so a capped page never
 * becomes a wrong total.
 */
export const GROUP_FEED_PAGE = 50;

/* -------------------------------------------------------------------------- */
/* Copy — one place, so this module and the screen cannot describe the same    */
/* empty page differently                                                      */
/* -------------------------------------------------------------------------- */

/**
 * THE DESIGNED REFUSAL. Not an empty feed, and the difference is the whole
 * promise the group makes to the people in it.
 *
 * Written separately from `MESSAGES_MEMBERS_ONLY` in `groupSpace.ts` even
 * though the door is the same one, because a reader who has just been told the
 * conversation is closed and then sees the identical sentence under a second
 * heading learns nothing from the second. This one is about posts.
 */
export const POSTS_MEMBERS_ONLY =
  "What this group has posted is only visible to the people in it. Nothing here is empty and nothing has been hidden from you in particular — ICEFALL does not read a group's posts to anyone outside it. Join, and you will see all of it.";

/**
 * Inside, and genuinely nothing there. REACHABLE ONLY AFTER THE HEAD-CHECK
 * PASSED, which is what makes it sayable at all.
 */
export const GROUP_FEED_EMPTY =
  "Nobody has posted in this group yet. You are a member, ICEFALL asked the server, and the answer was none — this is an empty feed rather than one you cannot see.";

/** No client in this build. DEMO and offline builds construct none. */
export const GROUP_FEED_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so it could not read this group's posts. Nothing is missing here — nothing was asked for, and no post has been invented to fill the space.";

/**
 * The column, the relationship or the table is genuinely absent.
 *
 * On a server without `20260912090000_post_group_id.sql`, `posts.group_id` does
 * not exist and the read below fails before it reaches a row. Never softened
 * into "this group has not posted anything": that would be a claim about eleven
 * climbers, made out of a deployment that has not happened.
 */
export const GROUP_FEED_NOT_LIVE =
  "Posting inside a group is not live on ICEFALL's server yet, so there is nothing to read. That is a fact about this build rather than about this group — no post has been hidden and none has been lost.";

/** A request that was made and did not come back. Also not an empty feed. */
export const GROUP_FEED_UNREACHABLE =
  "ICEFALL could not reach the server, so it could not read this group's posts. This is a failed request rather than an answer — nothing has gone anywhere.";

/**
 * The server answered and said no, for a reason this module did not anticipate.
 *
 * IT MUST NOT REACH FOR `GROUP_FEED_NOT_LIVE`. Reporting a refusal as a
 * deployment that had not happened is the bug `highlights.ts` documents at
 * length; a sentence naming a cause the app has not established is the same lie
 * as an invented number.
 */
export const GROUP_FEED_REFUSED =
  "ICEFALL's server refused that, so it cannot show this group's posts. This is a refusal rather than an answer — most often a session that has quietly expired, so signing in again is the thing to try. Nothing has been deleted.";

/** Reachable only when a session ends under a screen that is already open. */
export const GROUP_FEED_SIGNED_OUT =
  "Your ICEFALL session ended while this was open, so the group's posts could not be read. Nothing here is missing — sign in again and it comes back.";

/** The id resolved to no row. `groups_select` is open, so this is really absent. */
export const GROUP_FEED_NO_SUCH_GROUP =
  "ICEFALL's server has no group with that link, so there are no posts to read. It may have been removed by whoever started it.";

/** The same door from the other side — a write refused for want of membership. */
export const GROUP_POST_MEMBERS_ONLY =
  "Only members can post in this group, so nothing was sent. Your words are still here.";

const GROUP_POST_EMPTY =
  "A post needs something in it. Write a line and it will go to the group.";

const GROUP_POST_TOO_LONG = `A post has to fit in ${MAX_GROUP_POST_BODY} characters.`;

const GROUP_POST_NOT_LIVE =
  "ICEFALL's server cannot file a post against a group yet, so nothing was posted and nothing was stored.";

const GROUP_POST_UNREACHABLE =
  "ICEFALL could not reach the server, so nothing was posted. Nothing was half-saved — try again when you have signal.";

const GROUP_POST_FAILED = "That did not go through, and nothing was posted. Try it again.";

/**
 * SAID ON THE COMPOSER, BEFORE ANYBODY TYPES. A group post is closed to
 * outsiders and its attachment is not, and a person choosing what to photograph
 * is owed that distinction while they are choosing.
 */
export const GROUP_POST_MEDIA_CAVEAT =
  "Your words here are readable only by this group's members. A photograph is stored where any signed-in ICEFALL account could open it if they had its address — nobody is given that address outside the group, but it is not locked the way the words are.";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Reusing `GroupSpaceStatus` rather than declaring a fourth vocabulary for the
 * same nine answers. `members-only` is a DESIGNED REFUSAL and is separate from
 * `refused`: a locked door and a broken lock are different things to say.
 */
export type GroupFeedStatus = GroupSpaceStatus;

/** What a screen renders. `posts` is empty unless `state` is `ready`. */
export interface GroupFeedState {
  posts: Post[];
  /**
   * HOW MANY POSTS THIS GROUP HAS, as the server counted them — not the length
   * of `posts`, which is capped at `GROUP_FEED_PAGE`.
   *
   * NULL MEANS NOBODY COUNTED. A screen draws nothing for it. It is never
   * coerced to `posts.length`, because a page off the front of a longer feed
   * would then report a total it made up, and it is never coerced to 0, because
   * 0 is a measurement this module only makes when the server actually said so.
   */
  count: number | null;
  state: GroupFeedStatus;
  /** Why, when `state` is not `ready`. Never set alongside drawn posts. */
  message?: string;
  reload(): void;
}

/** One page of a group's feed, as the reader below answers. */
export type GroupFeedRead =
  | { status: "ready"; posts: Post[]; count: number | null }
  | { status: Exclude<GroupFeedStatus, "ready">; message: string };

/** What `composeGroupPost` answers. `id` is the server's, and its only evidence. */
export type GroupPostWrite =
  | { ok: true; id: string }
  | { ok: false; message: string };

/**
 * A PostgREST failure, narrowed to what this module reads.
 *
 * Declared structurally rather than imported as `PostgrestError` so a test can
 * construct one without a running server, and so the seam below has no
 * dependency on supabase-js at all.
 */
export interface FeedError {
  code?: string | null;
  message?: string | null;
}

/**
 * THE SEAM. Everything this module does to a server, expressed as four
 * questions — so the membership rule, the absence classification and the row
 * reading are all testable without a database, and so a fake cannot accidentally
 * be given powers the real one does not have.
 *
 * Each method answers with data OR an error, never by throwing: a rejected
 * promise here would be caught by whichever `try` happened to be nearest, and
 * this module's whole job is to turn a failure into the right sentence.
 */
export interface GroupFeedSource {
  /**
   * `groups?select=id,joined_by_me&id=eq.<groupId>`.
   *
   * `joined_by_me` is a SECURITY DEFINER computed field on `groups`
   * (20260902100000), which is why it can be asked by somebody who is not in
   * the group and still answer truthfully. `found: false` means no such row.
   */
  membership(groupId: string): Promise<{
    found: boolean;
    joined: boolean;
    error: FeedError | null;
  }>;

  /** One page of `posts` for the group, newest first, with an exact total. */
  page(
    groupId: string,
    limit: number,
  ): Promise<{ rows: Record<string, unknown>[]; count: number | null; error: FeedError | null }>;

  /** `post-media` paths to signed URLs, batched. A path that will not sign is absent. */
  sign(paths: string[]): Promise<Map<string, string>>;

  /** The insert. `id` is null whenever the row was not written. */
  insert(row: Record<string, unknown>): Promise<{ id: string | null; error: FeedError | null }>;

  /** The signed-in reader, for `mine`-style tests the caller may make. */
  uid: string;
}

/* -------------------------------------------------------------------------- */
/* Reading a refusal                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which honest absence a failure is.
 *
 * `PGRST200` AND `PGRST201` ARE HANDLED HERE AND NOT BY THE SHARED CLASSIFIER,
 * and that is the whole reason this function exists rather than a bare call to
 * `classifyBackendError`. Both are PostgREST refusing a query over its schema
 * cache before the database sees it:
 *
 *   · PGRST200 — "could not find a relationship". The
 *     read below embeds `group:groups(...)`, and until `posts.group_id` exists
 *     there is no relationship between those tables to embed, so the whole
 *     select is refused. It is a deployment fact and must read as one.
 *   · PGRST201 — "more than one relationship was found". The trap
 *     `highlights.ts` documents: `posts` reaches `profiles` twice, so the embed
 *     below names its constraint. If this code ever fires, the query string is
 *     wrong rather than the server, so it is NOT called "not live" — it is a
 *     refusal, and the sentence for a refusal at least invites a retry rather
 *     than asserting a migration has not happened.
 *
 * Everything else goes to the shared classifier, which already maps 42703 (no
 * such column) and 42P01/PGRST205 (no such table) to `not-provisioned`, 42501
 * to `refused`, and a bodiless transport failure to `unreachable`.
 */
export function feedAbsence(error: FeedError | null): {
  status: Exclude<GroupFeedStatus, "ready" | "loading">;
  message: string;
} {
  const code = error?.code ?? "";
  if (code === "PGRST200") {
    return { status: "not-provisioned", message: GROUP_FEED_NOT_LIVE };
  }
  if (code === "PGRST201") {
    return { status: "refused", message: GROUP_FEED_REFUSED };
  }
  switch (classifyBackendError(error ?? null)) {
    case "not-provisioned":
      return { status: "not-provisioned", message: GROUP_FEED_NOT_LIVE };
    case "unreachable":
      return { status: "unreachable", message: GROUP_FEED_UNREACHABLE };
    case "refused":
      return { status: "refused", message: GROUP_FEED_REFUSED };
    default:
      /* "unknown" — the server answered and this module cannot say why it said
         no. It gets the refusal sentence rather than the deployment one,
         because a refusal claims nothing about the server's state. */
      return { status: "refused", message: GROUP_FEED_REFUSED };
  }
}

/** Postgres speaks to operators; a person who has just typed needs a sentence. */
export function postFailure(error: FeedError | null): string {
  const code = error?.code ?? "";
  const text = (error?.message ?? "").toLowerCase();

  // The database refusing the membership arm of `posts_insert`. It is the only
  // 42501 this call can produce, because `author_id = auth.uid()` is set from
  // the session and the group arm is the only other test a member could fail.
  if (code === "42501" || text.includes("row-level security")) return GROUP_POST_MEMBERS_ONLY;
  if (code === "23503") {
    return "ICEFALL's server has no group with that link, so nothing was posted.";
  }
  if (code === "23514") return "The server refused those values, so nothing was posted.";
  switch (classifyBackendError(error ?? null)) {
    case "not-provisioned":
      return GROUP_POST_NOT_LIVE;
    case "unreachable":
      return GROUP_POST_UNREACHABLE;
    case "refused":
      return GROUP_POST_MEMBERS_ONLY;
    default:
      return code === "PGRST200" ? GROUP_POST_NOT_LIVE : GROUP_POST_FAILED;
  }
}

/* -------------------------------------------------------------------------- */
/* Row readers — the untyped client hands back `any`, so nothing is trusted    */
/* -------------------------------------------------------------------------- */

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * PostgREST serves a to-one embed as an object and an array wherever it cannot
 * prove the relationship is to-one. Both are read, because the difference is
 * decided by the schema cache rather than by this code — the same note
 * `groupSpace.ts`, `Comments.tsx` and `highlights.ts` all carry.
 */
function embedded(raw: unknown): Record<string, unknown> | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * The columns, and three deliberate omissions.
 *
 * `profiles!posts_author_id_fkey` NAMES THE CONSTRAINT AND IS NOT OPTIONAL:
 * `posts` reaches `profiles` twice — directly through `author_id`, and as a
 * junction through `post_likes`, whose primary key is exactly the two foreign
 * keys. A bare `profiles(...)` is PGRST201 and it fails the WHOLE select.
 * Measured against the live project by `highlights.ts`; copy that string, never
 * `Comments.tsx`'s, which embeds from a table reaching `profiles` once.
 *
 * `identity_verified` IS ABSENT, and unlike in `highlights.ts` that is a
 * decision rather than an oversight. It is a computed field, and a computed
 * field that is not deployed fails the entire select instead of quietly
 * omitting itself — `20260902200000` records `identity_verified(profiles)`
 * failing to resolve on this project at least once. This module already has one
 * hard dependency on an unpushed migration (`posts.group_id`, which is the
 * point of it); a second, avoidable one would take a group's whole feed dark
 * for a reason that has nothing to do with groups. `Author.identityVerified`
 * is therefore `undefined`, which is how that type spells NOBODY ASKED, and no
 * mark is drawn. The same call `groupSpace.ts` makes on its roster.
 *
 * `like_count` and `liked_by_me` ARE ABSENT for the reason `fetchServerPost`
 * gives: the tables exist but nothing in this app writes a like, so a real
 * total beside a heart that only marks the session would be the app disagreeing
 * with itself on one card.
 */
const FEED_COLUMNS =
  "id, author_id, author_kind, body, media_path, media_meta, media_gallery, created_at, " +
  "expires_at, group_id, " +
  "author:profiles!posts_author_id_fkey(id, display_name, username, avatar_url, location_label), " +
  "company:companies(id, name), " +
  "group:groups(id, name)";

/** `posts.author_kind` is CHECK-constrained; anything else is a person. */
function authorKind(value: unknown): PostAuthorKind {
  return value === "company" || value === "guide" ? value : "profile";
}

/**
 * The byline, or nothing. A post with no resolvable author is DROPPED rather
 * than drawn under an invented name — a post is somebody's words and ICEFALL
 * does not put a name on one itself.
 */
function toAuthor(
  authorId: string,
  profile: Record<string, unknown> | null,
  kind: PostAuthorKind,
  company: Record<string, unknown> | null,
): Author | null {
  const name = profile ? text(profile.display_name) : null;
  if (!name) return null;

  const companyId = company ? text(company.id) : null;
  const companyName = company ? text(company.name) : null;
  /*
   * A COMPANY POST WHOSE COMPANY DID NOT RESOLVE IS DROPPED, NOT RELABELLED.
   * `author_id` is always the human who pressed the button, so falling back to
   * 'profile' would not produce a missing byline — it would produce a wrong
   * one: a company's statement under the name of the employee who typed it.
   */
  if (kind === "company" && (!companyId || !companyName)) return null;

  return {
    id: authorId,
    name,
    handle: text(profile?.username) ?? undefined,
    avatarUrl: text(profile?.avatar_url) ?? undefined,
    location: text(profile?.location_label) ?? undefined,
    kind,
    company: kind === "company" && companyId && companyName
      ? { id: companyId, name: companyName }
      : undefined,
    // See FEED_COLUMNS: not asked for, so not claimed either way.
    identityVerified: undefined,
  };
}

/** `media_meta` as `PostMedia`, every field re-checked, nothing coerced. */
function toMedia(url: string, path: string, meta: Record<string, unknown> | null): PostMedia {
  const num = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
  const alt = typeof meta?.alt === "string" && meta.alt.trim().length > 0 ? meta.alt.trim() : undefined;
  return {
    url,
    path,
    kind: meta?.kind === "video" ? "video" : meta?.kind === "image" ? "image" : undefined,
    width: num(meta?.width),
    height: num(meta?.height),
    // Absent means decorative and is rendered as such. An invented description
    // of a photograph nobody has read is worse than none for a screen reader.
    alt,
  };
}

/**
 * `media_gallery` (20260916120000) as raw elements — one per image, each
 * shaped like `media_meta` plus its own `path`. Nothing is signed here; the
 * caller batches every path across the whole page (see `readGroupFeedFrom`)
 * in the same request that already signs every row's `media_path`.
 *
 * Genuinely defensive, the same posture `toAuthor`/`toMedia` take on this
 * untyped column: is it an array, is each element an object, is its `path` a
 * non-empty string. A malformed element is dropped; a malformed column (not
 * an array) returns an empty list, which is what leaves `gallery` absent
 * rather than an invented one-item array.
 */
function galleryElements(raw: unknown): { path: string; meta: Record<string, unknown> }[] {
  if (!Array.isArray(raw)) return [];
  const out: { path: string; meta: Record<string, unknown> }[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const meta = entry as Record<string, unknown>;
    const path = text(meta.path);
    if (!path) continue;
    out.push({ path, meta });
  }
  return out;
}

/**
 * The group this row was filed against, from the embed.
 *
 * FALLS BACK TO THE COLUMN'S OWN VALUE WITH A NULL NAME rather than dropping
 * the reference: the id is what a card links with, and an unresolved embed is a
 * missing name, not a missing group. Nothing title-cases anything.
 */
function toGroupRef(row: Record<string, unknown>): PostGroupRef | undefined {
  const embed = embedded(row.group);
  const id = (embed ? text(embed.id) : null) ?? text(row.group_id);
  if (!id) return undefined;
  return { id, name: embed ? text(embed.name) : null };
}

/**
 * ONE ROW AS A `Post`, or null where it cannot honestly be one.
 *
 * EXPORTED BECAUSE IT IS THE "EXISTING POSTS STILL WORK" GUARANTEE, and a
 * guarantee that is not executable is a comment. A row with no `group_id` comes
 * back as exactly the post it was before this file existed — `group` absent,
 * every other field untouched — and the suite next door asserts it.
 */
export function toGroupFeedPost(
  row: Record<string, unknown>,
  signedUrls: Map<string, string>,
): Post | null {
  const id = text(row.id);
  const authorId = text(row.author_id);
  const createdAt = text(row.created_at);
  // `body` is NOT NULL 1–4000 and `created_at` NOT NULL, so a row missing
  // either is a fault rather than a post. Nothing is coerced into place.
  const body = typeof row.body === "string" && row.body.length > 0 ? row.body : null;
  if (!id || !authorId || !createdAt || !body) return null;

  const kind = authorKind(row.author_kind);
  const author = toAuthor(authorId, embedded(row.author), kind, embedded(row.company));
  if (!author) return null;

  const mediaPath = text(row.media_path);
  const url = mediaPath ? signedUrls.get(mediaPath) : undefined;

  // ADDITIVE, alongside `media_path` above, never instead of it. A row with
  // no gallery (every row before 20260916120000, and every single-image or
  // single-video post since) reads as `[]` here and `gallery` below ends up
  // `undefined` — exactly what this function already returned.
  const galleryImages = galleryElements(row.media_gallery)
    .map(({ path, meta }) => {
      const signed = signedUrls.get(path);
      return signed ? toMedia(signed, path, meta) : null;
    })
    .filter((m): m is PostMedia => m !== null);

  return {
    id,
    author,
    body,
    createdAt,
    // Carried exactly as it came, including null: `isStory` tests this field
    // and nothing else, because it is the field that makes a story a story.
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    /*
     * A PATH THAT WOULD NOT SIGN LEAVES THE POST AS ITS WORDS, which is a real
     * post. An `<img>` pointed at an unsigned storage path is a broken frame
     * where type would have been fine. The same rule `posts.ts` states over its
     * own signer.
     */
    media: mediaPath && url
      ? toMedia(url, mediaPath, (row.media_meta ?? null) as Record<string, unknown> | null)
      : undefined,
    // Only where the column was genuinely a non-empty array AND at least one
    // element actually signed — never a partial-signing failure papered over
    // as a smaller gallery than what was written.
    gallery: galleryImages.length > 0 ? galleryImages : undefined,
    group: toGroupRef(row),
    // No likeCount, likedByMe or commentCount: see FEED_COLUMNS.
  };
}

/* -------------------------------------------------------------------------- */
/* The read                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A GROUP'S POSTS, NEWEST FIRST, WITH MEMBERSHIP ESTABLISHED FIRST.
 *
 * Takes its source rather than reaching for the module's client, so the whole
 * of this — the head-check, the absence classification, the row reading — runs
 * in the test suite against a fake server. `readGroupFeed` below is this
 * function with the real one.
 *
 * THE ORDER OF THE TWO REQUESTS IS THE FEATURE. Membership is read from
 * `groups.joined_by_me`, a SECURITY DEFINER computed field that answers
 * truthfully for a non-member, and a `false` there ends the function — no post
 * query is made at all. Doing it the other way round and inferring the door
 * from an empty array is the bug this ordering exists to make impossible,
 * because an empty array from a stranger and an empty array from a member are
 * the same bytes.
 */
export async function readGroupFeedFrom(
  source: GroupFeedSource,
  groupId: string,
  limit = GROUP_FEED_PAGE,
): Promise<GroupFeedRead> {
  const head = await source.membership(groupId);
  if (head.error) {
    const { status, message } = feedAbsence(head.error);
    return { status, message };
  }
  if (!head.found) return { status: "not-found", message: GROUP_FEED_NO_SUCH_GROUP };
  if (!head.joined) return { status: "members-only", message: POSTS_MEMBERS_ONLY };

  const page = await source.page(groupId, limit);
  if (page.error) {
    const { status, message } = feedAbsence(page.error);
    return { status, message };
  }

  const rows = Array.isArray(page.rows) ? page.rows : [];
  // ONE BATCH, covering both `media_path` and every `media_gallery` element
  // across the whole page — a gallery image is signed exactly like a single
  // post's image, just more of them, and there is no reason to round-trip
  // twice for what is one signing call either way.
  const singlePaths = rows.map((r) => text(r.media_path)).filter((p): p is string => p !== null);
  const galleryPaths = rows.flatMap((r) => galleryElements(r.media_gallery).map((e) => e.path));
  const paths = Array.from(new Set([...singlePaths, ...galleryPaths]));
  const signed = paths.length > 0 ? await source.sign(paths) : new Map<string, string>();

  const posts = rows.flatMap<Post>((row) => {
    const post = toGroupFeedPost(row, signed);
    return post ? [post] : [];
  });

  /*
   * THE COUNT IS THE SERVER'S OR IT IS NOTHING.
   *
   * `posts.length` is not a substitute: this is a page off the front of a feed
   * that may be longer, and a dropped row (an author that did not resolve) is
   * excluded from the page but not from the count, which is correct — the group
   * really does have that many posts, and this build could only render some.
   * A screen that wants "showing 50 of 214" has both numbers here honestly.
   */
  return { status: "ready", posts, count: typeof page.count === "number" ? page.count : null };
}

/* -------------------------------------------------------------------------- */
/* The write                                                                   */
/* -------------------------------------------------------------------------- */

export interface GroupPostInput {
  groupId: string;
  body: string;
  /** A path already uploaded to `post-media`. This module does not upload. */
  mediaPath?: string | null;
  /** Whatever the uploader MEASURED. Nothing is described that was not read. */
  mediaMeta?: Record<string, unknown> | null;
  /**
   * `posts.media_gallery` (20260916120000) — TWO OR MORE images already
   * uploaded to `post-media`, set only when the composer's caller genuinely
   * chose more than one. Mutually exclusive with `mediaPath`/`mediaMeta`: a
   * caller sends one or the other, never both, because choosing exactly one
   * image keeps using the classic single-attachment fields above and a
   * gallery of one is not what this column is for (see the migration's own
   * "1 to 10 rather than 2 to 10" note — the server does not police which
   * path a client picks, this module does, by construction: it sends only
   * one of the two).
   *
   * Each element is shaped exactly like `media_meta` for one image — `path`
   * plus whatever the uploader measured — because `toGroupFeedPost`'s
   * `galleryElements`/`toMedia` read every element back that same way.
   */
  mediaGallery?: { path: string; kind: "image"; [key: string]: unknown }[] | null;
  /**
   * A story inside a group. Passed through as `posts.expires_at` because the
   * column is the same one and a group story is not a new concept — but note it
   * leaves the READ policy at that moment for everyone but its author, so the
   * group's own feed loses it too. A composer offering this owes the sentence.
   */
  expiresAt?: string | null;
}

/**
 * POST INTO A GROUP. The API the composer needs; the composer's own UI is not
 * this module's business and is not touched.
 *
 * MEMBERSHIP IS CHECKED BEFORE THE INSERT IS COMPOSED, and the honest reason is
 * the sentence rather than the security: `posts_insert` will refuse a
 * non-member anyway (20260912090000), but it refuses with 42501, and "row
 * violates row-level security policy" is not a thing to show somebody who has
 * just written three paragraphs about a crevasse. Checking first means the
 * refusal arrives in English. IT IS NOT THE GATE. The gate is the policy.
 *
 * `author_id` is sent explicitly even though the policy pins it to `auth.uid()`
 * — so the statement says the rule out loud, the way `groupSpace.ts` sends it
 * on a message.
 *
 * `author_kind: 'profile'`, always. The phone app posts as a person; speaking
 * for a company needs an active-membership check the policy makes, and offering
 * it here would offer it to people who do not have one.
 */
export async function composeGroupPost(
  source: GroupFeedSource,
  input: GroupPostInput,
): Promise<GroupPostWrite> {
  const body = input.body.trim();
  if (body.length === 0) return { ok: false, message: GROUP_POST_EMPTY };
  if (body.length > MAX_GROUP_POST_BODY) return { ok: false, message: GROUP_POST_TOO_LONG };

  const head = await source.membership(input.groupId);
  if (head.error) return { ok: false, message: postFailure(head.error) };
  if (!head.found) {
    return { ok: false, message: "ICEFALL's server has no group with that link, so nothing was posted." };
  }
  if (!head.joined) return { ok: false, message: GROUP_POST_MEMBERS_ONLY };

  const { id, error } = await source.insert({
    author_id: source.uid,
    author_kind: "profile",
    group_id: input.groupId,
    body,
    media_path: input.mediaPath ?? null,
    media_meta: input.mediaMeta ?? null,
    media_gallery: input.mediaGallery ?? null,
    expires_at: input.expiresAt ?? null,
  });

  /*
   * THE RETURNED ID IS THE ONLY EVIDENCE THE ROW EXISTS. A screen that says
   * "posted" on the strength of a missing error is claiming a delivery it did
   * not witness — `Composer.tsx` states the same rule over its own insert.
   */
  if (error || !id) return { ok: false, message: postFailure(error) };
  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/* The real source                                                             */
/* -------------------------------------------------------------------------- */

/** Private since 20260902160000 — an attachment is signed, never linked. */
const POST_MEDIA_BUCKET = "post-media";
/** Long enough to read a feed and scroll it; short enough not to be a link. */
const POST_MEDIA_TTL_SECONDS = 60 * 60;

type Gate =
  | { ok: true; source: GroupFeedSource }
  | { ok: false; status: Exclude<GroupFeedStatus, "ready" | "loading">; message: string };

/**
 * Nothing here touches the network without going through this, which is also
 * where the two answers that are NOT failures of the feature get made:
 * a build with no client, and a session that has ended.
 */
async function gate(): Promise<Gate> {
  if (!supabase || !untyped) {
    return { ok: false, status: "no-backend", message: GROUP_FEED_NO_BACKEND };
  }
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id ?? null;
  if (!uid) return { ok: false, status: "signed-out", message: GROUP_FEED_SIGNED_OUT };
  return { ok: true, source: supabaseSource(untyped, uid) };
}

/** The seam, wired to a real client. Every string here is checked by hand. */
export function supabaseSource(client: SupabaseClient, uid: string): GroupFeedSource {
  return {
    uid,

    async membership(groupId) {
      const { data, error } = await client
        .from("groups")
        .select("id, joined_by_me")
        .eq("id", groupId)
        .maybeSingle();
      if (error) return { found: false, joined: false, error };
      if (!data) return { found: false, joined: false, error: null };
      const row = data as unknown as Record<string, unknown>;
      // `!== true` rather than `=== false`: an absent or unreadable value is
      // NOT membership. Failing closed by construction, not by luck.
      return { found: true, joined: row.joined_by_me === true, error: null };
    },

    async page(groupId, limit) {
      const { data, error, count } = await client
        .from("posts")
        // `count: "exact"` is a second aggregate on the same request, so the
        // total is the server's own and survives the limit below.
        .select(FEED_COLUMNS, { count: "exact" })
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return { rows: [], count: null, error };
      return {
        rows: Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [],
        count: typeof count === "number" ? count : null,
        error: null,
      };
    },

    async sign(paths) {
      const out = new Map<string, string>();
      if (paths.length === 0) return out;
      const { data, error } = await client.storage
        .from(POST_MEDIA_BUCKET)
        .createSignedUrls(paths, POST_MEDIA_TTL_SECONDS);
      if (error || !Array.isArray(data)) return out;
      for (const entry of data) {
        // Each entry carries its OWN error — one unsignable object does not
        // fail the batch and must not be read as a URL for the others.
        if (!entry || entry.error || typeof entry.path !== "string") continue;
        if (typeof entry.signedUrl === "string" && entry.signedUrl.length > 0) {
          out.set(entry.path, entry.signedUrl);
        }
      }
      return out;
    },

    async insert(row) {
      const { data, error } = await client.from("posts").insert(row).select("id").single();
      const id = (data as { id?: unknown } | null)?.id;
      return { id: typeof id === "string" ? id : null, error: error ?? null };
    },
  };
}

/** The read, against the real server. Outside React so a loader can call it. */
export async function readGroupFeed(
  groupId: string,
  limit = GROUP_FEED_PAGE,
): Promise<GroupFeedRead> {
  // A labelled example (demo builds only) is read through the same seam.
  if (isExampleGroupId(groupId)) return readGroupFeedFrom(exampleFeedSource(), groupId, limit);
  const session = await gate();
  if (!session.ok) return { status: session.status, message: session.message };
  return readGroupFeedFrom(session.source, groupId, limit);
}

/** The write, against the real server. The API the composer calls. */
export async function postToGroup(input: GroupPostInput): Promise<GroupPostWrite> {
  const refusal = exampleRefusal(input.groupId);
  if (refusal) return { ok: false, message: refusal };
  const session = await gate();
  if (!session.ok) {
    return {
      ok: false,
      message:
        session.status === "no-backend"
          ? GROUP_FEED_NO_BACKEND
          : "Your ICEFALL session ended, so nothing was posted. Sign in again and try it once more.",
    };
  }
  const result = await composeGroupPost(session.source, input);
  if (result.ok) bumpFeed();
  return result;
}

/* -------------------------------------------------------------------------- */
/* Refresh — a counter, not a subscription                                     */
/* -------------------------------------------------------------------------- */

/*
 * THERE IS NO LIVE FEED AND THIS MODULE DOES NOT IMPLY ONE. A post written on
 * this device moves the counter, every mounted feed re-reads, and that is all
 * that happens automatically. Somebody else's post arrives when the reader asks
 * for it — which is why `GroupFeedState` carries `reload()` and a screen should
 * offer it as an act somebody takes. The same posture `groupSpace.ts` takes on
 * the conversation, for the same reason: a refresh dressed up as an inbox is a
 * promise of delivery nothing here makes.
 */
let feedRevision = 0;
const listeners = new Set<() => void>();

function bumpFeed() {
  feedRevision += 1;
  listeners.forEach((l) => l());
}

function useFeedRevision(): number {
  const [value, setValue] = useState(() => feedRevision);
  useEffect(() => {
    const listener = () => setValue(feedRevision);
    listeners.add(listener);
    // A write between the render and this effect would otherwise be missed.
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A GROUP'S FEED, NEWEST FIRST.
 *
 * A NON-MEMBER GETS `members-only`, NEVER AN EMPTY FEED. `ready` with no posts
 * means one thing and one thing only: you are in the group and nobody has
 * posted yet — the sentence for which is `GROUP_FEED_EMPTY`, and a screen
 * should draw that rather than a bare blank, because a blank reads as a feed
 * that failed to load.
 */
export function useGroupFeed(groupId: string | undefined): GroupFeedState {
  const nonce = useFeedRevision();
  const [manual, setManual] = useState(0);
  const [posts, setPosts] = useState<Post[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [state, setState] = useState<GroupFeedStatus>("loading");
  const [message, setMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    let alive = true;

    if (!groupId) {
      setPosts([]);
      setCount(null);
      setState("not-found");
      setMessage(GROUP_FEED_NO_SUCH_GROUP);
      return;
    }

    setState("loading");
    setMessage(undefined);

    void readGroupFeed(groupId).then((result) => {
      if (!alive) return;
      if (result.status === "ready") {
        setPosts(result.posts);
        setCount(result.count);
        setState("ready");
        setMessage(undefined);
        return;
      }
      // Nothing is kept from a previous read: a stale page under a failure
      // sentence is the app showing posts it cannot currently vouch for.
      setPosts([]);
      setCount(null);
      setState(result.status);
      setMessage(result.message);
    });

    return () => {
      alive = false;
    };
  }, [groupId, nonce, manual]);

  const reload = useCallback(() => setManual((n) => n + 1), []);
  return { posts, count, state, message, reload };
}
