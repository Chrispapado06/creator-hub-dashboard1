import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/primitives";
import { useFollowing } from "@/profile/following";
import { DEMO_OPERATORS } from "@/services/operators";
import { SHOW_DEMO_COMMUNITY, agoLabel, communityPosts } from "@/social/community";
/*
 * VALUE IMPORTS, AND THE DIRECTION IS THE ONE `promoted.ts` ASKS FOR.
 *
 * That module takes `PromotedPlacement` from this file as a TYPE ONLY, and says
 * why in as many words: "a VALUE import back the other way would close a runtime
 * cycle". This is the other way round — a component reading a data module — so
 * there is no cycle, and it is the direction that was always intended.
 */
import { usePromotedStorySlides, type PromotedState } from "@/social/promoted";
import { planStoryRun, type StorySlideOf } from "@/social/promotedSlides";
import type { Author, CommunityPost, Story } from "@/social/types";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";

/**
 * STORIES — the rail at the top of the feed, and the list both story surfaces
 * read from.
 *
 * A story is a post that ends: `posts.expires_at` in the social migration, not
 * a second table. `@/social/types` already says this in the type system —
 * `Story` is `Post` narrowed to a set `expiresAt`, and `isStory` is the only
 * test — so this file consumes THAT model rather than growing a second story
 * shape beside it. Two shapes for one row is how a feed ends up with two
 * different answers to "has this expired".
 *
 * ── WHY THE ASSEMBLY LIVES IN A COMPONENT FILE ───────────────────────────────
 *
 * `src/social/` owns the shapes, and now the arithmetic too: the interleaving
 * moved to `social/promotedSlides.ts` so the feed and the story run could stop
 * keeping two copies of the same "never last" rule. What is left here is the
 * RUN's inputs — which stories, and at what cadence — and the rail and the
 * viewer are its only two readers. When a story FETCH and a publish path exist
 * this moves to `src/social/stories.ts` and both components keep importing the
 * same names.
 *
 * ── WHAT IS REAL HERE, AND WHAT IS NOT ───────────────────────────────────────
 *
 * THE PROMOTIONS ARE REAL AND FETCHED. `social/promoted.ts` reads
 * `promoted_placements` and `usePromotedStorySlides()` hands this file the rows
 * an athlete may be shown; `buildDemoPromotions` below is now only the gated
 * DEV fallback for a build with no campaign running.
 *
 * THE STORIES ARE NOT. Nobody can post one: there is no account, no publish
 * path and no server read for `posts`. So an ordinary build has NO stories and
 * the rail says exactly that, naming the reason, in the voice `Community.tsx`
 * uses for its empty feed. A demo build reuses the demo feed's own posts — the
 * ones young enough that a 24-hour story would still be running — and writes no
 * new people, no new times and no new figures to do it. Which means an ordinary
 * build shows no promoted slides either, however many campaigns are running:
 * there is nothing for one to sit between, and a promotion is never the first
 * slide and never the last.
 *
 * ── FOLLOWING ────────────────────────────────────────────────────────────────
 *
 * Stories are supposed to come from people you follow, and following is not
 * built (see `profile/following.ts` — a saved card is kept on the device;
 * nobody is subscribed to). So the demo rail is NOT filtered by who you follow,
 * and `STORIES_FOLLOWING_NOTICE` says so on the viewer rather than letting the
 * rail imply a subscription that does not exist. Same posture as the feed's
 * "Following" filter, which states the same thing rather than filtering by it.
 */

/**
 * How long a story runs.
 *
 * Used to give the DEMO rows an expiry — a real row carries its own, set by
 * whoever posted it, and nothing here may override that. `isStory` and
 * `storyTimeLeft` read the field; this constant only writes the demo one.
 */
export const STORY_LIFETIME_HOURS = 24;

/** How long one slide holds before it advances itself. */
export const STORY_DURATION_MS = 5000;

/**
 * A promotion appears after every third story, and never as the last slide.
 *
 * One constant, because the frequency is a product decision somebody will want
 * to change without reading the interleaving code. The "never last" rule is not
 * cosmetic: a run that ends on an advertisement ends on the one slide the
 * athlete did not come for.
 */
