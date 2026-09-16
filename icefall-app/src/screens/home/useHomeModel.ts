/**
 * Everything the new Home draws, computed from real records.
 *
 * Built to the owner's eight-state mockup boards (2026-09-16). The layout is
 * the mockup's; the words in each slot are what ICEFALL actually holds. Where a
 * mockup line could not be derived, the slot carries the nearest true thing:
 *
 *   - "Goûter Route" — no goal records a chosen route. The header prints the
 *     mountain alone.
 *   - "600 m ascent, 6 kg pack" — no session prescribes a pack weight. The
 *     title is the plan's own, with its ascent when the plan holds one.
 *   - "Building · altitude is your gap" — derivable, from the same objective
 *     assessment the mountain's command centre uses.
 *   - The coach's line is the briefing's own status, or — when the coach has
 *     actually eased today — the reason it gave.
 *   - The coach is the ICEFALL mark, not a photograph of a man: it is not one.
 *   - "A stepping stone that closes your altitude gap" is a claim about the
 *     athlete nothing makes. The card quotes the mountain record instead.
 *   - "Gear · 12 of 14 packed" is the kit list's own count, worded "sorted"
 *     because that list records have/borrow/rent, not what is in the bag.
 *   - "Hut booking · confirmed" — nobody confirms a booking; the row reports
 *     the athlete's own tick on the kit list.
 *   - "Day 2 · Summit" — trips hold no itinerary, so no day is "summit day".
 *   - "Your mountain passport has a new entry" — the debrief writes the summit
 *     LOG, which the passport does not read. The row says what happened.
 *   - "What's next" reasons ("a fast return to altitude") are difficulty calls
 *     `nextObjective.ts` refuses to make. Cards carry the catalogue's label.
 *   - No objective means no plan, so there is no "45 min easy run" to print.
 */
import { useMemo } from "react";
import { useCoachIntel } from "@/coach/hooks";
import { assessDowngrade } from "@/coach/downgrade";
import { HARD_FOCUS } from "@/coach/briefing";
import { assessObjectiveReadiness, athleteFactsFrom } from "@/coach/mountainReadiness";
import { isKnown, UNAVAILABLE_COPY } from "@/coach/types";
import { MOUNTAINS } from "@/data/mock/mountains";
import { loadReadinessTest } from "@/growth/readinessTest";
import { fmtDate, fmtDurationCompact, fmtElevation } from "@/lib/format";
import { tripDay } from "@/mountain/tripModel";
import { parseDay } from "@/network/groups";
import { useObjectiveDebriefs } from "@/objectives/objectiveDebrief";
import { proposeNextObjective } from "@/objectives/nextObjective";
import { generateChecklist, completion, isResolved } from "@/services/checklist";
import type { ItemStatus } from "@/services/checklist";
import { REFERENCE_PLAN_NOTE } from "@/services/peakTier";
import { sync } from "@/services/repository";
import { useSummitLogs } from "@/social/summitLog";
import { useApp } from "@/state/AppState";
import { activeSessionSummary } from "@/tracking/activeSession";
import { useRecordedActivities } from "@/tracking/feed";
import { parseBlockLabel, usePrimaryGoalWithProgress, useTraining } from "@/tracking/training";
import { useTrip } from "@/trip/trip";
import { visibleKit } from "@/mountain/tripTabModel";
import { STEPPING_STONE_QUOTES } from "@/home/steppingStones";
import {
  dayDiff,
  detectHomeState,
  findJustBack,
  localDay,
  type HomeStateId,
  type ReturnKind,
} from "@/home/homeState";

export interface PeakRef {
  name: string;
  elevationM?: number;
  lat?: number;
  lon?: number;
  curatedId?: string;
  wikipedia?: string;
  photo?: string;
}

export type Photo = { src: string } | { peak: PeakRef };

export type DayMark = "done" | "today" | "upcoming" | "missed" | "rest";

export interface PrepRow {
  label: string;
  tone: "done" | "partial" | "alert";
  to: string;
}

