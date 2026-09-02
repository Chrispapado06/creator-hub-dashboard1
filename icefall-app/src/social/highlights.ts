import { useCallback, useEffect, useState } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { DEMO } from "@/offline/offline";
import { communityPosts } from "./community";
import type { Author, Post } from "./types";

/**
 * HIGHLIGHTS — a story kept past its day, on the author's profile.
 *
 * The owner's words: "stories are only for 24 hours but people can add them as
 * highlights like instagram on their profile. they can create a highlight like
 * everest and add their everest stories".
 *
 * ── WHAT A HIGHLIGHT IS, IN THE DATABASE ─────────────────────────────────────
 *
 * `20260902170000_story_highlights.sql`. `highlights` is a name and a cover;
 * `highlight_items` is the membership. Neither holds a copy of anything — a
 * story in a highlight is still exactly the same row in `posts` it always was,
 * which is why nothing here duplicates a body, a photo or a time.
 *
 * THE ONE THING WORTH KNOWING BEFORE READING ANY CODE BELOW: expiry in this
 * schema is not a delete. A story leaves everyone ELSE's read policy when
 * `expires_at` passes and the row stays put, so highlighting one does not
 * resurrect it — it makes it publicly readable again, which the migration does
 * by amending `posts_select` to admit any post with a `highlight_items` row.
 * That is already deployed. Nothing in this file has to do it, and nothing in
 * this file may work around it.
 *
 * ── WHAT IS REAL HERE ────────────────────────────────────────────────────────
 *
 * Every highlight, every count and every cover this module returns came back
 * from the server on the request that returned it. `itemCount` is the length of
 * the membership rows the reader could actually see, so it cannot disagree with
 * the list they open by tapping the circle. No count is stored, estimated or
 * rounded, and there is no branch anywhere below that produces a highlight the
 * server did not name.
 *
 * The exception is `DEMO_HIGHLIGHTS`, which is gated the way `community.ts`
 * gates its posts and is labelled by `HIGHLIGHTS_DEMO_NOTICE` wherever it is
 * drawn. It stands in for an ABSENCE — no client in this build, nobody signed
 * in, the tables not deployed — and never for a FAILURE: a request that was
 * made and did not come back returns the unreachable sentence with an empty
 * list, because "this profile keeps no highlights" and "ICEFALL could not ask"
 * are different facts and only one of them is something this app knows.
 *
 * ── SIGNED OUT IS A STATE, NOT AN ERROR ──────────────────────────────────────
 *
 * Every policy on both tables is `to authenticated`. A signed-out reader is
 * therefore told that ICEFALL cannot see the list rather than shown an empty
 * one, and nothing here throws to say it — most of this app has no session.
 */

/**
 * The typed client does not know about `highlights`, `highlight_items` or
 * `posts` — `backend/types.ts` predates all three migrations and belongs to
 * another session. Rather than edit a file this module does not own, the calls
 * that need the new tables go through an untyped view of the same client, and
 * every shape below was checked by hand against `20260902170000` and
 * `20260831190000`. Same escape hatch, for the same reason, as
 * `network/interest.ts` and `components/social/Comments.tsx`.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/** `highlights_name_unique` is on `(owner_id, name)`; the check bounds it 1–40. */
export const MAX_HIGHLIGHT_NAME = 40;

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

export const HIGHLIGHTS_DEMO_NOTICE =
  "Placeholder highlights, shown to review this layout. Nobody can post a story in ICEFALL yet, so nothing here was kept by anybody — these highlights, photographs and dates were written by ICEFALL and none of it happened.";

/**
 * What a highlight actually promises the person creating one, said before they
 * create it rather than after.
 *
 * `posts_select` admits any post that has a `highlight_items` row, so adding an
 * expired story to a highlight puts it back in front of every signed-in reader,
 * permanently, which is the exact opposite of the expectation the 24 hours
 * created. Somebody keeping a story has to be told that, and the sentence also
 * carries the way out: removing it from every highlight returns it to expired.
 */
export const HIGHLIGHT_MAKES_IT_PUBLIC_AGAIN =
  "A story in a highlight stops ending. It becomes visible to anyone signed in to ICEFALL again, for as long as you keep it there — remove it from the highlight and it goes back to being expired.";

/** No client in this build — the offline and demo builds never construct one. */
export const HIGHLIGHTS_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so it cannot read anybody's highlights. Nothing is missing from this profile — nothing was asked for.";

/** Not "this profile has none". Signed out cannot see the list at all. */
export const HIGHLIGHTS_SIGNED_OUT =
  "Highlights are only readable while you are signed in, so ICEFALL cannot tell whether this profile keeps any. This is not an empty profile.";

/** A missing table or a missing grant. Never softened into "no highlights yet". */
export const HIGHLIGHTS_NOT_LIVE =
  "Highlights are not live on ICEFALL's server yet. Nothing is shown here rather than a guess — no highlight has been hidden from you and no count has been invented.";

/**
 * The server answered and said no, for a reason this module did not anticipate.
 *
 * IT MUST NOT REACH FOR `HIGHLIGHTS_NOT_LIVE`, and that is not a fine
 * distinction — it is the bug that produced this constant. A malformed embed in
 * `ITEM_COLUMNS` came back as `PGRST201`, fell through `classify` to "refused",
 * and every highlight then opened onto "Highlights are not live on ICEFALL's
 * server yet": a confident, checkable claim about the deployment, made on the
 * strength of an error that said nothing whatever about it, while the tables
 * were live and the migration applied. A sentence that names a cause the app
 * has not established is the same lie as an invented number.
 */