export const STORIES_BETWEEN_PROMOTIONS = 3;

export const STORIES_FOLLOWING_NOTICE =
  "Following is not built yet — nobody can be followed and nothing is subscribed to — so this is not filtered by who you follow.";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A paid slide, shaped from `promoted_placements` — the schema's column names,
 * kept deliberately, so the day this reads the table the mapping is a rename
 * and not a redesign.
 *
 * THAT DAY HAS ARRIVED. `social/promoted.ts` reads the table and
 * `toStoryPlacement` there fills this shape from a row; the mapping was indeed
 * a rename. The two remaining sources of one of these are that function and
 * `buildDemoPromotions` below, and `demo` is what tells them apart on screen.
 *
 * It is its own arm of the slide union for the same reason it is its own table:
 * "a client that renders it got it from here and knows what it is". The label
 * is structural. `StoryViewer` cannot draw one of these without drawing the
 * word Promoted, because the branch that draws it is the branch that draws the
 * label.
 */
export interface PromotedPlacement {
  /** `promoted_placements.id` */
  id: string;
  /** `promoted_placements.company_id` */
  companyId: string;
  /**
   * `promoted_placements.creative_company_name` — WHO PAID, off the row itself.
   *
   * Never resolved from the company directory, and it never was resolvable:
   * `companies_select` refuses that row to every climber, so a join could not
   * have produced this name from a phone. `social/promoted.ts` says so at
   * length. A placement with no name is not returned at all — "Promoted"
   * without a "by whom" is not a disclosure.
   */
  companyName: string;
  /** `promoted_placements.audience_mode` */
  audienceMode: "targeted" | "general";
  /**
   * WHETHER THE READER'S OWN DECLARED COUNTRY NARROWED WHO SAW THIS.
   *
   * `audienceMode` alone cannot disclose honestly — `promoted_placements.
   * countries` is applied to EVERY campaign, targeted or not, so a `general`
   * placement scoped to GB reached only GB profiles. Saying "nothing about you
   * was used" there is false on the one sentence whose whole job is to be true.
   * `PromotedCard.tsx` was corrected for exactly this; the story slide and the
   * feed card carry the same field so they cannot tell the other story.
   */
  countryScoped: boolean;
  /** `promoted_placements.creative_path` */
  creativePath: string | null;
  /** The promoted post's body, or the promoted product's name. One line. */
  headline: string;
  /** Where the placement points, inside ICEFALL. Absent = it points nowhere. */
  href?: string;
  /**
   * THE ADVERTISER'S OWN WORDS ON THE BUTTON — `creative_cta_label`.
   *
   * Required, and it was missing. Both social surfaces printed the fixed words
   * "View company" instead, which were true of the one demo row (its href is an
   * operator page) and false the moment real rows arrived: `creative_cta_href`
   * may be any in-app path, so a campaign pointing at a route, a trek or an
   * expedition had ICEFALL describing where its advertisement led — in a
   * sentence of ICEFALL's own invention — wrongly. Home never had the problem;
   * it prints this field.
   *
   * Required rather than optional for `demo`'s reason: a new source of one of
   * these has to answer the question rather than inherit somebody's default.
   */
  ctaLabel: string;
  /**
   * TRUE ONLY FOR A ROW THIS APP INVENTED, AND IT IS REQUIRED FOR THAT REASON.
   *
   * Nobody bought a demo placement, so the surfaces print a footnote saying so
   * — and that footnote must be attached to the ROW rather than to the run. It
   * used to be a property of the whole story run (`StoriesState.demo`, which is
   * about the STORIES being demo content), and the day real placements began
   * arriving that became a way to print "Nobody has bought this. The company is
   * invented" underneath a business that had actually paid. A false statement
   * about commerce, on a card whose entire subject is commerce.
   *
   * Required rather than optional so that a new source of one of these has to
   * answer the question. `toStoryPlacement` in `social/promoted.ts` answers
   * `false` — a row that came off the table is a row somebody bought.
   */
  demo: boolean;
}

