import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Button, Card, Disclaimer } from "@/components/ui/primitives";
import { CommentThread } from "@/components/domain/CommentThread";
import { OwnPostCard } from "@/components/domain/PostComposer";
import { SummitLogCard } from "@/components/domain/SummitLogKit";
import { PostCard } from "@/components/social/PostCard";
import { PostThread } from "@/components/social/Comments";
import { ReportDialog } from "@/components/social/ReportDialog";
import {
  POST_LINK_MALFORMED,
  usePostSubject,
  type PostLookupState,
  type PostSubject,
} from "@/social/posts";
import {
  COMMUNITY_DEMO_NOTICE,
  SHOW_DEMO_COMMUNITY,
  communityPosts,
  feedDetail,
  feedPost,
  type CommunityPostDetail,
} from "@/social/community";
import type { Post } from "@/social/types";
import { useRecordedActivities } from "@/tracking/feed";
import { useSettings } from "@/settings/store";
import { useApp } from "@/state/AppState";

/**
 * One post, with its conversation.
 *
 * The card is the same component the feed renders — a detail view that
 * re-implements the card is a detail view that will disagree with the feed
 * within a month. What the detail page adds is the thread.
 *
 * Both kinds of subject resolve here: a summit log and a general post share a
 * URL space (`/social/post/:id`) because from the athlete's side they are both
 * "a thing I posted that people can reply to".
 *
 * ── AND NOW SOMEBODY ELSE'S POST, WHICH IS WHY THE LINKS EXIST ───────────────
 *
 * This page used to read `useOwnPosts()` and `useSummitLogs()` and nothing
 * else, which meant it could only ever open the phone owner's own words: every
 * other post redirected silently back to the feed. `PostCard` now links a post
 * to this route (the owner's 3 Sep ruling — the byline opens the person, the
 * post opens the post), and a link that bounces is worse than no link.
 *
 * It was not hypothetical even before the cards were linked. TWO SHIPPED LINKS
 * ALREADY POINTED HERE WITH SERVER IDS and both bounced: `Notifications.tsx`
 * ("somebody liked your post") and `PublishSummit.tsx`'s stranded-post link,
 * which is the one place a climber is sent to look at a post ICEFALL could not
 * finish writing.
 *
 * THREE SUBJECTS, THREE SOURCES, AND THEY ARE NOT INTERCHANGEABLE. A local own
 * post and a summit log live on this device; a `posts` row lives on the server
 * and carries a byline that is not necessarily the reader's. So the server
 * branch draws the FEED's card and the FEED's thread — `PostThread` picks the
 * server conversation for a server row — rather than the device-local thread
 * the two local branches use. Writing a comment here and finding it missing
 * from the sheet the feed opens would be one post with two threads.
 *
 * ── AND A FOURTH, ADDED 2026-09-13 SO THE FEED'S OWN TAP HAS SOMEWHERE HONEST
 * TO LAND ────────────────────────────────────────────────────────────────────
 *
 * `explore/Community.tsx`'s feed is demo content until posting ships (see that
 * file's own header) — invented ids like `p-summit-1` that `postIdKind` (in
 * `@/social/posts`, not this file's to change) correctly calls `unknown`,
 * because no server row and no device store could ever hold one. Before this,
 * that was indistinguishable from a genuinely bad link: both resolved to
 * `gone`. The Feed tapping through to "No post here" on every card it shows —
 * OWNER'S RULING, 2026-09-13, "when you click on the post… same way you click
 * a post on x" — would have been ICEFALL calling its own visible feed broken.
 *
 * So `gone` is now checked against the demo feed FIRST, and only a
 * `POST_LINK_MALFORMED` miss there falls through to the honest empty page
 * below. `feedPost`/`feedDetail` (`@/social/community`) are the SAME adapter
 * the feed itself renders through — reused, not re-implemented, so a demo
 * post cannot read one way in the feed and another way here. It draws through
 * `PostCard` exactly like a `server` subject, says so with the feed's own
 * demo notice, and gets a DEVICE-LOCAL comment thread rather than
 * `PostThread` — there is no `posts` row behind it for a real comment to
 * attach to, so this is the same honest fallback the two local subjects
 * already use, not a fourth thread implementation.
 *
 * WHY THIS IS NOT A FIFTH CASE OF THE "GONE" TABLE BELOW. It is not a new
 * meaning for an empty page; it is a fact this module could not have known
 * about a link's own id shape until asked to render one the Feed actually
 * shows. `SHOW_DEMO_COMMUNITY` (and therefore `communityPosts()`) is `[]` in
 * a build with a real feed, so this whole branch is inert there and `gone`
 * keeps meaning exactly what the table says.
 *
 * ── THIS SCREEN DECIDES NOTHING ──────────────────────────────────────────────
 *
 * What is behind an id, and what ICEFALL may honestly say about it, is
 * `usePostSubject` in `@/social/posts`. A device id is answered from the device
 * with NO REQUEST AT ALL, and a server read that comes back empty is not
 * reported as a post that does not exist. This file is a renderer, and every
 * sentence it prints comes from that module, so the page and the read cannot
 * make different promises about the same empty screen.
 *
 * ── FIVE EMPTY PAGES, FIVE DIFFERENT THINGS TO SAY ───────────────────────────
 *
 *   loading      "Opening this post…"
 *   gone         "No post here" — a real answer, and shown only where it is
 *                CERTAIN: an id no post could hold, or a device post this
 *                phone's own store does not have. Nothing was asked of the
 *                server for either, and the page says so rather than claiming a
 *                round trip it never made.
 *   withheld     "This post is not showing" — the server answered and did not
 *                hand it over. Deleted, an ended story, or a block: row-level
 *                security returns the same empty result for all three, so this
 *                page names all three and picks none.
 *   unreachable  "Could not open this post" — ICEFALL could not ask, or asked
 *                and got no usable answer. NEVER dressed as an answer about the
 *                post. Telling a climber their partner's conditions report was
 *                deleted when the truth is that the hut wifi went quiet is the
 *                failure this app is built against, and it is one `if` away at
 *                every branch here.
 *   no-backend   "Not connected to a server" — nothing was asked, and no post
 *                has been invented to fill the space.
 *
 * NOTHING REDIRECTS ANY MORE. A `<Navigate>` was what this screen did with
 * every post it could not resolve, and it is the one response that tells the
 * reader nothing at all: no sentence, no back button, and no way to tell a
 * deleted post from a dead network. A page that says which of the five it is
 * costs one card.
 */
