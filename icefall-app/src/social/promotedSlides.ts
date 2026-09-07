/**
 * WHERE A PROMOTION SITS — the arrangement rules, and nothing else.
 *
 * Two surfaces already interleave paid slides among unpaid ones, each with its
 * own private copy of the same arithmetic: `assemble` in
 * `components/social/StoryRail.tsx` and `withPromotions` in
 * `screens/explore/Community.tsx`. The rules they encode are identical in shape
 * and were written twice, which is how a "never last" rule ends up true on one
 * surface and false on the other after somebody edits one of them. This file is
 * that arithmetic, once, as functions a test can call.
 *
 * ── WHAT THIS FILE IS NOT ────────────────────────────────────────────────────
 *
 * IT IS NOT A GATE. Nothing here checks a tier, a date, a status, a country, a
 * declared goal or a dismissal. Hand it a placement and it will place one. Every
 * decision about WHETHER an athlete may be shown a promotion is made in two
 * other places and neither of them is here:
 *
 *   · the server, in `promoted_select` — active, and inside its own dates. That
 *     policy is the security boundary. A modified client cannot read a draft or
 *     an expired campaign, and nothing in this file is relied on to stop it.
 *   · `social/promoted.ts` — the subscriber rule, the targeting, the dismissals,
 *     and the surface a row named. It returns a list; this file orders it.
 *
 * Saying so plainly matters, because a module named "promotedSlides" is exactly
 * the file a later reader would expect the filtering to live in, and would then
 * "helpfully" add a date check to. There is one already, on a machine the
 * athlete does not own.
 *
 * IT CANNOT MAKE A SLIDE SAY "PROMOTED". `StoryViewer.tsx` draws a promotion in
 * `PromotedSlideView` and nothing else can draw one, so the badge cannot be lost
 * to an edit of a shared component: the branch that renders the advertisement is
 * the branch that renders the label. The union arms below — `{ kind: "promoted";
 * placement }` beside `{ kind: "story"; story }` and `{ kind: "post"; post }` —
 * are what keep that property while the two kinds travel in one list. A function
 * here returns a list that has NAMED which entries are paid; a renderer that
 * ignores the name is a renderer that has thrown the disclosure away, and no
 * data module can stop it. Keep the branch.
 *
 * ── THE CONSTANTS ARE NOT DEFINED HERE, ON PURPOSE ───────────────────────────
 *
 * `every` is a required argument, never a default. The cadence is a product
 * decision that already has a home — `STORIES_BETWEEN_PROMOTIONS` in
 * `StoryRail.tsx`, `POSTS_BETWEEN_PROMOTIONS` in `Community.tsx`, each with the
 * argument for its number written above it — and a default in this file would
 * quietly become a third answer the day one of those changed. There is no
 * reasonable default anyway: "how often should this app show advertisements" is
 * not a question a helper function gets to answer.
 *
 * ── PURE, AND WHY THAT IS THE POINT ──────────────────────────────────────────
 *
 * No React, no fetch, no clock, no `import.meta.env`, and no imports at all —
 * the shapes are generic, so this module can be bundled by `npm test`'s esbuild
 * step and run under plain node without dragging a component tree behind it.
 * Same input, same output, every time. The rules are three lines of arithmetic
 * whose failures are invisible in review (an ad on the end of a run, two in a
 * row, one at the top of an empty feed) and obvious in a test.
 */

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How often a promotion may appear, and at most how many.
 *
 * `every` counts UNPAID ITEMS, never slides — see `promotionSlots`.
 *
 * `max` is a ceiling on one run and is off unless it is given, so it changes
 * nothing on either surface today. It exists because the owner's instruction for
 * the feed was advertising "a little bit" (quoted at `Community.tsx`), and on a
 * long scroll a cadence alone does not express that: one every six posts is one
 * ad on a short feed and eleven on a long one. A ceiling is the only knob that
 * says "a little bit" regardless of how much the athlete scrolls.
 */
export interface PromotionCadence {
  /** One promotion after every this many items. Below 1 means none at all. */
  every: number;
  /** At most this many in one run. Omitted = no ceiling. */
  max?: number;
}

/** One slide of a story run: somebody's story, or a labelled promotion. */
export type StorySlideOf<S, P> = { kind: "story"; story: S } | { kind: "promoted"; placement: P };

/** One entry in a scrolling feed: somebody's post, or a labelled promotion. */
export type FeedItemOf<T, P> = { kind: "post"; post: T } | { kind: "promoted"; placement: P };

/** One person and their stories, oldest first — the order they were lived. */
export interface StoryGroup<A, S> {
  person: A;
  stories: S[];
}

/** A person on the rail, and where their first story sits in the slide list. */
export interface StoryRailEntryOf<A, S> extends StoryGroup<A, S> {
  /**
   * Index into the FLAT SLIDE LIST, promotions included — what the rail hands
   * to the viewer as `startIndex`. One index space for both surfaces, which is
   * the reason a tap on the third face cannot open the second person's story.
   */
  slideIndex: number;
}

