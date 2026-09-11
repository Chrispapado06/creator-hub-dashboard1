/**
 * THE PRE-TRIP TIMELINE — counted back from a real departure date, and honest
 * about which of its rows ICEFALL is being paid for.
 *
 * ============================================================================
 * WHERE THE DATES COME FROM
 * ============================================================================
 *
 * From `trip.startDate` and nowhere else. Every row's due date is the departure
 * date minus a fixed number of days, and the number of days is either (a) a
 * published piece of travel-health or travel-document guidance, attributed by
 * name on the row, or (b) ICEFALL's own suggestion, marked as ICEFALL's own.
 * There is no third kind. A reader can always see whose idea a deadline was.
 *
 * NOTHING HERE IS DERIVED FROM THE MOUNTAIN, and that is a limitation rather
 * than a design choice: ICEFALL has no per-country vaccine schedule, no visa
 * table and no permit calendar. A row that said "Nepal: apply for your TIMS
 * card by the 14th" would be invented. So the rows are the general ones, they
 * say they are general, and each points at the authority that actually knows.
 *
 * ============================================================================
 * THE INSURANCE ROW, WHICH IS THE ONE WITH A COMMERCIAL INTEREST IN IT
 * ============================================================================
 *
 * Insurance is where somebody sells you something. The house position is
 * already set by `components/domain/PromotedCard.tsx` — "the branch that draws
 * it is the branch that draws the label" — and this module follows it exactly:
 * `commercial: true` and `PAID_PLACEMENT_LABEL` are produced by the same
 * expression that produces the row, so no edit can keep the row and lose the
 * disclosure.
 *
 * AND TODAY THERE IS NOTHING TO SELL. ICEFALL has no insurance partner, no
 * broker, no affiliate link and no commission arrangement. The row therefore
 * names NO INSURER, carries no price and no cover, offers no tap — and says
 * both things: that no insurer is named, and that when one ever is, it will be
 * because they paid to be there. Disclosing the future arrangement now is the
 * point. A label that appears on the same day as the advertiser is a label
 * nobody was warned by.
 *
 * ============================================================================
 * OFFLINE
 * ============================================================================
 *
 * Pure. Takes a trip and today's date, returns rows. No fetch, no store, no
 * clock of its own.
 */

import { addDays, daysBetween, type Trip } from "./trip";

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

export type TimelineKind = "documents" | "health" | "insurance" | "gear" | "plan";

/** Who decided this deadline. Printed on every row. */
export type TimelineAuthority =
  /** Standard published travel guidance, named in `authorityNote`. */
  | "published"
  /** ICEFALL's own suggestion, and the row says so. */
  | "icefall";

export interface TimelineItem {
  /** Persisted in the tick store — do not rename. */
  id: string;
  kind: TimelineKind;
  title: string;
  /** What to do, in one or two sentences. */
  detail: string;
  /** How many days before departure this falls. */
  daysBefore: number;
  /** The calendar date it falls on, from the trip's own start date. */
  dueDate: string;
  authority: TimelineAuthority;
  /** Who says so, or why it is ICEFALL's own suggestion. Always populated. */
  authorityNote: string;
  /**
   * True when ICEFALL has, or will have, a commercial interest in this row.
   * The label is emitted by the same expression — see the header.
   */
  commercial: boolean;
  /** `PAID_PLACEMENT_LABEL` when `commercial`, null otherwise. */
  commercialLabel: string | null;
  /**
   * An in-app destination, when one genuinely exists. Null means there is no
   * tap — never a tap that does nothing (house rule 3).
   */
  to: string | null;
  /** Why there is no destination, when there is none and a reader would expect one. */
  noDestinationReason: string | null;
}

export const PAID_PLACEMENT_LABEL = "Paid placement";

/** Printed above the insurance row, whether or not an insurer is ever named. */
export const INSURANCE_DISCLOSURE =
  "If ICEFALL ever names an insurer here, it will be because they paid for the position, and the row will say so. None is named today: there is no partner, no broker, no affiliate link and no commission. ICEFALL is telling you to arrange cover, not telling you who from.";