export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  /**
   * `attempt` is a retry that costs nothing structurally: bumping it remounts
   * the body, and `usePostSubject` reads once per id. Keyed on the route
   * parameter too, so walking from one post to another clears the previous
   * one's state rather than leaving somebody else's words under a new header.
   */
  const [attempt, setAttempt] = useState(0);
  const param = id ?? "";

  return (
    <PostBody key={`${param}#${attempt}`} id={param} onRetry={() => setAttempt((n) => n + 1)} />
  );
}

/**
 * `PostSubject` (from `@/social/posts`, not this file's to widen) plus the
 * fourth case that module cannot know about: a demo Feed post, adapted
 * exactly the way `explore/Community.tsx` adapts it. See the module doc's
 * fourth-subject section above for why this lives here rather than there.
 */
type Resolved = PostSubject | { kind: "demo"; post: Post; detail: CommunityPostDetail };

function PostBody({ id, onRetry }: { id: string; onRetry: () => void }) {
  const { subject, state, message } = usePostSubject(id);
  const recorded = useRecordedActivities();
  const { user } = useApp();
  const { settings } = useSettings();
  const [reporting, setReporting] = useState<string | null>(null);
  const still = useReducedMotion();
  const thread = useRef<HTMLDivElement>(null);
  const location = useLocation();

  /**
   * THE BACK BUTTON HAS TO SURVIVE A COLD OPEN, which is now an ordinary way to
   * arrive: a notification opens this URL directly, and so does a shared link.
   * `location.key` is `"default"` exactly when this is the router's first entry
   * — nothing inside the app to go back to — and a plain `navigate(-1)` there
   * either does nothing or leaves ICEFALL altogether. Every other arrival goes
   * back where the reader actually came from, which matters now that a post
   * opens from the feed, from a profile and from a notification.
   */
  const back = location.key === "default" ? "/social" : true;

  const me = {
    name: user.name,
    region: settings.region || user.homeBase || undefined,
    avatar: settings.avatar,
  };

  /* Frozen at mount, same reasoning as the feed's own `now` in
     `explore/Community.tsx`: recomputing it every render would move a demo
     post's "3h ago" forward as the page re-renders. Computed unconditionally
     because hooks cannot sit behind the `if`s below. */
  const [now] = useState(() => Date.now());

  /**
   * The fourth subject. Only ever consulted where `usePostSubject` has
   * already ruled the id neither a server uuid nor a device id — a `gone`
   * whose message is specifically `POST_LINK_MALFORMED` — and empty in any
   * build with no demo feed to match against (`communityPosts()` is `[]`
   * there). See the module doc above for the reasoning in full.
   */
  const demoPost = useMemo(() => {
    if (subject || state !== "gone" || message !== POST_LINK_MALFORMED) return null;
    return communityPosts().find((p) => p.id === id) ?? null;
  }, [subject, state, message, id]);

  const resolved: Resolved | null =
    subject ??
    (demoPost ? { kind: "demo", post: feedPost(demoPost, now), detail: feedDetail(demoPost) } : null);

  if (state === "loading") return <OpeningPost back={back} message={message} />;
  if (!resolved) return <NoPost state={state} message={message} onRetry={onRetry} back={back} />;

  /**
   * The card's comment control scrolls to the thread rather than opening one:
   * the conversation is already below, and a sheet stacked over the post being
   * discussed is both an overlay and a second copy of something three inches
   * further down the page.
   */
  const toThread = () =>
    thread.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title={titleFor(resolved)} back={back} />
      </div>

      {/* `Stagger` animates its DIRECT CHILDREN ONLY — a wrapper between it and
          these two would leave the whole page sitting at opacity 0. */}
      <Stagger className="px-5 pb-8">
        <Rise>
          {resolved.kind === "device-post" ? (
            <OwnPostCard post={resolved.post} author={me} recorded={recorded} />
          ) : resolved.kind === "device-log" ? (
            <SummitLogCard log={resolved.log} author={me} />
          ) : (
            <>
              <PostCard
                post={resolved.post}
                detail={resolved.kind === "demo" ? resolved.detail : undefined}
                onOpenComments={toThread}
                onReport={(post) => setReporting(post.id)}
              />
              {/* Said on the card's own page, not only back on the feed it came
                  from — a reader who arrived here from a notification or a
                  shared link never saw the feed's own notice. */}
              {resolved.kind === "demo" && SHOW_DEMO_COMMUNITY && (
                <Disclaimer className="mt-3">{COMMUNITY_DEMO_NOTICE}</Disclaimer>
              )}
            </>
          )}
        </Rise>

        <Rise className="pt-6">
          <div ref={thread} className="space-y-3.5 scroll-mt-4">
            {resolved.kind === "server" ? (
              /* The real thread, from `post_comments`, through the same
                 component the feed's own detail links resolve to — same
                 test, same rows, and a reply lands in the same place from
                 either screen. */
              <PostThread post={resolved.post} />
            ) : (
              /* Neither a post written on this phone nor a demo post has a
                 server row for a comment to hang off, so both keep the
                 device-local thread the two local subjects have always used
                 — the same honest fallback, not a fourth implementation. */
              <CommentThread subjectId={id} me={me} />
            )}
          </div>
        </Rise>
      </Stagger>

      {/* Keyed by post id and empty until one is set. A post you wrote on this
          phone has nobody to report it to, so only the `PostCard` branches
          above — `server` and `demo` — raise this; the two device branches
          never do. `reports` taking a post id it cannot honour for a demo id
          is the same thing the feed's own Report control already lives with
          today, unchanged by this page. */}
      <ReportDialog postId={reporting} onClose={() => setReporting(null)} />
    </Screen>
  );
}