/**
 * One slide of the run: somebody's story, or a labelled promotion.
 *
 * The union arms come from `social/promotedSlides.ts`, which owns the
 * interleaving both surfaces use, so the shape a plan returns and the shape
 * this file's readers destructure cannot drift into two different unions.
 */
export type StorySlide = StorySlideOf<Story, PromotedPlacement>;

/** One circle on the rail: a person, and where their first story sits. */
export interface StoryRailEntry {
  person: Author;
  /** This person's stories, oldest first — the order a run reads in. */
  stories: Story[];
  /**
   * Index into the flat slide list — what `onOpen` hands over and what
   * `StoryViewer` takes as `startIndex`. The two surfaces agree on ONE index
   * space on purpose: a rail index the viewer had to translate is how a tap on
   * the third face opens the second person's story.
   */
  slideIndex: number;
}

/** Hours since a story was posted, derived from the row every time it is asked. */
export function storyAgeHours(story: Story, now = Date.now()): number {
  const ms = now - new Date(story.createdAt).getTime();
  return Number.isNaN(ms) ? 0 : Math.max(0, ms / 3_600_000);
}

/* -------------------------------------------------------------------------- */
/* Seen                                                                       */
/* -------------------------------------------------------------------------- */

const SEEN_KEY = "icefall.stories.seen.v1";

/**
 * Which story ids this device has already watched.
 *
 * On the device, not on a server, because there is no server — and worth saying
 * plainly rather than implying: watching a story notifies nobody, and no author
 * learns that anybody saw theirs. A seen list is the one piece of story state
 * ICEFALL can hold honestly today, and it is the only reason the rings can be
 * right.
 */
function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let seen = readSeen();
const seenListeners = new Set<(v: string[]) => void>();

function writeSeen(next: string[]) {
  seen = next;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    /* private mode — the rings are right for this session and forget after it */
  }
  seenListeners.forEach((l) => l(next));
}

/** Records that a story has been watched. Idempotent; the viewer calls it a lot. */
export function markStorySeen(id: string) {
  if (seen.includes(id)) return;
  // Capped, oldest first. A story is gone within a day, so a list that grows
  // for ever is a localStorage leak with no reader — 500 covers any plausible
  // run of unexpired stories many times over.
  const next = [...seen, id];
  writeSeen(next.length > 500 ? next.slice(next.length - 500) : next);
}

export function useSeenStories(): string[] {
  const [ids, setIds] = useState(seen);
  useEffect(() => {
    seenListeners.add(setIds);
    setIds(seen);
    return () => {
      seenListeners.delete(setIds);
    };
  }, []);
  return ids;
}

/* -------------------------------------------------------------------------- */
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A demo feed post, read as the `posts` row it would have been.
 *
 * The demo model splits a title from a body; `posts.body` is one NOT NULL text
 * column and there is no headline field to put a title in, so they are joined
 * and the slide renders the whole thing. The objective ("Mont Blanc · July
 * 2027") is DROPPED rather than carried into the byline: a real post has no
 * objective column, and inventing a place for one on the story card is how the
 * demo model's taxonomy leaks into the shape that has to survive the backend.
 *
 * `expiresAt` is written here because these rows never went through a database.
 * A real story arrives with its own, set by whoever posted it.
 */
function demoPostAsStory(post: CommunityPost, now: number): Story {
  const createdAt = new Date(now - post.hoursAgo * 3_600_000);
  return {
    id: `story:${post.id}`,
    author: {
      id: post.author.id,
      name: post.author.name,
      // `Author.location` is a label somebody typed, never a coordinate. The
      // demo model's band ("Around Chamonix") is already exactly that.
      location: post.author.region,
      avatarUrl: post.author.avatar,
      kind: "profile",
    },
    body: post.body ? `${post.title}\n${post.body}` : post.title,
    media: post.photo ? { url: post.photo } : undefined,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + STORY_LIFETIME_HOURS * 3_600_000).toISOString(),
  };
}