export const NO_INSURER_NOTE =
  "Arrange it through a broker or an insurer who will say in writing that they cover mountaineering at the altitude and on the terrain you are going to, and helicopter evacuation from it. Ordinary travel policies routinely exclude both. ICEFALL has not read your policy and cannot tell you whether you are covered.";

/* -------------------------------------------------------------------------- */
/* The rows                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The template. `daysBefore` is the only number here, and each one is sourced.
 *
 * The travel-clinic figure is the widely published one — travel health services
 * ask to see people four to eight weeks before departure, because some courses
 * take weeks to complete. ICEFALL states the window and books nothing.
 *
 * The passport figure is the equally published one: a great many countries
 * require six months of validity beyond the date of entry or return. ICEFALL
 * does not hold the table of which, and says so rather than implying it does.
 */
interface Template {
  id: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  daysBefore: number;
  authority: TimelineAuthority;
  authorityNote: string;
  commercial?: boolean;
  /** Built per trip, because the checklist route needs the objective's id. */
  destination?: (trip: Trip) => { to: string | null; reason: string | null };
}

const CHECKLIST = (trip: Trip) =>
  trip.goalId
    ? { to: `/mountain/${trip.goalId}/checklist`, reason: null }
    : {
        to: null,
        reason:
          "This trip is not attached to an objective, and ICEFALL's kit list is generated from an objective's elevation and latitude. Attach one and this row opens the list.",
      };

const TEMPLATES: readonly Template[] = [
  {
    id: "documents.passport",
    kind: "documents",
    title: "Check passport validity and entry rules",
    detail:
      "Many countries require six months of passport validity beyond your return, and many require a visa arranged in advance. Check the rules for every country you pass through, not only the one you are climbing in.",
    daysBefore: 56,
    authority: "published",
    authorityNote:
      "The six-month rule is a widely published entry requirement, not an ICEFALL figure. ICEFALL holds no table of which countries apply it — the destination's own embassy or your government's travel advice does.",
  },
  {
    id: "health.clinic",
    kind: "health",
    title: "Book a travel clinic appointment",
    detail:
      "Travel health services ask to see people four to eight weeks before departure, because some vaccination courses take weeks to finish and some antimalarials are started before you go. Take your itinerary and your planned altitudes with you.",
    daysBefore: 42,
    authority: "published",
    authorityNote:
      "The four-to-eight-week window is standard travel-health guidance. ICEFALL is not a medical service, holds no vaccine schedule for anywhere, and names no drug — the clinic does all of that.",
  },
  {
    id: "health.altitude-plan",
    kind: "health",
    title: "Talk to a doctor about going high",
    detail:
      "Ask about your own medical history at altitude, about anything you already take, and about what to do if somebody in the party gets ill. ICEFALL does not prescribe and will not discuss medication.",
    daysBefore: 42,
    authority: "icefall",
    authorityNote:
      "ICEFALL's own suggestion, timed to the same appointment as the clinic row so it is one visit rather than two.",
  },
  {
    id: "insurance.cover",
    kind: "insurance",
    title: "Arrange insurance that actually covers this",
    detail: NO_INSURER_NOTE,
    daysBefore: 42,
    authority: "icefall",
    authorityNote:
      "ICEFALL's own suggestion. The timing is arbitrary and is set early only because a policy bought the night before departure often excludes cancellation.",
    commercial: true,
  },
  {
    id: "plan.itinerary",
    kind: "plan",
    title: "Get the night-by-night altitudes from your guide or operator",
    detail:
      "ICEFALL holds no camps and no route profile for any mountain, so it cannot tell you where you will sleep. Whoever is running the trip can. Ask for the sleeping altitude of every night, and bring it with you — the acclimatisation schedule on this trip counts from exactly that.",
    daysBefore: 28,
    authority: "icefall",
    authorityNote:
      "ICEFALL's own suggestion, and the honest consequence of a gap in this app rather than a piece of advice dressed up as one.",
  },
  {
    id: "gear.checklist",
    kind: "gear",
    title: "Work through the kit list",
    detail:
      "Go down the generated list and mark what you have, what you need and what you will hire. Four weeks leaves time for a boot that does not fit to be exchanged.",
    daysBefore: 28,
    authority: "icefall",
    authorityNote: "ICEFALL's own suggestion, and the list itself is generated from the objective.",
    destination: CHECKLIST,
  },
  {
    id: "gear.shakedown",
    kind: "gear",
    title: "Wear the new kit before it matters",
    detail:
      "Boots, pack, and anything that touches skin. A blister on day one of a trip you trained a year for was a decision made in a shop three weeks earlier.",
    daysBefore: 21,
    authority: "icefall",
    authorityNote: "ICEFALL's own suggestion.",
  },
  {
    id: "gear.final",
    kind: "gear",
    title: "Final pack against the list",
    detail:
      "Last pass through the kit list, with everything on the floor. Check the documents row is done while you are at it.",
    daysBefore: 5,
    authority: "icefall",
    authorityNote: "ICEFALL's own suggestion.",
    destination: CHECKLIST,
  },
];

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

