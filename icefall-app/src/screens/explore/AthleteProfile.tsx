import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  Ban,
  ChevronLeft,
  Flag,
  Link2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Mountain,
  MountainSnow,
  Share2,
  ShieldCheck,
  UserRoundCheck,
  UserRoundPlus,
  Users,
} from "lucide-react";

import {
  Avatar,
  Button,
  Card,
  Disclaimer,
  HeroCircleButton,
  SectionLabel,
  sharePage,
} from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { VerificationMark } from "@/components/ui/VerificationMark";
import { BadgeHex } from "@/components/domain/BadgeHex";
import { ElevationProgress } from "@/components/domain/ElevationProgress";
import { HighlightsRow } from "@/components/social/HighlightsRow";
import { HighlightViewer } from "@/components/social/HighlightViewer";
import { Comments } from "@/components/social/Comments";
import { PostCard } from "@/components/social/PostCard";
import { ReportDialog } from "@/components/social/ReportDialog";
import { ReportSheet } from "@/components/social/ReportSheet";
import { BADGES } from "@/badges/model";
import { supabase } from "@/backend/client";
import { countryName } from "@/auth/useMyProfile";
import { useSessionState } from "@/auth/session";
import { fmtDate, fmtElevation } from "@/lib/format";
import { withTimeout } from "@/lib/netTimeout";
import { canMessage, messageRouteFor, useDirectConversation } from "@/messaging";
import { FOLLOW_MEANING, useFollow } from "@/social/follow";
import { BLOCK_NOT_ENFORCED_YET, block, unblock, useBlocked, useIsBlocked } from "@/social/safety";
import type { Author, Post, PostAuthorKind, PostMedia } from "@/social/types";
import {
  CONNECTIONS_ARE_LOCAL,
  PROFILE_COUNTS_NOT_LIVE,
  PROFILE_LINK_MALFORMED,
  PUBLIC_PROFILE_LIMITS,
  SUMMITS_NOT_RECORDED,
  markKindFor,
  usePublicProfile,
  usePublicSummits,
  type PublicProfile,
  type PublicProfileState,
} from "@/social/publicProfile";
import { cn } from "@/lib/utils";

/**
 * ONE OTHER CLIMBER — the whole of what ICEFALL may honestly say about somebody
 * who is not you, laid out to the owner's profile mockup of 2 September.
 *
 * ── WHAT THE MOCKUP ASKS FOR, AND WHICH HALF EXISTS ──────────────────────────
 *
 * Top to bottom the drawing is: a cover, an avatar over it, the name with a
 * mark and a Follow pill, the handle, the place, a bio; five figures in a
 * bordered card; highlights; a main objective row; a Share Profile row; five
 * badge hexagons; an achievements chart of highest elevation by year; a recent
 * activity strip with All / Posts / Summits / Activities; a second share card;
 * and a footer saying the person controls their own page.
 *
 * Every one of those sections is here, in that order. Roughly half of them can
 * be filled from the server and the rest cannot, and THE DIFFERENCE IS DRAWN
 * RATHER THAN HIDDEN — each section that has nothing says, in one line, why it
 * has nothing and what would put something there.
 *
 *   REAL          name, handle, avatar, the place they typed, the month they
 *                 joined, their follower and following counts, their highlights,
 *                 their posts, the mark beside their name, Follow, and Message.
 *   NOT READABLE  a bio (no column on `profiles`), a cover photograph (no
 *                 column either), their objective, their connections, their
 *                 summits, their highest altitude, their activities, and any
 *                 badge.
 *
 * ── THE DOCTRINE, UNCHANGED FROM THE VERSION THIS REPLACES ───────────────────
 *
 * NOTHING ON THIS SCREEN MAY BE INVENTED. Not a sample athlete, not a seeded
 * profile, not a plausible-looking distance, not a readiness figure with no
 * source. Somebody could plan an alpine objective around what they read here,
 * and this feature's own safety copy is about meeting strangers in remote
 * places — a fabricated climbing partner is a hazard, not a placeholder.
 *
 * `0` IS A MEASURED ZERO AND AN EM DASH IS NOT MEASURED. The whole app leans on
 * that one distinction, and this screen is where it is most tested: the mockup
 * writes "0 Connections" and "0 Summits" and both are em dashes here, because
 * ICEFALL cannot count either and a nought would say the climber has connected
 * with nobody and climbed nothing. A follower count of `0`, by contrast, IS a
 * `0` — `follower_count_of` genuinely runs and genuinely counts nobody.
 *
 * NO FIGURE IS EVER READ OUT OF SOMEBODY'S WORDS. The mockup's post card shows
 * a "SUMMIT LOG" chip and "Aiguille du Tour — 3,542 m", which reads like a
 * summit that is a published post — and posts ARE readable. It does not survive
 * the table: `public.posts` is a body, optional media and a timestamp, with no
 * kind, no peak and no elevation, and `social/types.ts` states it outright — A
 * POST HAS NO KIND. The only remaining route to those figures is a regex over
 * prose, and "turned back at 3,542 m" and "summited at 3,542 m" are the same
 * pattern and opposite facts. `usePublicSummits` refuses in one place and this
 * screen prints the refusal; see `SUMMITS_NOT_RECORDED`.
 *
 * THE MARK BESIDE THE NAME IS THE SERVER'S. The drawing colours it gold, which
 * under the owner's four-mark ruling means "credentials ICEFALL checked" — a
 * claim nobody at ICEFALL has ever made about anybody. `markKindFor` picks it
 * from `app_owner` and `identity_verified` and from nothing else, so the colour
 * follows from a field rather than from a condition at this call site.
 *
 * ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────────
 *
 * THE MOUNTAIN PASSPORT. It is in the drawing and the owner removed it from the
 * shared page on 2 Sep — "just remove passport when sharing the profile". It
 * stays on `screens/Profile.tsx`, the athlete's own page.
 *
 * A "VIEW ALL" BESIDE THE SECTION LABELS. The mockup has three of them. There
 * is no badge page, no achievements page and no post archive for a person who
 * is not you, and a link to your OWN badges from a stranger's profile is worse
 * than no link at all.
 *
 * ── WHAT IS NO LONGER ABSENT: REPORT AND BLOCK ───────────────────────────────
 *
 * This paragraph used to say the overflow menu carried neither, because nothing
 * in `src/` had ever written a block and `ReportDialog` is keyed by a post. That
 * was defensible while nobody could message anybody. It stopped being
 * defensible the day this screen grew a Message control: a stranger can now put
 * words in front of somebody, and the person receiving them has to have
 * somewhere to stop it — otherwise the only two safety branches on this page
 * (`MESSAGE_YOU_BLOCKED`, and `iBlocked.blocked === true`) are unreachable code
 * describing a state no path can produce.
 *
 * So the menu now calls `block()` / `unblock()` and opens `ReportSheet` with
 * `kind: "profile"`. Both are `social/safety.ts`'s, both work against the LIVE
 * schema — `blocks` since 20260818090000, `reports.subject_id` today — and both
 * print that module's own sentence rather than one composed here, including
 * `BLOCK_NOT_ENFORCED_YET` so that no screen claims a blocked person's posts
 * are hidden before 20260903010000 is pushed.
 */

/* -------------------------------------------------------------------------- */
/* Copy — one place, so no two sections make different promises                */
/* -------------------------------------------------------------------------- */

/*
 * FOLLOWING MOVED OUT OF THIS FILE on 2026-09-06 — `social/follow.ts` now owns
 * `useFollow` and the three sentences that go with it, because Notifications
 * gained a second place to follow from and two copies of these rules is how one
 * of them drifts. `FOLLOW_MEANING` is still rendered here, under the pill; it
 * is imported rather than redeclared so both screens promise the same thing.
 */

/**
 * The objective row, which the mockup fills and no server can.
 *
 * An objective in ICEFALL is a `Goal` in `state/AppState.tsx`, held in this
 * device's localStorage; `athlete_profiles` has no objective column at all, and
 * its policy is owner-only regardless. So another climber's objective is on
 * another climber's phone. Same shape of answer as Connections: unknown, not
 * none — and the last sentence exists so the reader is told where THEIRS lives
 * rather than only being refused.
 */
const OBJECTIVE_IS_LOCAL =
  "A climber's objective is kept on their own phone, so ICEFALL cannot show you anybody else's — this is unknown rather than none. Yours is under Goals.";

/**
 * Recorded activities, same story and worth keeping separate from the summits
 * sentence: a summit is a thing ICEFALL has nowhere to store, while an activity
 * is a thing it stores deliberately on the device that recorded it.
 */
const ACTIVITIES_ARE_LOCAL =
  "A recorded session stays on the phone that recorded it — ICEFALL uploads nobody's tracks, so there is no activity here to show and none has been estimated from anything else.";