/**
 * The stories the app can actually show right now.
 *
 * THERE IS NO SERVER READ, and none is faked to cover the gap: `posts` is not
 * in `backend/types.ts` and there is no `.from(` for it anywhere in this app.
 * So this is the demo feed or it is nothing — and in an ordinary build
 * `communityPosts()` is `[]` (the demo feed is compiled away), which makes this
 * `[]` and puts the honest empty state on the rail. When a fetch exists it
 * returns `Story[]` from the same call and the rest of this file is unchanged.
 *
 * Nothing is invented to fill it: if every demo post is older than a day, there
 * are no stories, which is correct rather than inconvenient.
 */
function storiesNow(now: number): Story[] {
  return communityPosts()
    .filter((p) => p.hoursAgo < STORY_LIFETIME_HOURS)
    .sort((a, b) => a.hoursAgo - b.hoursAgo)
    .map((p) => demoPostAsStory(p, now));
}

/**
 * THE DEMO PROMOTION — a drawing of the design, and nothing a climber will meet.
 *
 * WHERE THE REAL ROWS COME FROM, said first because this comment used to say
 * the opposite. `social/promoted.ts` reads `promoted_placements` — the table
 * has been live since 20260831190000 — and `usePromotedStorySlides()` hands
 * this file the rows an athlete may be shown, already in this shape. The claim
 * that once stood here, that "this app has no read of `promoted_placements` …
 * so a promotion cannot appear", was true when it was written and is false now.
 *
 * So this function is no longer the source of promotions. It is the DEV
 * fallback, kept for one reason: with no campaign running there is nothing to
 * review, and a labelled advertisement is a design somebody has to be able to
 * look at. `useStories` prefers the real rows whenever there are any.
 *
 * TWO RULES FROM THE SCHEMA, BOTH STILL ENFORCED ON THIS PATH.
 *
 * 1. Premium members are excluded from promotion delivery. The migration is
 *    explicit that this is "a feed rule the reading apps enforce", so this is
 *    the reading app enforcing it — see `useStories`, where the tier is known.
 *    The fetch refuses on a paid plan as well, and two independent refusals to
 *    show an advertisement to a paying member is the right number.
 *
 * 2. Targeting is by the audience's own DECLARED goals, never inferred. Nothing
 *    here reads a location, a history or a behaviour. `audienceMode` is carried
 *    on the slide so the viewer can say which one it was.
 *
 * The gate is the one `community.ts` uses for its posts, with the env reads
 * spelled out inline so the branch folds at build time and the strings leave
 * the bundle rather than merely leaving the screen.
 */
function buildDemoPromotions(): PromotedPlacement[] {
  if (!import.meta.env.DEV && import.meta.env.VITE_SHOW_DEMO !== "1") return [];

  /*
   * INVENTED COMPANIES ONLY, AND THE FILTER IS THE GUARANTEE.
   *
   * An advertisement is a claim that a business paid ICEFALL to place it. Elite
   * Exped, 14 Peaks and 8K Expeditions are real businesses named in this app on
   * facts alone — no rating, no price, nothing they did not say themselves —
   * and putting one of them behind a "Promoted" badge would invent a commercial
   * relationship for a company that has none with ICEFALL. So the source is
   * `DEMO_OPERATORS` (already invented, already gated) and `!o.real` is
   * asserted again here: the guard survives somebody later adding a real name
   * to that array, which is exactly how the last version of this mistake
   * happened — see the long note above `DEMO_OPERATORS`.
   */
  const company = DEMO_OPERATORS.find((o) => o.demo === true && o.real !== true);
  if (!company) return [];

  return [
    {
      id: "promo:demo-1",
      companyId: company.id,
      companyName: company.name,
      // General: everybody who is not on a paid tier. No goal is read, so
      // nothing about this athlete decided that they saw it.
      audienceMode: "general",
      // No country narrowed this either — there is no country on it to narrow
      // by. Stated rather than left to `audienceMode` for the reason the field
      // exists: the two facts are not the same fact.
      countryScoped: false,
      // ICEFALL's own mountain photography standing in for a creative, the same
      // way the demo trips do. An invented company has no photographs.
      creativePath: "/img/everest-1.jpg",
      headline: company.blurb ?? company.certification,
      href: `/operator/${company.id}`,
      // Said here rather than assumed by the surfaces: this href IS a company
      // page, so these words are true of this row and of no other row by
      // default.
      ctaLabel: "View company",
      // Nobody bought it, and every surface that draws it says so.
      demo: true,
    },
  ];
}

