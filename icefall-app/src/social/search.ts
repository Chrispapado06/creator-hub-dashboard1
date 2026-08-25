import { DISCOVERABLE_ATHLETES, matchesAthlete } from "@/network/directory";
import type { AthleteProfile } from "@/network/types";
import { communityPosts } from "./community";
import type { CommunityPost } from "./types";

/**
 * Search across the social section — people and posts.
 *
 * ── WHAT IT SEARCHES, AND WHY THAT LIST IS SHORT ────────────────────────────
 *
 * People come from `DISCOVERABLE_ATHLETES`, which is empty and must stay empty
 * until a backend returns real people. So a name search finds nobody today.
 * That is the honest result, and the caller says so in those words rather than
 * rendering a blank panel that reads like a failure — an empty result that
 * implies a search ran against a populated directory is its own kind of lie.
 *
 * Posts come from the same source the feed reads, so search can never surface a
 * post the feed would not show.
 *
 * ── WHAT IT DELIBERATELY DOES NOT SEARCH ─────────────────────────────────────
 *
 * YOUR OWN posts and summit logs are not here. They were just taken out of the
 * feed on the same principle — your own writing belongs on your profile, and a
 * search box that answers "what did I post" is a filing cabinet, not discovery.
 * Profile → Posts is the place for that.
 *
 * A person is matched on their NAME and BIO only, never their objective. Being
 * able to type a mountain and get a list of who will be on it in March is a
 * different product from looking up someone you already know, and a much less
 * comfortable one. Finding partners for a peak is what People's own filters are
 * for, and the athlete opts into being findable that way.
 */

export interface SocialSearchResults {
  people: AthleteProfile[];
  posts: CommunityPost[];
  /** True once the query is long enough to have actually been run. */
  ran: boolean;
}

/**
 * One character is not a search — it matches most of everything and makes the
 * results flicker while someone is still typing the first letter of a name.
 */
export const MIN_QUERY = 2;

export const EMPTY_RESULTS: SocialSearchResults = { people: [], posts: [], ran: false };

function matchesPost(post: CommunityPost, q: string): boolean {
  const haystack = [
    post.title,
    post.body,
    post.author.name,
    post.objective.mountain,
    post.summit?.range,
    ...(post.tags ?? []),
  ];
  return haystack.some((field) => field?.toLowerCase().includes(q));
}

export function searchSocial(query: string): SocialSearchResults {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY) return EMPTY_RESULTS;

  return {
    people: DISCOVERABLE_ATHLETES.filter((a) => matchesAthlete(a, q)),
    posts: communityPosts().filter((p) => matchesPost(p, q)),
    ran: true,
  };
}