/** A summit log says so in the header; everything else is a post. */
function titleFor(resolved: Resolved): string {
  return resolved.kind === "device-log" ? "Summit log" : "Post";
}

/* -------------------------------------------------------------------------- */
/* The empty pages                                                             */
/* -------------------------------------------------------------------------- */

/**
 * No answer yet — and it SAYS no answer yet.
 *
 * A blank page reads as an empty post, which is a claim. One line costs nothing
 * and is the whole difference between "still asking" and "there is nothing
 * here".
 */
function OpeningPost({ back, message }: { back: boolean | string; message?: string }) {
  return (
    <Screen>
      <ScreenHeader title="Post" back={back} />
      <Card>
        <p className="flex items-center gap-2.5 text-[12.5px] text-mist-dim">
          <Loader2 size={14} strokeWidth={1.8} className="animate-spin" aria-hidden />
          Opening this post…
        </p>
        {message !== undefined && (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-mist-dim">{message}</p>
        )}
      </Card>
    </Screen>
  );
}

/**
 * The four ways this page can be empty, kept apart on purpose.
 *
 * `gone` is the ONLY one permitted to say there is no post, and the module only
 * reaches it where that is certain. Everything meaning "ICEFALL could not find
 * out" — a dead network, a refusal, a lapsed session, a build with no server —
 * lands on `unreachable` and says so. `withheld` sits between the two: a real
 * answer that declines to guess which of its three causes applied.
 *
 * ONE CONTROL PER PAGE. Cold and gloved at 4 a.m., two targets that do
 * different things must not be a thumb's width apart, and none of these states
 * needs a second one: only a failed read is worth trying again, and a `gone` or
 * a `withheld` would not change if it were.
 */
