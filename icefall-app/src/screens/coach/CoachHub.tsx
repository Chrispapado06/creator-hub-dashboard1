import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUp,
  ChevronRight,
  Mountain as MountainIcon,
  Route as RouteIcon,
  Sparkles,
  Timer,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { useCoachIntel } from "@/coach/hooks";
import { useCoachPlanSummary, type CoachPlanSummary } from "@/coach/planSummary";
import {
  useCoachActions,
  type CommitResult,
  type PlanActionContext,
  type PlanProposal,
} from "@/coach/planActions";
import type { CoachAction } from "@/coach/tools";
import { COACH_DISCLAIMER } from "@/coach/types";
import { dailyEnergyFor, type RecordedSessionInput } from "@/coach/fuelDay";
import { DELOAD_SCALE } from "@/tracking/training";
import { useFuelLocal } from "@/screens/Nutrition";
import { useDayKey } from "@/lib/useDayKey";
import { fmtDistance, fmtElevation } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSettings } from "@/settings/store";
import { useApp } from "@/state/AppState";
import { useRecordedActivities } from "@/tracking/feed";
import type { TrainingDay, TrainingWeek } from "@/types";
import { Chip, daysUntil, useObjective } from "./shell";
import { ObjectiveSheet } from "./ObjectiveSheet";
import { AboutCoachSheet } from "./AboutCoachSheet";

/**
 * COACH HUB — rebuilt to `docs/design/coach-1to1-spec.md` Part B1 and the
 * brief's "Coach Hub" section (16 Sep 2026), replacing the 2026-09-06 hub
 * entirely.
 *
 * SIX BLOCKS, IN THE MOCKUP'S OWN ORDER, NOTHING ELSE: the objective chip
 * (the header row itself — avatar, name, search/messages/bell — is the
 * app-wide `AppTopBar`, already rendered by `AppShell` above every non-full-
 * screen route including this one, so it is not rebuilt here), the hero
 * session card, "This week", "Ask your coach", "Fuel today", and the "About
 * this coach" row. REMOVED, per brief §1: the 2×2 photo-tile grid, the old
 * full-bleed hero, the big Plan photo card — and, because the brief's Coach
 * Hub list names exactly these six blocks and nothing more, also the old
 * weekly-review nudge and the Trip-mode row that used to sit on this page.
 * Neither is deleted from the app — `weeklyReview.ts` and `/trip` are both
 * still real and still reachable — they are just no longer ON THE HUB. Worth
 * a look from the owner if either should live somewhere else now.
 *
 * ONE SOURCE OF TRUTH — brief §4.2. Every count, week, percentage and day
 * total on this page comes from `useCoachPlanSummary()` and nothing else
 * recomputes one. `useCoachIntel()` is still used, but only for what it alone
 * knows: the day's briefing (whether it eased today's session) and the
 * inputs Fuel's own energy engine takes — neither is a plan-progress number.
 *
 * EVERY COLOUR IS A REAL TOKEN, per the corrected brief: `bg-graphite`,
 * `bg-slate`, `border-hairline*`, `text-snow`, `text-mist*`, `bg-azure`,
 * `text-azure*`, `bg-summit`, `.scrim-full` — the same set `Fuel.tsx` and
 * `ObjectiveSheet.tsx` already use. The one exception is the hero photo's own
 * on-image text, which reads `text-white`: `.scrim-full` reclaims
 * `--color-white` to a genuine white on the island it wraps (see
 * `index.css`), so that is a real token resolving correctly in both themes,
 * not a hex literal — it is NOT the same thing as the dark-only mistake the
 * brief warns against.
 */

/* -------------------------------------------------------------------------- */
/* Small local building blocks — kept local rather than added to `shell.tsx`,   */
/* which the Chat and Plan agents are touching concurrently today.             */
/* -------------------------------------------------------------------------- */