export interface StoryRunPlan<A, S, P> {
  /** Every slide in order, promotions interleaved. */
  slides: StorySlideOf<S, P>[];
  /** One entry per person, in rail order. */
  entries: StoryRailEntryOf<A, S>[];
  /**
   * The placements that actually made it into the run, in the order they first
   * appear, each listed once.
   *
   * THIS IS THE LIST A CALLER MAY RECORD A VIEW FOR, and the reason it is
   * returned rather than assumed: a surface can hold three placements and have
   * room for none — four posts at one-every-six places nothing — and recording a
   * view for a card that was never in the list would be a claim about a screen
   * this app cannot see. Compared by identity, not by id: round-robin hands back
   * the very objects it was given, so identity is exact here and needs no
   * accessor.
   */
  placed: P[];
}

export interface FeedPlan<T, P> {
  items: FeedItemOf<T, P>[];
  /** As `StoryRunPlan.placed`. */
  placed: P[];
}

/* -------------------------------------------------------------------------- */
/* The rule                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * AFTER WHICH ITEMS DOES A PROMOTION GO — the whole rule, isolated.
 *
 * Returns zero-based indexes into the unpaid list: a `2` means "a promotion
 * follows the third item". Both surfaces are the same rule with a different
 * number, so both call this, and a change to the rule is one edit.
 *
 * THREE PROPERTIES, EACH OF WHICH IS A DECISION.
 *
 * NEVER LAST. The last index is unreachable — `i` stops one short of `total`.
 * A run that ends on an advertisement ends on the one slide the athlete did not
 * come for, and a scroll that ends on one reads as the app's parting word.
 *
 * NEVER FIRST. Structural rather than checked: a promotion is only ever emitted
 * AFTER an item, so index -1 does not exist. It holds even at `every: 1`.
 *
 * NEVER TWO IN A ROW. Also structural: the counter runs over UNPAID ITEMS, so a
 * promotion never brings the next one closer. However many placements are
 * available, they cannot bunch.
 *
 * `every` below 1 places nothing. A promotion "after every zero items" has no
 * meaning, and the arithmetic that would otherwise run — `n % 0` is `NaN`, which
 * is never equal to `0` — is silence arrived at by accident. This is silence
 * arrived at on purpose, which is a different thing to read six months later.
 */
export function promotionSlots(total: number, cadence: PromotionCadence): number[] {
  const every = Math.floor(cadence.every);
  if (!Number.isFinite(every) || every < 1) return [];
  if (!Number.isFinite(total) || total < 2) return [];

  const ceiling = cadence.max === undefined ? Number.POSITIVE_INFINITY : Math.floor(cadence.max);
  if (ceiling < 1) return [];

  const slots: number[] = [];
  // `i` is how many items have been placed. It stops at `total - 1` because
  // something must follow — that is the "never last" rule, written as a bound
  // rather than as a condition inside the loop, so it cannot be edited out of
  // one branch and left in another.
  for (let i = every; i < total; i += every) {
    if (slots.length >= ceiling) break;
    slots.push(i - 1);
  }
  return slots;
}

/**
 * Which placement fills the nth slot: round robin, in the order given.
 *
 * The order is the query's — `starts_on` then `id`, fixed in `promoted.ts` —
 * and rotation means every campaign is drawn once before any is drawn twice.
 * ICEFALL sells no auction and runs no bidding; a random pick would make the
 * number of times an advertiser was shown depend on something nobody agreed to.
 */
function nth<P>(placements: readonly P[], n: number): P {
  return placements[n % placements.length]!;
}

/* -------------------------------------------------------------------------- */
/* The story run                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Groups stories by author, people in the order their first story appears and
 * each person's own stories oldest first — the order a run reads in.
 *
 * An unparseable `createdAt` sorts as equal rather than as `NaN`. A comparator
 * that returns `NaN` leaves the order to the engine, which is not a decision
 * anybody made; equal at least keeps the stories in the order they arrived.
 */
export function groupStoriesByAuthor<S extends { author: { id: string }; createdAt: string }>(
  stories: readonly S[],
): StoryGroup<S["author"], S>[] {
  const order: string[] = [];
  const byId = new Map<string, StoryGroup<S["author"], S>>();

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
      stories: [...group.stories].sort((a, b) => {
        const d = +new Date(a.createdAt) - +new Date(b.createdAt);
        return Number.isNaN(d) ? 0 : d;
      }),
    };
  });
}

/**
 * Lays a story run out: people in order, a promotion every `every` stories, and
 * never one on the end.
 *
 * THE COUNTER RUNS OVER STORIES, NOT OVER SLIDES, and it runs across people
 * rather than restarting per person — a run of four people with one story each
 * gets a promotion after the third, which is what "after every three stories"
 * means to the person watching. Restarting the count per person would mean a
 * rail of single-story people never showed one at all.
 *
 * `entries` is computed as the slides are built, so a person's `slideIndex`
 * already counts the promotions in front of them. That is the one part of this
 * that is easy to get wrong by hand and silent when it is wrong: the rail opens
 * the viewer at the wrong slide, and nothing throws.
 */