export type TodayCard =
  | {
      kind: "session";
      title: string;
      clock: string | null;
      line: string | null;
      note: string | null;
      to: string | null;
      start: { to: string; label: string };
      photo: Photo;
    }
  | { kind: "feel"; date: string; photo: Photo }
  | { kind: "rest"; line: string | null; checkedIn: boolean; photo: Photo }
  | { kind: "trip-prep"; photo: Photo; rows: PrepRow[]; block: string | null; to: string }
  | { kind: "on-trip"; title: string; photo: Photo }
  | {
      kind: "just-back";
      photo: Photo;
      title: string;
      line: string | null;
      action: { label: string; to: string };
    };

export interface ExploreItem {
  title: string;
  figure: string | null;
  line: string;
  to: string;
  photo: Photo;
}

export type ExploreSection =
  | { kind: "card"; label: string; item: ExploreItem }
  | { kind: "tiles"; label: string; items: ExploreItem[] }
  | { kind: "next"; label: string; caption: string; items: ExploreItem[] };

export interface HomeModel {
  state: HomeStateId;
  header: { title: string; subtitle: string; to: string; peak: PeakRef } | null;
  resume: { to: string } | null;
  today: TodayCard | null;
  passport: { label: string; to: string } | null;
  readiness: { word: string | null; tail: string | null; to: string } | null;
  week: { days: { letter: string; mark: DayMark }[]; summary: string | null } | null;
  coach: { quote: string; chevron: boolean } | null;
  explore: ExploreSection | null;
}

/* Photographs. Every one is CC0 or public domain (public/img/CREDITS.md), so
   none needs a credit line on the card. Mountains go through the peak lookup,
   which carries its own credit when one is owed. */
export const HOME_PHOTOS = {
  session: "/img/treks/wonderland-trail.jpg",
  feel: "/img/eiger.jpg",
  rest: "/img/private-hero.jpg",
  free: "/img/treks/pacific-crest-trail.jpg",
  onTrip: "/img/event-b.jpg",
  packing: "/img/splash.jpg",
  mountainCoach: "/img/aconcagua.jpg",
  pickHero: "/img/community-a.jpg",
  newHero: "/img/denali.jpg",
} as const;

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export { STEPPING_STONE_QUOTES as STEPPING_STONES } from "@/home/steppingStones";

/**
 * Hand-picked first peaks that ICEFALL has NOT surveyed (they come from the
 * bundled OSM peak file, pinned by id). A reference entry carries no grade —
 * `peakTier.ts` — so the caption is where the mountain is, never a class.
 */
const STARTING_POINTS: readonly (PeakRef & { where: string })[] = [
  { name: "Snowdon", elevationM: 1085, lat: 53.0685, lon: -4.0762, wikipedia: "Snowdon", where: "Wales" },
  { name: "Ben Nevis", elevationM: 1345, lat: 56.7969, lon: -5.0035, wikipedia: "Ben Nevis", where: "Scotland" },
];

const RETURN_WORD: Record<ReturnKind, (completed: boolean) => string> = {
  summited: (completed) => (completed ? "Completed" : "Summited"),
  "turned-around": () => "Back",
  travelled: () => "Back",
  "date-passed": () => "Date passed",
};