function HubCard({
  children,
  className,
  pad = true,
}: {
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-card border border-hairline-strong bg-graphite",
        pad && "p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** "Wed 16 Sep" — read from the plan day's own date, never `new Date()`. */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/**
 * "242 days" — the chip's own short form of `countdownLabel`, which the
 * mockup writes without "to go". `daysUntil` (shell.tsx) still does the real
 * local-calendar arithmetic; this only trims the word the chip does not show.
 */
function chipCountdown(days: number | null): string {
  if (days === null) return "no target date";
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago`;
  if (days === 0) return "today";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/* -------------------------------------------------------------------------- */
/* Hero tiles — real figures only, never the mockup's invented exercise names  */
/* -------------------------------------------------------------------------- */

interface Tile {
  icon: LucideIcon;
  label: string;
  value: string;
}

/**
 * B1's hero shows four icon-over-label tiles named "Split squats", "Step-ups",
 * "Calf raises", "Core" — a per-exercise breakdown `TrainingDay` does not
 * carry (it has one `focus` and one `title`, not a set list; see
 * `types/index.ts`). Inventing four exercise names ICEFALL never prescribed
 * is exactly what the brief's "never invent a number, a session…" line
 * forbids, so the tiles keep the mockup's LAYOUT — a row of icon-over-label
 * squares — and fill it with the figures the day actually holds: duration,
 * ascent, distance. Zero to three of them, never a tile for a figure the day
 * does not carry. GAP, reported below: a real per-exercise breakdown for
 * strength sessions is not data ICEFALL has today.
 */
function tilesFor(day: TrainingDay): Tile[] {
  const tiles: Tile[] = [];
  if (typeof day.durationMin === "number" && day.durationMin > 0) {
    tiles.push({ icon: Timer, label: "Duration", value: `${day.durationMin} min` });
  }
  if (typeof day.elevationM === "number" && day.elevationM > 0) {
    tiles.push({ icon: ArrowUp, label: "Ascent", value: `${fmtElevation(day.elevationM)} m` });
  }
  if (typeof day.distanceKm === "number" && day.distanceKm > 0) {
    tiles.push({ icon: RouteIcon, label: "Distance", value: `${fmtDistance(day.distanceKm)} km` });
  }
  return tiles;
}

/**
 * The nearest earlier day THIS WEEK that was prescribed and never marked
 * done — brief §5's "missed session (neutral, no shaming copy)" state.
 *
 * `CoachPlan.tsx`'s own rule governs the wording here too: "A PAST DAY THAT
 * WAS NOT DONE IS SHOWN, NOT SCOLDED." So this never replaces the hero's own
 * state — today's session is always what the hero is about — it surfaces as
 * one neutral sentence inside whichever state today is in, naming the day and
 * the session, never "missed" or "skipped" as a label.
 */
function earlierUnaddressedDay(
  days: TrainingDay[],
  completedByDate: ReadonlyMap<string, boolean>,
  todayKey: string,
): TrainingDay | null {
  for (const d of days) {
    if (d.date >= todayKey) break;
    if (d.focus === "rest") continue;
    if (completedByDate.get(d.date) ?? d.completed) continue;
    return d;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The page                                                                    */
/* -------------------------------------------------------------------------- */

type SheetKind = "objective" | "about" | "swap" | null;

export default function CoachHub() {
  const navigate = useNavigate();
  const summary = useCoachPlanSummary();
  const intel = useCoachIntel();
  const actions = useCoachActions();
  const { goal } = useObjective();
  const [sheet, setSheet] = useState<SheetKind>(null);

  function ask(question: string) {
    const q = question.trim();
    if (!q) return;
    // Same mechanism `CoachChat.tsx` already reads (`location.state.ask`) and
    // sends once, unprompted — see that screen's inbound-question effect.
    navigate("/coach/chat", { state: { ask: q } });
  }

  const chips = [
    "What should I train today?",
    goal ? `Am I ready for ${goal.name}?` : "Am I prepared?",
    "Why a deload?",
  ];

  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-8 pt-3">
        {/* ---- Objective chip — the ONLY place the objective changes, brief
            §1 and §4.3. The rest of the header row (avatar, name, search,
            messages, bell) is the app-wide top bar rendered above this
            outlet already; nothing here duplicates it. */}
        <Rise>
          <button
            type="button"
            onClick={() => setSheet("objective")}
            className="-ml-1 inline-flex min-h-11 max-w-full items-center gap-1 rounded-full pl-1 pr-2 text-[14px] text-azure-bright transition-opacity active:opacity-70"
          >
            <span className="min-w-0 truncate">
              {goal
                ? `${goal.name} · ${chipCountdown(daysUntil(goal.targetDate))}`
                : "Set an objective"}
            </span>
            <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
          </button>
        </Rise>

        {/* ---- Hero: today's session --------------------------------------- */}
        <Rise className="mt-4">
          <HeroCard
            summary={summary}
            intel={intel}
            actions={actions}
            onSwap={() => setSheet("swap")}
          />
        </Rise>

        {/* ---- This week ----------------------------------------------------- */}
        <Rise className="mt-4">
          <ThisWeekCard summary={summary} />
        </Rise>

        {/* ---- Ask your coach ------------------------------------------------- */}
        <Rise className="mt-4">
          <AskCoachCard chips={chips} onAsk={ask} />
        </Rise>

        {/* ---- Fuel today ------------------------------------------------------ */}
        <Rise className="mt-4">
          <FuelTodayCard />
        </Rise>

        {/* ---- About this coach ------------------------------------------------ */}
        <Rise className="mt-1">
          <button
            type="button"
            onClick={() => setSheet("about")}
            className="-mx-5 flex w-[calc(100%+40px)] items-center gap-3 border-t border-hairline px-5 py-4 text-left"
          >
            <span className="min-w-0 flex-1 text-[14px] text-snow">About this coach</span>
            <ChevronRight
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
              className="shrink-0 text-mist"
            />
          </button>
        </Rise>

        <Rise className="mt-2">
          <p className="text-[11px] leading-relaxed text-mist-dim">{COACH_DISCLAIMER}</p>
        </Rise>
      </Stagger>

      {sheet === "objective" && <ObjectiveSheet onClose={() => setSheet(null)} />}
      {sheet === "about" && <AboutCoachSheet onClose={() => setSheet(null)} />}
      {sheet === "swap" && summary?.today && (
        <SwapSheet
          today={summary.today}
          week={summary.currentWeek}
          ctx={actions.ctx}
          preview={actions.preview}
          commit={actions.commit}
          onClose={() => setSheet(null)}
        />
      )}
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero card                                                                   */
/* -------------------------------------------------------------------------- */

function HeroCard({
  summary,
  intel,
  actions,
  onSwap,
}: {
  summary: CoachPlanSummary | null;
  intel: ReturnType<typeof useCoachIntel>;
  actions: ReturnType<typeof useCoachActions>;
  onSwap: () => void;
}) {
  // No objective at all — nothing downstream (a plan, a session, a week) can
  // exist, so the hero says that plainly rather than showing a blank card.
  if (!summary) {
    return (
      <HubCard>
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-mist">Today</p>
        <h2 className="display mt-1.5 text-[26px] leading-[1.05] text-snow">Name the mountain</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-mist">
          Your plan, fuelling and coach all follow an objective. Set one and today has a step.
        </p>
        <Link
          to="/goals"
          className="mt-3.5 inline-flex items-center gap-1 text-[14px] text-azure-bright"
        >
          Set an objective
          <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" />
        </Link>
      </HubCard>
    );
  }

  const { today, currentWeek, isDeloadWeek, todayCompleted } = summary;

  if (!today) {
    return (
      <HubCard>
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-mist">
          Today · {dayLabel(actions.ctx.today)}
        </p>
        <h2 className="display mt-1.5 text-[26px] leading-[1.05] text-snow">
          Nothing planned today
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-mist">
          There is no session in your plan for today. Anything you record still counts.
        </p>
        <Link
          to="/activity/select"
          className="mt-3.5 inline-flex items-center gap-1 text-[14px] text-azure-bright"
        >
          Record a session
          <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" />
        </Link>
      </HubCard>
    );
  }

  const isRest = today.focus === "rest";
  // The briefing can hold today down (illness, a hard day yesterday). When it
  // disagrees with the plan's own focus, the plan's day still shows, with
  // this said alongside it — the same check `Today.tsx` makes, repeated here
  // so the hub cannot advertise a session the engine has already eased.
  const eased = Boolean(intel.briefing.training && intel.briefing.training.focus !== today.focus);
  const missed = earlierUnaddressedDay(
    currentWeek.days,
    actions.ctx.completedByDate,
    actions.ctx.today,
  );
  const blockLabel = currentWeek.block.replace(/ · deload$/, "");
  const tiles = !isRest ? tilesFor(today) : [];

  const chips: React.ReactNode[] = [];
  if (todayCompleted)
    chips.push(
      <Chip key="c" tone="green">
        Completed
      </Chip>,
    );
  if (!isRest && typeof today.durationMin === "number" && today.durationMin > 0) {
    chips.push(<Chip key="d">{today.durationMin} min</Chip>);
  }
  if (!isRest) chips.push(<Chip key="b">{blockLabel}</Chip>);
  if (isDeloadWeek && !isRest)
    chips.push(
      <Chip key="dl" tone="peach">
        Deload
      </Chip>,
    );

  return (
    <HubCard pad={false} className="overflow-hidden">
      {/* "a mountain photograph fills the top of the card under a dark
          gradient" — B1. `.scrim-full` reclaims a real `--color-white` for
          the text sitting on it (see file header); a public-domain frame
          already used elsewhere in Coach (`Today.tsx`'s reference), so this
          card matches the rest of the section rather than adding a new one. */}
      <div className="relative h-32 w-full bg-obsidian">
        <img
          src="/img/gran-paradiso.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "50% 34%" }}
        />
        <div aria-hidden="true" className="scrim-full absolute inset-0" />
        <div className="relative flex h-full items-start gap-1.5 p-4">
          <MountainIcon
            size={14}
            strokeWidth={1.8}
            className="mt-[1px] shrink-0 text-white/85"
            aria-hidden="true"
          />
          <span className="text-[13px] font-medium text-white">Today · {dayLabel(today.date)}</span>
        </div>
      </div>

      <div className="p-5">
        <h2 className="display text-[26px] leading-[1.05] text-snow">{today.title}</h2>

        {chips.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{chips}</div>}

        {/* One reason line — the deload note when it is a deload week, else
            the plan's own detail (a rest day's "Full rest. Adaptation
            happens here.", real, never the mockup's "Recovery and
            mobility"). Never both, and never the eased/missed notes stacked
            under it read as one paragraph. */}
        {isDeloadWeek && !isRest ? (
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-mist">
            Deload week: {Math.round(DELOAD_SCALE * 100)}% of your usual block load so earlier weeks
            are absorbed.
          </p>
        ) : today.detail ? (
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-mist">{today.detail}</p>
        ) : null}

        {eased && (
          <p className="mt-2.5 rounded-tile bg-azure/10 px-3 py-2 text-[12.5px] leading-relaxed text-azure-bright">
            <span className="font-semibold">Eased today. </span>
            {intel.briefing.status}
          </p>
        )}

        {missed && (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist-dim">
            {dayLabel(missed.date)}'s {missed.title} wasn't marked done. Missed work isn't a debt —
            today's plan carries on as normal.
          </p>
        )}

        {tiles.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {tiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <div
                  key={tile.label}
                  className="flex flex-col items-start gap-2 rounded-tile border border-hairline bg-slate p-3"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 place-items-center rounded-full bg-elevated text-azure"
                  >
                    <Icon size={14} strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10.5px] uppercase tracking-[0.08em] text-mist">
                      {tile.label}
                    </span>
                    <span className="tnum block truncate text-[13px] font-semibold text-snow">
                      {tile.value}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex gap-2.5">
          {todayCompleted ? (
            <Button asChild variant="secondary" size="lg" className="flex-1">
              <Link to={`/coach/session/${today.date}`}>View session</Link>
            </Button>
          ) : isRest ? (
            <Button asChild variant="secondary" size="lg" className="flex-1">
              <Link to={`/coach/session/${today.date}`}>View rest day</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="primary" size="lg" className="flex-1">
                <Link to={`/coach/session/${today.date}`}>Start session</Link>
              </Button>
              <Button variant="secondary" size="lg" onClick={onSwap}>
                Swap
              </Button>
            </>
          )}
        </div>
      </div>
    </HubCard>
  );
}

/* -------------------------------------------------------------------------- */
/* This week                                                                   */
/* -------------------------------------------------------------------------- */

function ThisWeekCard({ summary }: { summary: CoachPlanSummary | null }) {
  if (!summary) return null;
  const { thisWeek, currentWeekRangeLabel } = summary;

  return (
    <Link to="/coach/plan" className="block transition-transform active:scale-[0.99]">
      <HubCard>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="tnum text-[15px] font-medium text-snow">
              {thisWeek.prescribed > 0
                ? `${thisWeek.completed} of ${thisWeek.prescribed} sessions`
                : "No sessions scheduled"}
            </p>
            <p className="mt-0.5 text-[12.5px] text-mist">{currentWeekRangeLabel}</p>
          </div>
          <ChevronRight
            size={16}
            strokeWidth={1.8}
            aria-hidden="true"
            className="shrink-0 text-mist"
          />
        </div>

        {thisWeek.prescribed > 0 && (
          <>
            <div
              className="mt-4 flex gap-1.5"
              role="img"
              aria-label={`${thisWeek.completed} of ${thisWeek.prescribed} sessions done this week`}
            >
              {Array.from({ length: thisWeek.prescribed }).map((_, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className={cn(
                    "h-2 flex-1 rounded-full",
                    i < thisWeek.completed ? "bg-azure" : "bg-slate",
                  )}
                />
              ))}
            </div>
            <p className="tnum mt-2.5 text-[12.5px] text-mist">
              {thisWeek.remaining} {thisWeek.remaining === 1 ? "left" : "left"}
            </p>
          </>
        )}
      </HubCard>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Ask your coach                                                              */
/* -------------------------------------------------------------------------- */

function AskCoachCard({ chips, onAsk }: { chips: string[]; onAsk: (q: string) => void }) {
  return (
    <HubCard>
      <Link to="/coach/chat" className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <Sparkles
            size={16}
            strokeWidth={1.8}
            className="shrink-0 text-azure"
            aria-hidden="true"
          />
          <span className="truncate text-[16px] font-semibold text-snow">Ask your coach</span>
        </span>
        <ChevronRight
          size={16}
          strokeWidth={1.8}
          aria-hidden="true"
          className="shrink-0 text-mist"
        />
      </Link>
      <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
        Get personalised guidance from your training data.
      </p>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onAsk(c)}
            className="flex min-h-11 items-center rounded-full bg-slate px-3.5 text-[13px] text-snow transition-colors hover:bg-elevated"
          >
            {c}
          </button>
        ))}
      </div>
    </HubCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Fuel today                                                                  */
/* -------------------------------------------------------------------------- */

const kcal = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 0 });

function FuelTodayCard() {
  const { bodyMassKgSet } = useApp();
  const { settings } = useSettings();
  const { fuel } = useFuelLocal();
  const { today, briefing } = useCoachIntel();
  const recorded = useRecordedActivities();
  const todayKey = useDayKey();

  const recordedToday = useMemo<RecordedSessionInput[]>(
    () =>
      recorded
        .filter((a) => !a.simulated && a.startedAt.slice(0, 10) === todayKey)
        .map((a) => ({ kcal: a.calories, movingSec: a.movingSec, forKg: a.caloriesForKg ?? null })),
    [recorded, todayKey],
  );

  // The same call, same inputs, as `/coach/fuel` itself — see that screen —
  // so the hub's range and the Fuel page's range never disagree.
  const energy = useMemo(
    () =>
      dailyEnergyFor({
        bodyMassKgSet,
        heightCm: settings.heightCm ?? null,
        birthYear: settings.birthYear ?? null,
        sex: fuel.sexForEnergy ?? null,
        movement: fuel.dailyMovement ?? null,
        day: today ?? null,
        easedFocus: briefing.training?.focus ?? null,
        packKg: settings.packWeightKg ?? null,
        recorded: recordedToday,
      }),
    [
      bodyMassKgSet,
      settings.heightCm,
      settings.birthYear,
      settings.packWeightKg,
      fuel.sexForEnergy,
      fuel.dailyMovement,
      today,
      briefing.training?.focus,
      recordedToday,
    ],
  );

  const band = energy.total;
  const loggedToday = (fuel.foodLog ?? []).some((e) => e.date === todayKey);

  return (
    <Link to="/coach/fuel" className="block transition-transform active:scale-[0.99]">
      <HubCard>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <Utensils size={16} strokeWidth={1.7} className="text-mist" aria-hidden="true" />
            <span className="text-[15px] font-medium text-snow">Fuel today</span>
          </span>
          <ChevronRight
            size={16}
            strokeWidth={1.8}
            aria-hidden="true"
            className="shrink-0 text-mist"
          />
        </div>

        {band ? (
          <p className="display tnum mt-3 text-[24px] leading-[1.1] text-snow">
            {kcal(band.low)} – {kcal(band.high)} kcal
          </p>
        ) : (
          <p className="mt-3 text-[13.5px] leading-relaxed text-mist">
            {energy.resting.kind === "unavailable"
              ? energy.resting.sentence
              : "The range needs more inputs than ICEFALL has today."}
          </p>
        )}

        <p className="mt-1.5 text-[12.5px] text-mist">
          {loggedToday ? "Logged today." : "Nothing logged yet."}
        </p>
      </HubCard>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Swap sheet                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * "Swap" — B1's second hero button. Trades today's session with another day
 * this week, through the same real plan-change engine the chat coach uses
 * (`coach/planActions.ts`'s `swap_sessions` tool): nothing here is a new way
 * to edit the plan, it is this engine's own preview/commit pair behind a
 * small picker, so a swap made from the hub and one the coach proposes in
 * chat go through identical guards (a completed or past day is refused) and
 * write the same kind of record, undoable from Plan → Changes.
 */
function SwapSheet({
  today,
  week,
  ctx,
  preview,
  commit,
  onClose,
}: {
  today: TrainingDay;
  week: TrainingWeek;
  ctx: PlanActionContext;
  preview: (a: CoachAction) => PlanProposal;
  commit: (p: PlanProposal) => CommitResult;
  onClose: () => void;
}) {
  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  const [done, setDone] = useState(false);

  const candidates = week.days.filter(
    (d) => d.date !== today.date && d.date >= ctx.today && !ctx.completedByDate.get(d.date),
  );

  function choose(day: TrainingDay) {
    const action: CoachAction = {
      tool: "swap_sessions",
      date: today.date,
      withDate: day.date,
      why: "Requested from the Coach hub.",
    };
    setProposal(preview(action));
  }

  function confirmSwap() {
    if (!proposal) return;
    const result = commit(proposal);
    if (result.ok) setDone(true);
    else setProposal({ ...proposal, outcome: "refused", note: result.problem });
  }

  if (done) {
    return (
      <Sheet title="Session swapped" onClose={onClose}>
        <div className="py-6 text-center">
          <p className="text-[14px] leading-relaxed text-snow">{proposal?.summary}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 text-[14px] font-medium text-azure-bright"
          >
            Done
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Swap today's session" onClose={onClose}>
      {!proposal ? (
        candidates.length > 0 ? (
          <div className="divide-y divide-hairline">
            <p className="py-3 text-[13px] leading-relaxed text-mist">
              Pick another day this week to trade with {today.title}.
            </p>
            {candidates.map((d) => (
              <button
                key={d.date}
                type="button"
                onClick={() => choose(d)}
                className="flex w-full items-center justify-between gap-3 py-3.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[13.5px] text-snow">{dayLabel(d.date)}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-mist">{d.title}</span>
                </span>
                <ChevronRight
                  size={15}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  className="shrink-0 text-mist"
                />
              </button>
            ))}
          </div>
        ) : (
          <p className="py-5 text-[13.5px] leading-relaxed text-mist">
            There is nothing else left to swap with this week.
          </p>
        )
      ) : proposal.outcome === "refused" ? (
        <div className="py-5">
          <p className="text-[13.5px] leading-relaxed text-mist">{proposal.note}</p>
          <button
            type="button"
            onClick={() => setProposal(null)}
            className="mt-4 text-[14px] font-medium text-azure-bright"
          >
            Choose another day
          </button>
        </div>
      ) : (
        <div className="py-5">
          <p className="text-[14px] leading-relaxed text-snow">{proposal.summary}</p>
          {proposal.note && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-mist">{proposal.note}</p>
          )}
          <div className="mt-4 flex gap-2.5">
            <Button variant="secondary" size="md" onClick={() => setProposal(null)}>
              Back
            </Button>
            <Button variant="primary" size="md" className="flex-1" onClick={confirmSwap}>
              Confirm swap
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
