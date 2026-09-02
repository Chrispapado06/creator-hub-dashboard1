/**
 * COMMUNITY — the mountain activity feed.
 *
 * ── What is real and what is not ─────────────────────────────────────────────
 *
 * ICEFALL has no backend, so nobody has posted anything. The feed below is
 * DEMO CONTENT behind one flag, shown so the design can be reviewed and so the
 * wiring is exercised code rather than a branch nobody has run. It follows the
 * same pattern as `DEMO_OPERATORS` in `services/operators.ts`.
 *
 * It stops firmly short of one thing. `People.tsx` keeps its directory empty on
 * purpose — "adding a single entry here, even behind a flag, even labelled
 * demo, puts an invented climbing partner in front of someone planning a
 * mountain" — and that rule still holds. A post is something you read; a person
 * in a directory is somebody you might arrange to meet on a glacier. So these
 * authors exist as bylines on demo posts and are NOT discoverable people, do not
 * appear under People, and cannot be connected to.
 *
 * ── "Summit verified" ────────────────────────────────────────────────────────
 *
 * The badge means one specific, checkable thing: the summit was reached during
 * an activity recorded by ICEFALL's own tracker, and the track passed within
 * range of the summit coordinates. It does NOT mean ICEFALL vetted the person,
 * their experience or their judgement — nothing in this app does that.
 */

import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { DEMO } from "@/offline/offline";
import { OFFLINE_COMMUNITY_POSTS } from "@/offline/fixtures";
import type { PostKind } from "./types";

/**
 * THIS WAS HARD-CODED `true`, WHICH IS NOT A FLAG.
 *
 * The header above says the feed is "DEMO CONTENT behind one flag" and that it
 * "follows the same pattern as `DEMO_OPERATORS`". It did not: `DEMO_OPERATORS`
 * resolves through `SHOW_DEMO_DATA` and is `[]` at definition in an ordinary
 * build, while this constant was the literal `true`, so a plain production
 * bundle both contained and RENDERED nine invented climbers, their invented
 * summits and their invented "summit verified" badges as the community feed.
 * The comment describing the safeguard was doing the work the code was not.
 *
 * Now it is the same flag as everything else, and the posts are built inside a
 * guarded function so the names leave the bundle rather than merely leaving the
 * screen — see the long argument in `guides/types.ts`.
 */
/*
 * An OFFLINE build is a demo build by definition — it says so on every screen,
 * permanently — so the demo disclaimer belongs on the feed there too. This
 * reads the offline flag; it does not decide it. See `@/offline/offline`.
 */
export const SHOW_DEMO_COMMUNITY = SHOW_DEMO_DATA || DEMO;

export const COMMUNITY_DEMO_NOTICE =
  "Placeholder posts, shown to review this layout. Posting is not built, so nobody has posted anything — these people, times and figures were written by ICEFALL and none of it happened.";

/**
 * THERE WERE TWO STATEMENTS OF THE RULES AND NOW THERE IS ONE.
 *
 * This constant used to hold its own sentence — "Built for mountain athletes.
 * Be respectful. Report anything that doesn't belong." — rendered as the house
 * rule in `screens/explore/Community.tsx:470`. It was a second, and materially
 * different, statement of what is allowed here: "be respectful" is a clause
 * with no number, so a post removed under it could be neither cited nor
 * appealed.
 *
 * `social/houseRules.ts` now holds the owner's six numbered rules as the single
 * source of truth, and this is an alias of its one-line banner so the sentence
 * beside the shield POINTS AT them rather than standing in for them. The name
 * is kept so Community.tsx does not have to change; new code should import
 * `HOUSE_RULES_SUMMARY` directly.
 *
 * DO NOT GIVE THIS A STRING OF ITS OWN AGAIN. Two copies of the rules is how a
 * removal notice ends up citing text the app never showed.
 */
export { HOUSE_RULES_SUMMARY as COMMUNITY_HOUSE_RULE } from "./houseRules";

export const SUMMIT_VERIFIED_MEANING =
  "Verified means the summit was reached during an activity recorded in ICEFALL, and the track reached the summit. It is not a check on the person.";

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

export type FeedFilter = "for-you" | "following" | "my-mountains";

/**
 * Three filters, not six.
 *
 * The strip carried For You, My Mountains, Nearby, Training, Summits and
 * Expeditions — enough chips to scroll off the screen, and four of them slice a
 * feed that is nearly empty into emptier pieces. For You / Following / My
 * Mountains is the set that answers a different question each; the kind-filters
 * were a taxonomy the athlete never asked about.
 */
export const FEED_FILTERS: { id: FeedFilter; label: string; kinds?: PostKind[] }[] = [
  { id: "for-you", label: "For You" },
  { id: "following", label: "Following" },
  { id: "my-mountains", label: "My Mountains" },
];

/* -------------------------------------------------------------------------- */
/* Demo posts                                                                 */
/* -------------------------------------------------------------------------- */

import type { CommunityPost } from "./types";

/**
 * Times are given as "hours ago" rather than as instants.
 *
 * A hard-coded ISO date in demo content reads as "3 days ago" the week it is
 * written and "412 days ago" a year later, which is how placeholder data starts
 * looking like a bug. The screen resolves these against the clock when it
 * renders.
 */