/**
 * The gated demo rows, once.
 *
 * EXPORTED FOR THE FEED, which draws its own promoted card from the same shape
 * and used to reach these through the assembled story run — a longer path to
 * the same constant. The env gate lives inside `buildDemoPromotions`, so this
 * is `[]` in an ordinary build and the strings are not in the bundle at all.
 */
export const DEMO_PROMOTIONS: PromotedPlacement[] = buildDemoPromotions();

/* -------------------------------------------------------------------------- */
/* The promotions actually running                                            */
/* -------------------------------------------------------------------------- */

const NO_PROMOTIONS: readonly PromotedPlacement[] = Object.freeze([]);

/**
 * WHEN THE DEMO DRAWING IS AN HONEST STAND-IN, AND WHEN IT IS A LIE.
 *
 * `DEMO_PROMOTIONS` is a drawing of the design for a build with no campaign
 * running — that is what its own comment promises. Both surfaces used to reach
 * for it whenever the delivered list was EMPTY, and the list is empty in all
 * eight of the silent states, not only in the measured zero. So in a demo build
 * an unreachable server, a timed-out query or a lapsed token drew the invented
 * advertisement and called it "no campaign running", which is the one thing the
 * comment above it says it is not.
 *
 * The four states here are the ones where nothing real exists to draw: nobody
 * is advertising (`none`), or this build has no advertising system to ask at
 * all — no backend configured, the table not deployed, nobody signed in. The
 * ones deliberately left out are `unreachable`, `unreadable` and `withheld`: a
 * campaign may well be running behind each of them, and standing a made-up one
 * in front of a real one is a claim about ICEFALL's business that nobody
 * checked.
 *
 * No climber is reached either way — `DEMO_PROMOTIONS` is `[]` and out of the
 * bundle in an ordinary build — but a demo build is what people are shown, and
 * "nobody is advertising" is a sentence that has to be true there too.
 */
export function demoMayStandIn(state: PromotedState): boolean {
  return (
    state === "none" ||
    state === "no-backend" ||
    state === "not-provisioned" ||
    state === "signed-out"
  );
}

/** What a settled fetch left for both story surfaces to draw. */
interface DeliveredPromotions {
  /** The rows this athlete may be shown. Empty for every state but `ready`. */
  placements: readonly PromotedPlacement[];
  /** See `demoMayStandIn` — the only emptiness the demo row may stand in for. */
  noCampaignRunning: boolean;
}

const NOTHING_DELIVERED: DeliveredPromotions = Object.freeze({
  placements: NO_PROMOTIONS,
  noCampaignRunning: false,
});

/**
 * ONE LIST OF PROMOTIONS FOR BOTH STORY SURFACES, HELD OUTSIDE REACT.
 *
 * `useStories` promises that the rail and the viewer "cannot disagree about
 * what slide 4 is", and until now that was free: the promotions were a module
 * constant, so both components computed the same run from the same inputs. A
 * FETCH BREAKS THAT PROMISE ON ITS OWN. `StoryRail` and `StoryViewer` each call
 * `useStories`, each mount starts its own request, and the viewer's begins when
 * it opens — several seconds after the rail's has already answered.
 *
 * The failure is not cosmetic and it is silent. `slideIndex` is an index into
 * the flat slide list WITH the promotions in it. A rail that has three
 * promotions and a viewer that has none disagree about every index after the
 * third story, so a tap on the fourth face opens the wrong person — which is
 * exactly the bug `StoryRailEntry` warns about, arriving by a new route.
 *
 * So the delivered list is published here, module-wide, and every mounted
 * consumer is handed the same value.
 *
 * TWO MOUNTS FETCH; ONE PUBLISHES. The earlier version of this comment said
 * there was no second request, and that was never true — `usePromotedSurface`
 * runs its effect in every mount, so opening the viewer does issue a second
 * story-surface read. What is guaranteed is narrower and is the part that
 * matters: only the mount that owns the list may write to it, so a second
 * request cannot answer over the first one's. Hoisting the request itself is
 * worth doing and is not what makes the indexes agree.
 */
