import { isKnown, known, unavailable, type Score } from "@/coach/types";
import { EXPERIENCE_LABELS, type ExperienceLevel, type Expedition } from "@/network/types";

/**
 * Group planning — the model behind Social's Groups tab and its workspace
 * (/social?tab=groups and /social/groups/:id).
 *
 * A GROUP IS AN `Expedition`. There is no second entity here and there must
 * never be one: a party forming around one mountain and one date window is
 * already modelled in `@/network/types`, it is already created through
 * `createExpedition`, and a parallel "Group" record would fork the membership,
 * the party size and the objective into two places that could disagree about
 * the same trip. Everything this module adds is either derived from an
 * `Expedition` or keyed to one by id.
 *
 * What is genuinely new is the PLANNING layer — training sessions, notes,
 * messages and how the party intends to climb — and every one of those is held
 * on this device. ICEFALL has no server and no other members, so:
 *
 *   · An RSVP is the athlete's own note to themselves. Nobody is told.
 *   · A message reaches nobody, and the surface that shows one says so.
 *   · Sharing the checklist is a recorded INTENTION, not a transmission.
 *
 * Nothing in this file may invent a member, a group or a measurement. The mean
 * readiness below is the clearest case: members whose readiness is unknown are
 * removed from the numerator AND the denominator rather than being scored as
 * zero, and the caller is handed the count that actually contributed so it can
 * say so on screen.
 */

/* -------------------------------------------------------------------------- */
/* How the party intends to climb                                              */
/* -------------------------------------------------------------------------- */

/**
 * Guided or independent.
 *
 * Kept beside the group rather than on the `Expedition` record because it is a
 * planning decision that changes during planning, and because every group
 * created before this existed would otherwise carry a silent default. Absent
 * means NOT RECORDED — never "independent", which would be ICEFALL deciding on
 * someone's behalf that they are climbing without a guide.
 *
 * It describes an intention and nothing more. It does not change what the
 * mountain demands, and ICEFALL still defers to an IFMGA/UIAGM-certified guide
 * for anything glaciated, technical or at altitude.
 */
export type GroupStyle = "guided" | "independent";

export const GROUP_STYLE_LABELS: Record<GroupStyle, string> = {
  guided: "With a guide",
  independent: "Independent",
};

/* -------------------------------------------------------------------------- */
/* Training sessions                                                           */
/* -------------------------------------------------------------------------- */

/** Going, maybe, or not. There is no "no reply" state — an absent RSVP is that. */
export type RsvpStatus = "going" | "maybe" | "not-going";

export const RSVP_LABELS: Record<RsvpStatus, string> = {
  going: "Going",
  maybe: "Maybe",
  "not-going": "Can't make it",
};

/**
 * A session the group plans to do together.
 *
 * `dayKey` is a LOCAL `YYYY-MM-DD` day, never an instant. A session is "Saturday
 * the 14th" to the people going, and storing an ISO timestamp would move it to
 * the 13th for anyone west of Greenwich the moment it was read back.
 */
export interface GroupTrainingSession {
  id: string;
  groupId: string;
  title: string;
  /** Local day key, `YYYY-MM-DD`. See `todayKey`. */
  dayKey: string;
  /** Local `HH:MM`, optional — plenty of sessions are "sometime on Saturday". */
  time?: string;
  place?: string;
  note?: string;
  /**
   * Athlete id → status. Only the local athlete can ever appear in here: there
   * is nobody else to reply, and an entry for anyone else would be an invented
   * commitment from an invented person.
   */
  rsvps: Record<string, RsvpStatus>;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Something the athlete wrote in a group.
 *
 * There is no `status` field and there must not be one. A "sent" or "delivered"
 * flag would be the app claiming a message left the device, and somebody could
 * set off for a mountain believing the party had been told a plan changed.
 */
export interface GroupMessage {
  id: string;
  groupId: string;
  authorId: string;
  body: string;
  at: string;
}

/** Said wherever a message is written, before it is written. */
export const GROUP_CHAT_NOTICE =
  "Messages are held on this device and reach nobody. ICEFALL has no server and no other members, so nothing here is delivered, nobody is notified, and no reply can arrive. Anything the party needs to know has to be told to them another way.";

/** Said beside the checklist-sharing switch, which shares with nobody today. */
export const CHECKLIST_SHARING_NOTICE =
  "What you record against each item stays yours. Sharing is off until you turn it on, and turning it on records your intention rather than sending anything — there is no server to share through and, today, nobody else in the group to share with.";

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** Local `YYYY-MM-DD` for a date. Never `toISOString()` — see `parseDay`. */
export function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * A `YYYY-MM-DD` day (or the date part of a longer ISO string) as LOCAL midnight.
 *
 * NEVER `new Date(iso)` for a bare date: the platform parses it as UTC midnight,
 * so `toLocaleDateString` renders the previous day for everyone west of
 * Greenwich. A departure window or a countdown that reads a day early is a real
 * problem, and this codebase has already been bitten by the same bug elsewhere.
 */
export function parseDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // Rejects 2027-02-31, which the Date constructor would roll silently into March.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** Whole days between two LOCAL midnights. Rounded, so DST cannot shift a day. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

const DAY_MONTH_YEAR: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
};
const DAY_MONTH: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
const WEEKDAY_DAY_MONTH: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
};