/**
 * Badges, on a page that cannot read one.
 *
 * `badges/model.ts` is the whole model and its rule is that no badge can be
 * granted by this app; the applications it does hold are in `settings`, on the
 * device that applied. There is also NO BADGE TABLE ANYWHERE IN THE SCHEMA, so
 * this is not "we could not read theirs" — nobody holds one, and the hexagons
 * below are drawn muted for everybody because that is the true state of every
 * account.
 */
const BADGES_NONE_GRANTED =
  "Badges are awarded by the ICEFALL team, and none is granted automatically. None has been awarded to anybody yet, so no account has one to show.";

/** Liking, and what a like currently is. The same admission `Community` makes. */
const LIKE_NOTICE =
  "Liking marks a post for you, for this session. ICEFALL has no likes table yet, so nothing is sent, no author is told and no total is kept.";

/* -------------------------------------------------------------------------- */
/* Messaging them                                                              */
/* -------------------------------------------------------------------------- */

/**
 * THE OWNER, 2026-09-08: "an option to message someone if you see their
 * profile". This is that option, and everything behind it already existed —
 * `threads.kind = 'direct'` since 20260818090000, and `@/messaging` since
 * 20260908090000. This screen contributes the button and nothing else: it holds
 * no send logic, no thread id and no copy about what a message does.
 *
 * ── WHAT IT DOES ON TAP ──────────────────────────────────────────────────────
 *
 * It navigates. `messageRouteFor` resolves to `/messages/with/:profileId`,
 * which opens the existing conversation if there is one and an empty one if
 * there is not — so there is NO round trip on the tap, no spinner on a pill,
 * and NOTHING IS CREATED UNTIL SOMETHING IS SAID. Backing out of a profile you
 * opened by accident leaves no empty thread in a stranger's inbox.
 *
 * ── THE ID IS THE ACCOUNT ────────────────────────────────────────────────────
 *
 * `profile.id` is `public.profiles.id`, the uuid — the same value `useFollow`
 * writes to `follows.followed_profile_id` and the same one `shareUrl` is built
 * from. The route parameter this screen was opened with may be a HANDLE, and a
 * handle is not a person: `profiles_update_self` lets somebody change theirs.
 * The handle must never be what is handed to the messaging layer.
 *
 * ── WHEN IT IS NOT DRAWN, AND THE ONE CASE THAT SAYS WHY ─────────────────────
 *
 * `canMessage` is the same stance as `useFollow`'s hidden pill: a control that
 * cannot work must not appear. It answers false with no client, no session, no
 * id, or on your own profile. THE FIRST TWO CANNOT HAPPEN HERE — `profiles_select`
 * grants `to authenticated`, so `usePublicProfile` never renders a body without
 * a session, and this file is reached through a client. That leaves your own
 * profile, which already carries its own line about being your account, so it
 * needs no second sentence about messaging yourself.
 *
 * YOU BLOCKED THEM is the one withholding worth explaining, because otherwise a
 * control the reader saw on every other profile silently disappears on this one.
 * `useIsBlocked` answers it from `social/safety.ts`'s one cached read of YOUR
 * OWN block list.
 *
 * THE OTHER DIRECTION IS NOT ASKED AND MUST NEVER BE. `blocks_own` is
 * `using (blocker_id = auth.uid())`, so somebody who blocked YOU is invisible
 * here by design — telling a person they have been blocked is how a block turns
 * into an escalation. `messaging/send.ts` refuses the same probe in its own
 * header. So the Message control IS drawn for somebody who has blocked you, the
 * server refuses the message, and the thread screen says so in `SEND_REFUSED`
 * without naming which rule bit. That is deliberate: the alternative is either
 * leaking the block or showing a message as sent when it was not.
 */
const MESSAGE_YOU_BLOCKED =
  "You blocked this person, so ICEFALL will not open a conversation with them.";

/* -------------------------------------------------------------------------- */
/* Blocking them                                                               */
/* -------------------------------------------------------------------------- */

/**
 * WHAT A BLOCK DID, and there are three answers because `useBlocked().enforcement`
 * has three values and they are not interchangeable.
 *
 * `social/safety.ts` owns the fourth — `BLOCK_NOT_ENFORCED_YET`, for `not-live`
 * — and it is imported rather than restated. These two are the other two cases,
 * and every clause in them is taken from that module's header: the exclusion is
 * symmetric, the other person is never told, and NOTHING IS DELETED.
 */
const BLOCK_DONE_LIVE =
  "Blocked. ICEFALL stops showing the two of you to each other, and they are not told. Nothing has been deleted — unblocking brings all of it back.";

/**
 * `unknown` is NOT `not-live`. It means the probe had nothing to measure or its
 * read failed, so this says what was written and refuses to say what the server
 * is doing about it.
 */
const BLOCK_DONE_UNMEASURED =
  "Blocked, and saved to your account. ICEFALL could not check whether the server is yet hiding people you block, so you may still see them. Nothing you do here needs repeating.";

const UNBLOCK_DONE =
  "Unblocked. Their posts, comments and profile come back on the next read, exactly as they were — nothing was deleted while the block was on.";

/** Drawn, withheld with a reason, or simply absent. */
type MessageOption =
  | { kind: "open"; to: string; label: string }
  | { kind: "withheld"; reason: string }
  | { kind: "none" };

/* -------------------------------------------------------------------------- */
/* Follows                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `follows` and `posts` are not in `backend/types.ts` — that file predates the
 * social migrations and belongs to another session, so it is read around rather
 * than edited. Same untyped view `HighlightsRow`, `Composer` and `ReportDialog`
 * opened for the same reason; the shapes below were checked against
 * `20260831190000_social.sql` by hand.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/* -------------------------------------------------------------------------- */
/* Their posts                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `post-media`, created by `20260902160000_post_media_bucket.sql`. PRIVATE, so
 * an attachment has to be signed rather than linked — a public bucket serves an
 * object to anyone holding the URL for ever, including a photo its author later
 * deleted, which is precisely why that migration made it private.
 */
const POST_MEDIA_BUCKET = "post-media";
/** Long enough to read a profile and scroll back up it; short enough not to be a link. */
const MEDIA_URL_TTL_SECONDS = 60 * 60;

const POSTS_TIMEOUT_MS = 6_000;
/**
 * A profile is a page, not an archive. Twelve is what a reader will scroll
 * before deciding whether to follow somebody, and there is no "all posts by
 * this person" screen to link on to — so the strip says when it has stopped
 * short rather than implying twelve is everything they have written.
 */
const POSTS_LIMIT = 12;

/**
 * PERMANENT POSTS ONLY — `expires_at is null`.
 *
 * A story is a post with an expiry (`social/types.ts`), and stories belong to
 * the highlights shelf higher up this page and to the rail on Community. Mixed
 * into a profile feed they would read as ordinary posts that mysteriously
 * vanish, and an expired one kept in a highlight — which `posts_select` re-opens
 * — would surface here months later out of its run.
 */
const POSTS_SELECT = "id, author_kind, body, media_path, media_meta, created_at";

/**
 * One `posts` row, checked, with its attachment already signed.
 *
 * DELIBERATELY NOT A `Post`, WHICH IS A CORRECTION RATHER THAN A PREFERENCE. A
 * `Post` carries its author, and the author here is this page's own profile —
 * so building one inside the fetch made the request depend on an identity
 * OBJECT, and an effect keyed on an object re-runs whenever that object is
 * rebuilt. It cost a render loop ("Maximum update depth exceeded") the first
 * time this screen was opened.
 *
 * The rows are therefore plain data, fetched against nothing but the id in the
 * route, and the byline is put on them at render by `postsOf`.
 */
interface PostRow {
  id: string;
  authorKind: PostAuthorKind;
  body: string;
  createdAt: string;
  /** Present only when storage actually signed it — see `signMedia`. */
  media?: PostMedia;
}

type PostsState =
  | { status: "loading" }
  /** No client in this build. Nothing was asked, and nobody was invented. */
  | { status: "no-backend" }
  /** The read did not come back, or came back a refusal. NOT "they have posted nothing". */
  | { status: "unreadable"; message: string }
  | { status: "ready"; rows: PostRow[]; truncated: boolean };

/**
 * The same three-way reading of a failure the rest of the social code makes: a
 * missing table or a missing grant is an absence, a transport failure is a
 * failure, and the two must not be collapsed into one sentence.
 */
function postsFailure(error: PostgrestError): string {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  if (code === "PGRST205" || code === "42P01" || message.includes("schema cache")) {
    return "ICEFALL's server does not have the feed tables yet, so there is nothing to read. This is a fact about the build rather than about this climber.";
  }
  if (code === "42501" || message.includes("permission denied") || message.includes("row-level")) {
    return "ICEFALL refused that read, so it cannot show their posts. A refusal is not an answer — they may well have posted.";
  }
  return "Their posts could not be loaded. That is a read that did not come back rather than an empty profile.";
}

/**
 * Signs every attachment in one request rather than one per card.
 *
 * Failure is not an error state for the strip: an unsigned path simply means
 * the post renders as its words, which is a real post. The one rule is that a
 * URL is only ever attached when storage actually handed one back — a path is
 * not a picture, and an `<img>` pointed at a storage path is a broken frame
 * where type would have been fine.
 */
