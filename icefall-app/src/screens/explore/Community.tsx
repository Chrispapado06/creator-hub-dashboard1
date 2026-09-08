import { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  Flag,
  Mountain as MountainIcon,
  PenLine,
  Plus,
  Route as RouteIcon,
  Search as SearchIcon,
  ShieldCheck,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { Avatar, Disclaimer, sharePage } from "@/components/ui/primitives";
import { LogSummitSheet } from "@/components/domain/SummitLogKit";
import { CreatePostSheet } from "@/components/domain/PostComposer";
import { Sheet, SheetRow } from "@/components/ui/Sheet";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Comments } from "@/components/social/Comments";
import { Composer } from "@/components/social/Composer";
import { PostCard, type PostDetail } from "@/components/social/PostCard";
import { ReportDialog } from "@/components/social/ReportDialog";
import {
  DEMO_PROMOTIONS,
  StoryRail,
  demoMayStandIn,
  type PromotedPlacement,
} from "@/components/social/StoryRail";
import { StoryViewer } from "@/components/social/StoryViewer";
import {
  COMMUNITY_DEMO_NOTICE,
  COMMUNITY_HOUSE_RULE,
  FEED_FILTERS,
  SHOW_DEMO_COMMUNITY,
  communityPosts,
  type FeedFilter,
} from "@/social/community";
import {
  PROMOTED_DISMISS_IS_FOREVER,
  inAppImage,
  toStoryPlacement,
  usePromotedFeedPlacements,
} from "@/social/promoted";
import { interleaveFeed } from "@/social/promotedSlides";
import { CREATE_OPTIONS, type CommunityPost, type Post, type PostKind } from "@/social/types";
import { searchSocial } from "@/social/search";
import { useFollowing } from "@/profile/following";
import { useApp } from "@/state/AppState";

/**
 * SOCIAL → FEED. (It was EXPLORE → SOCIAL → COMMUNITY; Social left Explore on
 * 2026-09-03 and the tab is labelled "Feed", though its query value is still
 * `community` so old links resolve.)
 *
 * A feed of mountain activity, not a timeline. Every post is anchored to a
 * mountain and a date, because that is the only reason two people on this app
 * have anything to say to each other.
 *
 * Four things are deliberately absent, and their absence is the design:
 *
 *   · No follower or following counts, and no ranking of people.
 *   · No message button. Communication happens inside a group, between people
 *     who have agreed to be in one — see the house rule below.
 *   · No exact location, ever. Authors carry a band ("Around Chamonix"); the
 *     model has no field for a coordinate, so no card can leak one.
 *   · No age. Profiles use bands where they need age at all.
 *
 * ── THE CARD IS NOW THE SERVER'S CARD ────────────────────────────────────────
 *
 * This screen used to draw its own post card: a kind chip, a stats row, a
 * milestone ring, a route-report table. `@/social/types` explains at length why
 * none of that survives contact with `public.posts` — the table is a body, an
 * optional media reference and a timestamp, with no column for a taxonomy — so
 * the feed renders `components/social/PostCard`, which is built on the row that
 * will actually arrive, and `feedPost` below adapts the demo content into it.
 *
 * WHAT THE ADAPTER DROPS IS THE POINT. The demo posts' figures ("+1,420 m",
 * "4 of 6", "80% ready") have nowhere to live on a real post, and carrying them
 * into a card the server will one day fill would mean the card had to invent
 * them the day it stopped being demo content. The words survive; the invented
 * taxonomy does not. Same conversion `StoryRail.demoPostAsStory` already makes,
 * for the same reason.
 *
 * ── LIKES, AND WHAT A LIKE CURRENTLY IS ──────────────────────────────────────
 *
 * There is no likes table — `20260831190000_social.sql` ships posts, comments,
 * follows and promoted placements and nothing else — so a like is the reader's
 * own mark, held for this session, sent nowhere, and no author is told. That is
 * exactly the one like ICEFALL can vouch for, which is why `LIKE_NOTICE` sits
 * under the feed saying so rather than letting a heart imply an audience. It is
 * deliberately NOT written to the device: a like that survived the session
 * would start reading as a record ICEFALL kept, and it keeps none.
 */

/**
 * How many posts pass between promoted placements.
 *
 * The owner's instruction was advertising "a little bit" — so one placement per
 * six posts, and never on the end of the feed. The "never last" rule is the
 * same one the story run uses: a scroll that finishes on an advertisement
 * finishes on the one card the athlete did not come for.
 */
const POSTS_BETWEEN_PROMOTIONS = 6;

const LIKE_NOTICE =
  "Liking a post marks it for you, for this session. ICEFALL has no likes table yet, so nothing is sent, no author is told, and no total is kept — the only like this app can stand behind is your own.";

/* -------------------------------------------------------------------------- */
/* The demo feed, read as the rows it would have been                         */
/* -------------------------------------------------------------------------- */

/**
 * One demo post as a `posts` row.
 *
 * WORDS ARE CARRIED, FIGURES ARE NOT. `posts.body` is one NOT NULL text column,
 * so the title, the body and a route report's note — all of them sentences
 * somebody wrote — are joined into it. The stats, the bullets, the milestone
 * percentage and the group's "4 of 6" are dropped: they are structured claims
 * with no column behind them, and a card that renders them today is a card that
 * has to invent them tomorrow.
 *
 * `likeCount` and `commentCount` are left UNDEFINED rather than carrying the
 * demo's own `likes: 32` / `comments: 6`. `undefined` means NOT COUNTED and
 * prints nothing; a printed 32 above a thread that opens empty is the app
 * contradicting itself in two taps.
 */
