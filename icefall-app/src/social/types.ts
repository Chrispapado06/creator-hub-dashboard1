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