let deliveredPromotions: DeliveredPromotions = NOTHING_DELIVERED;
const promotionListeners = new Set<(v: DeliveredPromotions) => void>();
/** The mount allowed to publish. See `useDeliveredPromotions`. */
let promotionOwner: symbol | null = null;

function publishPromotions(next: DeliveredPromotions) {
  if (
    next.placements === deliveredPromotions.placements &&
    next.noCampaignRunning === deliveredPromotions.noCampaignRunning
  ) {
    return;
  }
  deliveredPromotions = next;
  promotionListeners.forEach((l) => l(next));
}

/**
 * The promotions this athlete may be shown, shared across every mount.
 *
 * A SECOND MOUNT MUST NOT WRITE OVER THE FIRST MOUNT'S ANSWER, and `loading` is
 * only the first way it could. Opening the viewer starts a fresh request that
 * begins, correctly, at `loading` — but it can also END at `unreachable` on a
 * cable car with no signal, or at `signed-out` on a lapsed token, and every one
 * of those publishes NOTHING TO DRAW. Guarding `loading` alone left the second
 * two: a blip while the viewer was open used to empty a run the rail had
 * already delivered, re-numbering every slide underneath it.
 *
 * So the first mount to ask CLAIMS the list and is the only one that may
 * publish; the others subscribe and draw what it found. When the owner
 * unmounts the claim is released and the last settled answer stays put — a run
 * that has begun does not empty itself because the component that fetched it
 * went away.
 *
 * Every state except `ready` publishes NOTHING TO DRAW, which is what every one
 * of them means on screen. The eight silences are distinguishable in
 * `social/promoted.ts` for a log or a test, never for a climber — and
 * `noCampaignRunning` is not an exception to that: it reaches no climber, only
 * the gated demo drawing. See `demoMayStandIn`.
 */
