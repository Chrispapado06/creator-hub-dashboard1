/**
 * The shapes the community feed is built from.
 *
 * Kept separate from the demo data so that swapping the data for a real fetch
 * touches one file and nothing else.
 *
 * Note what a post deliberately cannot carry: a follower count, a popularity
 * rank, an exact location, a coordinate, a phone number, an age. The screens do
 * not omit those by choice — they are not in the model, so no screen can render
 * one by accident.
 */

export type PostKind =
  | "activity"
  | "summit"
  | "route-report"
  | "looking-for-partners"
  | "milestone"
  | "group";

export interface PostAuthor {
  id: string;
  name: string;
  /**
   * A band, never a point: "Around Chamonix", not a distance and never a
   * coordinate. See `network/privacy.ts` — one precise figure anywhere undoes
   * the banding everywhere.
   */
  region: string;
  /** Optional avatar. Absent is normal and renders as initials. */
  avatar?: string;
}

export interface PostStat {
  label: string;
  value: string;
}

export interface CommunityPost {
  id: string;
  kind: PostKind;
  /** Resolved against the clock at render — see `agoLabel`. */
  hoursAgo: number;
  author: PostAuthor;
  /** The mountain this is about, and when. The reason the post exists. */
  objective: { mountain: string; when: string };
  title: string;
  body?: string;
  /** Distance / elevation / time, for a training post. */
  stats?: PostStat[];
  /** Short factual lines, for partner and group posts. */
  bullets?: string[];
  tags?: string[];
  photo?: string;

  summit?: {
    elevationM: number;
    range: string;
    /**
     * The summit was reached during an activity recorded in ICEFALL and the
     * track reached the top. NOT a check on the person — see
     * `SUMMIT_VERIFIED_MEANING`.
     */
    verified: boolean;
  };

  report?: {
    condition: string;
    visibility: string;
    snow: string;
    note: string;
  };

  milestone?: { pct: number; label: string };

  group?: { filled: number; size: number };

  likes: number;
  comments: number;
}

export const POST_KIND_LABEL: Record<PostKind, string> = {
  activity: "Activity",
  summit: "Summit",
  "route-report": "Route report",
  "looking-for-partners": "Looking for partners",
  milestone: "Milestone",
  group: "Expedition group",
};

/** What someone can post. Mirrors the create sheet in the design. */
export const CREATE_OPTIONS: { kind: PostKind; label: string; detail: string }[] = [
  { kind: "activity", label: "Activity", detail: "Share your training session" },
  { kind: "summit", label: "Summit", detail: "Share your summit achievement" },
  { kind: "route-report", label: "Route report", detail: "Share conditions or trail info" },
  {
    kind: "looking-for-partners",
    label: "Looking for partners",
    detail: "Find partners for your mountain",
  },
  { kind: "milestone", label: "Milestone", detail: "Share a training or journey milestone" },
];

/* ========================================================================== */
/* THE SERVER MODEL                                                           */
/* ========================================================================== */

