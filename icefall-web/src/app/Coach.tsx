import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, ArrowUp, ChevronLeft, ChevronRight, CloudSnow, Dumbbell, Footprints,
  Gauge, Moon, Mountain, Pickaxe, Sparkles, Waves, Zap,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { DEMO_NOTICE, EXPEDITIONS, IS_DEMO } from "@/data/demo";
import { cn } from "@/lib/utils";

/**
 * Coach on a desktop.
 *
 * ── WHY THIS PAGE LOOKS LIKE THIS ───────────────────────────────────────────
 *
 * The previous version was an essay. Every card carried two or three paragraphs
 * explaining what a laptop cannot know, which meant the honest thing (we do not
 * have your data) was said six times and the useful thing (here is the plan)
 * was pushed below the fold. Honesty is a LABEL problem, not a prose problem:
 * an em-dash next to "Recovery" says "not measured" faster and more plainly
 * than a paragraph does, and it says it once per value instead of once per card.
 *
 * So the rules this file holds to:
 *   • Exactly two blocks of explanatory prose on the whole page — the model
 *     disclaimer under the composer, and DEMO_NOTICE at the foot.
 *   • Every unknown user statistic renders as "—". Never a number, never an
 *     apology. This device records nothing, and a dash is the whole story.
 *   • Every server-backed control is disabled with a three-word label.
 *   • Prescription is fair game: minutes, vertical and phase dates are
 *     arithmetic on a plan, not claims about an athlete. Those get real numbers.
 *
 * Nothing here computes a readiness score, a percent complete or a streak.
 * Each of those is a statement about a person, and this device has nothing to
 * derive one from.
 */

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The training objective the demo plan is built for.
 *
 * Deliberately NOT the shared DEPARTURE from `./trip` — that constant is the
 * booked Everest expedition, and a training goal is a different thing from a
 * booking. Mont Blanc is what the coach is periodised against here.
 */