/**
 * The date window, collapsed to the shortest form that stays unambiguous.
 *
 * Unparseable dates say so rather than falling back to today — a fabricated
 * departure date is the same class of error as a fabricated person.
 */
export function formatWindow(window: { fromIso: string; toIso: string }): string {
  const from = parseDay(window.fromIso);
  const to = parseDay(window.toIso);
  if (!from || !to) return "Dates not recorded";

  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();

  if (sameMonth && from.getDate() === to.getDate()) {
    return from.toLocaleDateString("en-GB", DAY_MONTH_YEAR);
  }
  if (sameMonth) {
    return `${from.getDate()}–${to.toLocaleDateString("en-GB", DAY_MONTH_YEAR)}`;
  }
  if (sameYear) {
    return `${from.toLocaleDateString("en-GB", DAY_MONTH)} – ${to.toLocaleDateString("en-GB", DAY_MONTH_YEAR)}`;
  }
  return `${from.toLocaleDateString("en-GB", DAY_MONTH_YEAR)} – ${to.toLocaleDateString("en-GB", DAY_MONTH_YEAR)}`;
}

/** A single local day, written out. */
export function formatDay(dayKey: string): string {
  const day = parseDay(dayKey);
  return day ? day.toLocaleDateString("en-GB", WEEKDAY_DAY_MONTH) : "Date not recorded";
}

export type WindowState = "unknown" | "before" | "open" | "passed";

export interface WindowCountdown {
  state: WindowState;
  /** The countdown itself, e.g. "42 days to the window". */
  label: string;
  /** One further fact, or null. Never a nudge towards a decision. */
  note: string | null;
}

/**
 * The countdown, built from LOCAL date components at both ends.
 *
 * Today is local midnight and so are the window's ends, so "42 days" means 42
 * calendar days on the athlete's own calendar rather than 42 UTC days that
 * could read one out either side of midnight. It states a fact and stops there:
 * no urgency, no "only 3 days left", nothing pressing anybody towards a
 * mountain they are not ready for.
 */