export const HIGHLIGHTS_READ_REFUSED =
  "ICEFALL's server refused that read, so it cannot say which highlights this profile keeps. This is a refusal rather than an answer — the list may not be empty, and nothing has been deleted.";

/** A request that was made and did not come back. Also not an empty list. */
export const HIGHLIGHTS_UNREACHABLE =
  "ICEFALL could not reach the server, so it does not know which highlights this profile keeps. This is a failed request rather than an answer — the list may not be empty.";

const WRITE_SIGNED_OUT =
  "A highlight sits on your profile, so it needs your account. Sign in and it can be created.";

const NAME_EMPTY = "A highlight needs a name — “Everest”, or whatever the stories in it are.";

const NAME_TOO_LONG = `A highlight's name has to fit in ${MAX_HIGHLIGHT_NAME} characters. The stories inside it carry the detail.`;

const WRITE_REFUSED =
  "ICEFALL's server refused that, so nothing was changed. A highlight and the stories in it both have to be yours — you cannot keep somebody else's story, and you cannot add to somebody else's highlight.";

const WRITE_UNREACHABLE =
  "ICEFALL could not reach the server, so nothing was changed. Nothing was half-saved — try again when you have signal.";

const WRITE_FAILED =
  "That did not go through, and nothing was changed. Try it again.";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

export interface Highlight {
  /** `highlights.id`. */
  id: string;
  /** `highlights.name` — "Everest". Trimmed by the column check, 1–40 chars. */
  name: string;
  /**
   * A displayable URL for the cover story's photo, or absent.
   *
   * ABSENT IS THE NORMAL CASE TODAY and a circle must render without it. The
   * cover is one of the highlight's own stories (`highlights.cover_post_id`),
   * a story's photo lives in the private `post-media` bucket, and `Composer.tsx`
   * still holds `POST_MEDIA_BUCKET = null` — so no post written by this app has
   * media at all yet. A resolved URL here means a real object was really signed;
   * nothing guesses one from a path.
   */
  coverUrl?: string;
  /**
   * How many stories are in it — counted from the membership rows that came
   * back on this request, never stored and never estimated.
   */
  itemCount: number;
}

/**
 * One story's membership of one highlight — `highlight_items` joined to the
 * `posts` row it points at.
 *
 * IT CARRIES `Post`, NOT `Story`, AND THAT IS NOT SLOPPINESS. `Story` is `Post`
 * narrowed to a set `expiresAt`, and `highlight_items_insert` requires only
 * that the post is YOURS — so a permanent post can be kept in a highlight as
 * well, and typing this as `Story` would mean dropping those rows on read.
 * Dropping them is the worse lie of the two available: `itemCount` counts the
 * membership rows, so a silently filtered list would show "5" on a circle that
 * opens onto four slides. A caller that genuinely needs the expiry has
 * `isStory` in `./types`, which is the only test for it anywhere in this app.
 *
 * The post is carried whole rather than flattened into fields of its own,
 * because `Post` is what every other social surface here already reads and a
 * second post shape is how the app ends up with two answers to "when was this
 * posted".
 */
export interface HighlightStory {
  /** `highlight_items.highlight_id`. */
  highlightId: string;
  /** `highlight_items.position`, the first ordering key. */
  position: number;
  /**
   * `highlight_items.added_at` — when it was KEPT, which is not when it was
   * lived. The date on the slide is `story.createdAt`; this one orders ties.
   */
  addedAt: string;
  story: Post;
}

/* -------------------------------------------------------------------------- */
/* Reading a refusal                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which honest absence a PostgREST error is.
 *
 * `PGRST205` is "no such table in the schema cache", `42P01` is the same thing
 * from Postgres, `42501` is a missing grant OR a row-level security refusal.
 * A transport failure carries no code and its message mentions `fetch`.
 *
 * The same three-way test `network/interest.ts` makes, repeated rather than
 * imported because that module owns its copy and this one must not start
 * depending on a private helper in somebody else's file.
 */
function classify(error: PostgrestError | null): "not-provisioned" | "unreachable" | "refused" {
  if (!error) return "refused";
  if (error.code === "PGRST205" || error.code === "42P01") return "not-provisioned";
  /* 42501 is NOT a deployment fact — it is a refusal. Measured 2026-09-02: a
     deployed table with no grant for this role answers 42501, a missing one
     answers PGRST205. Telling somebody whose session expired that the feature
     is not live yet is a false claim about the server. See backend/pgErrors.ts. */
  if (error.code === "42501") return "refused";
  if ((error.message ?? "").toLowerCase().includes("fetch")) return "unreachable";
  return "refused";
}

/**
 * `classify`'s three answers as the three sentences a reader may be told.
 *
 * Both read paths spelled this out by hand and both spelled it the same wrong
 * way: a two-armed ternary that sent everything which was not `unreachable` to
 * `HIGHLIGHTS_NOT_LIVE`, so a REFUSAL was reported as a deployment that had not
 * happened. It is one function now so the third arm cannot go missing again from
 * one path and not the other.
 *
 * The other half of it is which side of `kind` a case lands on: `absent` may
 * have demo content stood in for it, `failed` may not — see `DEMO_OWNER_ID`. A
 * refusal is a FAILURE. Filling it with invented circles would put an Everest on
 * somebody's profile on the one occasion the app does not know what they keep.
 */