export type TimelineStatus =
  | { kind: "ticked"; at: string; label: string }
  | { kind: "due"; inDays: number; label: string }
  | { kind: "today"; label: string }
  | { kind: "overdue"; byDays: number; label: string }
  | { kind: "departed"; label: string };

/**
 * Where a row stands, from the calendar alone.
 *
 * OVERDUE IS SHOWN, NOT HIDDEN. Somebody who opens this three weeks before a
 * trip has genuinely missed the eight-week row, and a timeline that quietly
 * dropped it would be the more comfortable lie. Absence carries its reason,
 * and so does lateness.
 */
export function statusFor(
  item: TimelineItem,
  trip: Trip,
  today: string,
  tickedAt: string | null,
): TimelineStatus {
  if (tickedAt) {
    return { kind: "ticked", at: tickedAt, label: "Done — you ticked it" };
  }
  if (today >= trip.startDate) {
    return { kind: "departed", label: "The trip has started" };
  }
  const days = daysBetween(today, item.dueDate);
  if (days === 0) return { kind: "today", label: "Due today" };
  if (days > 0)
    return { kind: "due", inDays: days, label: `In ${days} day${days === 1 ? "" : "s"}` };
  const by = -days;
  return { kind: "overdue", byDays: by, label: `${by} day${by === 1 ? "" : "s"} ago` };
}

/* -------------------------------------------------------------------------- */
/* Build                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The timeline for a trip, in the order the days fall.
 *
 * Pure. Every date is `trip.startDate` minus the row's own `daysBefore`.
 */
export function buildTimeline(trip: Trip): TimelineItem[] {
  return TEMPLATES.map((t) => {
    const dest = t.destination ? t.destination(trip) : { to: null, reason: null };
    const commercial = t.commercial === true;
    return {
      id: t.id,
      kind: t.kind,
      title: t.title,
      detail: t.detail,
      daysBefore: t.daysBefore,
      dueDate: addDays(trip.startDate, -t.daysBefore),
      authority: t.authority,
      authorityNote: t.authorityNote,
      /* THE LABEL AND THE ROW COME OUT OF ONE EXPRESSION. Deleting the label
         means deleting `commercial`, which means the row stops being a
         commercial row. That is the PromotedCard rule, applied here. */
      commercial,
      commercialLabel: commercial ? PAID_PLACEMENT_LABEL : null,
      to: dest.to,
      noDestinationReason: dest.reason,
    };
  }).sort((a, b) => b.daysBefore - a.daysBefore);
}

/** True when every row has been ticked. Used for a count, never for a verdict. */
export function timelineProgress(
  items: TimelineItem[],
  ticked: (id: string) => string | null,
): { done: number; total: number } {
  return { done: items.filter((i) => ticked(i.id) !== null).length, total: items.length };
}

/** Said under the progress count, so it is never read as readiness. */
export const TIMELINE_PROGRESS_CAVEAT =
  "This counts ticks you made, nothing more. ICEFALL has not seen your passport, your policy or your kit, and a full set of ticks is not a statement that you are ready to travel.";
