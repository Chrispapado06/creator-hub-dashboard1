import { IS_DEMO } from "./demo";
import { PEAKS } from "./peaks";

/**
 * The social feed's content.
 *
 * ALL OF IT IS INVENTED, and gated at its DEFINITION — `IS_DEMO ? [ … ] : []`,
 * so a production build does not merely hide it, it does not contain it. That
 * matters more here than anywhere else in the app, because a social feed is
 * made of people: posts attributed to named climbers, a leaderboard ranking
 * them, follower and member counts. Seeding a real product's social surface
 * with invented athletes is how a marketplace ends up looking busier than it
 * is, and it is the one thing the phone app was told never to do.
 *
 * TWO THINGS THE REFERENCE DESIGN HAS THAT THIS DOES NOT:
 *
 *   VERIFICATION TICKS ON PEOPLE. ICEFALL verifies an OPERATOR's documents —
 *   that is what `verificationSentence` says and all it says. It does not
 *   verify a climber's identity, so a blue tick beside an athlete's name would
 *   be a badge this app grants itself for nothing.
 *
 *   PAST DATES. The reference posts a 2025 Everest trek and a "Everest Spring
 *   2025" group, both of which are behind us. Everything here is dated forward.
 */

export type PostKind = "summit" | "trek" | "rotation" | "training";

export interface Post {
  id: string;
  author: string;
  /** Where they were, as a place rather than a coordinate. */
  location: string;
  /** The peak this belongs to — also the id of the photograph used. */
  peakId: string;
  /** "Mont Blanc · July 2027" */
  trip: string;
  when: string;
  kind: PostKind;
  title: string;
  body: string;
  /** Peak ids used as the post's photographs. */
  photos: string[];
  /** Photographs beyond the three the grid shows. */
  morePhotos: number;
  likes: number;
  comments: number;
  shares: number;
}

export const POST_KIND_LABEL: Record<PostKind, string> = {
  summit: "Summit",
  trek: "Trek",
  rotation: "Rotation",
  training: "Training",
};

export const POSTS: Post[] = IS_DEMO
  ? [
      {
        id: "p1",
        author: "Alex Martin",
        location: "Chamonix, France",
        peakId: "mont-blanc",
        trip: "Mont Blanc · July 2027",
        when: "2h ago",
        kind: "summit",
        title: "Summit day on Mont Blanc",
        body: "Tough weather window but the team stayed strong. Left the Goûter at one, on top for sunrise, back in the valley by four.",
        photos: ["mont-blanc", "matterhorn", "eiger"],
        morePhotos: 6,
        likes: 234,
        comments: 18,
        shares: 7,
      },
      {
        id: "p2",
        author: "Nima Dorjee",
        location: "Khumbu Valley, Nepal",
        peakId: "everest",
        trip: "Everest Base Camp Trek · Spring 2027",
        when: "5h ago",
        kind: "trek",
        title: "Arrival at Everest Base Camp",
        body: "The Khumbu never disappoints. Eight days in from Lukla, slow and deliberate, and everyone walked in feeling good.",
        photos: ["everest", "ama-dablam", "lhotse"],
        morePhotos: 4,
        likes: 412,
        comments: 48,
        shares: 21,
      },
      {
        id: "p3",
        author: "Kristin Aalto",
        location: "Zermatt, Switzerland",
        peakId: "matterhorn",
        trip: "Matterhorn · Hörnli ridge",
        when: "1d ago",
        kind: "summit",
        title: "Hörnli ridge in four fifty",
        body: "Cold, clear, and no queue on the fixed ropes for once. Down before the afternoon build-up.",
        photos: ["matterhorn", "eiger"],
        morePhotos: 2,
        likes: 184,
        comments: 21,
        shares: 5,
      },
      {
        id: "p4",
        author: "Pemba Sherpa",
        location: "Everest Base Camp, Nepal",
        peakId: "everest",
        trip: "Everest · South Col",
        when: "1d ago",
        kind: "rotation",
        title: "Rotation three done",
        body: "Two nights at Camp 2 and a touch at Camp 3. Sleeping well, eating well. Now we wait on the forecast.",
        photos: ["everest", "lhotse", "cho-oyu"],
        morePhotos: 3,
        likes: 508,
        comments: 62,
        shares: 34,
      },
      {
        id: "p5",
        author: "Luca Ferrand",
        location: "Alaska Range, United States",
        peakId: "denali",
        trip: "Denali · West Buttress",
        when: "2d ago",
        kind: "rotation",
        title: "Day twelve, moving to fourteen camp",
        body: "Sleds packed at four to beat the sun on the Motorcycle Hill. Weather holding.",
        photos: ["denali"],
        morePhotos: 0,
        likes: 158,
        comments: 26,
        shares: 9,
      },
      {
        id: "p6",
        author: "Ana Ríos",
        location: "Mendoza, Argentina",
        peakId: "aconcagua",
        trip: "Aconcagua · Normal route",
        when: "3d ago",
        kind: "training",
        title: "Plaza de Mulas carry",
        body: "Snow all afternoon, wind dropped at six. Legs felt better than last week, which is the whole point.",
        photos: ["aconcagua", "ojos-del-salado"],
        morePhotos: 1,
        likes: 88,
        comments: 11,
        shares: 3,
      },
    ]
  : [];

