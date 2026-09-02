import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/primitives";
import { useFollowing } from "@/profile/following";
import { DEMO_OPERATORS } from "@/services/operators";
import { SHOW_DEMO_COMMUNITY, agoLabel, communityPosts } from "@/social/community";
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
 * `src/social/` owns the shapes. What is here is the RUN: which stories, in
 * what order, with the promotions placed. The rail and the viewer are its only
 * two readers and neither exists anywhere else yet, so it sits with them. When
 * a fetch and a publish path exist it moves to `src/social/stories.ts` and both
 * components keep importing the same names.
 *
 * ── WHAT IS REAL HERE, AND WHAT IS NOT ───────────────────────────────────────
 *
 * Nobody can post a story: there is no account, no publish path and no server
 * read. So an ordinary build has NO stories and the rail says exactly that,
 * naming the reason, in the voice `Community.tsx` uses for its empty feed. A
 * demo build reuses the demo feed's own posts — the ones young enough that a
 * 24-hour story would still be running — and writes no new people, no new times
 * and no new figures to do it.
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
  /** Resolved from the company directory — the row itself holds only the id. */
  companyName: string;
  /** `promoted_placements.audience_mode` */
  audienceMode: "targeted" | "general";
  /** `promoted_placements.creative_path` */
  creativePath: string | null;
  /** The promoted post's body, or the promoted product's name. One line. */
  headline: string;
  /** Where the placement points, inside ICEFALL. Absent = it points nowhere. */
  href?: string;
}

/** One slide of the run: somebody's story, or a labelled promotion. */
export type StorySlide =
  | { kind: "story"; story: Story }
  | { kind: "promoted"; placement: PromotedPlacement };

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
    expiresAt: new Date(
      createdAt.getTime() + STORY_LIFETIME_HOURS * 3_600_000,
    ).toISOString(),
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
 * The promotions this athlete may be shown.
 *
 * TWO RULES FROM THE SCHEMA, BOTH ENFORCED HERE.
 *
 * 1. Premium members are excluded from promotion delivery. The migration is
 *    explicit that this is "a feed rule the reading apps enforce", so this is
 *    the reading app enforcing it — see `useStories`, where the tier is known.
 *
 * 2. Targeting is by the audience's own DECLARED goals, never inferred. Nothing
 *    here reads a location, a history or a behaviour. `audienceMode` is carried
 *    on the slide so the viewer can say which one it was.
 *
 * WHERE THE ROWS COME FROM. Nowhere, in a real build: this app has no read of
 * `promoted_placements` — the table is not in `backend/types.ts` and there is
 * no `.from(` for it — so a promotion cannot appear. The demo entry below
 * exists so the labelled design is reviewable, and it is gated the way
 * `community.ts` gates its posts, with the env reads spelled out inline so the
 * branch folds at build time and the strings leave the bundle rather than
 * merely leaving the screen.
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
      // ICEFALL's own mountain photography standing in for a creative, the same
      // way the demo trips do. An invented company has no photographs.
      creativePath: "/img/everest-1.jpg",
      headline: company.blurb ?? company.certification,
      href: `/operator/${company.id}`,
    },
  ];
}

const DEMO_PROMOTIONS: PromotedPlacement[] = buildDemoPromotions();

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Groups stories by author, keeping each person's stories together and oldest
 * first within the person — the order they were lived, which is the order a
 * story run reads in.
 */
function groupByPerson(stories: Story[]): { person: Author; stories: Story[] }[] {
  const order: string[] = [];
  const byId = new Map<string, { person: Author; stories: Story[] }>();

  for (const story of stories) {
    const existing = byId.get(story.author.id);
    if (existing) existing.stories.push(story);
    else {
      order.push(story.author.id);
      byId.set(story.author.id, { person: story.author, stories: [story] });
    }
  }

  return order.map((id) => {
    const group = byId.get(id)!;
    return {
      person: group.person,
      stories: [...group.stories].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    };
  });
}

/**
 * Lays the run out: people in order, a promotion after every
 * `STORIES_BETWEEN_PROMOTIONS` stories, and never one on the end.
 *
 * The counter runs over STORIES rather than over slides, so a promotion never
 * pushes the next one closer — two promotions cannot end up adjacent however
 * many are available.
 */
function assemble(
  groups: { person: Author; stories: Story[] }[],
  promotions: PromotedPlacement[],
): { slides: StorySlide[]; entries: StoryRailEntry[] } {
  const slides: StorySlide[] = [];
  const entries: StoryRailEntry[] = [];
  const total = groups.reduce((n, g) => n + g.stories.length, 0);

  let storiesPlaced = 0;
  let promotionsPlaced = 0;

  for (const group of groups) {
    entries.push({
      person: group.person,
      stories: group.stories,
      slideIndex: slides.length,
    });

    for (const story of group.stories) {
      slides.push({ kind: "story", story });
      storiesPlaced += 1;

      const due = storiesPlaced % STORIES_BETWEEN_PROMOTIONS === 0;
      const somethingFollows = storiesPlaced < total;
      if (due && somethingFollows && promotions.length > 0) {
        slides.push({ kind: "promoted", placement: promotions[promotionsPlaced % promotions.length] });
        promotionsPlaced += 1;
      }
    }
  }

  return { slides, entries };
}

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
 * A hook rather than a module constant because the promotions depend on the
 * athlete's tier, and the tier changes inside a session (a trial starts, a plan
 * lapses). Both surfaces compute it from the same inputs, so the rail and the
 * viewer cannot disagree about what slide 4 is.
 */
export function useStories(): StoriesState {
  const { currentTier } = useApp();
  const { people: saved } = useFollowing();

  return useMemo(() => {
    const stories = storiesNow(Date.now());
    // Rule 1 of `buildDemoPromotions`, applied where the tier is known: a
    // paying member is excluded from promotion delivery.
    const promotions = currentTier === "free" ? DEMO_PROMOTIONS : [];
    const { slides, entries } = assemble(groupByPerson(stories), promotions);
    return {
      slides,
      entries,
      demo: SHOW_DEMO_COMMUNITY && stories.length > 0,
      savedPeople: saved.length,
    };
  }, [currentTier, saved.length]);
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