function absence(error: PostgrestError): { kind: "absent" | "failed"; message: string } {
  switch (classify(error)) {
    case "unreachable":
      return { kind: "failed", message: HIGHLIGHTS_UNREACHABLE };
    case "not-provisioned":
      return { kind: "absent", message: HIGHLIGHTS_NOT_LIVE };
    default:
      return { kind: "failed", message: HIGHLIGHTS_READ_REFUSED };
  }
}

/** Postgres speaks to operators. Every branch here ends in something a climber can act on. */
function writeFailure(error: PostgrestError | null, name?: string): string {
  if (!error) return WRITE_FAILED;
  const message = (error.message ?? "").toLowerCase();

  // `highlights_name_unique` — one "Everest" per person. The migration is
  // explicit that a second one is a rename rather than a new highlight, so this
  // says where the existing one is instead of quietly writing into it.
  if (error.code === "23505") {
    return name
      ? `You already have a highlight called “${name}”. Open that one and add the story there — one name is one highlight.`
      : "You already have a highlight with that name. Open it and add the story there.";
  }
  // `highlights_name_check` — the length rule, if a caller got past the client one.
  if (error.code === "23514") return NAME_TOO_LONG;
  if (error.code === "23503") {
    return "That story is not on ICEFALL's server, so it cannot be kept in a highlight.";
  }
  if (error.code === "42P01" || error.code === "PGRST205" || message.includes("schema cache")) {
    return "ICEFALL's server does not have highlights yet, so nothing was changed and nothing was stored.";
  }
  if (
    error.code === "42501" ||
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) {
    return WRITE_REFUSED;
  }
  if (message.includes("fetch")) return WRITE_UNREACHABLE;
  return WRITE_FAILED;
}

/* -------------------------------------------------------------------------- */
/* The session gate                                                            */
/* -------------------------------------------------------------------------- */

type Gate =
  | { ok: true; uid: string; client: SupabaseClient }
  | { ok: false; message: string };

/**
 * Nothing in this module touches the network without going through here.
 *
 * It also narrows `untyped` to non-null for the caller, which is why every
 * write below reads `gate.client` rather than the module constant — a `!` on
 * `untyped` at eight call sites is eight places a later edit can be wrong.
 */
async function gate(signedOutMessage: string): Promise<Gate> {
  if (!supabase || !untyped) return { ok: false, message: HIGHLIGHTS_NO_BACKEND };
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id ?? null;
  if (!uid) return { ok: false, message: signedOutMessage };
  return { ok: true, uid, client: untyped };
}

/* -------------------------------------------------------------------------- */
/* Covers                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `20260902160000_post_media_bucket.sql` — PRIVATE, deliberately, so that a
 * photo somebody later deletes from their post stops being served rather than
 * living for ever behind a URL anyone kept. Private means a path is not a URL
 * and a component cannot build one, which is the whole reason `PostMedia.url`
 * is required and `PostMedia.path` is not: the fetch layer signs it, and this
 * is the fetch layer.
 */
const POST_MEDIA_BUCKET = "post-media";

/**
 * How long a signed URL is good for.
 *
 * An hour, matched to how long a profile screen plausibly stays open on a
 * phone. Longer buys nothing — the list is re-read on every mount — and a long
 * signature is a link that outlives the session it was made for, which is
 * exactly what the private bucket exists to prevent.
 */
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Storage paths to displayable URLs, in ONE request, or none of them.
 *
 * A per-item `createSignedUrl` would be one round trip per circle on a profile
 * and one per slide in a run. It also fails soft on purpose: a path that cannot
 * be signed comes back absent, and the caller draws a monogram or the words
 * alone — an `<img>` pointed at an unsigned storage path is a broken image
 * where a letter would have been fine.
 *
 * The empty case is the ordinary one today and is answered without a request:
 * `Composer.tsx` still holds `POST_MEDIA_BUCKET = null`, so no post written by
 * this app has media to sign.
 */