export interface Story {
  id: string;
  author: string;
  peakId: string;
  /** Unseen stories get the ring in the reference design. */
  unseen: boolean;
}

export const STORIES: Story[] = IS_DEMO
  ? [
      { id: "s1", author: "Sara Khumbu", peakId: "ama-dablam", unseen: true },
      { id: "s2", author: "Nima Dorjee", peakId: "everest", unseen: true },
      { id: "s3", author: "Jason Wong", peakId: "k2", unseen: true },
      { id: "s4", author: "Lhakpa Sherpa", peakId: "lhotse", unseen: false },
      { id: "s5", author: "Kristin Aalto", peakId: "matterhorn", unseen: false },
      { id: "s6", author: "Luca Ferrand", peakId: "denali", unseen: false },
    ]
  : [];

export interface Group {
  id: string;
  name: string;
  members: number;
  peakId: string;
  blurb: string;
}

export const GROUPS: Group[] = IS_DEMO
  ? [
      { id: "g1", name: "Everest Spring 2027", members: 1240, peakId: "everest", blurb: "Everyone on the mountain this season, comparing forecasts." },
      { id: "g2", name: "Women Who Climb", members: 842, peakId: "ama-dablam", blurb: "Partners, beta and trip planning." },
      { id: "g3", name: "Alpine Photography", members: 623, peakId: "matterhorn", blurb: "Light, weight and what actually survives a summit push." },
      { id: "g4", name: "Seven Summits", members: 511, peakId: "vinson", blurb: "Logistics for the long project." },
      { id: "g5", name: "Winter Alpinism", members: 388, peakId: "eiger", blurb: "Conditions reports through the cold months." },
    ]
  : [];

export interface Contributor {
  id: string;
  name: string;
  points: number;
  posts: number;
  /** The peak they are best known for, for the avatar. */
  peakId: string;
}

/**
 * A leaderboard, and the most dangerous object in this file.
 *
 * It ranks people, which means it invents a hierarchy among climbers who do not
 * exist and presents it as a record of activity. It is here because the
 * reference design has it and the layout has to be judged with something in it
 * — and it is gated at the definition like everything else, so it cannot reach
 * a build. When real athletes post, this comes from their real activity or it
 * does not exist at all. It never gets seeded.
 */
export const CONTRIBUTORS: Contributor[] = IS_DEMO
  ? [
      { id: "c1", name: "Alex Martin", points: 4250, posts: 62, peakId: "mont-blanc" },
      { id: "c2", name: "Nima Dorjee", points: 3980, posts: 54, peakId: "everest" },
      { id: "c3", name: "Kristin Aalto", points: 3120, posts: 47, peakId: "matterhorn" },
      { id: "c4", name: "Pemba Sherpa", points: 2870, posts: 39, peakId: "lhotse" },
      { id: "c5", name: "Ana Ríos", points: 2310, posts: 35, peakId: "aconcagua" },
      { id: "c6", name: "Luca Ferrand", points: 1940, posts: 28, peakId: "denali" },
    ]
  : [];

/**
 * "Trending this week" — derived, not authored.
 *
 * The peaks people are actually posting about, counted from POSTS and broken by
 * altitude. A hand-written trending list is just an editor's opinion wearing
 * the clothes of a measurement.
 */
export function trendingPeaks(limit = 5) {
  const counts = new Map<string, number>();
  for (const p of POSTS) counts.set(p.peakId, (counts.get(p.peakId) ?? 0) + 1);
  return PEAKS.filter((p) => counts.has(p.id))
    .sort(
      (a, b) =>
        (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || b.elevationM - a.elevationM,
    )
    .slice(0, limit)
    .map((p) => ({ peak: p, posts: counts.get(p.id) ?? 0 }));
}

export const FEED_TABS = ["For you", "Following", "My mountains", "Trending"] as const;
export type FeedTab = (typeof FEED_TABS)[number];