function useDeliveredPromotions(): DeliveredPromotions {
  const { placements, state } = usePromotedStorySlides();
  const [shared, setShared] = useState(deliveredPromotions);
  const token = useRef<symbol | null>(null);
  if (token.current === null) token.current = Symbol("promotions");
  const owns = useRef(false);

  useEffect(() => {
    const mine = token.current as symbol;
    if (promotionOwner === null) {
      promotionOwner = mine;
      owns.current = true;
    }
    promotionListeners.add(setShared);
    /* Whatever an earlier mount already learned, without waiting for our own
       request to come back. */
    setShared(deliveredPromotions);
    return () => {
      promotionListeners.delete(setShared);
      if (promotionOwner === mine) {
        promotionOwner = null;
        owns.current = false;
      }
    };
  }, []);

  useEffect(() => {
    if (state === "loading" || !owns.current) return;
    publishPromotions(
      state === "ready"
        ? { placements, noCampaignRunning: false }
        : { placements: NO_PROMOTIONS, noCampaignRunning: demoMayStandIn(state) },
    );
  }, [placements, state]);

  return shared;
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

/*
 * THE ARITHMETIC LEFT THIS FILE. `groupByPerson` and `assemble` used to sit
 * here, beside a second copy of the same rules in `Community.tsx` — which is
 * how a "never last" rule ends up true on one surface and false on the other
 * after somebody edits one of them. Both surfaces now call
 * `social/promotedSlides.ts`, which is that arithmetic once, as functions a
 * test can call. The cadence stays HERE, in `STORIES_BETWEEN_PROMOTIONS`,
 * because how often this app shows advertisements is a product decision and not
 * a helper function's default.
 */

export interface StoriesState {
  /** Every slide in order — people's stories with promotions interleaved. */
  slides: StorySlide[];
  /** One entry per person, in rail order. */
  entries: StoryRailEntry[];
  /** True when what is on screen is demo content and must say so. */
  demo: boolean;
  /** Whether this device has saved anybody — changes which emptiness this is. */
  savedPeople: number;
}

/**
 * The one list both surfaces read.
 *
 * A hook rather than a module constant because the promotions are FETCHED and
 * because they depend on the athlete's tier, which changes inside a session (a
 * trial starts, a plan lapses). Both surfaces read the same delivered list —
 * see `useDeliveredPromotions`, which is what still makes it true that the rail
 * and the viewer cannot disagree about what slide 4 is.
 *
 * THE REAL ROWS WIN WHENEVER THERE ARE ANY. The demo placement is a drawing of
 * the design for a build with no campaign running; it is not a stand-in for one
 * that failed to load, and `demoMayStandIn` is what now makes that sentence
 * true of the code rather than only of this comment. It is compiled out of an
 * ordinary build entirely. So the order is: paid tier → nothing at all;
 * delivered rows → those; a measured zero → the DEV fallback, which is `[]`
 * everywhere a climber can reach; anything else → nothing.
 */
export function useStories(): StoriesState {
  const { currentTier } = useApp();
  const { people: saved } = useFollowing();
  const delivered = useDeliveredPromotions();

  return useMemo(() => {
    const stories = storiesNow(Date.now());
    // Rule 1 of `buildDemoPromotions`, applied where the tier is known: a
    // paying member is excluded from promotion delivery. The fetch has already
    // refused for the same reason; this is the second refusal, kept on purpose.
    const promotions =
      currentTier !== "free"
        ? NO_PROMOTIONS
        : delivered.placements.length > 0
          ? delivered.placements
          : /* Only for the emptiness the demo row is entitled to stand in for —
               see `demoMayStandIn`. A campaign that failed to load is not one. */
            delivered.noCampaignRunning
            ? DEMO_PROMOTIONS
            : NO_PROMOTIONS;

    const { slides, entries } = planStoryRun(stories, promotions, {
      every: STORIES_BETWEEN_PROMOTIONS,
    });

    return {
      slides,
      entries,
      /* About the STORIES, and only the stories. Whether a promotion was
         invented is a fact about that row — `PromotedPlacement.demo` — because
         a run can now hold demo stories and a placement somebody actually paid
         for at the same time. */
      demo: SHOW_DEMO_COMMUNITY && stories.length > 0,
      savedPeople: saved.length,
    };
  }, [currentTier, saved.length, delivered]);
}

/* -------------------------------------------------------------------------- */
/* The rail                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The row of faces above the feed.
 *
 * `onOpen` receives a SLIDE index, not a rail index — see `StoryRailEntry`.
 * Hand it straight to `StoryViewer`'s `startIndex`.
 *
 * Promotions are not on the rail and never will be. The rail answers "who has
 * posted something", and a company that paid for a slide has not answered it; a
 * face on this row means a person, which is also the reason an advertisement
 * cannot be mistaken for one.
 */
export function StoryRail({
  onOpen,
  onAddStory,
  className,
}: {
  onOpen(index: number): void;
  /** Optional so the rail can be mounted without a composer wired up yet. */
  onAddStory?: () => void;
  className?: string;
}): React.JSX.Element {
  const { entries, savedPeople } = useStories();
  /* The signed-in person's own name, for the "Your story" tile. Initials only —
     ICEFALL holds no photograph of them and must not invent one. */
  const { user } = useApp();
  const myName = user?.name || "You";
  const seenIds = useSeenStories();

  const unseenFor = useCallback(
    (entry: StoryRailEntry) => entry.stories.some((s) => !seenIds.includes(s.id)),
    [seenIds],
  );

  /*
   * YOUR STORY, always first, present even when nobody else has posted.
   *
   * It is not a story entry — it is the way IN, so it carries a + rather than
   * an unseen ring, and it shows the signed-in person's own initials rather
   * than a face, because ICEFALL has no photograph of them and inventing one
   * would be the thing `Avatar` exists to prevent.
   */
  const yourStory = (
    <li key="__yours">
      <button
        type="button"
        onClick={onAddStory}
        disabled={!onAddStory}
        aria-label="Add to your story"
        className="flex w-[68px] flex-col items-center gap-1.5 rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian disabled:opacity-60"
      >
        <span className="relative grid h-[62px] w-[62px] place-items-center rounded-full bg-hairline-strong p-[2px]">
          <span className="grid h-full w-full place-items-center rounded-full bg-obsidian p-[2px]">
            <Avatar name={myName} size={52} />
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-obsidian bg-azure">
            <Plus size={13} strokeWidth={2.6} className="text-obsidian" />
          </span>
        </span>
        <span className="w-full truncate text-center text-[11px] text-snow">Your story</span>
      </button>
    </li>
  );

  const header = (
    <div className="flex items-baseline justify-between px-5 pt-3.5">
      <p className="text-[13px] font-medium text-snow">Stories</p>
      <button
        type="button"
        onClick={() => onOpen(0)}
        disabled={entries.length === 0}
        className="text-[12px] text-azure disabled:text-mist-dim"
      >
        View all
      </button>
    </div>
  );

  if (entries.length === 0) {
    /*
     * TWO EMPTINESSES, AND THEY ARE DIFFERENT SENTENCES.
     *
     * With nobody saved, the honest statement is that the feature is empty:
     * nobody can post a story, so nobody has. With people saved, the athlete
     * has done their half and the app still has nothing to show — "no stories"
     * alone would read as those people having been quiet today, which blames
     * them for a server that does not exist.
     */
    return (
      <div className={cn("border-b border-hairline", className)}>
        {header}
        <ul className="flex w-max gap-4 px-5 pb-3.5 pt-3">{yourStory}</ul>
        <p className="px-5 text-[12.5px] text-snow">No stories from people you follow.</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-mist-dim">
          {savedPeople > 0
            ? "A story is a post that ends after a day. The cards you have saved are held on this device — ICEFALL cannot ask anybody what they posted, so this is silence from the app rather than from them."
            : "A story is a post that ends after a day. Posting one needs an account and a server, neither of which ICEFALL has built, so nobody has posted anything — an empty feature rather than a quiet morning."}
        </p>
        <div className="h-3.5" />
      </div>
    );
  }

  return (
    <div className={cn("border-b border-hairline", className)}>
      {header}
      <div className="no-scrollbar overflow-x-auto">
        <ul className="flex w-max gap-4 px-5 pb-3.5 pt-3">
          {yourStory}
          {entries.map((entry) => {
            const unseen = unseenFor(entry);
            const newest = Math.min(...entry.stories.map((s) => storyAgeHours(s)));
            return (
              <li key={entry.person.id}>
                <button
                  type="button"
                  onClick={() => onOpen(entry.slideIndex)}
                  aria-label={`${entry.person.name} — ${entry.stories.length === 1 ? "story" : `${entry.stories.length} stories`}, ${agoLabel(newest)}${unseen ? "" : ", already watched"}`}
                  className="flex w-[68px] flex-col items-center gap-1.5 rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian"
                >
                  {/* The ring carries the unseen state and nothing else does:
                      an unwatched story is azure, a watched one falls back to
                      the hairline every other quiet edge in the app uses. */}
                  <span
                    className={cn(
                      "grid h-[62px] w-[62px] place-items-center rounded-full p-[2px] transition-colors",
                      unseen
                        ? "bg-gradient-to-br from-azure via-azure-bright to-azure-deep"
                        : "bg-hairline-strong",
                    )}
                  >
                    <span className="grid h-full w-full place-items-center rounded-full bg-obsidian p-[2px]">
                      {entry.person.avatarUrl ? (
                        <img
                          src={entry.person.avatarUrl}
                          alt=""
                          aria-hidden
                          loading="lazy"
                          className={cn(
                            "h-full w-full rounded-full object-cover",
                            !unseen && "opacity-60",
                          )}
                        />
                      ) : (
                        /* Initials, never a photograph. Attaching a real face
                           to somebody who does not exist is the thing `Avatar`
                           was written to prevent. */
                        <Avatar
                          name={entry.person.name}
                          size={52}
                          className={cn(!unseen && "opacity-60")}
                        />
                      )}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "w-full truncate text-center text-[10.5px]",
                      unseen ? "text-snow" : "text-mist-dim",
                    )}
                  >
                    {entry.person.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