async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0 || !untyped) return out;

  const { data, error } = await untyped.storage
    .from(POST_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !Array.isArray(data)) return out;

  for (const entry of data) {
    // Each entry carries its OWN error — one unsignable object does not fail
    // the batch, and must not be read as a URL for the others.
    if (!entry || entry.error || typeof entry.path !== "string") continue;
    if (typeof entry.signedUrl === "string" && entry.signedUrl.length > 0) {
      out.set(entry.path, entry.signedUrl);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Reading highlights                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `cover:posts!cover_post_id(...)` names the foreign key by its column.
 * `highlights` has exactly one reference to `posts` today so the hint is not
 * strictly needed — it is here so that the day a second one is added this
 * request keeps meaning the cover rather than becoming ambiguous and failing.
 *
 * `highlight_items(post_id)` fetches the membership rows instead of asking
 * PostgREST for `count()`. Two reasons, and both are about the count being
 * true: aggregate functions are a deployment setting rather than a guarantee,
 * and a length taken from the rows the reader can actually see cannot disagree
 * with the list they get when they open the highlight. A few uuids per circle
 * is a cheap price for a number that is never a guess.
 */
const HIGHLIGHT_COLUMNS =
  "id, name, position, created_at, " +
  "cover:posts!cover_post_id(id, media_path), " +
  "highlight_items(post_id)";

/** What came off the wire, before the cover has a URL. */
interface RawHighlight {
  id: string;
  name: string;
  itemCount: number;
  coverPath: string | null;
}

/**
 * The untyped client hands back `any`, so every field is re-checked rather than
 * trusted. A row without an id or a name is DROPPED, not coerced into a blank
 * circle — the same rule `interest.ts` follows, and for the same reason: a
 * coerced value is an invented one.
 */
function toRaw(row: Record<string, unknown>): RawHighlight | null {
  const id = typeof row.id === "string" ? row.id : null;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!id || name.length === 0) return null;

  // PostgREST serves a to-one embed as an object; some versions and some
  // relationship shapes hand back a one-element array. Both are read — see the
  // same note in `Comments.tsx`.
  const raw = row.cover;
  const cover = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined;
  const coverPath =
    cover && typeof cover.media_path === "string" && cover.media_path.length > 0
      ? cover.media_path
      : null;

  const items = Array.isArray(row.highlight_items) ? row.highlight_items : [];
  return { id, name, itemCount: items.length, coverPath };
}

/**
 * `absent` means ICEFALL has no way to ask, and demo content may stand in for
 * it. `failed` means it asked and got nothing back, and demo content may NOT —
 * substituting there would show invented highlights on the one occasion the app
 * genuinely does not know what this profile keeps.
 */
type ReadResult =
  | { kind: "ready"; highlights: Highlight[] }
  | { kind: "absent"; message: string }
  | { kind: "failed"; message: string };

async function readHighlights(profileId?: string): Promise<ReadResult> {
  const session = await gate(HIGHLIGHTS_SIGNED_OUT);
  if (!session.ok) return { kind: "absent", message: session.message };

  // No `profileId` means "mine". `highlights_select` is `using (true)` for any
  // signed-in reader, so somebody else's profile is a different id and not a
  // different query.
  const owner = profileId ?? session.uid;

  const { data, error } = await session.client
    .from("highlights")
    .select(HIGHLIGHT_COLUMNS)
    .eq("owner_id", owner)
    // Exactly the order of `highlights_owner_idx`. `position` is 0 for
    // everything until a reorder UI exists, so today this is oldest-first —
    // the order they were created, which is the order they were lived in.
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return absence(error);

  /*
   * `as unknown as` rather than a plain assertion, and the reason is worth
   * stating so nobody "simplifies" it back and hits the same error.
   *
   * supabase-js parses the select STRING at the type level. With an untyped
   * client it cannot resolve `cover:posts!cover_post_id(...)` against a schema
   * it does not have, so it falls back to `GenericStringError[]` — a type with
   * no index signature, which is not comparable to `Record<string, unknown>[]`
   * in one step. The double cast is the honest admission that these rows are
   * unchecked, which is exactly why `toRaw` re-checks every field below.
   */
  const rows = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
  const raws = rows.flatMap((r) => toRaw(r) ?? []);
  const covers = await signPaths(raws.map((r) => r.coverPath).filter((p): p is string => p !== null));

  return {
    kind: "ready",
    highlights: raws.map((r) => ({
      id: r.id,
      name: r.name,
      coverUrl: r.coverPath ? covers.get(r.coverPath) : undefined,
      itemCount: r.itemCount,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Reading the stories inside one                                              */
/* -------------------------------------------------------------------------- */

/**
 * The membership row, its post, and the post's author, in one request.
 *
 * `company:companies(id, name)` is not optional politeness. `posts` carries
 * `author_kind`, a post can speak for a company, and `Author.company` is
 * documented as set exactly when `kind` is 'company' — so a query that read the
 * kind without resolving the company would hand a card a company post with a
 * personal byline. Either both or neither; this reads both.
 *
 * `logo_url` is absent on purpose: `companies` stores `logo_path`, a key in the
 * operator-media bucket, and this module does not resolve that bucket. A logo
 * nobody signed is not a logo.
 *
 * `profiles!posts_author_id_fkey` NAMES THE CONSTRAINT, AND IT IS NOT OPTIONAL.
 * `posts` reaches `profiles` twice: directly through `author_id`, and as a
 * many-to-many through `post_likes` (20260902100000), whose primary key is
 * exactly the two foreign keys — the junction shape PostgREST recognises on
 * sight. A bare `profiles(...)` is therefore ambiguous and PostgREST refuses the
 * WHOLE select before it reaches the database:
 *
 *     PGRST201 — Could not embed because more than one relationship was found
 *     for 'posts' and 'profiles'
 *
 * That is measured against the live project, not deduced. It shipped that way
 * for a few hours, and the reason it was not obvious is worth recording: this
 * module reads the failure through `classify`, which had no branch for it, so
 * every highlight opened onto "Highlights are not live on ICEFALL's server yet"
 * — a sentence about the SERVER, which was live and correct, for a fault in the
 * query string. See `READ_REFUSED` below for the second half of the fix.
 *
 * `Comments.tsx` gets away with a bare `author:profiles(...)` because it embeds
 * from `post_comments`, which reaches `profiles` once. Do not copy its string
 * here; copy this one.
 */
const ITEM_COLUMNS =
  "highlight_id, post_id, position, added_at, " +
  "post:posts(id, body, media_path, media_meta, created_at, expires_at, author_kind, " +
  "author:profiles!posts_author_id_fkey(id, display_name, username, avatar_url, location_label, identity_verified), " +
  "company:companies(id, name))";

function toAuthor(row: Record<string, unknown>, kind: unknown, company: unknown): Author | null {
  const id = typeof row.id === "string" ? row.id : null;
  const name = typeof row.display_name === "string" ? row.display_name : null;
  // A story whose author cannot be resolved is a story nobody can be held to,
  // so it is dropped rather than rendered under an invented name.
  if (!id || !name) return null;

  const co = (Array.isArray(company) ? company[0] : company) as
    | Record<string, unknown>
    | null
    | undefined;
  const companyId = co && typeof co.id === "string" ? co.id : null;
  const companyName = co && typeof co.name === "string" ? co.name : null;

  /*
   * A COMPANY POST WHOSE COMPANY DID NOT RESOLVE IS DROPPED, not relabelled.
   *
   * `posts.author_id` is always the human who pressed the button, even on a
   * company post — so falling back to `kind: 'profile'` here would not produce
   * a missing byline, it would produce a WRONG one: a company's statement drawn
   * under the name of the employee who typed it. Losing the slide is the
   * smaller harm, and it is a branch that should never fire, because the embed
   * only fails when `companies` refuses the row.
   */
  if (kind === "company" && (!companyId || !companyName)) return null;

  return {
    id,
    name,
    handle: typeof row.username === "string" ? row.username : undefined,
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : undefined,
    location: typeof row.location_label === "string" ? row.location_label : undefined,
    // An unreadable `author_kind` reads as 'profile' — the default the column
    // itself carries, and the only one of the three that claims nothing extra.
    kind: kind === "guide" ? "guide" : kind === "company" ? "company" : "profile",
    company:
      kind === "company" && companyId && companyName
        ? { id: companyId, name: companyName }
        : undefined,
    identityVerified: typeof row.identity_verified === "boolean" ? row.identity_verified : undefined,
  };
}

/** The membership row and its post, before the media path has a URL. */
interface RawItem {
  item: Omit<HighlightStory, "story">;
  story: Post;
  mediaPath: string | null;
  mediaKind: "image" | "video" | undefined;
}

function toRawItem(row: Record<string, unknown>): RawItem | null {
  const highlightId = typeof row.highlight_id === "string" ? row.highlight_id : null;
  if (!highlightId) return null;

  const rawPost = row.post;
  const post = (Array.isArray(rawPost) ? rawPost[0] : rawPost) as
    | Record<string, unknown>
    | null
    | undefined;
  // The post embed comes back null where `posts_select` refused the row. That
  // should be impossible for a highlighted post — membership is precisely what
  // the amended policy admits it on — so this is a guard rather than a case,
  // and it drops the slide instead of rendering an empty one.
  if (!post) return null;

  const id = typeof post.id === "string" ? post.id : null;
  const body = typeof post.body === "string" ? post.body : null;
  const createdAt = typeof post.created_at === "string" ? post.created_at : null;
  if (!id || !body || !createdAt) return null;

  const rawAuthor = post.author;
  const authorRow = (Array.isArray(rawAuthor) ? rawAuthor[0] : rawAuthor) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!authorRow) return null;
  const author = toAuthor(authorRow, post.author_kind, post.company);
  if (!author) return null;

  const meta = (post.media_meta ?? null) as Record<string, unknown> | null;
  const kind = meta && typeof meta.kind === "string" ? meta.kind : null;

  return {
    item: {
      highlightId,
      position: typeof row.position === "number" && Number.isFinite(row.position) ? row.position : 0,
      // Falling back to the post's own time rather than to `now`: a missing
      // `added_at` must not make a months-old story look like it was kept
      // seconds ago.
      addedAt: typeof row.added_at === "string" ? row.added_at : createdAt,
    },
    story: {
      id,
      author,
      body,
      createdAt,
      // Carried as it came. `expires_at` being in the past is normal and is the
      // whole feature — the story is readable because it is kept, not because
      // it is still running — so nothing here rewrites or clears it.
      expiresAt: typeof post.expires_at === "string" ? post.expires_at : null,
    },
    mediaPath: typeof post.media_path === "string" && post.media_path.length > 0 ? post.media_path : null,
    // Only the two values `PostMedia.kind` allows. An unrecognised one is left
    // undefined rather than passed through, because a renderer that does not
    // know the kind draws nothing, and a renderer handed a kind it half
    // recognises draws the wrong element.
    mediaKind: kind === "image" || kind === "video" ? kind : undefined,
  };
}

type ReadStoriesResult =
  | { kind: "ready"; stories: HighlightStory[] }
  | { kind: "absent"; message: string }
  | { kind: "failed"; message: string };

async function readHighlightStories(highlightId: string): Promise<ReadStoriesResult> {
  const session = await gate(HIGHLIGHTS_SIGNED_OUT);
  if (!session.ok) return { kind: "absent", message: session.message };

  const { data, error } = await session.client
    .from("highlight_items")
    .select(ITEM_COLUMNS)
    .eq("highlight_id", highlightId)
    // `highlight_items_order_idx` is `(highlight_id, position, added_at)` —
    // this is that index, in that order.
    .order("position", { ascending: true })
    .order("added_at", { ascending: true })
    .limit(200);

  if (error) return absence(error);

  // Double cast for the reason spelled out in `readHighlights`; `toRawItem`
  // re-checks every field.
  const rows = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
  const raws = rows.flatMap((r) => toRawItem(r) ?? []);
  const signed = await signPaths(raws.map((r) => r.mediaPath).filter((p): p is string => p !== null));

  return {
    kind: "ready",
    stories: raws.map((raw) => {
      const url = raw.mediaPath ? signed.get(raw.mediaPath) : undefined;
      return {
        ...raw.item,
        story: {
          ...raw.story,
          // `PostMedia.url` is required precisely so that this is the only
          // shape a card can receive: a path that would not sign produces NO
          // media rather than a `url` built out of a bucket name.
          media: url ? { url, path: raw.mediaPath ?? undefined, kind: raw.mediaKind } : undefined,
        },
      };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Demo highlights                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Whether this BUILD may contain demo highlights at all.
 *
 * An OFFLINE or DEMO build is a demo build by definition — it says so on every
 * screen — so highlights follow `SHOW_DEMO_COMMUNITY` exactly. This reads the
 * flags; it does not decide them.
 *
 * DO NOT DRAW THE DEMO NOTICE OFF THIS CONSTANT. It says the build could show
 * demo content, not that the circles on screen are demo content — a signed-in
 * athlete in a dev build sees their own real highlights and must not be told
 * they are placeholders. `useHighlights().demo` is the field that knows.
 */
export const SHOW_DEMO_HIGHLIGHTS: boolean = SHOW_DEMO_DATA || DEMO;

/** Ids carry this prefix so a demo circle can never be mistaken for a uuid. */
const DEMO_PREFIX = "highlight:demo-";

export const isDemoHighlight = (id: string): boolean => id.startsWith(DEMO_PREFIX);

/**
 * Resolved once, at module load, rather than written as fixed dates.
 *
 * `community.ts` states the rule: a hard-coded ISO date in demo content reads
 * as "3 days ago" the week it is written and "412 days ago" a year later, which
 * is how placeholder data starts looking like a bug. These are months old by
 * design, so a session's worth of drift cannot show and once is enough.
 */
const BUILT_AT = Date.now();
const DAY_MS = 86_400_000;

interface DemoHighlight {
  highlight: Highlight;
  stories: HighlightStory[];
}

/**
 * Guarded builder, not a top-level literal.
 *
 * The `import.meta.env` reads are spelled out INLINE and deliberately do not go
 * through `SHOW_DEMO_HIGHLIGHTS`: the build-time substitution has to be
 * syntactically inside the branch for the branch to fold, and with a named
 * constant the bundler keeps every literal below. The four reads are the
 * expansion of `SHOW_DEMO_DATA || DEMO` — all four are needed, because a demo
 * build whose highlights compiled away would show the demo notice above
 * nothing. Do not tidy this; `community.ts` and `guides/types.ts` both document
 * the same trap and what it cost.
 */
function buildDemoHighlights(): DemoHighlight[] {
  if (
    !import.meta.env.DEV &&
    import.meta.env.VITE_SHOW_DEMO !== "1" &&
    import.meta.env.VITE_ICEFALL_DEMO !== "1" &&
    import.meta.env.VITE_ICEFALL_OFFLINE !== "1"
  ) {
    return [];
  }

  /**
   * NO NEW PERSON IS INVENTED HERE. A highlight belongs to somebody, and the
   * demo feed already has bylines that are gated, labelled and — per the long
   * note in `community.ts` — deliberately not discoverable people. The first of
   * those keeps these highlights. Writing a fresh name would put one more
   * invented climber in the app for nothing.
   */
  const source = communityPosts()[0];
  if (!source) return [];

  const person: Author = {
    id: source.author.id,
    name: source.author.name,
    // A band somebody typed, never a coordinate — `Author.location` holds
    // exactly what the demo model's region already is.
    location: source.author.region,
    avatarUrl: source.author.avatar,
    kind: "profile",
  };

  /*
   * "Everest" because it is the owner's own example of a highlight. The
   * photographs are ICEFALL's own mountain imagery, the same way the demo
   * promotion in `StoryRail.tsx` uses it, and the lines carry no distance, no
   * elevation and no time — a placeholder must not put a measurement on screen
   * even behind a flag, because a measurement is the one thing a reader assumes
   * came from the tracker.
   */
  const spec: { name: string; slides: { photo: string; body: string; daysAgo: number }[] }[] = [
    {
      name: "Everest",
      slides: [
        { photo: "/img/everest.jpg", body: "Walked in to base camp today.", daysAgo: 118 },
        {
          photo: "/img/everest-1.jpg",
          body: "Rest day. The icefall doctors were out before it was light.",
          daysAgo: 111,
        },
        { photo: "/img/everest-3.jpg", body: "Off the hill, all of us.", daysAgo: 96 },
      ],
    },
    {
      name: "Mont Blanc",
      slides: [
        { photo: "/img/mont-blanc.jpg", body: "Goûter route, first light.", daysAgo: 47 },
        { photo: "/img/mont-blanc-2.jpg", body: "Back at the hut before the afternoon came in.", daysAgo: 46 },
      ],
    },
  ];

  return spec.map((entry, index) => {
    const id = `${DEMO_PREFIX}${index + 1}`;

    const stories: HighlightStory[] = entry.slides.map((slide, slot) => {
      const createdAt = new Date(BUILT_AT - slide.daysAgo * DAY_MS);
      // The expiry is a day after it was posted and therefore months in the
      // past, which is the point: a highlighted story is one whose 24 hours ran
      // out long ago and which is still readable because it is kept.
      const expiresAt = new Date(createdAt.getTime() + DAY_MS);
      return {
        highlightId: id,
        position: slot,
        // The demo has no separate moment at which these were kept, and one is
        // not invented for it — a second made-up date buys nothing, and the run
        // orders on `position` regardless.
        addedAt: createdAt.toISOString(),
        story: {
          id: `${id}:${slot + 1}`,
          author: person,
          body: slide.body,
          media: { url: slide.photo },
          createdAt: createdAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        },
      };
    });

    return {
      highlight: {
        id,
        name: entry.name,
        // The cover is one of the highlight's own stories, exactly as the
        // column requires — never a separate image.
        coverUrl: entry.slides[0]?.photo,
        // A real length over real slides. Nothing here is a rounded figure.
        itemCount: stories.length,
      },
      stories,
    };
  });
}

const DEMO_HIGHLIGHTS: DemoHighlight[] = buildDemoHighlights();

/**
 * WHOSE demo highlights these are, and the reason it has to be checked.
 *
 * A highlight is not free-floating decoration — it sits on one person's profile
 * and says "this is what they keep". Standing demo circles in for any profile
 * the app could not read would attach an invented Everest to whoever's page
 * happened to be open, including a real person's. So the substitution below is
 * allowed on the athlete's own profile (nobody else's claim to misstate) and on
 * this demo byline's, and nowhere else.
 */
const DEMO_OWNER_ID: string | null = DEMO_HIGHLIGHTS[0]?.stories[0]?.story.author.id ?? null;

/* -------------------------------------------------------------------------- */
/* Refresh                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A write in one component has to be visible in another.
 *
 * NO POLLING AND NO REALTIME SUBSCRIPTION — the same posture `interest.ts`
 * takes. A highlight only changes because of something the person just did, so
 * the list is re-read on mount and after every write this module makes, and a
 * socket is not held open on a phone that may be on a mountain.
 */
let revision = 0;
const listeners = new Set<() => void>();

function changed() {
  revision += 1;
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

/* -------------------------------------------------------------------------- */
/* The hooks                                                                   */
/* -------------------------------------------------------------------------- */

export interface HighlightsState {
  highlights: Highlight[];
  loading: boolean;
  /**
   * Why the list is empty, when ICEFALL could not find out. Null both when the
   * server answered and when demo content is standing in — a screen must never
   * print a failure sentence over content it is also drawing.
   */
  error: string | null;
  /** True when what is on screen is demo content and must say so. */
  demo: boolean;
  reload(): void;
}

/**
 * The highlights on a profile — the athlete's own when `profileId` is omitted.
 *
 * A REAL ANSWER ALWAYS WINS. If the server replies, its list is what comes
 * back, including when that list is empty: a signed-in athlete with no
 * highlights is shown that they have none, never demo circles standing where
 * their own would be. Demo content only fills an absence, and says so through
 * `demo`.
 */
export function useHighlights(profileId?: string): HighlightsState {
  const nonce = useRevision();
  const [manual, setManual] = useState(0);
  const [loading, setLoading] = useState(true);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    void readHighlights(profileId).then((result) => {
      if (!alive) return;
      setLoading(false);

      if (result.kind === "ready") {
        setHighlights(result.highlights);
        setError(null);
        setDemo(false);
        return;
      }

      // See `DEMO_OWNER_ID`: demo circles may fill the athlete's own profile
      // and the demo byline's, never an arbitrary one the app could not read.
      const mayStandIn =
        DEMO_HIGHLIGHTS.length > 0 && (profileId === undefined || profileId === DEMO_OWNER_ID);

      if (result.kind === "absent" && mayStandIn) {
        setHighlights(DEMO_HIGHLIGHTS.map((d) => d.highlight));
        setError(null);
        setDemo(true);
        return;
      }

      setHighlights([]);
      setError(result.message);
      setDemo(false);
    });

    return () => {
      alive = false;
    };
  }, [profileId, nonce, manual]);

  const reload = useCallback(() => setManual((n) => n + 1), []);
  return { highlights, loading, error, demo, reload };
}

export interface HighlightStoriesState {
  stories: HighlightStory[];
  loading: boolean;
  error: string | null;
  demo: boolean;
}

/**
 * The stories inside one highlight, in the order they are meant to play.
 *
 * A demo id is answered from the demo set without a request — those highlights
 * have no rows, and asking the server for `highlight:demo-1` would return an
 * empty list that looked like an empty highlight.
 */
export function useHighlightStories(highlightId?: string): HighlightStoriesState {
  const nonce = useRevision();
  const [loading, setLoading] = useState(Boolean(highlightId));
  const [stories, setStories] = useState<HighlightStory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let alive = true;

    if (!highlightId) {
      setLoading(false);
      setStories([]);
      setError(null);
      setDemo(false);
      return;
    }

    const local = DEMO_HIGHLIGHTS.find((d) => d.highlight.id === highlightId);
    if (local) {
      setLoading(false);
      setStories(local.stories);
      setError(null);
      setDemo(true);
      return;
    }

    setLoading(true);
    void readHighlightStories(highlightId).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (result.kind === "ready") {
        setStories(result.stories);
        setError(null);
      } else {
        setStories([]);
        setError(result.message);
      }
      setDemo(false);
    });

    return () => {
      alive = false;
    };
  }, [highlightId, nonce]);

  return { stories, loading, error, demo };
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

export interface HighlightActions {
  /** The new highlight's id, or null. `error` says why on a null. */
  create(name: string): Promise<string | null>;
  addPost(highlightId: string, postId: string): Promise<boolean>;
  removePost(highlightId: string, postId: string): Promise<boolean>;
  /** Deletes the highlight itself. See the note on the implementation. */
  remove(highlightId: string): Promise<boolean>;
  /** The last failure, in a sentence a climber can act on. Cleared on success. */
  error: string | null;
  busy: boolean;
}

/**
 * Creating, filling and deleting highlights.
 *
 * EVERY RETURN VALUE IS WITNESSED. `create` returns the id the server sent
 * back, not the absence of an error, because an id is the only evidence the row
 * exists — the rule `Composer.tsx` follows for a post and the reason it asks
 * for `.select("id")`. A screen that says "created" on the strength of a
 * missing error is claiming something it did not see happen.
 *
 * NOTHING IS MIRRORED LOCALLY AND NOTHING IS QUEUED. A highlight that could not
 * be written does not exist, and the person is told so rather than shown a
 * circle that will disappear on the next load.
 */
export function useHighlightActions(): HighlightActions {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = useCallback(async (name: string): Promise<string | null> => {
    const trimmed = name.trim();
    // Checked here as well as in the column, so an empty name costs nothing and
    // the person is told the rule instead of a constraint violation.
    if (trimmed.length === 0) {
      setError(NAME_EMPTY);
      return null;
    }
    if (trimmed.length > MAX_HIGHLIGHT_NAME) {
      setError(NAME_TOO_LONG);
      return null;
    }

    const session = await gate(WRITE_SIGNED_OUT);
    if (!session.ok) {
      setError(session.message);
      return null;
    }

    setBusy(true);
    const { data, error: failure } = await session.client
      .from("highlights")
      // `owner_id` is sent because the INSERT needs a value for it; the policy
      // then requires it to equal `auth.uid()`, so a client that sent somebody
      // else's is refused rather than believed.
      .insert({ owner_id: session.uid, name: trimmed })
      .select("id")
      .single();
    setBusy(false);

    const id = (data as { id?: unknown } | null)?.id;
    if (failure || typeof id !== "string") {
      setError(writeFailure(failure, trimmed));
      return null;
    }

    setError(null);
    changed();
    return id;
  }, []);

  const addPost = useCallback(async (highlightId: string, postId: string): Promise<boolean> => {
    const session = await gate(WRITE_SIGNED_OUT);
    if (!session.ok) {
      setError(session.message);
      return false;
    }

    setBusy(true);
    const { error: failure } = await session.client
      .from("highlight_items")
      .insert({ highlight_id: highlightId, post_id: postId });

    // Already in the highlight. The primary key is `(highlight_id, post_id)`,
    // so a second tap collides — and "it is in the highlight" is true either
    // way, which is the answer this function gives.
    if (failure && failure.code !== "23505") {
      setBusy(false);
      setError(writeFailure(failure));
      return false;
    }

    /*
     * The first story kept becomes the cover.
     *
     * `.is("cover_post_id", null)` does the whole job in one statement: no read
     * first, and no race where two adds both decide they are first. A highlight
     * that already has a cover is untouched — changing it is a deliberate act
     * somebody performs, not a side effect of adding a story.
     *
     * A failure here is NOT a failure of `addPost`. The story is in the
     * highlight; it is the circle that has no picture, and reporting the add as
     * failed would invite a second tap that changes nothing.
     */
    await session.client
      .from("highlights")
      .update({ cover_post_id: postId })
      .eq("id", highlightId)
      .is("cover_post_id", null);

    setBusy(false);
    setError(null);
    changed();
    return true;
  }, []);

  const removePost = useCallback(async (highlightId: string, postId: string): Promise<boolean> => {
    const session = await gate(WRITE_SIGNED_OUT);
    if (!session.ok) {
      setError(session.message);
      return false;
    }

    setBusy(true);
    const { error: failure } = await session.client
      .from("highlight_items")
      .delete()
      .eq("highlight_id", highlightId)
      .eq("post_id", postId);

    if (failure) {
      setBusy(false);
      setError(writeFailure(failure));
      return false;
    }

    /*
     * A COVER CANNOT SHOW SOMETHING THE HIGHLIGHT NO LONGER CONTAINS.
     *
     * `cover_post_id` is `on delete set null`, which only fires when the POST
     * is deleted — taking a story out of the highlight does not touch it. So
     * the cover is cleared here when it was this story, and the `.eq` makes
     * that conditional in the statement rather than after a read.
     *
     * It is cleared rather than replaced. Promoting the next remaining story
     * would need another read and would silently pick a cover the person did
     * not choose; a highlight with no cover draws its monogram, which is honest
     * and is what a chooser will replace when one exists.
     */
    await session.client
      .from("highlights")
      .update({ cover_post_id: null })
      .eq("id", highlightId)
      .eq("cover_post_id", postId);

    setBusy(false);
    setError(null);
    changed();
    return true;
  }, []);

  /**
   * Deletes the highlight.
   *
   * THIS DELETES NO STORIES. `highlight_items` cascades and the `posts` rows
   * are untouched — but every story that was in it goes back to being expired
   * the instant the last membership row disappears, because `posts_select`
   * admits them only while one exists. That is the behaviour somebody deleting
   * a highlight expects, and it is worth a screen saying so before the tap.
   */
  const remove = useCallback(async (highlightId: string): Promise<boolean> => {
    const session = await gate(WRITE_SIGNED_OUT);
    if (!session.ok) {
      setError(session.message);
      return false;
    }

    setBusy(true);
    const { error: failure } = await session.client
      .from("highlights")
      .delete()
      .eq("id", highlightId);
    setBusy(false);

    if (failure) {
      setError(writeFailure(failure));
      return false;
    }

    setError(null);
    changed();
    return true;
  }, []);

  return { create, addPost, removePost, remove, error, busy };
}