/**
 * The mockup's extras, lifted off the community row.
 *
 * The title comes OUT of the body here — `feedPost` used to fold it in with
 * the prose, which is why the drawing's headline ("Morning vertical session")
 * had nowhere to be set apart from the words under it.
 */
function feedDetail(post: CommunityPost): PostDetail {
  return {
    chip: POST_KIND_CHIP[post.kind],
    title: post.title,
    // "Mont Blanc · July 2026" — the objective, exactly as the mockup writes it.
    subtitle: `${post.objective.mountain} · ${post.objective.when}`,
    stats: post.stats,
  };
}

/** The chip the mockup puts above the headline, one word per kind of post. */
const POST_KIND_CHIP: Record<CommunityPost["kind"], string> = {
  activity: "Activity",
  summit: "Summit",
  "route-report": "Conditions",
  "looking-for-partners": "Partners",
  milestone: "Milestone",
  group: "Group",
};

function feedPost(post: CommunityPost, now: number): Post {
  const words = [post.body, post.report?.note].filter(Boolean).join("\n\n");
  return {
    id: post.id,
    author: {
      id: post.author.id,
      name: post.author.name,
      // `Author.location` is a label somebody typed, never a coordinate — and
      // the demo model's band ("Around Chamonix") is already exactly that.
      location: post.author.region,
      avatarUrl: post.author.avatar,
      kind: "profile",
    },
    body: words,
    media: post.photo ? { url: post.photo } : undefined,
    createdAt: new Date(now - post.hoursAgo * 3_600_000).toISOString(),
    // The demo rows carry both, and the mockup shows both. `PostCard` prints
    // nothing for a zero, so an unengaged post stays clean.
    likeCount: post.likes,
    commentCount: post.comments,
  };
}

type FeedItem = { kind: "post"; post: Post } | { kind: "promoted"; placement: PromotedPlacement };

/**
 * Lays the promotions into the scroll: one every N posts, never on the end.
 *
 * THE ARITHMETIC IS NOT HERE ANY MORE. It used to be, in a second copy of the
 * loop the story run keeps — which is how a "never last" rule ends up true on
 * one surface and false on the other after somebody edits one of them.
 * `interleaveFeed` is that rule once, and it holds "never first" and "never two
 * in a row" structurally rather than by checking for them: a promotion is only
 * ever emitted AFTER a post, and the counter runs over POSTS, so however many
 * placements are available they cannot bunch.
 *
 * The cadence stays on this screen, in `POSTS_BETWEEN_PROMOTIONS`, with the
 * owner's "a little bit" written above it. How often this app shows
 * advertisements is not a question a helper function gets to answer.
 *
 * THE POSTS PASSED IN ARE THE FILTERED ONES, which is the one thing the caller
 * owes: a promotion placed against the unfiltered list lands at the wrong count,
 * and on a filter that matched two posts it lands on the end.
 */
function withPromotions(posts: Post[], placements: readonly PromotedPlacement[]): FeedItem[] {
  return interleaveFeed(posts, placements, { every: POSTS_BETWEEN_PROMOTIONS }).items;
}

/* -------------------------------------------------------------------------- */
/* Community                                                                  */
/* -------------------------------------------------------------------------- */

