import { useEffect, useState } from "react";
import { haversine } from "@/tracking/filters";
import type { RecordedActivity } from "@/tracking/types";

/**
 * The athlete's own posts — the general half of the social layer.
 *
 * `summitLog.ts` holds the structured summit record; this holds everything
 * else a mountaineer shares: a photo from the hill, a line of text, a training
 * session, an objective. One store, one shape, every kind — the feed and the
 * profile both read it, and the day Supabase exists it becomes the publish
 * queue without changing shape.
 *
 * Attachments REFERENCE existing entities rather than copying them: an
 * activity attachment is the recording's id, a mountain attachment is a peak
 * id + name. Rule 42 of the social spec, and also just correct — a post must
 * not hold a second copy of a track that the recording already owns.
 */

export type OwnPostKind =
  | "photo"
  | "text"
  | "activity"
  | "objective"
  | "route";

export const OWN_POST_KIND_LABEL: Record<OwnPostKind, string> = {
  photo: "Post",
  text: "Post",
  activity: "Activity",
  objective: "Objective",
  route: "Route",
};

/** Who may see it — once there is anyone to see it. Stored now, honest now. */
export type PostPrivacy = "public" | "connections" | "group";

export const PRIVACY_LABEL: Record<PostPrivacy, string> = {
  public: "Public",
  connections: "Connections",
  group: "Group only",
};

export interface MountainRef {
  name: string;
  /** `osm:…` or a curated id — the key to the mountain's own page. */
  peakId?: string;
  elevationM?: number;
}

export interface OwnPost {
  id: string;
  kind: OwnPostKind;
  caption: string;
  /** Banner-sized JPEG data URLs. Capped — localStorage is a shared 5 MB. */
  photos: string[];
  mountain?: MountainRef;
  /** A recorded activity's id — metrics are read live from the recording. */
  activityId?: string;
  /** A saved trail's osmId. */
  routeOsmId?: number;
  /** An objective (goal) name + target date, copied small. */
  objective?: { name: string; when: string };
  privacy: PostPrivacy;
  createdAt: string;
}

const KEY = "icefall.posts.v1";
/** Photos are the storage hog; two per post keeps a long history affordable. */
export const MAX_POST_PHOTOS = 2;

function read(): OwnPost[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as OwnPost[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let current = read();
const listeners = new Set<(posts: OwnPost[]) => void>();

function write(next: OwnPost[]) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota — the post lives for the session */
  }
  listeners.forEach((l) => l(current));
}

export const ownPosts = (): OwnPost[] => current;

export function addPost(post: Omit<OwnPost, "id" | "createdAt">): OwnPost {
  const entry: OwnPost = {
    ...post,
    photos: post.photos.slice(0, MAX_POST_PHOTOS),
    id: `post:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  write([entry, ...current]);
  return entry;
}

export function removePost(id: string) {
  write(current.filter((p) => p.id !== id));
}

export const postsForMountain = (name: string, peakId?: string): OwnPost[] =>
  current.filter(
    (p) =>
      p.mountain &&
      ((peakId && p.mountain.peakId === peakId) ||
        p.mountain.name.toLowerCase() === name.toLowerCase()),
  );

export function useOwnPosts(): OwnPost[] {
  const [posts, setPosts] = useState(current);
  useEffect(() => {
    listeners.add(setPosts);
    setPosts(current);
    return () => {
      listeners.delete(setPosts);
    };
  }, []);
  return posts;
}

/* -------------------------------------------------------------------------- */
/* Summit verification                                                         */
/* -------------------------------------------------------------------------- */

/** How close a recorded track must pass to the summit to count as reaching it. */
const SUMMIT_TOLERANCE_M = 75;

/**
 * The one verification ICEFALL can honestly perform.
 *
 * `SUMMIT_VERIFIED_MEANING` has said it from the start: verified means an
 * activity recorded in ICEFALL carried a track that reached the summit — a
 * claim about the TRACK, never about the person. So the check is exactly that:
 * a real (non-simulated) recording whose GPS line passes within 75 metres of
 * the summit's coordinates. No recording, or a simulated one, or a track that
 * stops below the top: not verified, and the card simply carries no tick —
 * an unverified log is a normal log, not an accusation.
 */
export function trackReachedSummit(
  activity: RecordedActivity | undefined,
  summit: { lat: number; lon: number },
): boolean {
  if (!activity || activity.simulated) return false;
  return activity.points.some(
    (p) => haversine({ lat: p.lat, lon: p.lon }, summit) <= SUMMIT_TOLERANCE_M,
  );
}

/* -------------------------------------------------------------------------- */
/* Leaderboard-grade totals — VERIFIED ONLY                                    */
/* -------------------------------------------------------------------------- */

export interface VerifiedTotals {
  /** Metres of elevation gained across real (non-simulated) recordings. */
  verticalM: number;
  /** Real recordings counted. */
  activities: number;
}

/**
 * What the leaderboard may count for this athlete: recorded, non-simulated
 * effort and nothing else. Self-reported summits and logs stay on the profile
 * and the passport — they are records, not rankings — and no invented number
 * ever enters a table that compares people.
 */
export function verifiedTotals(recorded: RecordedActivity[]): VerifiedTotals {
  const real = recorded.filter((r) => !r.simulated);
  return {
    verticalM: Math.round(real.reduce((m, r) => m + r.elevationGainM, 0)),
    activities: real.length,
  };
}