async function signMedia(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0 || !untyped) return out;

  const { data, error } = await untyped.storage
    .from(POST_MEDIA_BUCKET)
    .createSignedUrls(paths, MEDIA_URL_TTL_SECONDS);
  if (error || !Array.isArray(data)) return out;

  for (const entry of data) {
    // Each entry carries its own error — one unsignable object must not be read
    // as a URL for the others.
    if (!entry || entry.error || typeof entry.path !== "string") continue;
    if (typeof entry.signedUrl === "string" && entry.signedUrl.length > 0) {
      out.set(entry.path, entry.signedUrl);
    }
  }
  return out;
}

/** `posts.author_kind` is a CHECK-constrained string; anything else is a person. */
function authorKindOf(value: unknown): PostAuthorKind {
  return value === "company" || value === "guide" ? value : "profile";
}

/**
 * One climber's posts, newest first.
 *
 * `posts_select` is `for select to authenticated` and admits any post whose
 * expiry has not passed, so another person's posts need no special access and
 * none is asked for. The rows come back through the untyped client, so every
 * field is re-checked rather than trusted and a row missing an id, a body or a
 * date is DROPPED — a coerced value is an invented one.
 *
 * NO LIKE OR COMMENT COUNTS ARE FETCHED, and that is deliberate rather than
 * unfinished. `like_count` and `liked_by_me` exist as computed fields
 * (20260902100000), but nothing on this screen WRITES a like — `Community`
 * does not either — so reading a real total while the heart only marks the
 * session would be the app disagreeing with itself on one card. `PostCard`
 * prints nothing for an absent count, which is the honest render, and
 * `LIKE_NOTICE` says so underneath.
 */
function usePublicPosts(profileId: string | null): PostsState {
  const [state, setState] = useState<PostsState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });

    // The screen has not resolved a climber yet. Nothing is asked, and the
    // strip stays on "loading" rather than reporting an empty page for
    // somebody who has not been looked up.
    if (!profileId) return;
    if (!untyped) {
      setState({ status: "no-backend" });
      return;
    }

    const controller = new AbortController();

    void (async () => {
      const deadline = withTimeout(POSTS_TIMEOUT_MS, controller.signal);
      const query = untyped
        .from("posts")
        .select(POSTS_SELECT)
        .eq("author_id", profileId)
        .is("expires_at", null)
        .order("created_at", { ascending: false })
        .limit(POSTS_LIMIT);

      const { data, error } = await (deadline ? query.abortSignal(deadline) : query);

      if (!alive || controller.signal.aborted) return;
      if (error) {
        setState({ status: "unreadable", message: postsFailure(error) });
        return;
      }

      // Double cast: supabase-js parses the select string at the type level and
      // an untyped client cannot resolve it, so it falls back to a shape that is
      // not comparable in one step. The honest admission that these rows are
      // unchecked — which is why each field is checked below.
      const raw = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];

      const rows: PostRow[] = [];
      const paths: string[] = [];
      /** Which row wanted which object, and what kind of thing it is. One
          signing pass then serves every card. */
      const attachment = new Map<string, { path: string; kind?: "image" | "video" }>();

      for (const row of raw) {
        const id = typeof row.id === "string" ? row.id : null;
        const body = typeof row.body === "string" ? row.body : null;
        const createdAt = typeof row.created_at === "string" ? row.created_at : null;
        if (!id || !body || !createdAt) continue;

        const meta = (row.media_meta ?? null) as { kind?: unknown } | null;
        const path =
          typeof row.media_path === "string" && row.media_path.length > 0 ? row.media_path : null;
        if (path) {
          paths.push(path);
          // `Composer` writes `{kind, mime, bytes}` and no dimensions, so
          // `PostCard` reserves its fixed band rather than an aspect ratio.
          // An unrecognised kind is left undefined and drawn as an image,
          // which is `PostMedia`'s own default.
          attachment.set(id, {
            path,
            kind: meta?.kind === "video" ? "video" : meta?.kind === "image" ? "image" : undefined,
          });
        }

        rows.push({ id, authorKind: authorKindOf(row.author_kind), body, createdAt });
      }

      const signed = await signMedia(paths);
      if (!alive || controller.signal.aborted) return;

      setState({
        status: "ready",
        rows: rows.map((row) => {
          const held = attachment.get(row.id);
          const url = held ? signed.get(held.path) : undefined;
          // An attachment that could not be signed leaves the post as its
          // words, which is a real post — never an `<img>` pointed at a storage
          // path, which is a broken frame where type would have been fine.
          if (!held || !url) return row;
          return { ...row, media: { url, path: held.path, kind: held.kind } };
        }),
        truncated: raw.length >= POSTS_LIMIT,
      });
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [profileId]);

  return state;
}

/**
 * The rows, with this page's climber put on them as the byline.
 *
 * Built at render rather than in the fetch — see `PostRow`. It is the same
 * person on every card by construction (the query is `author_id = them`), so
 * there is no join to disagree with the header and none is made.
 */