export default function Community() {
  /* The filter and the create request both arrive from the Social header's
     Instagram row via the URL — see `FeedMenu` and the + in Social.tsx. */
  const [params, setParams] = useSearchParams();
  const feedRaw = params.get("feed");
  const filter: FeedFilter = FEED_FILTERS.some((f) => f.id === feedRaw)
    ? (feedRaw as FeedFilter)
    : "for-you";
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState<Post | null>(null);
  useEffect(() => {
    if (params.get("create") !== "1") return;
    setCreating(true);
    const next = new URLSearchParams(params);
    next.delete("create");
    setParams(next, { replace: true });
  }, [params, setParams]);
  const [composing, setComposing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [posting, setPosting] = useState(false);
  const [storyAt, setStoryAt] = useState<number | null>(null);
  const [commenting, setCommenting] = useState<Post | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  /** The reader's own likes. Session-only, on purpose — see the header. */
  const [liked, setLiked] = useState<ReadonlySet<string>>(() => new Set<string>());

  const { goals, currentTier } = useApp();
  const { people: saved } = useFollowing();

  /**
   * Frozen at mount rather than read per render.
   *
   * The demo posts carry an age ("2 hours ago"), not an instant, so the instant
   * has to be computed — and recomputing it every render would move every post
   * forward in time as the screen re-rendered, which is how a feed starts
   * showing "just now" on a post that was two hours old a keystroke ago.
   */
  const [now] = useState(() => Date.now());

  const results = useMemo(() => searchSocial(query), [query]);
  const searching = results.ran;

  const all = useMemo(() => communityPosts(), []);

  /* The mockup's chip, headline and stat trio, keyed by post id. Built from the
     same rows the feed is built from, so the two cannot drift apart. */
  const details = useMemo(() => new Map(all.map((p) => [p.id, feedDetail(p)] as const)), [all]);
  /** Whether the FEED is empty, as distinct from this filter matching nothing. */
  const feedEmpty = all.length === 0;

  /**
   * The mountains this athlete has set as objectives.
   *
   * READ FROM `goals`, NOT FROM `objectives`, AND THE DIFFERENCE MATTERS. The
   * `objectives` list in `AppState` is SEEDED with every curated ICEFALL
   * mountain on first run, so filtering on it would match nearly everything and
   * "My Mountains" would silently become a second copy of the main feed. `goals`
   * is what the athlete actually named — at onboarding or by adding one — which
   * is what the owner's "mountains you set as goals" means.
   *
   * COMPLETED GOALS COUNT. The tab is My Mountains, not My Objectives, and a
   * peak you summited is still yours — `usePrimaryGoal` filters to active
   * because the coach can only train you for something ahead of you, and that
   * is a different question from which mountains you want to read about.
   *
   * THE MATCH IS EXACT, on purpose. A goal named "Mount Olympus" does not pull
   * in a post about "Olympus", and it should not start to: a fuzzy mountain
   * match is how a feed quietly shows somebody the wrong peak, which this app
   * has already been bitten by once in place search. When posts arrive from the
   * server this joins on a mountain id and the string comparison goes away.
   */
  const myMountains = useMemo(
    () => new Set(goals.map((g) => g.name.trim().toLowerCase())),
    [goals],
  );

  /**
   * The people whose cards this device has kept.
   *
   * Following is not a subscription yet — `profile/following.ts` says so at
   * length: a saved card is held on the device and nobody is notified. But it
   * is a real list the athlete built, so the Following tab filters on it rather
   * than showing the whole feed behind a disclaimer, which is what it used to
   * do. Matched on NAME because that is the only field a saved card and a post
   * byline both carry; when posts arrive from the server this becomes a query
   * against `follows` and the match stops being a string comparison.
   */
  const followedNames = useMemo(
    () => new Set(saved.map((p) => p.name.trim().toLowerCase())),
    [saved],
  );

  /**
   * The promotions running ON THIS SURFACE.
   *
   * It used to be whatever the story run had been given, sifted back out of its
   * assembled slides. That was the right answer while there was one gated demo
   * row and no read of the table; it is the wrong answer now, because
   * `promoted_placements.surfaces` says where a campaign runs and the column
   * defaults to NOWHERE precisely so that one advertisement cannot appear on
   * Home, in the story run and in the feed at once. A campaign that bought the
   * feed is a different list from one that bought the stories, and this asks for
   * the feed's.
   *
   * EVERY RULE ABOUT WHETHER THIS ATHLETE MAY SEE ONE IS ALREADY APPLIED. The
   * server refuses a draft or an expired campaign; `social/promoted.ts` applies
   * the subscriber rule, the targeting, the dismissals and the surface. Nothing
   * on this screen re-decides any of it: `placements` is empty in all eight of
   * the silent states, so an unready feed places nothing and the scroll is
   * simply a scroll of posts. No skeleton, no reserved height, no message — a
   * failure to deliver an advertisement is not news the climber came for.
   *
   * `state` IS read, for exactly one thing and never for a climber: telling the
   * measured zero apart from the seven silences, so the gated demo drawing
   * stands in only for "nobody is advertising". See `demoMayStandIn`.
   *
   * `placements` rather than the hook's `slots`, and the property `slots` exists
   * to protect is kept anyway: `interleaveFeed` emits the same `{ kind:
   * "promoted", placement }` arm, so nothing enters this list without naming
   * what it is, and no branch can draw an advertisement believing it is drawing
   * somebody's post.
   */
  const promoted = usePromotedFeedPlacements();
  const placements = useMemo<readonly PromotedPlacement[]>(() => {
    /* The second refusal, kept for the reason the story rail keeps its own: the
       fetch has already declined to ask on a paid plan, and two independent
       refusals to advertise at a paying member is the right number. */
    if (currentTier !== "free") return [];
    /* THE REAL ROWS WIN WHENEVER THERE ARE ANY. `DEMO_PROMOTIONS` is a drawing
       of the design for a build with no campaign running — the env gate lives
       inside `buildDemoPromotions`, so it is `[]` and out of the bundle in an
       ordinary build. It is not a stand-in for a campaign that failed to load,
       and `demoMayStandIn` is what makes that true rather than only stated: an
       empty list is empty in all eight silent states, so testing emptiness
       alone had a timed-out query drawing the invented advertisement. The story
       rail applies the same test to the same constant. */
    const live = promoted.placements.map(toStoryPlacement);
    if (live.length > 0) return live;
    return demoMayStandIn(promoted.state) ? DEMO_PROMOTIONS : [];
  }, [currentTier, promoted.placements, promoted.state]);

  /*
   * FILTERING HAPPENS ON THE DEMO SHAPE, BEFORE THE ADAPTER RUNS.
   *
   * `feedPost` drops the objective and the region, because a real `posts` row
   * has neither — so the mountain a post is about only exists on this side of
   * the conversion. Filter first, adapt second, and the day the feed is fetched
   * these two filters become `where` clauses instead.
   */
  const items = useMemo(() => {
    const matched = all.filter((p) => {
      if (filter === "following") return followedNames.has(p.author.name.trim().toLowerCase());
      if (filter === "my-mountains") {
        return myMountains.has(p.objective.mountain.trim().toLowerCase());
      }
      return true;
    });
    return withPromotions(
      matched.map((p) => feedPost(p, now)),
      placements,
    );
  }, [all, filter, followedNames, myMountains, now, placements]);

  const posts = items.filter((i) => i.kind === "post").length;

  function toggleLike(post: Post, next: boolean) {
    setLiked((current) => {
      const copy = new Set(current);
      if (next) copy.add(post.id);
      else copy.delete(post.id);
      return copy;
    });
  }

  return (
    <Screen padded={false}>
      {/* ---- Stories -------------------------------------------------------
          Under the header, above the feed. The rail renders its own honest
          empty state — two of them, in fact — so it needs no condition around
          it; it is hidden only while a search is running, for the same reason
          the filter chips are. `onOpen` hands over a SLIDE index, which is
          exactly what `StoryViewer` takes: no translation, by design. */}
      {!searching && <StoryRail onOpen={setStoryAt} />}

      {/*
        Two things are deliberately not at the top of this feed any more.

        NO COMPOSER BLOCK. It opened with two stacked buttons — "I've made it to
        a summit" and "Create post" — which pushed the feed itself below the fold
        to ask a question the floating ＋ already asks. Creating is reached from
        that control alone, which is where every other feed in the world puts it.

        NO "YOUR POSTS". A feed is what other people are doing; your own summit
        logs reading back at you is a mirror, not a community. They live on your
        profile — Profile → Posts renders exactly these two lists, sorted
        together — which is where you go to see what you have written.
      */}
      {searching ? (
        <SearchResults query={query} results={results} now={now} />
      ) : (
        <Stagger className="pb-6 pt-1">
          {items.map((item, i) =>
            item.kind === "promoted" ? (
              /* `pt-3` and nothing else — the SAME wrapper the post branch
                 below uses. The `px-5` here was the last of the card: it inset
                 the advertisement's photograph by 20px while every post's ran
                 edge to edge, which is the box surviving as a margin after the
                 border was taken away. */
              <Rise key={`promoted:${item.placement.id}:${i}`} className="pt-3">
                <PromotedCard
                  placement={item.placement}
                  onDismiss={promoted.dismiss}
                  onShown={promoted.markShown}
                />
              </Rise>
            ) : (
              <Rise key={item.post.id} className="pt-3">
                <TappablePost
                  post={item.post}
                  detail={details.get(item.post.id)}
                  liked={liked.has(item.post.id)}
                  onOpenComments={setCommenting}
                  onReport={(p) => setReporting(p.id)}
                  onLike={toggleLike}
                  onShare={setSharing}
                />
              </Rise>
            ),
          )}

          {posts === 0 && (
            /* Centred type on the page. A bordered box announcing an empty
               feed is a container drawn around nothing — and it made a feature
               that is honestly not built yet look like a component that broke.
               Both sentences are unchanged; only the frame is gone. */
            <Rise className="px-4 py-10 text-center">
              <div>
                <p className="text-[15px] text-snow">Nothing here yet.</p>
                {/* FIVE DIFFERENT EMPTINESSES, AND THEY ARE NOT THE SAME
                    STATEMENT. "No posts match this filter" implies there are
                    posts — that somewhere behind the filter is a feed. In a
                    production build there is not: nobody can post yet, so
                    nobody has posted anything, and saying so is the honest
                    answer rather than one that reads as a filter that came back
                    empty. The two tabs then split again on whether the athlete
                    has done their half — set an objective, saved a card —
                    because "nobody you follow has posted" blames people for a
                    server that does not exist. */}
                <p className="mx-auto mt-2.5 max-w-[300px] text-[11.5px] leading-relaxed text-mist">
                  {feedEmpty
                    ? "Nobody has posted anything, because posting is not built yet. This is an empty feature rather than a filter that came back with nothing — when people can post, what they write appears here."
                    : filter === "following"
                      ? followedNames.size === 0
                        ? "You have not saved anybody yet. Opening someone's shared profile link keeps their card on this device, and this tab reads that list — following is not a subscription yet, so nobody is notified and nothing is fetched on your behalf."
                        : "Nothing from the people whose cards you have kept. ICEFALL cannot ask them what they posted, so this is silence from the app rather than from them."
                      : filter === "my-mountains"
                        ? myMountains.size === 0
                          ? "Set an objective and this fills with what other people are doing on it."
                          : "Nobody has posted about the mountains you have set as goals."
                        : "No posts match this filter."}
                </p>
              </div>
            </Rise>
          )}

          {/* ---- House rule + honesty ----------------------------------------
              The end of the scroll, so it is separated by the largest step of
              air on the screen rather than by an outline. The shield is the
              mark that says "this is the house speaking"; a rectangle around it
              said the same thing again, more loudly and less well. */}
          <Rise className="px-4 pt-10">
            <div>
              <p className="flex items-center gap-2 text-[12.5px] text-snow">
                <ShieldCheck size={14} strokeWidth={1.7} className="shrink-0 text-azure" />
                {COMMUNITY_HOUSE_RULE}
              </p>
              {/*
                THE UNDER-18 SENTENCE IS GONE, and it must not come back until
                something enforces it. `settings.ageBand` is stored and read by
                exactly one screen — the one that sets it. No discovery, message
                or profile path consults it anywhere, so "restricted people
                discovery and no private messaging" described protections that
                did not exist.

                It was also expensive. Under the Online Safety Act the cheapest
                position available to ICEFALL is a defensible finding that the
                service is NOT likely to be accessed by children — and a claim
                on screen that under-18 protections are running is evidence the
                operator expected them. Deleting it is worth more than any
                control it purported to describe.

                The first sentence stays because it is TRUE: `messages` really
                is gated on shared membership.
              */}
              <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
                Private messages are only available inside a group you have both joined.
              </p>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">{LIKE_NOTICE}</p>
            {SHOW_DEMO_COMMUNITY && (
              <Disclaimer className="mt-3">{COMMUNITY_DEMO_NOTICE}</Disclaimer>
            )}
          </Rise>
        </Stagger>
      )}

      {/* No floating +: creating a post is the + in the Social header's
          Instagram row (Social.tsx), which reaches this screen as `?create=1`. */}

      {creating && (
        <CreateSheet
          onClose={() => setCreating(false)}
          onCompose={() => {
            setCreating(false);
            setComposing(true);
          }}
          onPick={(kind) => {
            setCreating(false);
            // "Summit" is a structured record with a route and conditions, not
            // a caption — it has its own composer. Everything else is a post.
            if (kind === "summit") setLogging(true);
            else setPosting(true);
          }}
        />
      )}
      {composing && (
        <Sheet title="New post" onClose={() => setComposing(false)}>
          <div className="py-4">
            {/* The composer owns every state this can be in — no backend, signed
                out, verified, refused — so nothing is decided for it here. It
                closes only once the server has returned a row id. */}
            <Composer onPosted={() => setComposing(false)} />
          </div>
        </Sheet>
      )}
      {logging && <LogSummitSheet onClose={() => setLogging(false)} />}
      {posting && <CreatePostSheet onClose={() => setPosting(false)} />}

      {storyAt !== null && <StoryViewer startIndex={storyAt} onClose={() => setStoryAt(null)} />}
      {/*
        SHARE — the drawing's sheet has a search box, a grid of people and a
        row of apps. Two of those are honest here: copy the link, and hand it
        to the phone's own share sheet (which is where WhatsApp and the rest
        live). The grid of people is not: sending a post to somebody inside
        ICEFALL needs a message that actually goes, and messaging does not
        send yet — so no row of faces that would do nothing when tapped.
      */}
      {sharing && <ShareSheet post={sharing} onClose={() => setSharing(null)} />}
      {commenting && <Comments post={commenting} onClose={() => setCommenting(null)} />}
      <ReportDialog postId={reporting} onClose={() => setReporting(null)} />
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Posts                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A post card you can tap anywhere on to open its thread.
 *
 * The owner asked for exactly this — "when you click on post it can then show
 * you comments" — and `PostCard` is not this screen's file to change, so the
 * gesture is added around it rather than inside it.
 *
 * THE WRAPPER IS NOT A BUTTON, and that is deliberate rather than lazy. The
 * card already contains a like button, an options menu, sometimes a video with
 * its own controls; a `role="button"` around all of that is a control
 * containing controls, which screen readers and keyboards both read wrongly.
 * So the tap is a convenience for the finger, the card's own labelled comment
 * button stays the reachable, announced route into the same thread, and a tap
 * that lands on any control — or that ends a text selection — is left alone.
 *
 * `likeCount` is 1 exactly while the reader has liked it, and absent otherwise.
 * That is not a total: it is the single like this app can vouch for, and
 * `LikeButton` prints no figure at all for the zero.
 */
function TappablePost({
  post,
  detail,
  liked,
  onOpenComments,
  onReport,
  onLike,
  onShare,
}: {
  post: Post;
  detail?: PostDetail;
  liked: boolean;
  onOpenComments: (post: Post) => void;
  onReport: (post: Post) => void;
  onLike: (post: Post, next: boolean) => void;
  onShare: (post: Post) => void;
}) {
  return (
    <div
      onClick={(e) => {
        // `Element`, not `HTMLElement`: a tap that lands on a lucide icon hands
        // back an SVGElement, and casting one of those to HTMLElement is a lie
        // the compiler would have believed.
        const el = e.target as Element;
        if (el.closest("button, a, video, input, textarea, [role='menu']")) return;
        if ((window.getSelection()?.toString().length ?? 0) > 0) return;
        onOpenComments(post);
      }}
    >
      <PostCard
        /* The row's own like count is kept, not replaced. `PostCard` derives
           the displayed figure from it plus this session's own mark, so a post
           that arrived with 32 likes reads 33 when you like it — replacing the
           count with 1 threw the real figure away. */
        post={{ ...post, likedByMe: liked }}
        detail={detail}
        onOpenComments={onOpenComments}
        onReport={onReport}
        onLike={onLike}
        onShare={onShare}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Promoted                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * THE ONE PAID CARD IN THE SCROLL, AND IT SAYS SO FIRST.
 *
 * The label is the first thing in the card and it is structural: this is the
 * only component that can draw a `PromotedPlacement`, so the branch that
 * renders an advertisement is the branch that renders the word "Promoted".
 * Same reason `promoted_placements` is its own table and the story slide is its
 * own arm of a union — a client that renders one got it from here and knows
 * what it is. It cannot be mistaken for a post: no byline, no like, no comment
 * count, nothing that would let it borrow the shape of something a person
 * wrote.
 *
 * WHY THE READER IS SEEING IT is stated on the card, in three branches because
 * there are three truths. `audience_mode` is the schema's own column and its
 * two values mean genuinely different things to the person reading — but
 * `countries` is applied to EVERY campaign, targeted or not, so a 'general'
 * placement scoped to GB reached only GB profiles and this card used to tell
 * them "nothing you have told ICEFALL decided that you saw it". Their own
 * declared country did. `PromotedCard.tsx` on Home was corrected for exactly
 * that; `countryScoped` is the field both cards read. Nothing here is inferred,
 * because the migration forbids targeting on anything that would be.
 *
 * ── THE CARD IS NO LONGER ONE BIG LINK ───────────────────────────────────────
 *
 * It was, and that left nowhere to put the x: a button inside an anchor is not
 * something HTML allows, and a whole-card tap target that also has to host a
 * dismiss control is a mis-tap waiting to happen. The destination is now a
 * control at the bottom, the x is at the top, and they are the height of the
 * copy apart — the same arrangement, and the same reasoning, as Home's card.
 */
function PromotedCard({
  placement,
  onDismiss,
  onShown,
}: {
  placement: PromotedPlacement;
  /** Close this placement for good. See `PROMOTED_DISMISS_IS_FOREVER`. */
  onDismiss: (placementId: string) => void;
  /**
   * Called ONCE per placement, when this card is actually on screen.
   *
   * Not an impression and not a delivery — ICEFALL cannot see a screen. It
   * records that a client asked to record a view. See `recordPromotedView`.
   */
  onShown: (placementId: string) => void;
}) {
  /*
   * A SCROLL POSITION IS NOT A VIEW, WHICH IS WHY THIS IS AN OBSERVER.
   *
   * On Home the card is the only promotion on the screen and rendering it is
   * enough — `PromotedCard.tsx` records on render for that reason. A feed is
   * different in kind: React has mounted every card in the list, including the
   * promotion eleven posts below the fold that the athlete may never reach and
   * may never even scroll past. Recording on render there would count a view of
   * something nobody could have seen, and "a client asked to record a view" is
   * the only claim this app is entitled to make.
   *
   * So the card reports itself when it is genuinely in the viewport, and half of
   * it has to be: `threshold: 0.5` means a card clipped to a sliver at the edge
   * of the screen during a fast scroll does not count. It is still not proof
   * anybody looked, and nothing downstream calls it one.
   *
   * ONCE PER PLACEMENT, guarded here and again in `recordPromotedView`, so
   * scrolling the same card back into view is one view rather than a tally that
   * drifts upward — which is what the primary key on `(placement_id,
   * profile_id)` is about too.
   */
  const holder = useRef<HTMLDivElement | null>(null);
  const recorded = useRef<string | null>(null);
  const { id, demo } = placement;
  useEffect(() => {
    /* A demo row has no placement behind it: there is nothing on the server to
       record a view against, and writing one would be a figure about a campaign
       nobody bought. */
    if (demo || !id) return;
    if (recorded.current === id) return;
    const node = holder.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (recorded.current === id) return;
        recorded.current = id;
        observer.disconnect();
        onShown(id);
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [id, demo, onShown]);

  /* See the band below: an advertiser's reference, refused unless it is a path
     inside this app, and dropped entirely if it fails to load. */
  const [imageBroken, setImageBroken] = useState(false);
  const imageSrc = imageBroken ? null : inAppImage(placement.creativePath);

  return (
    /*
     * NOT A CARD. THE OWNER, TWICE, AND THE SECOND TIME IN CAPITALS.
     *
     * This was a bordered box on a fill, sitting in a column of posts that
     * carry no border and no fill at all — so the advertisement read as a
     * foreign object dropped into the feed rather than as a post somebody paid
     * for. The owner's standing rule is that a card is for a genuinely distinct
     * OBJECT, and a promotion in a feed is not one: it is a post with a
     * different reason for being there.
     *
     * So the shape is `PostCard`'s exactly — byline row, media edge to edge,
     * copy under it, nothing around any of it — and the ONE difference is
     * colour. Gilt is not decoration here and it is not a second accent: the
     * palette in `index.css` defines `--ice-gilt` as "somebody is selling you
     * this", the colour reserved for a paid placement, and this is the one
     * surface in the app that is literally that. Azure would have been wrong
     * for the same reason it is right everywhere else — azure means the
     * athlete's own things, and this is not theirs.
     */
    <div ref={holder} className="relative">
      {/* ---- The label, and the x beside it ------------------------------- */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className="rounded-pill border border-gilt/45 bg-gilt/[0.12] px-2 py-[3px] text-[9.5px] uppercase tracking-[0.12em] text-gilt">
          Promoted
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-mist-dim">
          {placement.companyName}
        </span>

        {/*
          THE X IS OFFERED ONLY WHERE IT CAN KEEP ITS PROMISE. A demo row is not
          a placement anybody can close — there is no server row to write a
          dismissal against, and the local mirror would quietly delete the one
          advertisement a DEV build has to review. `UpgradePrompt.tsx:16` forbids
          "an x that dismisses a thing which then returns tomorrow", and an x
          that closes an invented campaign for ever is the same broken promise
          from the other end.
        */}
        {!placement.demo && (
          <button
            type="button"
            onClick={() => onDismiss(placement.id)}
            aria-label={`Close this promotion from ${placement.companyName}. Closing it is permanent.`}
            className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist-dim transition-colors hover:bg-white/[0.06] hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        )}
      </div>

      {/*
        THE PICTURE, HELD TO `PromotedCard.tsx`'S RULE, because it is the same
        picture from the same column. `creativePath` is
        `promoted_placements.creative_path` — a string an ADVERTISER wrote, and
        a reference rather than a URL — so `inAppImage` accepts one shape, a
        path inside this app, and a storage key is not guessed at and
        `https://…` is not fetched from somebody else's host on a climber's
        phone. The whole band is gated on it, and `onError` removes it: a
        150px empty rectangle inside a card labelled Promoted is exactly the
        placeholder advertisement this surface must never draw.
      */}
      {imageSrc && (
        /* Edge to edge and taller, because that is what the posts above and
           below it do. A promotion that is inset while they are not is the
           box again, wearing a smaller frame. */
        <div className="aspect-[4/3] w-full overflow-hidden bg-slate/40">
          <img
            src={imageSrc}
            alt=""
            aria-hidden
            loading="lazy"
            onError={() => setImageBroken(true)}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <p className="px-4 pt-3.5 text-[13px] leading-relaxed text-snow">{placement.headline}</p>

      {placement.href && (
        <Link
          to={placement.href}
          aria-label={`${placement.ctaLabel} — promoted by ${placement.companyName}`}
          className="mt-2 flex items-center gap-1 px-4 pb-1 text-[12px] font-medium text-gilt"
        >
          {/* The advertiser's own words. `creative_cta_href` may point at a
              route, a trek or an expedition as easily as at a company, so
              ICEFALL naming the destination itself would be ICEFALL getting it
              wrong — on the one line that says where an advertisement leads. */}
          {placement.ctaLabel}
          <ChevronRight size={14} strokeWidth={1.8} />
        </Link>
      )}

      <div className="mt-2.5 px-4 pb-1">
        <p className="text-[10.5px] leading-relaxed text-mist-dim">
          Paid placement by {placement.companyName}. ICEFALL does not endorse it, does not vet it,
          and takes no part in anything you book.{" "}
          {placement.audienceMode === "targeted"
            ? "You are seeing it because of an objective you set yourself — ICEFALL targets on the goals you declared and on nothing it worked out about you."
            : placement.countryScoped
              ? "You are seeing it because of the country on your profile. Nothing else about you was used."
              : "Nothing about you was used to choose it."}
        </p>
        {/* Said BEFORE the x is tapped, not discovered after — and only where
            the x is actually offered. */}
        {!placement.demo && (
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-mist-dim">
            {PROMOTED_DISMISS_IS_FOREVER}
          </p>
        )}
        {placement.demo && (
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-mist-dim">
            Nobody has bought this. The company is invented, the picture is ICEFALL&apos;s own, and
            campaigns need an account nobody has — this shows what a promoted post looks like.
          </p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Search results                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What a search turned up — people first, then posts.
 *
 * The people section states plainly that the directory is empty rather than
 * rendering a blank space. An empty result that looks like "no matches" implies
 * a search ran against a populated list of climbers and found nobody by that
 * name; the truth is that there is nobody to search yet, and those are very
 * different things to a person deciding whether this app has anyone on it.
 */
function SearchResults({
  query,
  results,
  now,
}: {
  query: string;
  results: ReturnType<typeof searchSocial>;
  now: number;
}) {
  const { people, posts } = results;

  return (
    <Stagger className="px-5 pb-24 pt-4">
      <Rise>
        <div className="flex items-baseline justify-between">
          <p className="section-label">People</p>
          <span className="tnum text-[11.5px] text-mist-dim">{people.length}</span>
        </div>
      </Rise>

      {people.length === 0 ? (
        /* The sentence, on the page. A box around an explanation of why a
           search found nothing is a container drawn around nothing. */
        <Rise className="pt-3">
          <p className="max-w-[46ch] text-[12.5px] leading-relaxed text-mist">
            There is nobody to find yet. Accounts exist, but no climber directory does, so none can
            be looked up by name — this is an empty network rather than a search that came back
            short.
          </p>
        </Rise>
      ) : (
        /* Rows, not a stack of outlined tiles. The avatar column already runs
           down the left edge and does the aligning an outline was doing; the
           `-mx-5 px-5` lets the hover state reach the screen edge while the
           type stays on the gutter. */
        people.map((athlete) => (
          <Rise key={athlete.id}>
            <Link
              to={`/social/people/${athlete.id}`}
              className="-mx-5 flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.03]"
            >
              <Avatar name={athlete.displayName} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-snow">
                  {athlete.displayName}
                </span>
                {athlete.bio && (
                  <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">
                    {athlete.bio}
                  </span>
                )}
              </span>
              <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
            </Link>
          </Rise>
        ))
      )}

      <Rise className="pt-7">
        <div className="flex items-baseline justify-between">
          <p className="section-label">Posts</p>
          <span className="tnum text-[11.5px] text-mist-dim">{posts.length}</span>
        </div>
      </Rise>

      {posts.length === 0 ? (
        <Rise className="pt-3">
          <p className="text-[12.5px] text-mist">No posts mention “{query.trim()}”.</p>
        </Rise>
      ) : (
        /* There is no promoted placement in here: nobody paid to appear against
           a query, so nothing may. A results list is not inventory. */
        posts.map((post) => (
          <Rise key={post.id} className="pt-3">
            <SearchPost post={feedPost(post, now)} />
          </Rise>
        ))
      )}
    </Stagger>
  );
}

/**
 * A search hit.
 *
 * It carries its OWN thread and report state rather than reaching back up to
 * the feed's, because the feed's state is unmounted while a search is running —
 * `SearchResults` replaces the whole scroll. Lifting them to `Community` would
 * mean a sheet whose owner had gone, and closing it would drop the reader back
 * onto results that had re-rendered underneath.
 */
function SearchPost({ post }: { post: Post }) {
  const [thread, setThread] = useState<Post | null>(null);
  const [report, setReport] = useState<string | null>(null);

  return (
    <>
      <PostCard post={post} onOpenComments={setThread} onReport={(p) => setReport(p.id)} />
      {thread && <Comments post={thread} onClose={() => setThread(null)} />}
      <ReportDialog postId={report} onClose={() => setReport(null)} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Sheets                                                                     */
/* -------------------------------------------------------------------------- */

const KIND_ICON: Record<PostKind, typeof MountainIcon> = {
  activity: RouteIcon,
  summit: Flag,
  "route-report": TriangleAlert,
  "looking-for-partners": Users,
  milestone: MountainIcon,
  group: Users,
};

/**
 * The floating ＋ sheet — the only way into a composer.
 *
 * TWO WRITE PATHS SIT HERE, AND THEY ARE NOT THE SAME THING, so they are not
 * presented as one. "Post to ICEFALL" is `components/social/Composer` — the
 * only composer that writes to `public.posts`, which is why it also owns the
 * story expiry and the identity gate on video. The five options below it are
 * the demo taxonomy, and each one opens the device-local composer that has
 * always been behind them: photos, an attached recording, a saved trail. Both
 * say plainly what they can and cannot deliver; neither is dressed up as the
 * other.
 */
function CreateSheet({
  onClose,
  onCompose,
  onPick,
}: {
  onClose: () => void;
  onCompose: () => void;
  onPick: (kind: PostKind) => void;
}) {
  return (
    <Sheet title="Create post" onClose={onClose}>
      <button
        type="button"
        onClick={onCompose}
        className="flex w-full items-center gap-3.5 py-3.5 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-azure/40 bg-azure/[0.1]">
          <PenLine size={16} strokeWidth={1.7} className="text-azure" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] text-snow">Post to ICEFALL</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">
            Words, or a story that ends
          </span>
        </span>
        <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
      </button>

      {CREATE_OPTIONS.map((o) => {
        const Icon = KIND_ICON[o.kind];
        return (
          <button
            key={o.kind}
            type="button"
            onClick={() => onPick(o.kind)}
            className="flex w-full items-center gap-3.5 py-3.5 text-left"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline bg-slate">
              <Icon size={16} strokeWidth={1.7} className="text-azure" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-snow">{o.label}</span>
              <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">{o.detail}</span>
            </span>
            <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
          </button>
        );
      })}

      {/* The sheet is already the floating surface; a second box inside it is
          just a box. One hairline marks the real division — the options above,
          the house's own words below — and the shield does the rest. */}
      <div className="mt-2 border-t border-hairline py-5">
        <div>
          <p className="flex items-center gap-2 text-[12.5px] text-snow">
            <ShieldCheck size={14} strokeWidth={1.7} className="shrink-0 text-azure" />
            Safety first
          </p>
          {/* The under-18 claim removed here for the reason given at the other
              occurrence above — nothing reads `ageBand` outside the screen that
              sets it. What remains is advice ICEFALL can actually stand behind,
              because it asks something of the reader rather than promising
              something of the app. */}
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
            Never post an exact address or a live location. Be respectful.
          </p>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
          The five options above save to this device and publish nowhere. Posting to ICEFALL needs
          an account, and says so if you do not have one.
        </p>
      </div>
    </Sheet>
  );
}

function ShareSheet({ post, onClose }: { post: Post; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/social/post/${encodeURIComponent(post.id)}`;
  const title = post.author.company?.name ?? post.author.name;
  return (
    <Sheet title="Share" onClose={onClose}>
      <SheetRow
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
        title={copied ? "Link copied" : "Copy link"}
        detail={url}
      />
      {typeof navigator.share === "function" && (
        <SheetRow
          onClick={() => {
            sharePage(`${title} on ICEFALL`, url);
            onClose();
          }}
          title="Share to…"
          detail="WhatsApp, Messages, Snapchat — whatever this phone has."
        />
      )}
    </Sheet>
  );
}