export function interleaveStoryRun<A, S, P>(
  groups: readonly StoryGroup<A, S>[],
  placements: readonly P[],
  cadence: PromotionCadence,
): StoryRunPlan<A, S, P> {
  const slides: StorySlideOf<S, P>[] = [];
  const entries: StoryRailEntryOf<A, S>[] = [];
  const placed: P[] = [];

  const total = groups.reduce((n, g) => n + g.stories.length, 0);
  const slots = placements.length === 0 ? [] : promotionSlots(total, cadence);
  const after = new Set(slots);

  let ordinal = 0; /* stories placed so far, across everybody */
  /*
   * OCCURRENCES, NOT DISTINCT CAMPAIGNS, and they are different numbers the
   * moment the rotation wraps. Rotating on `placed.length` looks equivalent and
   * is not: once every campaign has been drawn once that figure stops growing,
   * so every later slot draws the same advertiser for ever. Caught by the
   * equivalence check against the original, not by reading it.
   */
  let occurrences = 0;

  for (const group of groups) {
    entries.push({
      person: group.person,
      stories: group.stories,
      slideIndex: slides.length,
    });

    for (const story of group.stories) {
      slides.push({ kind: "story", story });

      if (after.has(ordinal)) {
        const placement = nth(placements, occurrences);
        occurrences += 1;
        slides.push({ kind: "promoted", placement });
        if (!placed.includes(placement)) placed.push(placement);
      }
      ordinal += 1;
    }
  }

  return { slides, entries, placed };
}

/**
 * `groupStoriesByAuthor` and `interleaveStoryRun` in one call — the shape the
 * rail actually needs from a flat list of stories.
 */
export function planStoryRun<S extends { author: { id: string }; createdAt: string }, P>(
  stories: readonly S[],
  placements: readonly P[],
  cadence: PromotionCadence,
): StoryRunPlan<S["author"], S, P> {
  return interleaveStoryRun(groupStoriesByAuthor(stories), placements, cadence);
}

/* -------------------------------------------------------------------------- */
/* The feed                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Lays promotions into a scroll: one every `every` posts, never on the end.
 *
 * Same rule, same function behind it, different number. A feed has no grouping
 * to respect, so this is `promotionSlots` applied directly.
 *
 * ONE THING THE CALLER STILL OWES. Interleave the posts the reader will actually
 * see — after the filter, not before. A promotion placed against the unfiltered
 * list lands at the wrong count, and on a filter that matched two posts it lands
 * on the end, which is the rule this function exists to keep.
 */
export function interleaveFeed<T, P>(
  posts: readonly T[],
  placements: readonly P[],
  cadence: PromotionCadence,
): FeedPlan<T, P> {
  const items: FeedItemOf<T, P>[] = [];
  const placed: P[] = [];

  const slots = placements.length === 0 ? [] : promotionSlots(posts.length, cadence);
  const after = new Set(slots);
  /* Occurrences, not distinct campaigns — see `interleaveStoryRun`. */
  let occurrences = 0;

  posts.forEach((post, i) => {
    items.push({ kind: "post", post });
    if (!after.has(i)) return;
    const placement = nth(placements, occurrences);
    occurrences += 1;
    items.push({ kind: "promoted", placement });
    if (!placed.includes(placement)) placed.push(placement);
  });

  return { items, placed };
}

/* -------------------------------------------------------------------------- */
/* Reading a plan back                                                        */
/* -------------------------------------------------------------------------- */

/**
 * How many promotions a plan contains — occurrences, not distinct campaigns.
 *
 * `placed.length` answers the other question ("how many campaigns appeared"),
 * and they differ the moment one campaign is rotated in twice. Neither is a
 * count of people, of screens or of anybody seeing anything: it is a count of
 * entries in a list this device built.
 */
export function countPromotions(entries: readonly ({ kind: string } | undefined)[]): number {
  let n = 0;
  for (const entry of entries) if (entry?.kind === "promoted") n += 1;
  return n;
}

/**
 * The distinct placements inside a mixed list, in order of first appearance.
 *
 * For a caller that has a list from somewhere else — a surface that assembled
 * its own, or a plan it was handed — and needs the set of campaigns in it. The
 * plans above return this as `placed`; this is for lists that did not come from
 * one, and it is what `Community.tsx` currently does inline over the story
 * run's slides.
 */
export function placementsIn<P>(
  entries: readonly ({ kind: "promoted"; placement: P } | { kind: string })[],
): P[] {
  const out: P[] = [];
  for (const entry of entries) {
    if (entry.kind !== "promoted") continue;
    const { placement } = entry as { kind: "promoted"; placement: P };
    if (!out.includes(placement)) out.push(placement);
  }
  return out;
}
