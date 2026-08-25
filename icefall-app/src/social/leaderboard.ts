import type { RecordedActivity } from "@/tracking/types";
import type { Summit } from "@/types";

/**
 * Mountain leaderboards.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: a leaderboard may only ever count
 * VERIFIED effort — a real, non-simulated activity recorded in ICEFALL. Summit
 * logs, passport stamps and the summit list are self-reported records; they
 * belong on a profile and they do not belong in a table that ranks people
 * against each other. `SUMMIT_VERIFIED_MEANING` already draws that line for a
 * single summit ("the track reached the top — a claim about the track, not the
 * person"), and a ranking is exactly where the line matters most.
 *
 * THE SECOND RULE: no invented entries, ever. There is no backend, so there is
 * nobody to rank against, and the honest output of a worldwide leaderboard with
 * one athlete on it is an empty table plus that athlete's real totals — not a
 * podium of plausible strangers. Every function here returns the athlete's own
 * standing and an explicitly empty field.
 *
 * Anti-gaming (rule 29): the categories reward breadth and accumulation —
 * summits, vertical, diversity, countries, progress. Nothing here ranks speed
 * on a named route, because that is a table that rewards taking a risk for a
 * place on it.
 */

export type BoardScope = "world" | "country" | "mountain";
export type BoardCategory =
  | "summits"
  | "vertical"
  | "expeditions"
  | "diversity"
  | "countries"
  | "progress";
export type BoardPeriod = "week" | "month" | "year" | "all";

export const SCOPE_LABEL: Record<BoardScope, string> = {
  world: "World",
  country: "Country",
  mountain: "Mountain",
};

export const CATEGORY_LABEL: Record<BoardCategory, string> = {
  summits: "Summits",
  vertical: "Vertical",
  expeditions: "Expeditions",
  diversity: "Diversity",
  countries: "Countries",
  progress: "Progress",
};

/** What each category actually counts — printed under the table, not implied. */
export const CATEGORY_MEANING: Record<BoardCategory, string> = {
  summits: "Summits reached during an activity recorded in ICEFALL.",
  vertical: "Elevation gained across recorded activities.",
  expeditions: "Expeditions completed with recorded activity.",
  diversity: "Distinct mountains reached — breadth, not repetition of one hill.",
  countries: "Countries with at least one recorded ascent.",
  progress: "Change against your own previous period. You are the only benchmark.",
};

export const PERIOD_LABEL: Record<BoardPeriod, string> = {
  week: "This week",
  month: "This month",
  year: "This year",
  all: "All time",
};

/** Rule 23: the year is the default — long enough to mean something, short enough to move. */
export const DEFAULT_PERIOD: BoardPeriod = "year";

export function periodStart(period: BoardPeriod, now = new Date()): Date | null {
  const d = new Date(now);
  switch (period) {
    case "week": {
      // Monday-based, matching how a training week is read everywhere else.
      const day = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "month":
      return new Date(d.getFullYear(), d.getMonth(), 1);
    case "year":
      return new Date(d.getFullYear(), 0, 1);
    case "all":
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* The athlete's own standing                                                  */
/* -------------------------------------------------------------------------- */

export interface Standing {
  /** Verified summits reached in the period. */
  summits: number;
  /** Verified metres gained in the period. */
  verticalM: number;
  /** Distinct mountains reached. */
  distinctMountains: number;
  /** Countries with a recorded ascent. Absent until a location model exists. */
  countries: number;
  /** Recorded, non-simulated activities in the period. */
  activities: number;
  /**
   * Rank, when there is a population to rank within. Null is the honest answer
   * today and the screens print it as "—", never as "#1".
   */
  rank: number | null;
  /** How many athletes the rank is out of. Null for the same reason. */
  outOf: number | null;
}

/**
 * The athlete's verified standing.
 *
 * `verifiedSummits` are the summit names this athlete actually reached on a
 * recorded track — computed by the caller with `trackReachedSummit`, because
 * only the caller knows which peaks were candidates.
 */
export function standingFor({
  recorded,
  verifiedSummits,
  period,
  now = new Date(),
}: {
  recorded: RecordedActivity[];
  verifiedSummits: { name: string; date: string }[];
  period: BoardPeriod;
  now?: Date;
}): Standing {
  const from = periodStart(period, now);
  const inPeriod = (iso: string) => (from ? new Date(iso) >= from : true);

  const real = recorded.filter((r) => !r.simulated && inPeriod(r.startedAt));
  const summits = verifiedSummits.filter((s) => inPeriod(s.date));
  const distinct = new Set(summits.map((s) => s.name.toLowerCase()));

  return {
    summits: summits.length,
    verticalM: Math.round(real.reduce((m, r) => m + r.elevationGainM, 0)),
    distinctMountains: distinct.size,
    // Deliberately zero: ICEFALL holds no country for a recorded activity, and
    // guessing one from a coordinate is the location model this app has not
    // built. A zero that is explained beats a number that was inferred.
    countries: 0,
    activities: real.length,
    rank: null,
    outOf: null,
  };
}

/** The figure a category actually shows, from a standing. */
export function categoryValue(standing: Standing, category: BoardCategory): string {
  switch (category) {
    case "summits":
      return String(standing.summits);
    case "vertical":
      return `${standing.verticalM.toLocaleString("en-GB")} m`;
    case "expeditions":
      return "0";
    case "diversity":
      return String(standing.distinctMountains);
    case "countries":
      return String(standing.countries);
    case "progress":
      return standing.activities > 0 ? `${standing.activities} sessions` : "0";
  }
}

/* -------------------------------------------------------------------------- */
/* The field                                                                   */
/* -------------------------------------------------------------------------- */

export interface BoardEntry {
  athleteId: string;
  name: string;
  region?: string;
  avatar?: string;
  value: string;
  rank: number;
  isYou?: boolean;
  /**
   * Whether ICEFALL has confirmed this athlete's identity. It is a fact the
   * backend supplies, never something the screen infers from having a name and
   * a number: the tick is the one mark on this board that makes a claim about a
   * PERSON rather than about a track, so it renders only when this is true.
   */
  verified?: boolean;
}

/**
 * Everyone else on the board.
 *
 * Empty, and it will stay empty until there is a backend to fetch real athletes
 * from. This function exists so the screen has one obvious place to become a
 * query later, and so nobody is ever tempted to inline a demo array into the
 * component — which is how a fixture becomes a production leaderboard.
 */
export function boardEntries(): BoardEntry[] {
  return [];
}

export const EMPTY_BOARD_TITLE = "No verified rankings yet";
export const EMPTY_BOARD_BODY =
  "Rankings will appear as the ICEFALL community grows. Only summits reached on a recorded activity are counted — nothing typed in by hand, from anyone.";

export const EMPTY_MOUNTAIN_BOARD_TITLE = "No verified ascents yet";
export const EMPTY_MOUNTAIN_BOARD_BODY =
  "Be the first to record a verified ascent of this mountain on ICEFALL.";

/**
 * The second line of the board's footer.
 *
 * It says when a standing changes, and it deliberately does not promise a
 * refresh cadence ("rankings update hourly") for a service that does not exist
 * yet. What is true today is that your own figures move the moment an activity
 * is recorded, and that the community table starts when there is a community.
 */
export const RANKING_UPDATE_NOTICE =
  "Your standing recalculates the moment an activity finishes recording. Community rankings begin when there are verified athletes to rank against.";

export const VERIFIED_ONLY_NOTICE =
  "Leaderboards count only what ICEFALL recorded: a real activity whose track reached the summit. Summit logs and passport entries you typed yourself stay on your profile and are never ranked.";