function NoPost({
  state,
  message,
  onRetry,
  back,
}: {
  state: PostLookupState;
  message?: string;
  onRetry: () => void;
  back: boolean | string;
}) {
  const gone = state === "gone";
  const withheld = state === "withheld";
  const noBackend = state === "no-backend";

  const title = gone
    ? "No post here"
    : withheld
      ? "This post is not showing"
      : noBackend
        ? "Not connected to a server"
        : "Could not open this post";

  /**
   * The second line says what KIND of answer the first one is: the message
   * above says what happened, this says how much weight to put on it.
   *
   * The two `gone` variants are told apart by the message identity, the way
   * `AthleteProfile` tells its two apart — it is the only signal that crosses
   * the boundary, and both constants come from the module that decided which.
   */
  const footnote = gone
    ? message === POST_LINK_MALFORMED
      ? "Nothing was asked of ICEFALL's server for this one: no post could hold an id of that shape, so it is the link that is wrong rather than a post that is missing."
      : "Nothing was asked of ICEFALL's server for this one either. A post written in ICEFALL stays on the phone that wrote it, so this phone's own store is the whole of the answer."
    : withheld
      ? "This is an answer rather than a failed request — ICEFALL asked, and the server replied. What it will not do is pick one of those three reasons and hand it to you as the fact."
      : noBackend
        ? null
        : "This is not “no post here”. Nothing has been checked, so nothing on this page should be read as a fact about the post or about whoever wrote it.";

  return (
    <Screen>
      <ScreenHeader title="Post" back={back} />
      <Card>
        <p className="text-[15px] text-snow">{title}</p>
        {message !== undefined && (
          <p className="mt-2.5 text-[12px] leading-relaxed text-mist">{message}</p>
        )}
        {footnote && <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">{footnote}</p>}

        {state === "unreachable" ? (
          <Button variant="secondary" className="mt-4 w-full" onClick={onRetry}>
            Try again
          </Button>
        ) : (
          <Button asChild variant="secondary" className="mt-4 w-full">
            <Link to="/social">Back to Social</Link>
          </Button>
        )}
      </Card>
    </Screen>
  );
}