function postsOf(rows: readonly PostRow[], author: Author): Post[] {
  return rows.map((row) => ({
    id: row.id,
    // `author_kind` is the row's own: a post written on behalf of a company or
    // as a guide is carried as what it is. The company's NAME is not fetched
    // and so is not claimed — the human who pressed the button is the byline,
    // which is the schema's own accountability rule.
    author: { ...author, kind: row.authorKind },
    body: row.body,
    createdAt: row.createdAt,
    media: row.media,
    // No `likeCount` and no `commentCount`: `undefined` means NOT COUNTED and
    // `PostCard` prints nothing for it, which is the honest render while this
    // screen writes no like. See the hook's note.
  }));
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function AthleteProfile() {
  const { id } = useParams<{ id: string }>();
  /**
   * `attempt` is a retry that costs nothing structurally: bumping it remounts
   * the body, and `usePublicProfile` reads once on mount. Keyed on the route
   * parameter too, so walking from one climber to another also clears the open
   * highlight — the alternative is the viewer staying up over somebody else's
   * profile, which on this screen is the worst available mix-up.
   */
  const [attempt, setAttempt] = useState(0);
  const param = id ?? "";

  return (
    <ProfileBody
      key={`${param}#${attempt}`}
      idOrUsername={param}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

/** Which of the four recent-activity pills is showing. */
type ActivityTab = "all" | "posts" | "summits" | "activities";

function ProfileBody({ idOrUsername, onRetry }: { idOrUsername: string; onRetry: () => void }) {
  const { profile, state, message } = usePublicProfile(idOrUsername);
  const session = useSessionState();
  const [openHighlight, setOpenHighlight] = useState<string | null>(null);
  const [commenting, setCommenting] = useState<Post | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  /** The mockup opens on Posts, which is also the only pill that can hold anything. */
  const [tab, setTab] = useState<ActivityTab>("posts");

  const myId = session?.user.id ?? null;
  const isYou = profile !== null && myId !== null && profile.id === myId;

  const follows = useFollow(isYou ? null : (profile?.id ?? null), myId);
  const summits = usePublicSummits(profile?.id ?? "");
  const mark = profile ? markKindFor(profile) : null;
  const posts = usePublicPosts(profile?.id ?? null);

  /*
   * MESSAGING THEM. Both hooks are called unconditionally and before the early
   * returns below — an id that is not there yet is `""` / `null` and answers
   * "no" rather than moving a hook out of the render.
   *
   * Neither costs a request of its own. `useIsBlocked` reads the one cached
   * block list `social/safety.ts` keeps for the whole app, and
   * `useDirectConversation` reads the conversation store `AppTopBar`'s unread
   * count has already loaded. See the "Messaging them" section above for what
   * each may and may not know.
   */
  const iBlocked = useIsBlocked(profile?.id ?? "");
  const direct = useDirectConversation(profile?.id ?? null);

  if (state === "loading") return <LookingUp />;
  if (state === "not-found") return <NoClimberHere message={message} />;
  if (profile === null) return <CouldNotLook state={state} message={message} onRetry={onRetry} />;

  const firstName = profile.displayName.trim().split(/\s+/)[0] || profile.displayName;
  /**
   * THE LINK IS BUILT FROM THE ACCOUNT ID, not from the address bar.
   *
   * Both forms of link open this screen, and they are not equivalent:
   * `profiles_update_self` lets somebody change their own `username`, and
   * nothing stops a handle being given up and later claimed by a different
   * account. So a handle link points at a NAME and an id link points at a
   * PERSON — and a link somebody shares outlives the reason they shared it.
   */
  const shareUrl = `${window.location.origin}/social/people/${profile.id}`;
  const shareProfile = () => sharePage(`${profile.displayName} · ICEFALL`, shareUrl);

  /*
   * THE MESSAGE CONTROL, RESOLVED IN ONE PLACE so the pill and the sentence
   * under it can never disagree about whether a conversation can be opened.
   *
   * `blocked === true` only. `useIsBlocked` returns `null` for NOT MEASURED —
   * before the list arrives, or when that read failed — and treating that as a
   * block would hide a working control on a slow connection. Treating it as
   * "not blocked" is the honest fallback here, because the server refuses the
   * message anyway and the thread screen carries the refusal.
   *
   * The visible label stays "Message" at every width; the ACCESSIBLE name is
   * where the distinction between a new conversation and one that already
   * exists is told, since `useDirectConversation` can only make that claim on a
   * `ready` snapshot and a pill has no room to hedge.
   *
   * BOTH NAMES BEGIN WITH THE VISIBLE WORD, and that is a rule rather than a
   * style: WCAG 2.5.3 asks that a control's accessible name contain its visible
   * label, because somebody driving the phone by voice says "tap Message" and
   * gets nothing if the name the system matches on has dropped the word.
   */
  const messageOption: MessageOption = !canMessage(profile.id, myId)
    ? { kind: "none" }
    : iBlocked.blocked === true
      ? { kind: "withheld", reason: MESSAGE_YOU_BLOCKED }
      : {
          kind: "open",
          to: messageRouteFor(profile.id),
          label:
            direct.state === "ready" && direct.conversation
              ? `Message ${firstName}, in the conversation you already have`
              : `Message ${firstName}`,
        };

  /**
   * The byline every post card carries. Built here, from the profile this page
   * already read, rather than joined onto each row — it is the same person on
   * every card by construction.
   *
   * `identityVerified` is set only when the HEADER is also showing grey. An
   * owner wears one mark under the ruling in `markKindFor`, so a white mark at
   * the top of the page and a grey one on every card below it would be the same
   * person carrying two different claims down one screen.
   */
  const author: Author = {
    id: profile.id,
    name: profile.displayName,
    handle: profile.username ?? undefined,
    avatarUrl: profile.avatarUrl ?? undefined,
    location: profile.locationLabel ?? undefined,
    kind: "profile",
    identityVerified: mark === "identity" ? true : undefined,
  };

  return (
    <Screen padded={false}>
      <CoverBand
        profileId={profile.id}
        name={profile.displayName}
        isYou={isYou}
        shareUrl={shareUrl}
        onShare={shareProfile}
      />

      {/* Every direct child of `Stagger` is a `Rise`. A plain wrapper here is
          the classic way to leave a row sitting at opacity 0 with nothing in the
          console to explain it, so spacing is carried on the `Rise` elements
          themselves rather than by a `space-y` on the parent — which also means
          the highlights row, which renders NOTHING when there is nothing on the
          shelf, contributes no stray gap. */}
      {/* `relative` IS LOAD-BEARING. The band above is positioned and this
          column is not, and CSS paints positioned siblings above in-flow ones
          whatever the source order — so without it the band's lower gradient
          was drawn OVER the avatar that overlaps it, slicing the top off every
          climber's picture. Caught in the browser, not in review. */}
      <Stagger className="relative px-5">
        <Rise>
          <Identity
            profile={profile}
            mark={mark}
            isYou={isYou}
            follows={follows}
            message={messageOption}
          />
        </Rise>

        <Rise className="pt-5">
          <Figures
            profile={profile}
            summitCount={summits.summitCount}
            highestM={summits.highestM}
          />
        </Rise>

        {/* ---- Highlights ---------------------------------------------------
            `isOwn={false}` is what removes the + tile: `highlight_items_insert`
            requires the highlight and the post to both be yours, so a + here
            would be an affordance the database will always refuse.

            NO SECTION LABEL, and the mockup has one. The row draws its own
            honest states — including drawing NOTHING at all when the shelf is
            empty, the read failed or there is no session — and this screen
            cannot see which of those it did. A label above it would therefore
            be a heading with nothing under it on most profiles, which is the
            "reads as broken" state everything else here is arranged to avoid.
            A label belongs here the day the row can report that it is empty.

            `-mx-5` because the shelf scrolls edge to edge and carries its own
            `px-5` inside the scroller; left in this column it would be padded
            twice and run out of runway before the screen edge. It also carries
            no vertical padding of its own, so the row rendering nothing leaves
            no gap behind it. */}
        <Rise className="-mx-5">
          <HighlightsRow profileId={profile.id} isOwn={false} onOpen={setOpenHighlight} />
        </Rise>

        <Rise className="pt-5">
          <ObjectiveRow />
        </Rise>

        <Rise className="pt-3">
          <ShareRow isYou={isYou} firstName={firstName} onShare={shareProfile} />
        </Rise>

        <Rise className="pt-7">
          <Badges />
        </Rise>

        <Rise className="pt-7">
          <Achievements
            highestM={summits.highestM}
            byYear={summits.byYear}
            message={summits.message}
          />
        </Rise>

        <Rise className="pt-7">
          <RecentActivity
            tab={tab}
            onTab={setTab}
            posts={posts}
            author={author}
            isYou={isYou}
            onOpenComments={setCommenting}
            onReport={(post) => setReporting(post.id)}
          />
        </Rise>

        <Rise className="pt-7">
          <ShareCard isYou={isYou} firstName={firstName} onShare={shareProfile} />
        </Rise>

        <Rise className="pt-6">
          <WhatIsNotHere isYou={isYou} />
        </Rise>

        <Rise className="pt-6">
          <ControlledBy firstName={firstName} isYou={isYou} />
        </Rise>
      </Stagger>

      {openHighlight !== null && (
        <HighlightViewer highlightId={openHighlight} onClose={() => setOpenHighlight(null)} />
      )}
      {commenting !== null && <Comments post={commenting} onClose={() => setCommenting(null)} />}
      <ReportDialog postId={reporting} onClose={() => setReporting(null)} />
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* The band across the top                                                     */
/* -------------------------------------------------------------------------- */

/** The height of the band, before the status-bar inset is added to it. */
const BAND_H = 148;
/** The status-bar inset, resolved the way `Screen` resolves it (chrome.tsx). */
const SAFE_TOP = "var(--screen-safe-top, env(safe-area-inset-top, 0px))";

/**
 * THE COVER, WHICH IS NOT A PHOTOGRAPH AND MUST NOT LOOK LIKE ONE.
 *
 * The mockup opens on a cover photo. `public.profiles` has no cover column —
 * the athlete's own banner in `Profile.tsx` is `settings.cover`, in this
 * device's localStorage — so there is no image of this person to show and
 * inventing one would be exactly the fabrication this screen refuses.
 *
 * So the band is a flat field of the app's own surfaces: chrome, deliberately
 * reading as the top of a page rather than as an empty photo frame. It gives
 * the controls somewhere to sit and the avatar something to overlap, which is
 * what the mockup uses it for, and it claims nothing about anybody. It is the
 * SAME field on every profile for the same reason — a colour derived from a
 * person's name would be a fact about them that ICEFALL made up.
 */
function CoverBand({
  profileId,
  name,
  isYou,
  shareUrl,
  onShare,
}: {
  /** The ACCOUNT — what a block row and a report both name. Never the handle. */
  profileId: string;
  name: string;
  isYou: boolean;
  shareUrl: string;
  onShare: () => void;
}) {
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState<null | "done" | "failed">(null);
  const [reporting, setReporting] = useState<string | null>(null);
  /**
   * What the last block or unblock actually did, in the words `social/safety.ts`
   * chose. Never composed here: that module is the only thing that knows
   * whether the row was written and whether the server is yet acting on it.
   */
  const [blockNote, setBlockNote] = useState<string | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const blocked = useIsBlocked(profileId);
  const { enforcement } = useBlocked();

  /*
   * BLOCK AND UNBLOCK, WIRED TO THE CALLS THAT ALREADY WORK.
   *
   * `block()` writes one row to `public.blocks`, which has been live since
   * 20260818090000 — and until 20260903010000 is pushed that row hides nothing,
   * which is why `enforcement` is read and `BLOCK_NOT_ENFORCED_YET` is printed
   * rather than a claim that this person's posts are gone. The module's own
   * sentence is shown for every failure too.
   *
   * WHY IT IS HERE AT ALL NOW. The menu carried neither control, on the stated
   * grounds that nothing in the app wrote a block — a defensible position while
   * nobody could message anybody. Person-to-person messaging changed that: a
   * stranger can now put words in front of somebody, and the person on the
   * receiving end must have somewhere to stop it. This is that somewhere, and
   * `Thread.tsx`'s header links here so it is reachable from the message.
   */
  const toggleBlock = async () => {
    if (blockBusy) return;
    setBlockBusy(true);
    setBlockNote(null);
    const result = blocked.blocked === true ? await unblock(profileId) : await block(profileId);
    setBlockBusy(false);
    if (!result.ok) {
      setBlockNote(result.message);
      return;
    }
    /* WHAT HAPPENED, MATCHED TO WHAT WAS MEASURED. `blocked.blocked` still
       holds the state from BEFORE this call — the shared list has not been
       re-read into this render yet — so it is what says which of the two
       actions ran. */
    setBlockNote(
      blocked.blocked === true
        ? UNBLOCK_DONE
        : result.enforcement === "live"
          ? BLOCK_DONE_LIVE
          : result.enforcement === "not-live"
            ? BLOCK_NOT_ENFORCED_YET
            : BLOCK_DONE_UNMEASURED,
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied("done");
    } catch {
      // A clipboard the browser would not open. Said plainly rather than
      // reporting a copy that did not happen.
      setCopied("failed");
    }
  };

  return (
    <div
      className="relative"
      style={{
        // `Screen` has already applied the safe-area inset to the scroller;
        // pulling it back here is what stops it being counted twice, and lets
        // the band run under the status bar the way the mockup draws it.
        marginTop: `calc(-1 * ${SAFE_TOP})`,
        height: `calc(${BAND_H}px + ${SAFE_TOP})`,
        background:
          "linear-gradient(168deg, var(--ice-slate) 0%, var(--ice-graphite) 52%, var(--ice-obsidian) 100%)",
      }}
    >
      {/* Fades into the canvas at the lower edge rather than stopping at it. */}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-obsidian to-transparent" />

      {/* `subject_id` is a live column on `public.reports`, so a report about a
          PERSON reaches moderation today. The sheet prints where it went. */}
      <ReportSheet
        kind="profile"
        id={reporting}
        title={`Report ${name}`}
        intro="Pick the closest reason, then say what happened."
        onClose={() => setReporting(null)}
      />

      {menu && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => setMenu(false)}
          className="absolute inset-0 z-10 cursor-default"
        />
      )}

      <div
        className="absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5"
        style={{ paddingTop: `calc(${SAFE_TOP} + 12px)` }}
      >
        <HeroCircleButton icon={ChevronLeft} label="Back" onClick={() => navigate(-1)} />

        <div className="relative">
          {/* Not `HeroCircleButton`: a menu trigger has to carry `aria-haspopup`
              and `aria-expanded`, and the primitive takes neither. The classes
              are its classes so the two controls stay one shape. */}
          <button
            type="button"
            aria-label={`More about ${name}`}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => {
              setMenu((v) => !v);
              setCopied(null);
            }}
            className="grid h-9 w-9 place-items-center rounded-full border border-hairline-strong bg-obsidian/70 text-snow backdrop-blur transition-colors hover:border-azure/50"
          >
            <MoreHorizontal size={17} strokeWidth={1.7} />
          </button>

          {menu && (
            <div
              role="menu"
              aria-label="Profile options"
              className="absolute right-0 top-11 w-[214px] overflow-hidden rounded-card border border-hairline-strong bg-graphite/95 backdrop-blur"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onShare();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[13px] text-snow transition-colors hover:bg-slate/60"
              >
                <Share2 size={14} strokeWidth={1.7} className="shrink-0 text-mist" />
                Share profile
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void copy()}
                className="flex w-full items-center gap-2.5 border-t border-hairline px-3.5 py-3 text-left text-[13px] text-snow transition-colors hover:bg-slate/60"
              >
                <Link2 size={14} strokeWidth={1.7} className="shrink-0 text-mist" />
                {copied === "done"
                  ? "Link copied"
                  : copied === "failed"
                    ? "Could not copy"
                    : "Copy link"}
              </button>
              {isYou && (
                <Link
                  to="/profile"
                  onClick={() => setMenu(false)}
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 border-t border-hairline px-3.5 py-3 text-[13px] text-snow transition-colors hover:bg-slate/60"
                >
                  <UserRoundCheck size={14} strokeWidth={1.7} className="shrink-0 text-mist" />
                  Your own profile
                </Link>
              )}
              {/* BLOCK AND REPORT, on your own profile neither of which is a
                  thing you do to yourself. `blocks_not_self` and the report's
                  own subject would both refuse it. */}
              {!isYou && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={blockBusy}
                    onClick={() => void toggleBlock()}
                    className="flex w-full items-center gap-2.5 border-t border-hairline px-3.5 py-3 text-left text-[13px] text-snow transition-colors hover:bg-slate/60 disabled:opacity-60"
                  >
                    <Ban size={14} strokeWidth={1.7} className="shrink-0 text-mist" />
                    {blockBusy
                      ? "Working…"
                      : blocked.blocked === true
                        ? `Unblock ${name}`
                        : `Block ${name}`}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setReporting(profileId);
                    }}
                    className="flex w-full items-center gap-2.5 border-t border-hairline px-3.5 py-3 text-left text-[13px] text-snow transition-colors hover:bg-slate/60"
                  >
                    <Flag size={14} strokeWidth={1.7} className="shrink-0 text-mist" />
                    Report {name}
                  </button>
                </>
              )}

              {/* WHAT THE BLOCK ACTUALLY DID, in the module's words. It sits in
                  the menu rather than in a toast because a person who has just
                  blocked somebody is owed a sentence they can read twice. */}
              {blockNote !== null && (
                <p className="border-t border-hairline px-3.5 py-3 text-[11.5px] leading-relaxed text-mist">
                  {blockNote}
                </p>
              )}
              {/* A block made on a previous visit, on a server that is not yet
                  acting on it. `not-live` only: `unknown` has measured nothing
                  and has nothing to report. */}
              {blocked.blocked === true && blockNote === null && enforcement === "not-live" && (
                <p className="border-t border-hairline px-3.5 py-3 text-[11.5px] leading-relaxed text-mist">
                  {BLOCK_NOT_ENFORCED_YET}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The place, as one line.
 *
 * `location_label` is free text the person typed, so "Chamonix, France" beside a
 * country code of FR would otherwise render "Chamonix, France, France". The
 * country is appended only when the label does not already carry it — a small
 * containment check rather than the blind join `Profile.tsx` can afford on the
 * athlete's own page, where they can see and fix what they wrote.
 */
function placeOf(profile: PublicProfile): string | null {
  const country = countryName(profile.countryCode);
  const label = profile.locationLabel;
  if (!label) return country;
  if (!country) return label;
  return label.toLowerCase().includes(country.toLowerCase()) ? label : `${label}, ${country}`;
}

/**
 * The month and year the account was made, or nothing.
 *
 * `created_at` is `not null` on the table, so the null branch is unreachable
 * while the column stands. It is handled because the alternative to a guard is
 * the string "Invalid Date" printed under a real person's name.
 */
function memberSinceLabel(iso: string): string | null {
  if (!Number.isFinite(new Date(iso).getTime())) return null;
  return fmtDate(iso, { day: undefined, month: "long" });
}

function Identity({
  profile,
  mark,
  isYou,
  follows,
  message,
}: {
  profile: PublicProfile;
  mark: ReturnType<typeof markKindFor>;
  isYou: boolean;
  follows: ReturnType<typeof useFollow>;
  message: MessageOption;
}) {
  const place = useMemo(() => placeOf(profile), [profile]);
  const since = useMemo(() => memberSinceLabel(profile.memberSince), [profile.memberSince]);

  return (
    <div>
      {/* Overlapping the foot of the band, as the mockup draws it. */}
      <div className="-mt-[44px]">
        {/* Keyed on the picture, not the person: navigating to another climber
            is already covered by the route key on `ProfileBody`, but a component
            that remembers "this image failed" must not carry that memory onto a
            DIFFERENT url if one ever arrives without a remount. */}
        <ProfileAvatar key={profile.avatarUrl ?? profile.id} profile={profile} />
      </div>

      <div className="mt-3.5 flex items-start gap-2">
        {/* `min-w-0` + `truncate` on the name and `shrink-0` on the mark: when
            the two cannot both fit, the NAME gives way, never the mark. A
            half-drawn mark reads as a rendering bug; a shortened name reads as
            a long name. */}
        <h1 className="min-w-0 shrink truncate text-[24px] font-light leading-tight text-snow">
          {profile.displayName}
        </h1>
        {/* SERVER-GRANTED ONLY, and picked by `markKindFor` rather than by any
            condition here. White says this person runs ICEFALL; grey says their
            identity was checked and nothing more. Gold — the colour the mockup
            draws — would say ICEFALL checked their climbing credentials, which
            is a claim nobody at ICEFALL has made about anybody. */}
        {mark && <VerificationMark kind={mark} className="mt-0.5" />}

        {/* The two actions, side by side and right-aligned. The group is drawn
            only when it holds something: an empty one still carries `pl-2` and
            would push the name 8px short of the edge for no reason. */}
        {(follows.state.kind === "ready" || message.kind === "open") && (
          <span className="ml-auto flex shrink-0 items-center gap-2 pl-2">
            {follows.state.kind === "ready" && (
              <Button
                variant={follows.state.following ? "secondary" : "primary"}
                size="sm"
                className="rounded-full px-4"
                disabled={follows.busy}
                onClick={() =>
                  void (follows.state.kind === "ready" && follows.state.following
                    ? follows.unfollow()
                    : follows.follow())
                }
              >
                {follows.state.following ? (
                  <UserRoundCheck size={14} strokeWidth={1.8} />
                ) : (
                  <UserRoundPlus size={14} strokeWidth={1.8} />
                )}
                {/* The label says what the state IS, not what the tap will do —
                    "Following" on a quiet control is how every app this athlete
                    already uses reads, and a button saying "Unfollow" is a screen
                    shouting an action at somebody who is only checking. */}
                {follows.busy ? "Saving…" : follows.state.following ? "Following" : "Follow"}
              </Button>
            )}

            {/* MESSAGE. A LINK, not a button with a handler: it navigates and
                nothing more, so it must behave like every other link on the
                phone — long-press, open in a new tab, and a destination the
                browser shows before the tap. `asChild` keeps it the same pill
                as Follow rather than a second shape beside it.

                `secondary` because `primitives.tsx` allows one azure call to
                action per screen and Follow is already it. Not a claim that
                messaging matters less — a second filled pill would just make
                neither of them read as the primary action. */}
            {message.kind === "open" && (
              <Button asChild variant="secondary" size="sm" className="rounded-full px-3.5">
                <Link to={message.to} aria-label={message.label}>
                  <MessageCircle size={14} strokeWidth={1.8} />
                  Message
                </Link>
              </Button>
            )}
          </span>
        )}
      </div>

      {/* No handle line at all when there is no handle. An account created
          through Google or Apple has a session before anybody can be asked to
          choose one, so this is an ordinary state and not a gap — and an id
          dressed up as an `@name` would be a handle nobody can reach them at. */}
      {profile.username !== null && (
        <p className="mt-1 truncate text-[13px] text-mist">@{profile.username}</p>
      )}

      {place !== null && (
        <p className="mt-2.5 flex items-start gap-2 text-[13px] text-mist">
          <MapPin size={14} strokeWidth={1.5} className="mt-[3px] shrink-0 text-azure" />
          {/* Their words for where they are. `profiles` holds no coordinate to
              be more precise with, which is the point. */}
          <span className="min-w-0">{place}</span>
        </p>
      )}

      {/* THE MOCKUP'S BIO LINE IS NOT HERE, and there is no empty slot standing
          in for it. `public.profiles` has no bio column at all — the athlete's
          own bio in `Profile.tsx` is `settings.bio`, in this device's storage —
          so there is nothing to read and no space is held for something that
          does not exist. */}

      {since !== null && (
        <p className="mt-1.5 text-[12px] text-mist-dim">On ICEFALL since {since}</p>
      )}

      {/* NOT a toast. A write that failed has to stay on screen next to the
          control that failed, or the reader is left believing the tap worked. */}
      {follows.error !== null && (
        <p className="mt-3 text-[11px] leading-relaxed text-danger">{follows.error}</p>
      )}
      {follows.state.kind === "ready" && (
        <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">{FOLLOW_MEANING}</p>
      )}

      {/* THE ONE WITHHOLDING WORTH EXPLAINING. Every other reason the Message
          pill is absent draws nothing, because there is no true sentence to
          write — see the "Messaging them" section. A control that vanishes on
          one profile and nowhere else is the case that needs a line. */}
      {message.kind === "withheld" && (
        <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">{message.reason}</p>
      )}

      {isYou && (
        <p className="mt-3 border-t border-hairline pt-3.5 text-[11px] leading-relaxed text-mist-dim">
          This is your own account, as another climber reads it.{" "}
          <Link to="/profile" className="text-azure">
            Your profile
          </Link>{" "}
          is where you can change any of it.
        </p>
      )}
    </div>
  );
}

/**
 * Their picture if they set one, their initials otherwise — never a stock face.
 *
 * `avatar_url` is stored as a displayable URL (this is how `search/people.ts`
 * and `PostCard` both use it), so there is nothing to sign here. A URL that
 * fails to load falls back to the monogram rather than to a broken frame: a
 * grey box on a stranger's profile reads as a person with a broken account.
 *
 * THE MOCKUP'S CORNER MARK IS NOT DRAWN. The drawing puts a small badge on the
 * rim of the avatar, and there is no fact on a profile row shaped like one:
 * every mark ICEFALL grants is a claim about the person, and the ruling puts
 * those beside the NAME where a reader can tap one and be told what it means.
 * A second, smaller, unexplainable mark on the picture would be the private
 * language that ruling exists to prevent.
 */
function ProfileAvatar({ profile }: { profile: PublicProfile }) {
  const [broken, setBroken] = useState(false);

  if (profile.avatarUrl === null || broken) {
    return (
      /* `Avatar` sets its own font size from `size`, so only the rim is
         overridden here — a 3px obsidian edge is what separates the circle from
         the band it overlaps. */
      <Avatar name={profile.displayName} size={92} className="border-[3px] border-obsidian" />
    );
  }
  return (
    <img
      src={profile.avatarUrl}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setBroken(true)}
      className="h-[92px] w-[92px] shrink-0 rounded-full border-[3px] border-obsidian bg-slate object-cover"
    />
  );
}

/* -------------------------------------------------------------------------- */
/* The five figures                                                            */
/* -------------------------------------------------------------------------- */

type FigureKey = "followers" | "following" | "connections" | "summits" | "highest";

/**
 * The five-across strip from the mockup — Followers, Following, Connections,
 * Summits, Highest — of which TWO can be counted and three cannot.
 *
 * EVERY FIGURE CARRIES ITS OWN SENTENCE, reachable by tapping it, and that is
 * what makes an em dash honest rather than mysterious. `VerificationMark`
 * established the idiom on this app: a mark that cannot explain itself is a
 * private language, and a dash that cannot explain itself is the same problem
 * with a number's authority. One line under the card at a time, rather than
 * three paragraphs stacked under a row of five.
 */
function Figures({
  profile,
  summitCount,
  highestM,
}: {
  profile: PublicProfile;
  summitCount: number | null;
  highestM: number | null;
}) {
  const [open, setOpen] = useState<FigureKey | null>(null);

  const figures: {
    key: FigureKey;
    icon: typeof Users;
    label: string;
    value: string;
    unit?: string;
    hint: string;
  }[] = [
    {
      key: "followers",
      icon: Users,
      label: "Followers",
      // `null` is NOT MEASURED and `0` is a measured zero. Both reach this line
      // and only one of them is a number.
      //
      // GROUPED, NOT ABBREVIATED. `toLocaleString("en-GB")` is how every other
      // count in the app is printed (`Health.tsx` uses this exact idiom beside
      // the same em dash), and a bare `String()` put an ungrouped `1243` in the
      // same card as a grouped `3,182 m`. The mockup writes "1.2K" and that is
      // the one thing not copied: 1.2K is 1,150 rounded up or 1,249 rounded
      // down, and a figure this screen went to some trouble to measure exactly
      // should not be handed to the reader with its last two digits guessed.
      value: profile.followerCount === null ? "—" : profile.followerCount.toLocaleString("en-GB"),
      hint:
        profile.followerCount === null
          ? PROFILE_COUNTS_NOT_LIVE
          : "Accounts that follow this one on ICEFALL. Counted on the server; the list of who is not readable.",
    },
    {
      key: "following",
      icon: UserRoundPlus,
      label: "Following",
      value: profile.followingCount === null ? "—" : profile.followingCount.toLocaleString("en-GB"),
      hint:
        profile.followingCount === null
          ? PROFILE_COUNTS_NOT_LIVE
          : "Accounts this one follows. Counted on the server; the list of who is not readable.",
    },
    {
      key: "connections",
      icon: Link2,
      label: "Connections",
      value: "—",
      hint: CONNECTIONS_ARE_LOCAL,
    },
    {
      key: "summits",
      icon: Mountain,
      label: "Summits",
      // Grouped for the same reason, though nobody will reach four figures.
      value: summitCount === null ? "—" : summitCount.toLocaleString("en-GB"),
      hint: SUMMITS_NOT_RECORDED,
    },
    {
      key: "highest",
      icon: MountainSnow,
      label: "Highest",
      value: highestM === null ? "—" : fmtElevation(highestM),
      unit: highestM === null ? undefined : "m",
      hint: SUMMITS_NOT_RECORDED,
    },
  ];

  const shown = figures.find((f) => f.key === open) ?? null;

  return (
    <>
      <Card className="p-3">
        <div className="flex items-start">
          {figures.map((f) => {
            const on = open === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setOpen((cur) => (cur === f.key ? null : f.key))}
                aria-expanded={on}
                className="min-w-0 flex-1 px-[1px] text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite rounded-[8px] py-0.5"
              >
                <f.icon
                  size={13}
                  strokeWidth={1.7}
                  aria-hidden
                  className={cn("mx-auto", on ? "text-azure" : "text-mist-dim")}
                />
                <span className="mt-1.5 flex items-baseline justify-center gap-[2px]">
                  <span className="tnum text-[17px] font-light leading-none tracking-[-0.02em] text-snow">
                    {f.value}
                  </span>
                  {f.unit && <span className="text-[10px] text-mist-dim">{f.unit}</span>}
                </span>
                {/* 8px rather than the mockup's 9: five labels across a 375px
                    handset, and CONNECTIONS is one unbreakable word. It is the
                    label that gives, not the figure above it. */}
                <span
                  className={cn(
                    "mt-1.5 block text-[8px] uppercase leading-[1.3] tracking-[0.02em]",
                    on ? "text-azure" : "text-mist-dim",
                  )}
                >
                  {f.label}
                </span>
                <span className="sr-only">
                  {" — "}
                  {f.hint}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {shown ? (
        <p className="mt-3 border-l border-azure/30 pl-3 text-[11px] leading-relaxed text-mist-dim">
          <span className="text-mist">{shown.label}.</span> {shown.hint}
        </p>
      ) : (
        <p className="mt-2.5 text-center text-[10.5px] text-mist-dim">
          Tap a figure to see where it comes from, or why it is a dash.
        </p>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The graphite row from the mockup: a leading mark, two lines, and either a
 * chevron or nothing.
 *
 * Written here rather than imported because the two versions in this codebase
 * are both private to their screens — `Profile.tsx` has one and
 * `components/settings/kit.tsx` has another with a different lead — and reaching
 * into either is how two sessions end up editing one line.
 */
function ProfileRow({
  icon: Icon,
  eyebrow,
  title,
  detail,
  onClick,
}: {
  icon: typeof Share2;
  eyebrow?: string;
  title: string;
  detail?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-tile border border-azure/35 bg-azure/[0.07] text-azure">
        <Icon size={17} strokeWidth={1.7} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        {eyebrow && <span className="block text-[12px] leading-tight text-azure">{eyebrow}</span>}
        <span className={cn("block truncate text-[15px] text-snow", eyebrow && "mt-0.5")}>
          {title}
        </span>
        {detail && (
          <span className="mt-1 block text-[11.5px] leading-relaxed text-mist-dim">{detail}</span>
        )}
      </span>
    </>
  );

  /* `items-start`, matching `components/settings/kit.tsx`: the objective row
     carries three lines of explanation beside a 44px mark, and centring the
     mark against that leaves it floating in the middle of a paragraph. */
  const className =
    "flex w-full items-start gap-3.5 rounded-card border border-hairline bg-graphite p-3.5 text-left";

  // A row with nothing to do is not a button. The objective row states a fact
  // and has no destination, and a pressable surface that does nothing is the
  // affordance version of a fabricated figure.
  if (!onClick) return <div className={className}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(className, "transition-colors hover:border-azure/45 hover:bg-slate/30")}
    >
      {inner}
    </button>
  );
}

/**
 * MAIN OBJECTIVE — in the mockup, "Gran Paradiso, June 2027".
 *
 * The row is drawn because the section is part of the page and its absence
 * would be silent; the VALUE is a dash because an objective is a `Goal` in this
 * device's localStorage and no server holds anybody's. See
 * `OBJECTIVE_IS_LOCAL` — the sentence is the whole reason a dash here is a
 * statement rather than a gap.
 */
function ObjectiveRow() {
  return (
    <ProfileRow icon={Mountain} eyebrow="Main objective" title="—" detail={OBJECTIVE_IS_LOCAL} />
  );
}

/**
 * SHARE PROFILE — the first of the mockup's two share surfaces.
 *
 * Both are drawn, deliberately: one near the top where somebody decides to pass
 * a climber on, and one at the foot of a long scroll. They share one link, built
 * once in `ProfileBody`, so the two can never drift into pointing at different
 * things.
 */
function ShareRow({
  isYou,
  firstName,
  onShare,
}: {
  isYou: boolean;
  firstName: string;
  onShare: () => void;
}) {
  return (
    <ProfileRow
      icon={Share2}
      title="Share Profile"
      // The mockup's line is written for your own page. On somebody else's it
      // would be claiming their journey as yours to promote.
      detail={isYou ? "Let others follow your journey" : `Send ${firstName}'s page to somebody`}
      onClick={onShare}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The five hexagons, all of them muted, on every profile.
 *
 * NOT A DECISION ABOUT THIS PERSON. `badges/model.ts` holds the five and its
 * rule is that no badge can be granted by this app; the applications it keeps
 * live in `settings`, on the device that applied. THERE IS NO BADGE TABLE IN
 * THE SCHEMA AT ALL — no migration creates one — so there is nothing to read
 * about anybody, and "nobody holds a badge" is a true statement about every
 * account rather than a guess about this one.
 *
 * The shapes are drawn rather than the section being dropped because a badge is
 * a claim ICEFALL would make about somebody to people who might climb with
 * them, and a reader is better served knowing which five exist and that this
 * climber has none than not knowing the system exists. `muted` is
 * `BadgeHex`'s own unearned treatment, the same one the athlete's own profile
 * uses; five LIT hexagons on a profile with no badges would be the fabrication.
 */
function Badges() {
  return (
    <>
      <SectionLabel>Badges</SectionLabel>
      <div className="mt-3.5 flex items-start justify-between gap-1">
        {BADGES.slice(0, 5).map((badge) => (
          <div key={badge.id} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <BadgeHex
              badge={badge}
              size={52}
              tone="azure"
              muted
              className="opacity-70 saturate-[0.4]"
            />
            <span className="text-center text-[10px] leading-[1.25] text-mist-dim">
              {badge.name}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">{BADGES_NONE_GRANTED}</p>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Achievements                                                                */
/* -------------------------------------------------------------------------- */

/**
 * HIGHEST ELEVATION, and the chart of it by year.
 *
 * The mockup fills this with 3,182 m and a five-year line. Both come from the
 * same place and that place does not exist: nothing on ICEFALL's server records
 * a summit for anybody — no table, no column, no writer — and the local summit
 * log and passport never leave the phone that wrote them. `usePublicSummits`
 * therefore answers `null` and an empty series without making a request, and
 * this card prints the dash and the reason.
 *
 * `ElevationProgress` renders NOTHING for an empty series, which is why the
 * message below it is not conditional on the chart: an axis with a flat line
 * along zero would be a picture of a climber who reached sea level five years
 * running.
 */
function Achievements({
  highestM,
  byYear,
  message,
}: {
  highestM: number | null;
  byYear: readonly { year: number; highestM: number }[];
  message: string;
}) {
  return (
    <>
      <SectionLabel>Achievements</SectionLabel>
      <Card className="mt-3.5">
        <div className="flex items-start gap-3">
          <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-tile border border-hairline-strong bg-white/[0.03] text-mist">
            <MountainSnow size={17} strokeWidth={1.6} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-mist-dim">Highest elevation</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="tnum text-[30px] font-light leading-none tracking-[-0.02em] text-snow">
                {highestM === null ? "—" : fmtElevation(highestM)}
              </span>
              {highestM !== null && <span className="text-[13px] text-mist">m</span>}
            </p>
          </div>
        </div>

        {byYear.length > 0 ? (
          <ElevationProgress years={byYear} className="mt-4" />
        ) : (
          <p className="mt-3.5 border-t border-hairline pt-3.5 text-[11.5px] leading-relaxed text-mist-dim">
            {message}
          </p>
        )}
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Recent activity                                                             */
/* -------------------------------------------------------------------------- */

const ACTIVITY_TABS: readonly { id: ActivityTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "posts", label: "Posts" },
  { id: "summits", label: "Summits" },
  { id: "activities", label: "Activities" },
];

/**
 * The mockup's four pills, and the honest contents of each.
 *
 * ALL FOUR ARE DRAWN even though only one can hold anything, because the three
 * empty ones are the answer to a question a reader will otherwise ask silently:
 * a profile that shows posts and nothing else reads as a climber who does not
 * summit. Each empty pill says what ICEFALL holds and does not, in one line,
 * which is the difference between an empty feature and an empty person.
 *
 * "All" and "Posts" render the same list today. That is not a bug to hide — it
 * is what "everything ICEFALL can show about this climber" currently amounts
 * to, and the day a summit or an activity is publishable the pill it belongs
 * under is already here.
 */
function RecentActivity({
  tab,
  onTab,
  posts,
  author,
  isYou,
  onOpenComments,
  onReport,
}: {
  tab: ActivityTab;
  onTab: (tab: ActivityTab) => void;
  posts: PostsState;
  author: Author;
  isYou: boolean;
  onOpenComments: (post: Post) => void;
  onReport: (post: Post) => void;
}) {
  const firstName = author.name.trim().split(/\s+/)[0] || author.name;

  return (
    <>
      {/* NO "VIEW ALL". The mockup has one and there is nowhere for it to go:
          there is no post archive for a climber who is not you, and a link that
          lands on your own page would be worse than none. */}
      <SectionLabel>Recent activity</SectionLabel>

      <div className="no-scrollbar mt-3.5 flex gap-2 overflow-x-auto">
        {ACTIVITY_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            aria-pressed={tab === t.id}
            className={cn(
              "shrink-0 rounded-pill border px-3.5 py-1.5 text-[11.5px] transition-colors",
              tab === t.id
                ? "border-azure/50 bg-azure/[0.10] text-azure"
                : "border-hairline-strong text-mist hover:text-snow",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(tab === "all" || tab === "posts") && (
        <PostStrip
          posts={posts}
          author={author}
          firstName={firstName}
          isYou={isYou}
          onOpenComments={onOpenComments}
          onReport={onReport}
        />
      )}

      {tab === "summits" && <EmptyTab>{SUMMITS_NOT_RECORDED}</EmptyTab>}
      {tab === "activities" && <EmptyTab>{ACTIVITIES_ARE_LOCAL}</EmptyTab>}
    </>
  );
}

function EmptyTab({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[12px] leading-relaxed text-mist-dim">{children}</p>;
}

function PostStrip({
  posts,
  author,
  firstName,
  isYou,
  onOpenComments,
  onReport,
}: {
  posts: PostsState;
  author: Author;
  firstName: string;
  isYou: boolean;
  onOpenComments: (post: Post) => void;
  onReport: (post: Post) => void;
}) {
  if (posts.status === "loading") {
    /* A sentence, not a skeleton. A grey card where a post goes is a drawing of
       something that may not exist, on a screen whose whole premise is that it
       does not draw what it has not read. */
    return <EmptyTab>Reading their posts…</EmptyTab>;
  }

  if (posts.status === "no-backend") {
    return (
      <EmptyTab>
        ICEFALL is not connected to a server in this build, so there are no posts to read. Nothing
        is missing from this page — nothing was asked for.
      </EmptyTab>
    );
  }

  if (posts.status === "unreadable") return <EmptyTab>{posts.message}</EmptyTab>;

  if (posts.rows.length === 0) {
    return (
      <EmptyTab>
        {isYou
          ? "You have posted nothing yet. This is what another climber sees on your page."
          : `${firstName} has not posted anything. ICEFALL asked and got an answer, so this is an empty page rather than a page that would not load.`}
      </EmptyTab>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {postsOf(posts.rows, author).map((post) => (
        <PostCard key={post.id} post={post} onOpenComments={onOpenComments} onReport={onReport} />
      ))}
      {posts.truncated && (
        <p className="text-[11px] text-mist-dim">
          Their {POSTS_LIMIT} most recent. A profile is a page rather than an archive, and ICEFALL
          has no full history of another climber to open.
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-mist-dim">{LIKE_NOTICE}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Share, again                                                                */
/* -------------------------------------------------------------------------- */

/** The mockup's second share surface, at the foot of the scroll. Same link. */
function ShareCard({
  isYou,
  firstName,
  onShare,
}: {
  isYou: boolean;
  firstName: string;
  onShare: () => void;
}) {
  return (
    <Card>
      <p className="text-[15px] text-snow">Share this profile</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
        {isYou
          ? "Invite others to follow your journey. The link opens this page, and shows exactly what you can see here."
          : `Send ${firstName}'s page to somebody. The link opens this page and shows what you can see here — nothing private travels with it.`}
      </p>
      <Button variant="secondary" className="mt-3.5 w-full" onClick={onShare}>
        <Share2 size={15} strokeWidth={1.8} />
        Share
      </Button>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The shape of what is missing                                                */
/* -------------------------------------------------------------------------- */

/**
 * What this page can and cannot say, in the app's own voice.
 *
 * It is not an apology and it is not padding: the second half — that nothing was
 * estimated to fill the gaps — is the part a reader cannot check for themselves,
 * and it is the whole difference between a sparse profile and a profile whose
 * numbers you should not trust. The copy is `PUBLIC_PROFILE_LIMITS`, imported
 * rather than retyped, so this page and the module that does the read cannot end
 * up making different claims about what ICEFALL knows.
 */
function WhatIsNotHere({ isYou }: { isYou: boolean }) {
  return (
    <Card>
      <SectionLabel>What ICEFALL can show you</SectionLabel>
      <p className="mt-3 text-[12px] leading-relaxed text-mist">{PUBLIC_PROFILE_LIMITS}</p>
      {!isYou && (
        <Disclaimer className="mt-4">
          Nothing on this page has been checked by ICEFALL — not their name, not their experience,
          not where they say they are. Ask directly about what somebody has actually done and who
          they did it with before you plan anything with them.
        </Disclaimer>
      )}
    </Card>
  );
}

/**
 * The mockup's footer, and one of the truest lines on the page.
 *
 * Everything above it was written by the person whose page this is: their name,
 * their handle, their location, their words. ICEFALL has checked none of it and
 * verifies no achievement — which is exactly why the summit figures are dashes
 * rather than numbers, and why saying so at the foot of the scroll is the
 * summary rather than a disclaimer bolted on.
 */
function ControlledBy({ firstName, isYou }: { firstName: string; isYou: boolean }) {
  return (
    <p className="flex items-start justify-center gap-2 px-4 text-center text-[10.5px] leading-relaxed text-mist-dim">
      <ShieldCheck size={13} strokeWidth={1.6} aria-hidden className="mt-[1px] shrink-0" />
      <span>
        Profile content is controlled by {isYou ? "you" : firstName}. ICEFALL does not verify
        achievements.
      </span>
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * NO SKELETON OF A PERSON. A grey oval where a face goes and two grey bars where
 * a name goes is a drawing of somebody who may not exist — and on a screen
 * reached by tapping a search result, half of which resolve to nobody, it is a
 * drawing that will frequently be wrong. A sentence costs the same and claims
 * nothing.
 */
function LookingUp() {
  return (
    <Screen>
      <ScreenHeader title="Climber" back />
      <Card>
        <p className="text-[13px] text-mist">Looking this climber up…</p>
      </Card>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Nobody                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The server was asked, and answered that there is nobody.
 *
 * CALM, NOT AN ERROR. This is a real answer and a common one — handles change,
 * links get old, accounts are deleted — so it reads as a fact about the link
 * rather than as a fault. It is also the ONLY state on this screen permitted to
 * say "nobody": everything that means "ICEFALL could not find out" goes to
 * `CouldNotLook` instead, because telling somebody their friend has no account
 * every time hut wifi drops is the failure this whole module was built to avoid.
 */
function NoClimberHere({ message }: { message?: string }) {
  /**
   * TWO WAYS OF BEING NOBODY, AND THEY MUST NOT SHARE A SENTENCE.
   *
   * The usual one is an answer: the server was asked and said no account holds
   * that id or handle. The other is decided WITHOUT ASKING ANYBODY —
   * `publicProfile.ts` checks the link's shape against the uuid type and the
   * `profiles_username_shape` CHECK first, and a string that satisfies neither
   * cannot be any account's, in any build, connected or not. Printing "ICEFALL
   * asked its server" under that one would be this screen claiming a round trip
   * that never happened, on the exact page whose whole premise is that it does
   * not claim things it has not done.
   *
   * The message identity is the discriminator because it is the only signal
   * that crosses the boundary — `state` is `not-found` for both — and both
   * constants are exported from the module that decides which it was.
   */
  const malformedLink = message === PROFILE_LINK_MALFORMED;

  return (
    <Screen>
      <ScreenHeader title="Climber" back />
      <Card>
        <p className="text-[15px] text-snow">No climber here</p>
        {message !== undefined && (
          <p className="mt-2.5 text-[12px] leading-relaxed text-mist">{message}</p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
          {malformedLink
            ? "Nothing was asked of the server for this one: no ICEFALL account can hold a value of that shape, so it is the link that is wrong rather than a person who is missing."
            : "ICEFALL asked its server and got an answer, so this is not a connection problem — there is genuinely no account behind this link."}
        </p>
        <Link to="/social?tab=people" className="mt-4 block">
          <Button variant="secondary" className="w-full">
            Search for people
          </Button>
        </Link>
      </Card>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Could not ask                                                               */
/* -------------------------------------------------------------------------- */

/**
 * ICEFALL could not find out — and WHICH of the two reasons it was.
 *
 * `no-backend` is a fact about this build and will not change by trying again,
 * so it gets no retry. `unreachable` is a request that did not come back, which
 * is exactly the thing a second tap can fix, so it gets one. Neither says
 * anything about whether the account exists, because neither knows.
 */
function CouldNotLook({
  state,
  message,
  onRetry,
}: {
  state: PublicProfileState;
  message?: string;
  onRetry: () => void;
}) {
  const noBackend = state === "no-backend";

  return (
    <Screen>
      <ScreenHeader title="Climber" back />
      <Card>
        <p className="text-[15px] text-snow">
          {noBackend ? "Not connected to a server" : "Could not look this climber up"}
        </p>
        {message !== undefined && (
          <p className="mt-2.5 text-[12px] leading-relaxed text-mist">{message}</p>
        )}
        {!noBackend && (
          <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
            This is not “no such climber”. The account has not been checked at all, so nothing here
            should be read as a fact about the person you were looking for.
          </p>
        )}

        {noBackend ? (
          <Link to="/social?tab=people" className="mt-4 block">
            <Button variant="secondary" className="w-full">
              Back to people
            </Button>
          </Link>
        ) : (
          <Button variant="secondary" className="mt-4 w-full" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Card>
    </Screen>
  );
}