const GOAL_DATE = new Date("2026-11-04T06:00:00Z");

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const out = startOfDay(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** Monday of the week `d` falls in. Weeks start on Monday everywhere in ICEFALL. */
function mondayOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/** Local calendar key, for comparing days without crossing a timezone. */
function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const longDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** "8h 25", "45m". Never "0h 45", which reads as a rounding error. */
function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}`;
}

const fmtMetres = (m: number) => `${m.toLocaleString("en-GB")} m`;

/* -------------------------------------------------------------------------- */
/* The plan                                                                    */
/* -------------------------------------------------------------------------- */

type Focus = "endurance" | "strength" | "intervals" | "long-mountain" | "technical" | "recovery" | "rest";

const FOCUS: Record<Focus, { label: string; icon: typeof Mountain }> = {
  endurance: { label: "Endurance", icon: Footprints },
  strength: { label: "Strength", icon: Dumbbell },
  intervals: { label: "Intervals", icon: Zap },
  "long-mountain": { label: "Mountain day", icon: Mountain },
  technical: { label: "Technical", icon: Pickaxe },
  recovery: { label: "Recovery", icon: Waves },
  rest: { label: "Rest", icon: Moon },
};

interface Session {
  focus: Focus;
  title: string;
  /** Prescribed duration. Zero on a rest day, which is a session of nothing. */
  minutes: number;
  /** Vertical ascent the session asks for, where it asks for any. */
  vertM?: number;
  /**
   * The instruction, compressed to a chip line. Middot-joined cues rather than
   * a sentence — a coach's note on a whiteboard, not a paragraph in an app.
   */
  cue: string;
}

const PHASES = [
  { name: "Base", weeks: 16, tag: "Aerobic volume" },
  { name: "Build", weeks: 12, tag: "Volume plus vertical" },
  { name: "Peak", weeks: 6, tag: "Highest load" },
  { name: "Taper", weeks: 4, tag: "Load comes down" },
] as const;

type PhaseName = (typeof PHASES)[number]["name"];

const TOTAL_WEEKS = PHASES.reduce((n, p) => n + p.weeks, 0);

const REST: Session = { focus: "rest", title: "Rest", minutes: 0, cue: "Prescribed · not a gap" };

/** Monday-first week template per block. */
const TEMPLATE: Record<PhaseName, Session[]> = {
  Base: [
    REST,
    { focus: "endurance", title: "Easy run or hike", minutes: 70, cue: "Conversational pace throughout" },
    { focus: "strength", title: "Gym — legs and posterior chain", minutes: 45, cue: "Step-ups · split squats · deadlifts" },
    { focus: "endurance", title: "Steady hill laps", minutes: 60, vertM: 400, cue: "One hill · even effort" },
    { focus: "recovery", title: "Mobility and easy spin", minutes: 40, cue: "Ankles · hips · thoracic spine" },
    { focus: "long-mountain", title: "Long hill day with a pack", minutes: 210, vertM: 900, cue: "Loaded · steepest ground nearby" },
    { focus: "endurance", title: "Easy hill walk", minutes: 75, vertM: 300, cue: "Unloaded · tired legs" },
  ],
  Build: [
    REST,
    { focus: "intervals", title: "Uphill intervals", minutes: 65, vertM: 400, cue: "5 × 5 min hard · 3 min easy" },
    { focus: "strength", title: "Gym — heavy, low volume", minutes: 55, cue: "Low reps · loaded carry" },
    { focus: "endurance", title: "Loaded hill laps", minutes: 90, vertM: 600, cue: "Pack weight · controlled descent" },
    { focus: "recovery", title: "Mobility and easy spin", minutes: 40, cue: "Low intensity only" },
    { focus: "long-mountain", title: "Long mountain day", minutes: 330, vertM: 1500, cue: "Full pack · eat on the move" },
    { focus: "endurance", title: "Back-to-back hill day", minutes: 100, vertM: 600, cue: "Tired legs on purpose" },
  ],
  Peak: [
    REST,
    { focus: "intervals", title: "Uphill intervals, long efforts", minutes: 70, vertM: 500, cue: "4 × 8 min hard · 4 min easy" },
    { focus: "strength", title: "Gym — maintenance", minutes: 50, cue: "Maintain · no personal bests" },
    { focus: "endurance", title: "Loaded hill laps", minutes: 100, vertM: 700, cue: "Boots and pack you will carry" },
    REST,
    { focus: "long-mountain", title: "Big mountain day, full pack", minutes: 420, vertM: 2000, cue: "Longest day in the plan" },
    { focus: "long-mountain", title: "Second big day", minutes: 300, vertM: 1200, cue: "Yesterday's legs · slower is right" },
  ],
  Taper: [
    REST,
    { focus: "endurance", title: "Easy run", minutes: 50, cue: "Short · genuinely easy" },
    { focus: "technical", title: "Rope work and crampon drills", minutes: 45, cue: "Skills · no load" },
    { focus: "endurance", title: "Easy hill walk", minutes: 45, vertM: 200, cue: "Legs turning over" },
    REST,
    { focus: "long-mountain", title: "Short hill day with a pack", minutes: 120, vertM: 500, cue: "A reminder · not a test" },
    REST,
  ],
};

/**
 * Standing daily items. Part of the prescription — the plan asks for these
 * every day of every block — so they are legitimate content, unlike the sleep
 * DURATION, which is a measurement and stays a dash in the rail.
 */
const DAILY_ITEMS = [
  { title: "Mobility — ankles and hips", meta: "15 min" },
  { title: "Sleep window", meta: "8 h" },
] as const;

interface PlanDay {
  date: Date;
  key: string;
  session: Session;
}

interface PlanWeek {
  /** 1-based, as an athlete counts weeks. */
  number: number;
  phase: PhaseName;
  /** Every fourth week of a working block. Same sessions, less of them. */
  deload: boolean;
  days: PlanDay[];
}

/** A deload week is the same week at 60%, rounded to something a watch can show. */
function deloaded(s: Session): Session {
  if (s.focus === "rest") return s;
  return {
    ...s,
    minutes: Math.round((s.minutes * 0.6) / 5) * 5,
    vertM: s.vertM === undefined ? undefined : Math.round((s.vertM * 0.6) / 50) * 50,
  };
}

function phaseOfWeek(weekNumber: number): { name: PhaseName; ordinal: number } {
  let seen = 0;
  for (const phase of PHASES) {
    if (weekNumber <= seen + phase.weeks) return { name: phase.name, ordinal: weekNumber - seen };
    seen += phase.weeks;
  }
  const last = PHASES[PHASES.length - 1];
  return { name: last.name, ordinal: last.weeks };
}

/**
 * The build, counted backwards from the mountain — the date is the fixed thing,
 * the taper has to land on the week you fly, and everything else is arranged
 * behind it.
 */
function buildPlan(): PlanWeek[] {
  const lastWeekStart = addDays(mondayOf(GOAL_DATE), -7);
  const firstWeekStart = addDays(lastWeekStart, -7 * (TOTAL_WEEKS - 1));

  return Array.from({ length: TOTAL_WEEKS }, (_, i) => {
    const number = i + 1;
    const { name, ordinal } = phaseOfWeek(number);
    const deload = name !== "Taper" && ordinal % 4 === 0;
    const start = addDays(firstWeekStart, i * 7);

    return {
      number,
      phase: name,
      deload,
      days: TEMPLATE[name].map((session, d) => {
        const date = addDays(start, d);
        return { date, key: dayKey(date), session: deload ? deloaded(session) : session };
      }),
    };
  });
}

const PLAN: PlanWeek[] = IS_DEMO ? buildPlan() : [];

interface WeekTotals {
  sessions: number;
  minutes: number;
  vertM: number;
}

function totalsOf(days: PlanDay[]): WeekTotals {
  return days.reduce<WeekTotals>(
    (t, d) => ({
      sessions: t.sessions + (d.session.focus === "rest" ? 0 : 1),
      minutes: t.minutes + d.session.minutes,
      vertM: t.vertM + (d.session.vertM ?? 0),
    }),
    { sessions: 0, minutes: 0, vertM: 0 },
  );
}

interface PhaseBlock {
  name: PhaseName;
  tag: string;
  weeks: number;
  firstWeek: number;
  lastWeek: number;
  start: Date;
  end: Date;
}

const PHASE_BLOCKS: PhaseBlock[] = IS_DEMO
  ? PHASES.map((phase) => {
      const weeks = PLAN.filter((w) => w.phase === phase.name);
      const first = weeks[0];
      const last = weeks[weeks.length - 1];
      return {
        name: phase.name,
        tag: phase.tag,
        weeks: weeks.length,
        firstWeek: first.number,
        lastWeek: last.number,
        start: first.days[0].date,
        end: last.days[6].date,
      };
    })
  : [];

/** The objective card's subtitle comes from the marketplace, not from thin air. */
const GOAL_EXPEDITION = EXPEDITIONS.find((e) => e.heroPeak === "mont-blanc");

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

type TabId = "chat" | "today" | "plan" | "progress";

const TABS: { id: TabId; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "today", label: "Today" },
  { id: "plan", label: "Plan" },
  { id: "progress", label: "Progress" },
];

export default function Coach() {
  const [tab, setTab] = useState<TabId>("chat");
  const [today] = useState(() => startOfDay(new Date()));

  const todayKey = dayKey(today);

  // -1 when today falls outside the build. Nothing is then marked current,
  // rather than pinning the marker to an end and implying a position.
  const currentIndex = useMemo(
    () => PLAN.findIndex((w) => todayKey >= w.days[0].key && todayKey <= w.days[6].key),
    [todayKey],
  );

  const currentWeek = currentIndex >= 0 ? PLAN[currentIndex] : undefined;
  const todayDay = currentWeek?.days.find((d) => d.key === todayKey);

  const weeksToGoal = Math.max(
    0,
    Math.round((mondayOf(GOAL_DATE).getTime() - mondayOf(today).getTime()) / 604_800_000),
  );

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <h1 className="sr-only">Coach</h1>

      {/* ---- Tabs, and the only thing allowed to sit beside them --------- */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-hairline">
        <nav role="tablist" aria-label="Coach" className="-mb-px flex items-end gap-7">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "border-b-2 pb-3.5 text-[11px] font-medium uppercase tracking-[0.16em] transition-colors",
                tab === t.id ? "border-azure text-azure" : "border-transparent text-mist-dim hover:text-mist",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <span className="mb-3 inline-flex items-center gap-2 rounded-pill border border-hairline-strong px-3 py-1.5 text-[11.5px] text-mist">
          <Sparkles size={13} strokeWidth={1.7} className="text-azure" />
          Coach credits
          <span className="text-mist-dim">·</span>
          {/* A credit balance is a user statistic. No account, no number. */}
          <span className="tnum text-snow">{IS_DEMO ? "8" : "—"}</span>
          available
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-6 xl:flex-row">
        <section role="tabpanel" className="min-w-0 flex-1">
          {tab === "chat" && <ChatPane week={currentWeek} day={todayDay} weeksToGoal={weeksToGoal} />}
          {tab === "today" && <TodayPane day={todayDay} week={currentWeek} />}
          {tab === "plan" && <PlanPane startIndex={currentIndex} todayKey={todayKey} />}
          {tab === "progress" && <ProgressPane currentIndex={currentIndex} />}
        </section>

        <aside className="w-full shrink-0 space-y-5 xl:w-[360px]">
          <GoalCard weeksToGoal={weeksToGoal} />
          <GlanceCard />
          <PrioritiesCard day={todayDay} />
          <ConditionsCard />
        </aside>
      </div>

      {/* ---- Explanatory block 2 of 2, and the last thing on the page ---- */}
      {IS_DEMO && (
        <p className="mt-10 border-l-2 border-azure/30 pl-4 text-[11px] leading-relaxed text-mist-dim">
          {DEMO_NOTICE}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Chat                                                                        */
/* -------------------------------------------------------------------------- */

const SUGGESTED = [
  { icon: Dumbbell, q: "What should I train today?" },
  { icon: Mountain, q: "Am I ready for Mont Blanc?" },
  { icon: Moon, q: "How can I improve my sleep?" },
] as const;

function ChatPane({
  week,
  day,
  weeksToGoal,
}: {
  week: PlanWeek | undefined;
  day: PlanDay | undefined;
  weeksToGoal: number;
}) {
  const [draft, setDraft] = useState("");

  const greeting =
    week === undefined
      ? "Morning. No objective on file yet."
      : `Morning. ${weeksToGoal} weeks to Mont Blanc — you are in the ${week.phase} block.`;

  return (
    <div className="flex min-h-[640px] flex-col rounded-card border border-hairline bg-graphite p-6">
      <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-azure">
        <IcefallGlyph />
        Icefall Coach
      </p>

      {/* ---- The one assistant turn ------------------------------------ */}
      <div className="mt-5 flex gap-3.5">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-azure/40 text-azure">
          <IcefallGlyph size={15} />
        </span>
        <div className="min-w-0 max-w-[60ch] rounded-card border border-hairline bg-slate px-4 py-3.5">
          <p className="text-[13.5px] leading-relaxed text-snow">{greeting}</p>
          {day !== undefined && (
            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-mist">
              <span className="section-label">Priority today</span>
              <span className="text-snow">{day.session.title}</span>
              {day.session.minutes > 0 && (
                <>
                  <span className="text-mist-dim">·</span>
                  <span className="tnum">{fmtMinutes(day.session.minutes)}</span>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {/* ---- Suggested questions --------------------------------------- */}
      <p className="section-label mt-8">Suggested questions</p>
      <div className="mt-3.5 max-w-[60ch] space-y-2">
        {SUGGESTED.map(({ icon: Icon, q }) => (
          <button
            key={q}
            type="button"
            onClick={() => setDraft(q)}
            className="flex w-full items-center gap-3.5 rounded-tile border border-hairline bg-slate/40 px-4 py-3 text-left transition-colors hover:border-hairline-strong hover:bg-slate"
          >
            <Icon size={16} strokeWidth={1.7} className="shrink-0 text-azure" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-snow">{q}</span>
            <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
          </button>
        ))}
      </div>

      {/* ---- Composer, pinned to the foot ------------------------------ */}
      <div className="mt-auto pt-10">
        <form
          onSubmit={(e) => e.preventDefault()}
          className="flex items-center gap-2 rounded-pill border border-hairline-strong bg-slate py-2 pl-5 pr-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask your coach…"
            aria-label="Ask your coach"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-snow outline-none placeholder:text-mist-dim"
          />
          {/*
            Composing is local and harmless; sending needs a model behind an
            account. The control is present and disabled rather than absent —
            a missing button reads as an unfinished screen.
          */}
          <button
            type="submit"
            disabled
            aria-label="Send — needs an account"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-azure text-obsidian disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp size={16} strokeWidth={2.2} />
          </button>
        </form>

        <div className="mt-2.5 flex items-center justify-between gap-4 px-1">
          {/* Explanatory block 1 of 2. */}
          <span className="text-[11px] text-mist-dim">Icefall Coach can make mistakes.</span>
          <span className="section-label">Needs an account</span>
        </div>
      </div>
    </div>
  );
}

/** The house mark, small. Same path as the wordmark so they cannot drift. */
function IcefallGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 20L9 7l4 7 2.5-4L22 20H2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Today                                                                       */
/* -------------------------------------------------------------------------- */

function TodayPane({ day, week }: { day: PlanDay | undefined; week: PlanWeek | undefined }) {
  if (day === undefined || week === undefined) return <EmptyPane label="No plan yet" />;

  const Icon = FOCUS[day.session.focus].icon;
  const isRest = day.session.focus === "rest";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <p className="section-label">{longDate(day.date)}</p>
          <h2 className="mt-2 text-[19px] font-light tracking-[-0.01em] text-snow">
            Week <span className="tnum">{week.number}</span> · {week.phase}{" "}
            <span className="tnum">{phaseOfWeek(week.number).ordinal}</span>
          </h2>
        </div>
        {week.deload && <Badge tone="azure">deload week · 60%</Badge>}
      </div>

      {/* ---- The session -------------------------------------------- */}
      <article className="rounded-card border border-hairline bg-graphite p-6">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-tile border",
              isRest ? "border-hairline text-mist-dim" : "border-azure/40 text-azure",
            )}
          >
            <Icon size={19} strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="section-label">{FOCUS[day.session.focus].label}</p>
            <h3 className="mt-2 text-[22px] font-light tracking-[-0.01em] text-snow">{day.session.title}</h3>
            <p className="mt-2 text-[12.5px] text-mist">{day.session.cue}</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-hairline pt-5 sm:grid-cols-4">
          <Stat label="Time" value={isRest ? "—" : fmtMinutes(day.session.minutes)} dim={isRest} />
          <Stat label="Vertical" value={day.session.vertM === undefined ? "—" : fmtMetres(day.session.vertM)} dim={day.session.vertM === undefined} />
          <Stat label="Focus" value={FOCUS[day.session.focus].label} />
          {/* Nothing on a laptop can fill this. It stays a dash. */}
          <Stat label="Logged" value="—" dim />
        </dl>
      </article>

      {/* ---- Standing daily items ----------------------------------- */}
      <div className="rounded-card border border-hairline bg-graphite p-6">
        <p className="section-label">Also today</p>
        <ul className="mt-4 divide-y divide-hairline">
          {DAILY_ITEMS.map((item) => (
            <li key={item.title} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <span className="min-w-0 truncate text-[13px] text-snow">{item.title}</span>
              <span className="tnum shrink-0 text-[12.5px] text-mist">{item.meta}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ---- The week around it ------------------------------------- */}
      <div className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-card border border-hairline bg-graphite px-6 py-5">
        <Stat label="Sessions" value={String(totalsOf(week.days).sessions)} sub="this week" />
        <Stat label="Time" value={fmtMinutes(totalsOf(week.days).minutes)} sub="this week" />
        <Stat label="Vertical" value={fmtMetres(totalsOf(week.days).vertM)} sub="this week" />
        <Stat label="Logged" value="—" sub="this week" dim />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Plan                                                                        */
/* -------------------------------------------------------------------------- */

function PlanPane({ startIndex, todayKey }: { startIndex: number; todayKey: string }) {
  const [weekIndex, setWeekIndex] = useState(() => (startIndex >= 0 ? startIndex : 0));

  if (PLAN.length === 0) return <EmptyPane label="No plan yet" />;

  const week = PLAN[weekIndex];
  const totals = totalsOf(week.days);

  return (
    <div className="space-y-6">
      {/* ---- Week strip --------------------------------------------- */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="section-label">The week</p>
            <h2 className="mt-2 flex flex-wrap items-center gap-2.5 text-[17px] font-light text-snow">
              Week <span className="tnum">{week.number}</span> of <span className="tnum">{TOTAL_WEEKS}</span>
              <Badge tone={weekIndex === startIndex ? "azure" : "neutral"}>
                {week.phase} {phaseOfWeek(week.number).ordinal}
              </Badge>
              {week.deload && <Badge tone="neutral">deload</Badge>}
            </h2>
            <p className="tnum mt-1.5 text-[12px] text-mist">
              {shortDate(week.days[0].date)} – {shortDate(week.days[6].date)} {week.days[6].date.getFullYear()}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={startIndex < 0 || startIndex === weekIndex} onClick={() => setWeekIndex(startIndex)}>
              This week
            </Button>
            <Button variant="secondary" size="sm" aria-label="Previous week" disabled={weekIndex === 0} onClick={() => setWeekIndex((i) => Math.max(0, i - 1))}>
              <ChevronLeft size={15} strokeWidth={1.9} />
            </Button>
            <Button variant="secondary" size="sm" aria-label="Next week" disabled={weekIndex === PLAN.length - 1} onClick={() => setWeekIndex((i) => Math.min(PLAN.length - 1, i + 1))}>
              <ChevronRight size={15} strokeWidth={1.9} />
            </Button>
          </div>
        </div>

        {/*
          Seven columns, Monday first. No styling separates a past day from a
          future one — flagging "missed" sessions is how an app talks someone
          into making up volume in the week before an objective.
        */}
        <div className="mt-4 grid grid-cols-7 gap-2.5">
          {week.days.map((d, i) => {
            const Icon = FOCUS[d.session.focus].icon;
            const isToday = d.key === todayKey;
            const isRest = d.session.focus === "rest";

            return (
              <div
                key={d.key}
                className={cn(
                  "flex min-h-[168px] flex-col rounded-card border p-3",
                  isRest ? "bg-graphite/40" : "bg-graphite",
                  isToday ? "border-azure/45" : "border-hairline",
                )}
              >
                <span className="flex items-baseline justify-between">
                  <span className={cn("section-label", isToday && "text-azure")}>{DAY_LABELS[i]}</span>
                  <span className="tnum text-[11px] text-mist-dim">{shortDate(d.date)}</span>
                </span>

                <Icon size={16} strokeWidth={1.7} className={cn("mt-4", isRest ? "text-mist-dim" : "text-azure")} />
                <span className={cn("clamp-2 mt-2.5 text-[12.5px] leading-snug", isRest ? "text-mist" : "text-snow")}>
                  {d.session.title}
                </span>

                <span className="tnum mt-auto pt-3 text-[12px] text-mist">
                  {isRest ? "—" : fmtMinutes(d.session.minutes)}
                  {d.session.vertM !== undefined && ` · ${fmtMetres(d.session.vertM)}`}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-10 gap-y-4 rounded-card border border-hairline bg-graphite px-6 py-5">
          <Stat label="Sessions" value={String(totals.sessions)} sub="prescribed" />
          <Stat label="Time" value={fmtMinutes(totals.minutes)} sub="prescribed" />
          <Stat label="Vertical" value={fmtMetres(totals.vertM)} sub="prescribed" />
          <Stat label="Logged" value="—" sub="on the phone" dim />
        </div>
      </section>

      {/* ---- Phase timeline ------------------------------------------ */}
      <section>
        <p className="section-label">The build</p>
        <h2 className="mt-2 text-[17px] font-light text-snow">
          Four blocks, <span className="tnum">{TOTAL_WEEKS}</span> weeks
        </h2>

        <div className="mt-4 flex h-12 overflow-hidden rounded-tile border border-hairline bg-obsidian/60">
          {PHASE_BLOCKS.map((p) => (
            <button
              key={p.name}
              type="button"
              style={{ flexGrow: p.weeks }}
              onClick={() => setWeekIndex(p.firstWeek - 1)}
              className={cn(
                "flex min-w-0 flex-col items-start justify-center gap-1 border-r border-hairline px-3 text-left transition-colors last:border-r-0",
                p.name === week.phase ? "bg-azure/[0.10]" : "hover:bg-white/[0.03]",
              )}
            >
              <span className={cn("truncate text-[12.5px]", p.name === week.phase ? "text-azure" : "text-snow")}>
                {p.name}
              </span>
              <span className="tnum truncate text-[10.5px] text-mist-dim">{p.weeks} wks</span>
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PHASE_BLOCKS.map((p) => (
            <article
              key={p.name}
              className={cn(
                "rounded-card border bg-graphite p-5",
                p.name === week.phase ? "border-azure/35" : "border-hairline",
              )}
            >
              <div className="flex items-baseline justify-between">
                <h3 className={cn("text-[14.5px] font-light", p.name === week.phase ? "text-azure" : "text-snow")}>
                  {p.name}
                </h3>
                <span className="tnum text-[11px] text-mist-dim">
                  wk {p.firstWeek}–{p.lastWeek}
                </span>
              </div>
              <p className="mt-2 text-[12px] text-mist">{p.tag}</p>
              <p className="tnum mt-3 border-t border-hairline pt-3 text-[11.5px] text-mist-dim">
                {shortDate(p.start)} – {shortDate(p.end)}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                    */
/* -------------------------------------------------------------------------- */

function ProgressPane({ currentIndex }: { currentIndex: number }) {
  if (PLAN.length === 0) return <EmptyPane label="No plan yet" />;

  const weekly = PLAN.map((w) => ({ number: w.number, phase: w.phase, deload: w.deload, minutes: totalsOf(w.days).minutes }));
  const peak = Math.max(...weekly.map((w) => w.minutes));
  const totalMinutes = weekly.reduce((n, w) => n + w.minutes, 0);

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-hairline bg-graphite p-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="section-label">Prescribed volume</p>
            <h2 className="mt-2 text-[17px] font-light text-snow">Hours per week</h2>
          </div>
          <p className="tnum text-[11.5px] text-mist-dim">peak {fmtMinutes(peak)}</p>
        </div>

        {/*
          Bars are the PLAN's minutes, not an athlete's. The chart is honest
          because of its label — "prescribed" — not because of a disclaimer.
        */}
        <div className="mt-6 flex h-[220px] items-end gap-[3px]">
          {weekly.map((w, i) => (
            <div
              key={w.number}
              title={`Week ${w.number} · ${w.phase} · ${fmtMinutes(w.minutes)}`}
              style={{ height: `${Math.max(2, (w.minutes / peak) * 100)}%` }}
              className={cn(
                "min-w-0 flex-1 rounded-t-[2px] transition-colors",
                i === currentIndex ? "bg-azure" : w.deload ? "bg-slate/60" : "bg-slate",
              )}
            />
          ))}
        </div>

        <div className="mt-2.5 flex border-t border-hairline pt-2.5">
          {PHASE_BLOCKS.map((p) => (
            <span key={p.name} style={{ flexGrow: p.weeks }} className="min-w-0 truncate text-[10px] uppercase tracking-[0.16em] text-mist-dim">
              {p.name}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-card border border-hairline bg-graphite px-6 py-5">
        <Stat label="Current week" value={currentIndex >= 0 ? `${PLAN[currentIndex].number} / ${TOTAL_WEEKS}` : "—"} dim={currentIndex < 0} />
        <Stat label="Prescribed" value={fmtMinutes(totalMinutes)} sub="whole build" />
        <Stat label="Peak week" value={fmtMinutes(peak)} sub="whole build" />
        <Stat label="Logged" value="—" sub="on the phone" dim />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Right rail                                                                  */
/* -------------------------------------------------------------------------- */

function GoalCard({ weeksToGoal }: { weeksToGoal: number }) {
  if (!IS_DEMO) {
    return (
      <Card className="p-5">
        <p className="section-label">Current goal</p>
        <p className="mt-3 text-[13px] text-mist">No objective yet</p>
        <Link to="/app/explore" className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-azure transition-colors hover:text-azure-bright">
          Find one
          <ChevronRight size={13} strokeWidth={1.9} />
        </Link>
      </Card>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-graphite">
      <div className="relative h-[150px]">
        <img src="/img/mont-blanc.jpg" alt="" aria-hidden className="h-full w-full object-cover" />
        <span className="scrim-bottom absolute inset-0" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="section-label">Current goal</p>
          <h2 className="mt-2 text-[17px] font-light tracking-[-0.01em] text-snow">Mont Blanc Summit</h2>
          {GOAL_EXPEDITION !== undefined && (
            <p className="mt-1 truncate text-[11.5px] text-mist">
              {GOAL_EXPEDITION.company} · {GOAL_EXPEDITION.country}
            </p>
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="tnum text-[12.5px] text-snow">{weeksToGoal} weeks to go</span>
          {/* The bar has no fill because no percentage exists to fill it with. */}
          <span className="section-label">Not measured</span>
        </div>
        <div className="mt-3 h-1.5 rounded-pill border border-hairline bg-obsidian" role="presentation" />
      </div>
    </div>
  );
}

const GLANCE = [
  { label: "Recovery", icon: Activity },
  { label: "Sleep", icon: Moon },
  { label: "Readiness", icon: Gauge },
  { label: "Acclimatisation", icon: Mountain },
] as const;

function GlanceCard() {
  return (
    <Card className="p-5">
      <p className="section-label">Today at a glance</p>
      {/*
        All four are sensor readings from the phone. The dash IS the empty
        state — no card here explains itself, because four identical
        explanations is exactly the wall of text this page exists to avoid.
      */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {GLANCE.map(({ label, icon: Icon }) => (
          <div key={label} className="rounded-tile border border-hairline bg-slate/40 px-3.5 py-3">
            <Icon size={14} strokeWidth={1.7} className="text-mist-dim" />
            <p className="tnum mt-2.5 text-[20px] font-light text-mist-dim">—</p>
            <p className="mt-1 truncate text-[11px] text-mist">{label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PrioritiesCard({ day }: { day: PlanDay | undefined }) {
  const rows =
    day === undefined
      ? []
      : [
          { title: day.session.title, meta: day.session.minutes > 0 ? fmtMinutes(day.session.minutes) : "Rest day" },
          ...DAILY_ITEMS,
        ];

  return (
    <Card className="p-5">
      <p className="section-label">Today's priorities</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-mist">None yet</p>
      ) : (
        <ol className="mt-4 space-y-3.5">
          {rows.map((row, i) => (
            <li key={row.title} className="flex items-start gap-3">
              <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full border border-hairline text-[11px] text-mist">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-snug text-snow">{row.title}</span>
                <span className="tnum mt-1 block text-[11.5px] text-mist-dim">{row.meta}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function ConditionsCard() {
  return (
    <Card className="p-5">
      <p className="section-label">Conditions</p>

      {IS_DEMO ? (
        <>
          <div className="mt-3.5 flex items-center gap-3.5">
            <CloudSnow size={28} strokeWidth={1.4} className="shrink-0 text-azure" />
            <span className="tnum text-[26px] font-light leading-none text-snow">−4°</span>
            <span className="min-w-0 truncate text-[12.5px] text-mist">Light snow</span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-hairline pt-3.5">
            <Row term="Wind" value="18 km/h" />
            <Row term="Humidity" value="72%" />
          </dl>
        </>
      ) : (
        <p className="mt-3 text-[13px] text-mist">Not available</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-3.5">
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 text-[12px] text-azure disabled:cursor-not-allowed disabled:opacity-45"
        >
          View full forecast
          <ChevronRight size={13} strokeWidth={1.9} />
        </button>
        <span className="section-label">Needs an account</span>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                                */
/* -------------------------------------------------------------------------- */

/** Production, or any tab with no plan behind it. One label, one way out. */
function EmptyPane({ label }: { label: string }) {
  return (
    <div className="rounded-card border border-hairline bg-graphite p-8">
      <p className="section-label">{label}</p>
      <Link
        to="/app/explore"
        className="mt-4 inline-flex items-center gap-2 rounded-tile border border-azure/45 px-4 py-2.5 text-[12.5px] text-azure transition-colors hover:bg-azure/10"
      >
        Find an objective
        <ChevronRight size={14} strokeWidth={1.9} />
      </Link>
    </div>
  );
}

function Stat({ label, value, sub, dim }: { label: string; value: string; sub?: string; dim?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="section-label">{label}</p>
      <p className={cn("tnum mt-2 truncate text-[16px] font-light", dim ? "text-mist-dim" : "text-snow")}>{value}</p>
      {sub !== undefined && <p className="mt-1 truncate text-[11px] text-mist-dim">{sub}</p>}
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-mist-dim">{term}</dt>
      <dd className="tnum mt-0.5 truncate text-[12.5px] text-snow">{value}</dd>
    </div>
  );
}