/**
 * Everything above this line is the DEMO feed's shape — a hand-written post
 * with a kind, a mountain, a milestone ring and an invented byline, built so
 * the community layout could be reviewed before there was a server.
 *
 * Everything below is what the server actually stores, read off
 * `icefall-supabase/migrations/20260831190000_social.sql`. The two live side by
 * side on purpose and neither converts into the other: `CommunityPost` carries
 * six fields the table has no column for, and inventing those columns in the
 * client is how a model starts promising data the database cannot hold. New
 * Social screens are built on `Post`; `Community.tsx` keeps its demo shape
 * until the feed is fetched rather than written.
 *
 * FOUR THINGS THE TABLE DECIDES, AND THE TYPES BELOW REPEAT RATHER THAN SOFTEN:
 *
 *  1. A POST HAS NO KIND. `posts` is `body` + optional media, and nothing else
 *     — no summit, no route report, no "looking for partners". So `Post` has no
 *     `kind` and no card built on it may draw a kind chip. That taxonomy needs
 *     a column and an owner ruling first; until then it exists only in the demo
 *     model above, where it is labelled as demo.
 *
 *  2. A STORY IS A POST WITH AN EXPIRY. Not a second table, not a flag —
 *     `expires_at` set means the row leaves everyone else's read policy at that
 *     moment. `Story` is therefore `Post` narrowed, and `isStory` is the only
 *     test: a screen cannot classify a story by anything but the field that
 *     actually makes it one.
 *
 *  3. NOTHING PUBLISHED IS EDITABLE. There is no UPDATE grant and no UPDATE
 *     policy on `posts` or `post_comments` — published words are stood behind
 *     or deleted. So there is no `editedAt` here, and there must never be one:
 *     a field for it would be a claim the database cannot make.
 *
 *  4. COUNTS ARE COUNTED, NEVER STORED. The migration says it about follows and
 *     it holds everywhere: no count column exists to read, so every count below
 *     is optional and `undefined` means NOT COUNTED — a screen renders nothing,
 *     never a `0` standing in for a question it did not ask.
 *
 * And one thing the table does NOT have yet: A LIKES TABLE. `20260831190000`
 * ships posts, comments, follows and promoted placements — there is nowhere for
 * a like to be recorded and nowhere to count other people's from. `likeCount`
 * is consequently a number only a caller that genuinely holds one may pass, and
 * `LikeButton` moves the figure by exactly ±1 for the reader's own tap, because
 * the reader liking something is the one like this app can currently vouch for.
 */

/**
 * Who a post is from — `posts.author_kind`.
 *
 * `author_id` is ALWAYS the human who pressed the button, whichever of these
 * it is; the policy pins it to `auth.uid()`. 'company' additionally names the
 * company being spoken for and requires active membership at write time,
 * 'guide' requires the author to actually hold a guide profile.
 */
export type PostAuthorKind = "profile" | "company" | "guide";

/**
 * The person behind a post, resolved from `profiles` (+ `companies` for a
 * company post).
 *
 * Distinct from `PostAuthor` above, which belongs to the demo feed and requires
 * a hand-written region band. This one carries only what a profile row holds.
 */
export interface Author {
  /** `profiles.id` — the human, always, even on a company post. */
  id: string;
  /** `profiles.display_name`. */
  name: string;
  /** `profiles.username`. NULL until they have chosen one — most social signups. */
  handle?: string;
  /** `profiles.avatar_url`. Absent is normal and renders as a monogram. */
  avatarUrl?: string;
  /**
   * `profiles.location_label` — a place they typed ("Chamonix, France"), and
   * deliberately not a coordinate: the location migration stores a label and a
   * country and no lat/lon at all, so no card can leak a position.
   */
  location?: string;
  kind: PostAuthorKind;
  /** Set exactly when `kind` is 'company' — the company being spoken for. */
  company?: { id: string; name: string; logoUrl?: string };
  /**
   * The GREY mark, from `identity_verified(profiles)`: ICEFALL confirmed this
   * person is who they say. NOTHING MORE — not their credentials, not their
   * experience, not their judgement.
   *
   * Named after the function rather than called `verified` on purpose. The
   * owner's three-marks ruling (31 Aug) gives credentials, identity and paid
   * membership three different marks that may never borrow each other's
   * colour, and a bare `verified` is exactly the field a later reader
   * generalises into "ICEFALL checked them". It is server-derived — there is no
   * boolean column to set, so nothing on the device can grant it.
   */
  identityVerified?: boolean;
}

/**
 * `posts.media_path` + `posts.media_meta`, resolved for display.
 *
 * `url` is required and `path` is not: storage paths are resolved by whoever
 * fetched the row, because a component that builds a bucket URL out of a path
 * is a component that renders a broken image the day the bucket moves.
 */
export interface PostMedia {
  /** A displayable URL. The fetch layer resolves it; a card never guesses one. */
  url: string;
  /** The raw `media_path`, kept so a delete or a re-resolve has the key. */
  path?: string;
  kind?: "image" | "video";
  /** From `media_meta`, when the uploader recorded them — lets a card reserve the right box. */
  width?: number;
  height?: number;
  /** Author-written alt text. Absent means decorative, and is rendered as such. */
  alt?: string;
}