function trainingWord(value: number): string {
  if (value >= 75) return "Established";
  if (value >= 50) return "Building";
  return "Early";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function countdown(days: number): string {
  if (days === -1) return "Yesterday";
  if (days < 0) return "Date passed";
  if (days === 0) return "Today";
  return plural(days, "day", "days");
}

export function useHomeModel(): HomeModel {
  const app = useApp();
  const { goals, objectives, coachProfile, checklistStatuses, can, todaysCheckIn } = app;
  const today = localDay(new Date().toISOString());
  /* The app-wide objective rule (`objectives/primaryGoal.ts`), so Home, the
     coach, the plan and trip prep always mean the same mountain. */
  const goal = usePrimaryGoalWithProgress();
  const training = useTraining();
  const intel = useCoachIntel();
  const { trip, trips } = useTrip();
  const debriefs = useObjectiveDebriefs();
  const activities = useRecordedActivities();
  const summitLogs = useSummitLogs();

  const recorded = useMemo(() => activities.filter((a) => !a.simulated), [activities]);

  const justBack = useMemo(
    () => findJustBack({ today, trips, goals, debriefs }),
    [today, trips, goals, debriefs],
  );

  const runningTrip = trip && !trip.endedAt && tripDay(trip, today).kind === "during" ? trip : null;
  /* Looked up by today's key rather than `training.today`, which is memoised
     and goes stale when Home stays open past midnight. */
  const day = useMemo(
    () => training.plan?.weeks.flatMap((w) => w.days).find((d) => d.date === today),
    [training.plan, today],
  );
  const todayWeek = useMemo(
    () =>
      day ? (training.plan?.weeks.find((w) => w.days.some((d) => d.date === day.date)) ?? null) : null,
    [training.plan, day],
  );
  const doneToday = day ? training.completedByDate.get(day.date) === true : false;

  const state = detectHomeState({
    today,
    goalTargetDay: goal ? localDay(goal.targetDate) : null,
    runningTrip: runningTrip !== null,
    justBack: justBack?.kind ?? null,
    todaySession: day ? { rest: day.focus === "rest", done: doneToday } : null,
    hasHistory:
      goals.length > 0 || recorded.length > 0 || trips.length > 0 || loadReadinessTest() !== null,
  });

  const mountain = goal?.mountainId ? sync.mountainById(goal.mountainId) : undefined;
  const surveyed = mountain !== undefined;
  const elevationM = goal?.elevationM ?? mountain?.elevationM;
  const lat = goal?.lat ?? mountain?.coords.lat;
  const lon = goal?.lon ?? mountain?.coords.lon;

  const summitsLogged = useMemo(
    () =>
      objectives.flatMap((o) =>
        o.summitedAt ? [{ name: o.name, elevationM: o.elevationM, date: o.summitedAt }] : [],
      ),
    [objectives],
  );

  const objectiveReadiness = useMemo(() => {
    if (!goal || elevationM === undefined || !surveyed) return null;
    return assessObjectiveReadiness({
      peak: { name: goal.name, elevationM, lat, lon },
      activities: recorded,
      summitsLogged,
      selfReported: {
        technicalSkills:
          coachProfile.technicalSkills.length > 0 ? coachProfile.technicalSkills : undefined,
        maxAltitudeM: coachProfile.maxAltitudeM,
        disciplineExperience:
          Object.keys(coachProfile.disciplineExperience).length > 0
            ? coachProfile.disciplineExperience
            : undefined,
        altitudeIllness: coachProfile.altitudeIllness,
      },
    });
  }, [goal, elevationM, lat, lon, surveyed, recorded, summitsLogged, coachProfile]);

  const nextFacts = useMemo(
    () =>
      athleteFactsFrom({
        activities: recorded,
        summitsLogged: summitLogs
          .filter((l) => typeof l.elevationM === "number")
          .map((l) => ({ name: l.peakName, elevationM: l.elevationM as number, date: l.date })),
        selfReported: {
          technicalSkills: coachProfile.technicalSkills,
          maxAltitudeM: coachProfile.maxAltitudeM,
        },
      }),
    [recorded, summitLogs, coachProfile.technicalSkills, coachProfile.maxAltitudeM],
  );

  const goalPeak: PeakRef | null = goal
    ? {
        name: goal.name,
        elevationM,
        lat,
        lon,
        curatedId: goal.mountainId,
        wikipedia: goal.wikipedia,
        photo: goal.photo,
      }
    : null;

  const active = activeSessionSummary();
  const start = active
    ? { to: `/activity/live/${active.activityTypeId}`, label: "Resume" }
    : { to: "/activity/select", label: "Start" };

  /* ---- Header ----------------------------------------------------------- */

  let header: HomeModel["header"] = null;
  if (state === "on-trip" && runningTrip) {
    const d = tripDay(runningTrip, today);
    const name = runningTrip.peakName ?? runningTrip.name;
    const tripGoal = goals.find((g) => g.id === runningTrip.goalId);
    const curated = runningTrip.mountainId ? sync.mountainById(runningTrip.mountainId) : undefined;
    header = {
      title: name,
      subtitle: d.kind === "during" ? `Day ${d.dayNumber} of ${d.totalDays}` : "",
      to: runningTrip.goalId ? `/mountain/${runningTrip.goalId}` : "/trip",
      peak: {
        name,
        elevationM: runningTrip.peakElevationM ?? undefined,
        lat: tripGoal?.lat ?? curated?.coords.lat,
        lon: tripGoal?.lon ?? curated?.coords.lon,
        curatedId: runningTrip.mountainId ?? tripGoal?.mountainId,
        photo: tripGoal?.photo,
      },
    };
  } else if (state === "just-back" && justBack) {
    const g = goals.find((x) => x.id === justBack.goalId);
    const curated = g?.mountainId ? sync.mountainById(g.mountainId) : undefined;
    header = {
      title: justBack.name,
      subtitle: `${RETURN_WORD[justBack.kind](justBack.completed)} · ${fmtDate(justBack.endedOn, { month: "long" })}`,
      to: `/goals/${justBack.goalId}`,
      peak: {
        name: justBack.name,
        elevationM: g?.elevationM ?? curated?.elevationM,
        lat: g?.lat ?? curated?.coords.lat,
        lon: g?.lon ?? curated?.coords.lon,
        curatedId: g?.mountainId,
        photo: g?.photo,
      },
    };
  } else if (goal && goalPeak) {
    header = {
      title: goal.name,
      subtitle: `${fmtDate(goal.targetDate, { month: "long" })} · ${countdown(dayDiff(today, localDay(goal.targetDate)))}`,
      to: `/mountain/${goal.id}`,
      peak: goalPeak,
    };
  }

  /* ---- Today ------------------------------------------------------------ */

  let todayCard: TodayCard | null = null;
  /* Eased by the same veto the briefing uses (`coach/downgrade.ts`, one
     definition), applied to Home's own day so a briefing memoised before
     midnight cannot un-ease today. Only while the session is still ahead. */
  const downgrade = assessDowngrade({
    readiness: intel.readiness,
    recovery: intel.recovery,
    load: intel.load,
  });
  const eased =
    state === "default" && Boolean(day && downgrade.downgraded && HARD_FOCUS.includes(day.focus));

  if (state === "on-trip" && runningTrip) {
    const d = tripDay(runningTrip, today);
    const name = runningTrip.peakName ?? runningTrip.name;
    todayCard = {
      kind: "on-trip",
      title: d.kind === "during" ? `Day ${d.dayNumber} · ${name}` : name,
      photo: { src: HOME_PHOTOS.onTrip },
    };
  } else if (state === "just-back" && justBack && header) {
    const when = fmtDate(justBack.endedOn, { month: "long", year: undefined });
    todayCard = {
      kind: "just-back",
      photo: { peak: header.peak },
      title:
        justBack.kind === "summited"
          ? `You climbed ${justBack.name} · ${when}`
          : justBack.kind === "date-passed"
            ? `${justBack.name} · ${when}`
            : `Back from ${justBack.name} · ${when}`,
      line: justBack.debriefed
        ? null
        : justBack.kind === "date-passed"
          ? "How did it go?"
          : "Capture what happened while it is still fresh",
      action: {
        label: justBack.debriefed ? "Open your debrief" : "Add your debrief",
        to: `/objective/${justBack.goalId}/debrief`,
      },
    };
  } else if (state === "two-weeks" && goal && goalPeak) {
    const rows: PrepRow[] = [];
    if (surveyed && elevationM !== undefined) {
      const checklist = `/mountain/${goal.id}/checklist`;
      const statuses = checklistStatuses[goal.id] ?? {};
      const items = visibleKit(generateChecklist({ name: goal.name, elevationM, lat, lon }).items, statuses, {
        full: can("equipment.checklist.full"),
        documents: can("equipment.documents"),
      });
      const kit = completion(
        items.filter((i) => i.category !== "documents"),
        statuses,
      );
      if (kit.applicable > 0) {
        rows.push({
          label: `Gear · ${kit.resolved} of ${kit.applicable} sorted`,
          tone: kit.resolved === kit.applicable ? "done" : "partial",
          to: checklist,
        });
      }
      /* A document the athlete marked "n/a" is settled, as the checklist's own
         count treats it — no row, rather than a red one contradicting them. */
      const docRow = (id: string, yes: string, no: string) => {
        const item = items.find((i) => i.id === id);
        const status: ItemStatus | undefined = item ? statuses[item.id] : undefined;
        if (!item || status === "n/a") return;
        const ok = isResolved(status);
        rows.push({ label: ok ? yes : no, tone: ok ? "done" : "alert", to: checklist });
      };
      docRow("doc-hut", "Hut booking · booked", "Hut booking · not booked yet");
      docRow("doc-insurance", "Insurance · added", "Insurance · not added yet");
    }
    let block: string | null = null;
    if (todayWeek) {
      const sessions = todayWeek.days.filter((d) => d.focus !== "rest").length;
      const name = parseBlockLabel(todayWeek.block)?.kind === "taper" ? "Taper week" : todayWeek.block;
      block = `${name} · ${plural(sessions, "session", "sessions")}`;
    }
    todayCard = { kind: "trip-prep", photo: { peak: goalPeak }, rows, block, to: `/trip?goal=${goal.id}` };
  } else if (state === "rest" && day) {
    todayCard = {
      kind: "rest",
      line: day.detail ?? null,
      checkedIn: todaysCheckIn !== undefined,
      photo: { src: HOME_PHOTOS.rest },
    };
  } else if (state === "done" && day) {
    todayCard = { kind: "feel", date: day.date, photo: { src: HOME_PHOTOS.feel } };
  } else if (state === "default" && day) {
    const clock = day.durationMin ? fmtDurationCompact(day.durationMin * 60) : null;
    todayCard = eased
      ? {
          kind: "session",
          // The briefing's own wording for an eased hard day (`coach/briefing.ts`).
          title: "Easy session or rest",
          clock: null,
          line: `Your plan had ${day.title.toLowerCase()}`,
          note: goal && !surveyed ? REFERENCE_PLAN_NOTE : null,
          to: `/coach/session/${day.date}`,
          start,
          photo: { src: HOME_PHOTOS.session },
        }
      : {
          kind: "session",
          title: day.elevationM ? `${day.title} · ${fmtElevation(day.elevationM)} m ascent` : day.title,
          clock,
          line: day.detail ?? null,
          note: goal && !surveyed ? REFERENCE_PLAN_NOTE : null,
          to: `/coach/session/${day.date}`,
          start,
          photo: { src: HOME_PHOTOS.session },
        };
  } else if (state === "default" && goal) {
    // An objective with no planned day today — the plan has not started or has ended.
    todayCard = {
      kind: "session",
      title: "Record a session",
      clock: null,
      line: "Nothing planned today",
      note: null,
      to: null,
      start,
      photo: { src: HOME_PHOTOS.session },
    };
  } else if (state === "no-objective") {
    todayCard = {
      kind: "session",
      title: "Record a session",
      clock: null,
      line: "Every session you record builds your history",
      note: null,
      to: null,
      start,
      photo: { src: HOME_PHOTOS.free },
    };
  } else if (state === "new") {
    todayCard = {
      kind: "session",
      title: "Your first session",
      clock: null,
      line: "A small place to begin",
      note: null,
      to: null,
      start,
      photo: { src: HOME_PHOTOS.free },
    };
  }

  /* ---- Passport (just back) --------------------------------------------- */

  let passport: HomeModel["passport"] = null;
  if (state === "just-back" && justBack) {
    const g = goals.find((x) => x.id === justBack.goalId);
    const logged = summitLogs.some(
      (l) =>
        ((g?.mountainId && l.peakId === g.mountainId) ||
          l.peakName.toLowerCase() === justBack.name.toLowerCase()) &&
        Math.abs(dayDiff(l.date, justBack.endedOn)) <= 7,
    );
    if (logged) passport = { label: "Added to your summit log.", to: "/profile" };
  }

  /* ---- Readiness -------------------------------------------------------- */

  /* On a trip, the objective's readiness and plan belong on Home only when the
     trip is for that objective — never another mountain's under this one. */
  const tripIsForGoal = Boolean(runningTrip && goal && runningTrip.goalId === goal.id);

  let readiness: HomeModel["readiness"] = null;
  if (state === "no-objective") {
    const score = intel.readiness.score;
    readiness = {
      word: isKnown(score)
        ? `${Math.round(score.value)}% today`
        : UNAVAILABLE_COPY[score.reason ?? "no-data"],
      tail: null,
      to: "/coach/readiness",
    };
  } else if (goal && (state === "default" || state === "done" || state === "rest" || state === "two-weeks" || (state === "on-trip" && tripIsForGoal))) {
    const to = `/mountain/${goal.id}`;
    if (!surveyed) readiness = { word: "Not assessed", tail: null, to };
    else if (!objectiveReadiness) readiness = { word: "Not enough yet", tail: null, to };
    else {
      const gap = objectiveReadiness.biggestGap;
      readiness = isKnown(objectiveReadiness.overall)
        ? {
            word: trainingWord(objectiveReadiness.overall.value),
            tail: gap ? `${gap.label.toLowerCase()} is your gap` : null,
            to,
          }
        : { word: null, tail: gap ? `${gap.label.toLowerCase()} unknown` : "Not enough yet", to };
    }
  }

  /* ---- This week -------------------------------------------------------- */

  let week: HomeModel["week"] = null;
  if (todayWeek && (state === "default" || state === "done" || state === "rest" || state === "two-weeks" || (state === "on-trip" && tripIsForGoal))) {
    const days = todayWeek.days.map((d, i) => {
      const parsed = parseDay(d.date);
      const done = training.completedByDate.get(d.date) === true;
      const rest = d.focus === "rest";
      const mark: DayMark = done
        ? "done"
        : d.date === today
          ? "today"
          : rest
            ? "rest"
            : d.date < today
              ? "missed"
              : "upcoming";
      return { letter: LETTERS[parsed ? (parsed.getDay() + 6) % 7 : i % 7], mark };
    });
    const planned = todayWeek.days.filter((d) => d.focus !== "rest");
    const doneCount = planned.filter((d) => training.completedByDate.get(d.date) === true).length;
    week = {
      days,
      summary: state === "on-trip" ? null : `${doneCount} of ${plural(planned.length, "session", "sessions")} done`,
    };
  } else if (state === "no-objective") {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const recordedDays = new Set(recorded.map((a) => localDay(new Date(a.startedAt).toISOString())));
    const days = LETTERS.map((letter, i) => {
      const key = localDay(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i).toISOString());
      const mark: DayMark = recordedDays.has(key) ? "done" : key === today ? "today" : key < today ? "missed" : "upcoming";
      return { letter, mark };
    });
    const weekStart = localDay(monday.toISOString());
    const count = recorded.filter((a) => {
      const key = localDay(new Date(a.startedAt).toISOString());
      return key >= weekStart && key <= today;
    }).length;
    week = { days, summary: `${plural(count, "session", "sessions")} recorded` };
  }

  /* ---- Coach ------------------------------------------------------------ */

  let coach: HomeModel["coach"] = null;
  if (state === "default" || state === "done" || state === "rest" || state === "two-weeks") {
    coach = {
      quote: eased ? `Given ${downgrade.shortReason}, today is easy on purpose.` : intel.briefing.status,
      chevron: state === "two-weeks",
    };
  }

  /* ---- Explore ---------------------------------------------------------- */

  let explore: ExploreSection | null = null;
  if ((state === "default" || state === "done" || state === "rest") && goal && mountain) {
    const stone = STEPPING_STONE_QUOTES[mountain.id];
    const target = stone ? sync.mountainById(stone.id) : undefined;
    const m = target ?? mountain;
    explore = {
      kind: "card",
      label: "One thing to explore",
      item: {
        title: m.name,
        figure: `${fmtElevation(m.elevationM)} m`,
        line: target && stone ? stone.line : m.difficultyLabel,
        to: `/explore/mountain/${m.id}`,
        photo: {
          peak: { name: m.name, elevationM: m.elevationM, lat: m.coords.lat, lon: m.coords.lon, curatedId: m.id },
        },
      },
    };
  } else if (state === "two-weeks" && goal && surveyed) {
    explore = {
      kind: "card",
      label: "One thing to explore",
      item: {
        title: "Packing list",
        figure: null,
        line: "What this class of peak actually demands",
        to: `/mountain/${goal.id}/checklist`,
        photo: { src: HOME_PHOTOS.packing },
      },
    };
  } else if (state === "on-trip") {
    explore = {
      kind: "card",
      label: "One thing to explore",
      item: {
        title: "Mountain coach",
        figure: null,
        line: "Turnaround, cold, altitude and fuel",
        to: "/mountain/coach",
        photo: { src: HOME_PHOTOS.mountainCoach },
      },
    };
  } else if (state === "no-objective") {
    const kili = sync.mountainById("kilimanjaro");
    const items: ExploreItem[] = STARTING_POINTS.map((p) => ({
      title: p.name,
      figure: `${fmtElevation(p.elevationM!)} m`,
      line: p.where,
      to: `/explore/peak/${encodeURIComponent(`osm:${p.lat},${p.lon}`)}`,
      photo: { peak: p },
    }));
    if (kili) {
      items.push({
        title: kili.name,
        figure: `${fmtElevation(kili.elevationM)} m`,
        line: kili.difficultyLabel,
        to: `/explore/mountain/${kili.id}`,
        photo: {
          peak: { name: kili.name, elevationM: kili.elevationM, lat: kili.coords.lat, lon: kili.coords.lon, curatedId: kili.id },
        },
      });
    }
    explore = { kind: "tiles", label: "Explore a starting point", items };
  } else if (state === "just-back" && justBack) {
    const g = goals.find((x) => x.id === justBack.goalId);
    const next = proposeNextObjective({
      catalogue: MOUNTAINS,
      facts: nextFacts,
      finishedMountainId: g?.mountainId,
      limit: 2,
      bridge: { proposals: [], note: "", none: "" },
    });
    if (next.candidates.length > 0) {
      explore = {
        kind: "next",
        /* The module's own first words, and the first sentence of its basis:
           together they are what stops the first card reading as "do this next". */
        label: next.headline.split(". ")[0],
        caption: next.basisShort,
        items: next.candidates.map((c) => {
          const m = sync.mountainById(c.mountainId);
          return {
            title: c.name,
            figure: `${fmtElevation(c.elevationM)} m`,
            line: c.difficultyLabel,
            to: `/explore/mountain/${c.mountainId}`,
            photo: {
              peak: { name: c.name, elevationM: c.elevationM, lat: m?.coords.lat, lon: m?.coords.lon, curatedId: c.mountainId },
            },
          };
        }),
      };
    }
  }

  return {
    state,
    header,
    resume: active && todayCard?.kind !== "session" ? { to: start.to } : null,
    today: todayCard,
    passport,
    readiness,
    week,
    coach,
    explore,
  };
}