/**
 * Guarded builder, not a top-level literal.
 *
 * The `import.meta.env` reads are spelled out INLINE and deliberately do not go
 * through `SHOW_DEMO_COMMUNITY` or `SHOW_DEMO_DATA`: the build-time
 * substitution has to be syntactically inside the branch for the branch to
 * fold, and with a named constant the bundler keeps every literal below. Do not
 * tidy this — the same edit was already documented as a trap in
 * `guides/types.ts`, and here it would put nine invented climbers back into the
 * production bundle with nothing in the app's behaviour to show it.
 */
function buildDemoPosts(): CommunityPost[] {
  if (!import.meta.env.DEV && import.meta.env.VITE_SHOW_DEMO !== "1") return [];
  return [
  {
    id: "p-activity-1",
    kind: "activity",
    hoursAgo: 2,
    author: { id: "a-alex", name: "Alex Martin", region: "Around Chamonix", avatar: "/img/guides/guide-demo-wehrli.jpg" },
    objective: { mountain: "Mont Blanc", when: "July 2027" },
    title: "Morning vertical session",
    stats: [
      { label: "Distance", value: "16.4 km" },
      { label: "Elevation", value: "+1,420 m" },
      { label: "Time", value: "4h 18m" },
    ],
    tags: ["Mont Blanc preparation", "Vertical endurance"],
    photo: "/img/onboarding-plan.jpg",
    likes: 14,
    comments: 3,
  },
  {
    id: "p-summit-1",
    kind: "summit",
    hoursAgo: 26,
    author: { id: "a-sarah", name: "Sarah D.", region: "Around Marrakesh", avatar: "/img/guides/guide-demo-kastrinaki.jpg" },
    objective: { mountain: "Toubkal", when: "Completed" },
    title: "Summited Toubkal",
    summit: { elevationM: 4167, range: "Atlas Mountains", verified: true },
    photo: "/img/toubkal-1.jpg",
    likes: 32,
    comments: 6,
  },
  {
    id: "p-report-1",
    kind: "route-report",
    hoursAgo: 30,
    author: { id: "a-james", name: "James Parker", region: "Around Litochoro", avatar: "/img/guides/guide-demo-ait-benhaddou.jpg" },
    objective: { mountain: "Olympus", when: "Route report" },
    title: "Trail conditions update",
    report: {
      condition: "Good",
      visibility: "Good",
      snow: "Above 2,900 m",
      note: "Snow starts around 2,900 m. Below that the trail is dry and the Spilios Agapitos path is clear.",
    },
    photo: "/img/mount-olympus-1.jpg",
    likes: 21,
    comments: 9,
  },
  {
    id: "p-partners-1",
    kind: "looking-for-partners",
    hoursAgo: 3,
    author: { id: "a-elena", name: "Elena Rossi", region: "Around Zermatt", avatar: "/img/guides/guide-demo-falkenrath.jpg" },
    objective: { mountain: "Matterhorn", when: "July 2027" },
    title: "Looking for 2 partners",
    bullets: ["Matterhorn", "12 – 16 July 2027", "Intermediate", "Based in Europe"],
    group: { filled: 4, size: 6 },
    photo: "/img/matterhorn.jpg",
    likes: 18,
    comments: 8,
  },
  {
    id: "p-milestone-1",
    kind: "milestone",
    hoursAgo: 5,
    author: { id: "a-mark", name: "Mark Williams", region: "Around Grenoble", avatar: "/img/guides/guide-demo-lama.jpg" },
    objective: { mountain: "Mont Blanc", when: "July 2027" },
    title: "80% ready for Mont Blanc",
    body: "Big week of training behind me. Final push starts now.",
    milestone: { pct: 80, label: "Ready" },
    likes: 26,
    comments: 4,
  },
  {
    id: "p-group-1",
    kind: "group",
    hoursAgo: 9,
    author: { id: "a-daniel", name: "Daniel Roux", region: "Around Courmayeur", avatar: "/img/guides/guide-demo-zelenika.jpg" },
    objective: { mountain: "Mont Blanc", when: "July 2027" },
    title: "Mont Blanc — July 2027",
    bullets: ["Intermediate", "Training together", "2 places available"],
    group: { filled: 4, size: 6 },
    photo: "/img/mont-blanc-2.jpg",
    likes: 11,
    comments: 5,
  },
  {
    id: "p-activity-2",
    kind: "activity",
    hoursAgo: 34,
    author: { id: "a-nina", name: "Nina Haugen", region: "Around Bergen", avatar: "/img/guides/guide-demo-halvorsen.jpg" },
    objective: { mountain: "Gran Paradiso", when: "September 2026" },
    title: "Long carry with a loaded pack",
    stats: [
      { label: "Distance", value: "22.1 km" },
      { label: "Elevation", value: "+1,180 m" },
      { label: "Time", value: "5h 02m" },
    ],
    tags: ["Pack carry", "Aerobic base"],
    photo: "/img/onboarding-track.jpg",
    likes: 9,
    comments: 1,
  },
  ];
}

export const DEMO_POSTS: CommunityPost[] = buildDemoPosts();

export const communityPosts = (): CommunityPost[] =>
  // The offline build brings its own posts. `DEMO_POSTS` is compiled away in
  // any built bundle (see the guard above), so without this the feed would be
  // empty in exactly the build that most needs something in it.
  DEMO ? OFFLINE_COMMUNITY_POSTS : SHOW_DEMO_COMMUNITY ? DEMO_POSTS : [];

/** "2h ago", "1d ago" — resolved at render, never stored. */
export function agoLabel(hoursAgo: number): string {
  if (hoursAgo < 1) return "just now";
  if (hoursAgo < 24) return `${Math.round(hoursAgo)}h ago`;
  const days = Math.round(hoursAgo / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
}