/** One row of `public.posts`, with its author resolved. */
export interface Post {
  id: string;
  author: Author;
  /** `posts.body` — NOT NULL, 1–4000 characters. A post is always words. */
  body: string;
  media?: PostMedia;
  /** `posts.created_at`, ISO. */
  createdAt: string;
  /**
   * `posts.expires_at`. Set = this is a story and it ends; null/absent = it is
   * permanent. See `isStory`.
   */
  expiresAt?: string | null;

  /**
   * Likes, and the honest shape of a feature with no table behind it.
   *
   * `undefined` means nobody counted — render no figure. `likedByMe` is the
   * reader's own mark and is the only part of this a client can currently be
   * sure of; see the note at the top of this section.
   */
  likeCount?: number;
  likedByMe?: boolean;
  /** Counted from `post_comments`. `undefined` = not counted, not zero. */
  commentCount?: number;
}

/**
 * A post that ends.
 *
 * Deliberately a narrowing of `Post` rather than a shape of its own, because
 * that is exactly what the table does: one `posts` row whose `expires_at` is
 * set. Anything true of a post is true of a story.
 */
export type Story = Post & { expiresAt: string };

export function isStory(post: Post): post is Story {
  return typeof post.expiresAt === "string" && post.expiresAt.length > 0;
}

/**
 * "ends in 7h" while it is live, "ended" once it is past, `null` for an
 * ordinary post — derived from the row's own expiry every time it is asked,
 * never stored. A stored "live" flag outlives the moment it describes.
 */
export function storyTimeLeft(post: Post, now = new Date()): string | null {
  if (!isStory(post)) return null;
  const ms = new Date(post.expiresAt).getTime() - now.getTime();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "ended";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `ends in ${Math.max(1, mins)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `ends in ${hours}h`;
  return `ends in ${Math.round(hours / 24)}d`;
}

/**
 * One row of `public.post_comments`, with its author resolved.
 *
 * NOT the same type as `Comment` in `@/social/comments`. That one is the
 * device-local thread the app already ships — it predates the server, holds
 * replies (`parentId`) and a local "respected" mark, and lives in
 * localStorage. This one is the server's row and has neither, because
 * `post_comments` has no parent column and no update path: replies and edits
 * would each need a migration and an owner ruling. Importing both into one
 * file needs an alias, and the alias is the point — they are different things.
 */
export interface Comment {
  id: string;
  /** `post_comments.post_id`. */
  postId: string;
  author: Author;
  /** 1–2000 characters, NOT NULL. */
  body: string;
  createdAt: string;
}

/**
 * An expedition party — `public.threads` where `kind = 'group'`.
 *
 * There is no `groups` table and this type does not pretend there is. A group
 * in ICEFALL is a conversation with a name and an objective, which is why
 * joining one is what unlocks messaging: the house rule ("private messages are
 * only available inside a group you have both joined") is the membership row on
 * `thread_participants`, not a setting.
 */
export interface Group {
  /** `threads.id`. */
  id: string;
  /** `threads.title` — a group names itself; only a group thread may be retitled. */
  title: string;
  /**
   * What the party is for, denormalised on the thread at creation so it cannot
   * change under the conversation. Every part is nullable on the row.
   */
  objective?: {
    mountain?: string;
    elevationM?: number;
    /** `threads.from_date` / `to_date`, ISO dates. */
    from?: string;
    to?: string;
  };
  /** `threads.group_size` — how big the party intends to be. Absent = not stated. */
  partySize?: number;
  /**
   * Counted from `thread_participants`. `undefined` = not counted — a group
   * card shows "4 of 6" only where both halves were actually read.
   */
  memberCount?: number;
  /** `threads.status`. A closed group is history, not a place to arrive. */
  status: "open" | "closed";
  /** Whether the reader holds a participant row. The gate on messaging. */
  joined?: boolean;
  createdAt: string;
  /** `threads.last_message_at` — the inbox-ordering column. */
  lastMessageAt?: string;
}