export function windowCountdown(
  window: { fromIso: string; toIso: string },
  now: Date = new Date(),
): WindowCountdown {
  const from = parseDay(window.fromIso);
  const to = parseDay(window.toIso);
  if (!from || !to) {
    return {
      state: "unknown",
      label: "Dates not recorded",
      note: "There is no window to count down to.",
    };
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const spanDays = daysBetween(from, to) + 1;

  if (daysBetween(today, from) > 0) {
    const days = daysBetween(today, from);
    return {
      state: "before",
      label: days === 1 ? "1 day to the window" : `${days} days to the window`,
      note: spanDays === 1 ? null : `The window runs for ${spanDays} days.`,
    };
  }

  if (daysBetween(to, today) > 0) {
    const days = daysBetween(to, today);
    return {
      state: "passed",
      label: days === 1 ? "The window closed yesterday" : `The window closed ${days} days ago`,
      note: null,
    };
  }

  const dayOf = daysBetween(from, today) + 1;
  return {
    state: "open",
    label: "The window is open now",
    note: spanDays === 1 ? null : `Day ${dayOf} of ${spanDays}.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Group readiness                                                             */
/* -------------------------------------------------------------------------- */

export interface GroupReadiness {
  /** The mean of the members whose readiness is known, or the reason there is none. */
  score: Score;
  /** How many members contributed a figure. */
  contributing: number;
  /** How many members were considered. */
  members: number;
}

/**
 * The MEAN readiness of a party, over the members ICEFALL has a figure for.
 *
 * A mean, and deliberately not a minimum, a ranking or a "weakest link": this
 * number exists so a party can see roughly where it stands while it plans, and
 * the moment it becomes an ordering it becomes pressure on whoever is at the
 * bottom of it. The screens that draw it never sort members by it.
 *
 * Members with no known readiness are dropped from BOTH sides of the average —
 * scoring an unknown as zero would drag a party's figure down with a number
 * ICEFALL never worked out — and `contributing` is returned so the caller can
 * say how many people the figure actually describes. When nobody has a known
 * readiness there is no mean, and the absence carries its reason.
 */
export function meanReadiness(scores: readonly Score[]): GroupReadiness {
  const values = scores.filter(isKnown).map((s) => s.value);
  if (values.length === 0) {
    // No mean, rather than a mean of nothing. `no-data` is the weakest claim in
    // the vocabulary and the only true one here: whether the party is empty or
    // simply has no assessable member, ICEFALL has no figure to average.
    return { score: unavailable("no-data"), contributing: 0, members: scores.length };
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return {
    score: known(Math.round(mean)),
    contributing: values.length,
    members: scores.length,
  };
}

/**
 * Said wherever group readiness appears.
 *
 * It has two jobs: to stop the figure being read as a verdict on the party, and
 * to stop it being read as an ordering of the people in it.
 */
export const GROUP_READINESS_NOTE =
  "Group readiness is the average of the members ICEFALL has a figure for. It is planning information, not a ranking and not a verdict on anyone: nobody is scored against anybody else, and a member whose readiness is unknown is left out of the average rather than counted as a zero.";

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

export type DateFilter = "any" | "open-now" | "next-90" | "this-year" | "passed";

export const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  any: "Any date",
  "open-now": "Open now",
  "next-90": "Next 3 months",
  "this-year": "This year",
  passed: "Passed",
};

/** Buckets that describe a rope team, a small party and a big one. */
export type SizeFilter = "any" | "pair" | "small" | "large";

export const SIZE_FILTER_LABELS: Record<SizeFilter, string> = {
  any: "Any size",
  pair: "Pair",
  small: "3–4",
  large: "5–8",
};

const SIZE_RANGES: Record<Exclude<SizeFilter, "any">, { min: number; max: number }> = {
  pair: { min: 2, max: 2 },
  small: { min: 3, max: 4 },
  large: { min: 5, max: 8 },
};

export type StyleFilter = "any" | GroupStyle | "not-recorded";

export const STYLE_FILTER_LABELS: Record<StyleFilter, string> = {
  any: "Any style",
  guided: GROUP_STYLE_LABELS.guided,
  independent: GROUP_STYLE_LABELS.independent,
  "not-recorded": "Not recorded",
};

export interface GroupFilters {
  /** An exact peak name taken from the groups that exist. Never free text. */
  peakName: string | null;
  date: DateFilter;
  experience: ExperienceLevel | null;
  size: SizeFilter;
  style: StyleFilter;
  /** Groups whose stated intent includes training together. */
  trainingTogether: boolean;
}

export const NO_FILTERS: GroupFilters = {
  peakName: null,
  date: "any",
  experience: null,
  size: "any",
  style: "any",
  trainingTogether: false,
};

export function anyFilterActive(f: GroupFilters): boolean {
  return (
    f.peakName !== null ||
    f.date !== "any" ||
    f.experience !== null ||
    f.size !== "any" ||
    f.style !== "any" ||
    f.trainingTogether
  );
}

/** How many facets are narrowing the list, for the "N filters" caption. */
export function activeFilterCount(f: GroupFilters): number {
  return [
    f.peakName !== null,
    f.date !== "any",
    f.experience !== null,
    f.size !== "any",
    f.style !== "any",
    f.trainingTogether,
  ].filter(Boolean).length;
}

function matchesDate(group: Expedition, filter: DateFilter, now: Date): boolean {
  if (filter === "any") return true;
  const from = parseDay(group.window.fromIso);
  const to = parseDay(group.window.toIso);
  // A window that cannot be read matches nothing except "any". It is not
  // quietly treated as upcoming, which would put an unreadable date into a list
  // the athlete is using to plan around dates.
  if (!from || !to) return false;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filter) {
    case "open-now":
      return daysBetween(from, today) >= 0 && daysBetween(today, to) >= 0;
    case "passed":
      return daysBetween(to, today) > 0;
    case "next-90": {
      const horizon = new Date(today.getTime() + 90 * DAY_MS);
      // Overlaps the next 90 days, rather than merely starting inside them: a
      // window that opened last week and runs into next month is still a trip
      // in the next three months.
      return daysBetween(today, to) >= 0 && from.getTime() <= horizon.getTime();
    }
    case "this-year":
      return from.getFullYear() === today.getFullYear() || to.getFullYear() === today.getFullYear();
  }
}

function matchesSize(group: Expedition, filter: SizeFilter): boolean {
  if (filter === "any") return true;
  const bucket = SIZE_RANGES[filter];
  // Overlap, not containment: a party of 2–4 genuinely is a pair as well as a
  // small team, and a group should not vanish from a facet it satisfies.
  return group.sizeMin <= bucket.max && group.sizeMax >= bucket.min;
}

function matchesStyle(style: GroupStyle | undefined, filter: StyleFilter): boolean {
  if (filter === "any") return true;
  if (filter === "not-recorded") return style === undefined;
  return style === filter;
}

/**
 * Whether a group survives the filters.
 *
 * This runs over the athlete's REAL groups — the only ones that exist — so an
 * empty result here means "none of yours match", which is a true statement
 * about a real search. That is a different sentence from the discovery list,
 * where nothing matched because there is nothing to search, and the screen must
 * never blur the two.
 */
export function matchesFilters(
  group: Expedition,
  style: GroupStyle | undefined,
  filters: GroupFilters,
  now: Date = new Date(),
): boolean {
  if (filters.peakName !== null && group.peakName !== filters.peakName) return false;
  if (filters.experience !== null && group.experience !== filters.experience) return false;
  if (filters.trainingTogether && !group.lookingFor.includes("training-partners")) return false;
  if (!matchesSize(group, filters.size)) return false;
  if (!matchesStyle(style, filters.style)) return false;
  return matchesDate(group, filters.date, now);
}

/* -------------------------------------------------------------------------- */
/* Sharing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The paragraph that travels with every shared group.
 *
 * It goes inside the exported text rather than only on the screen, because the
 * text is the only thing the recipient ever sees. Two claims it must make:
 * ICEFALL sent nothing, and ICEFALL has checked nobody.
 */
export const SHARE_FOOTER =
  "Shared from ICEFALL. This group exists only on the device it was created on — ICEFALL has no server, so there is no page to open, no link to follow, no way to join from this message, and nobody has been notified. Arrange everything directly with whoever sent it. ICEFALL does not check anyone's identity, experience, qualifications or safety.";

/** Why there is no link, said wherever a link would otherwise be offered. */
export const SHARE_LINK_UNAVAILABLE =
  "There is no link. ICEFALL has no server, so a group has no address anywhere — any URL shown here would simply fail to open for whoever you sent it to, which is worse than saying so. The card below is text you can send through anything you already use.";

/**
 * The shareable card, as plain text.
 *
 * Deliberately not a URL and deliberately not an image of one: a link would
 * promise a door that does not exist.
 */
export function groupSummary(
  group: Expedition,
  style: GroupStyle | undefined,
  elevationLabel: string,
): string {
  const lines: string[] = [
    `ICEFALL group — ${group.peakName}${elevationLabel ? ` (${elevationLabel})` : ""}`,
    formatWindow(group.window),
    `${group.memberIds.length} of ${group.sizeMax} members · party of ${group.sizeMin}–${group.sizeMax}`,
    `Experience: ${EXPERIENCE_LABELS[group.experience]} (self-declared)`,
  ];

  if (style !== undefined) lines.push(`Style: ${GROUP_STYLE_LABELS[style]} (intended)`);

  const description = group.description?.trim();
  if (description) lines.push("", description);

  lines.push("", SHARE_FOOTER);
  return lines.join("\n");
}
