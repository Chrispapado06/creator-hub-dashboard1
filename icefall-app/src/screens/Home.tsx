import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity as ActivityIcon, ArrowUpRight, Backpack, Bell, Check, ChevronRight, Clock, CloudSun,
  Droplets, Eye, Flame, MessageCircle, Plus, Route, Search, TrendingUp, Users, Wind,
} from "lucide-react";
import { Card, SectionLabel } from "@/components/ui/primitives";
import { MiniBars } from "@/components/ui/charts";
import { ScoreRing } from "@/components/coach/CoachUI";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { ActivityCard } from "@/components/domain/cards";
import { MountainThumb } from "@/components/domain/MountainImage";
import { IcefallMark } from "@/components/ui/IcefallMark";
import {
  fmtCountdown, fmtDistance, fmtElevation, fmtHours, greeting, FOCUS_LABELS,
} from "@/lib/format";
import { sync } from "@/services/repository";
import { useActivityFeed, useWeeklyProgress } from "@/tracking/feed";
import { activeSessionSummary } from "@/tracking/activeSession";
import { activityById } from "@/tracking/activities";
import { ACTIVITY_ICON } from "@/components/tracker/activityIcons";
import { useApp } from "@/state/AppState";
import { usePrimaryGoalWithProgress, useTraining } from "@/tracking/training";
import { useConversations } from "@/screens/chat/useConversations";
import { useCoachIntel } from "@/coach/hooks";
import { CATEGORY_ORDER, completion, generateChecklist, isResolved } from "@/services/checklist";
import { getMountainConditions, type MountainConditions } from "@/services/conditions";
import { parseDay } from "@/network/groups";
import { NETWORK_NOT_CONNECTED_NOTICE } from "@/network/types";
import type { Score } from "@/coach/types";
import { cn } from "@/lib/utils";

/**
 * The notch, borrowed back.
 *
 * `Screen` pads the scroll container by the safe-area inset so no screen writes
 * under the status bar. The hero photograph is the one thing that SHOULD run
 * under it, so the hero pulls the inset off as a negative margin and re-applies
 * it as padding — the picture bleeds to the top of the display, the top bar
 * still clears the notch, and the inset is counted exactly once.
 */
const SAFE_TOP = "var(--screen-safe-top, env(safe-area-inset-top, 0px))";

/**
 * Screen 03 — the athlete's command center.
 *
 * Laid out to a supplied design. Where that design asked for a figure ICEFALL
 * cannot actually derive, the section states what it really knows instead of
 * printing the number:
 *
 *   - The ring is TODAY'S readiness, not a "weekly" one — no weekly readiness
 *     exists — and when the score cannot be computed it draws a visibly BROKEN
 *     ring behind an em dash rather than a full unlit track, which would read
 *     as a measured zero. The design's "72%" is printed only when there is a
 *     72 to print.
 *   - "Expedition ready" is never printed: `mountainReadiness` is deliberately
 *     hostile to that reading and nothing here may clear anyone for a summit.
 *     The line under the progress bar is the real training block ("Base 3 ·
 *     deload · week 12"), taken from the plan.
 *   - The checklist counts EQUIPMENT AND DOCUMENT ITEMS, not "tasks" — there is
 *     no task model, and the items are derived from the peak itself.
 *   - No heart-rate zones: ICEFALL has never measured a threshold.
 *   - Nobody is listed under "people nearby". The athlete directory is
 *     deliberately empty until there is a backend, and an invented climbing
 *     partner is a hazard rather than a placeholder.
 */
export default function Home() {
  const { user, checklistStatuses, groupSessions, networkOptIn, locationOptIn, toggleSession } =
    useApp();
  const goal = usePrimaryGoalWithProgress();
  const weekly = useWeeklyProgress();
  const feed = useActivityFeed();
  const { plan, today, currentWeek, completedByDate, satisfiedByActivity } = useTraining();
  const intel = useCoachIntel();
  const conversations = useConversations();

  const firstName = user.name.split(" ")[0];
  const unread = conversations.reduce((n, c) => n + c.unread, 0);
  const todayIndex = (new Date().getDay() + 6) % 7;
  const recent = feed.slice(0, 2);
  const doneToday = today ? completedByDate.get(today.date) === true : false;

  /*
   * The week that actually contains today, not `plan.currentWeek`.
   *
   * `toggleSession` is keyed on (week index, date); handing it the wrong week
   * would write an override nothing reads back, and the tick would appear to do
   * nothing. The two agree in normal use — they diverge around a plan whose
   * start date has moved.
   */
  const todayWeek = useMemo(
    () => (today ? (plan?.weeks.find((w) => w.days.some((d) => d.date === today.date)) ?? null) : null),
    [plan, today],
  );

  const goalMountain = goal?.mountainId ? sync.mountainById(goal.mountainId) : undefined;
  const elevationM = goal?.elevationM ?? goalMountain?.elevationM ?? null;
  const lat = goal?.lat ?? goalMountain?.coords.lat;
  const lon = goal?.lon ?? goalMountain?.coords.lon;

  const active = activeSessionSummary();
  const activeType = active ? activityById(active.activityTypeId) : null;
  const ActiveIcon = active ? ACTIVITY_ICON[active.activityTypeId] : null;

  /* ---- Equipment checklist, derived from the objective ------------------- */
  const checklist = useMemo(() => {
    if (!goal || elevationM === null) return null;
    const list = generateChecklist({ name: goal.name, elevationM, lat, lon });
    const statuses = checklistStatuses[goal.id] ?? {};
    const result = completion(list.items, statuses);
    const next = CATEGORY_ORDER.flatMap((c) =>
      list.items.filter((i) => i.category === c && !isResolved(statuses[i.id])),
    )[0];
    return { result, next };
  }, [goal, elevationM, lat, lon, checklistStatuses]);

  const readinessKnown =
    typeof intel.readiness.score.value === "number" &&
    Number.isFinite(intel.readiness.score.value);

  return (
    <Screen padded={false}>
      {/* ---- Hero — the top bar and the greeting ride ON the photograph --- */}
      <Stagger>
        <Rise
          className="relative"
          style={{ marginTop: `calc(-1 * ${SAFE_TOP})`, paddingTop: SAFE_TOP }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[300px] overflow-hidden"
          >
            {/*
              Mirrored. The photograph puts the Matterhorn on the LEFT, which
              is exactly where the greeting and the athlete's name sit — the
              peak ended up behind the type. Flipping moves it under the
              readiness dial on the right, where the composition has room, and
              costs nothing: it is scenery, not a map, so left-right carries no
              meaning to mislead.
            */}
            <img
              src="/img/home-hero.jpg"
              alt=""
              className="h-full w-full scale-x-[-1] object-cover"
            />
            {/* Two scrims. The vertical one dissolves the picture into the
                canvas rather than ending it on a hard edge; the horizontal one
                holds the left third dark enough for the greeting to read over
                cloud, which is the brightest thing this photograph does. */}
            <div className="absolute inset-0 bg-gradient-to-b from-obsidian/80 via-obsidian/45 to-obsidian" />
            <div className="absolute inset-0 bg-gradient-to-r from-obsidian/70 via-obsidian/25 to-transparent" />
          </div>

          {/* ---- Top bar, transparent over the photograph ----------------- */}
          <header className="relative flex items-center justify-between px-5 pb-1 pt-3">
            <IcefallMark className="h-[17px] shrink-0 text-azure" />
            {/* Centred on the DISPLAY, not on what is left between the mark and
                the icons — the wordmark is the axis of the whole screen. */}
            <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 pl-[0.32em] text-center text-[13px] font-light tracking-[0.32em] text-snow">
              ICEFALL
            </p>
            <div className="relative flex shrink-0 items-center gap-0.5">
              {/* One door to the whole app — every other search box in ICEFALL is
                  local to the screen it sits on. */}
              <Link
                to="/search"
                aria-label="Search"
                className="grid h-9 w-9 place-items-center rounded-full text-snow/90 transition-colors hover:bg-white/[0.07] hover:text-snow"
              >
                <Search size={18} strokeWidth={1.6} />
              </Link>
              <Link
                to="/messages"
                aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
                className="relative grid h-9 w-9 place-items-center rounded-full text-snow/90 transition-colors hover:bg-white/[0.07] hover:text-snow"
              >
                <MessageCircle size={18} strokeWidth={1.5} />
                {/* A real count, and only when there is one to show. */}
                {unread > 0 && (
                  <span className="tnum absolute right-0.5 top-1 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-azure px-1 text-[9px] font-medium text-obsidian ring-2 ring-obsidian/60">
                    {unread}
                  </span>
                )}
              </Link>
              {/*
                No unread dot on the bell.
                The mockup shows one, and the messages icon beside it earns its
                badge from a real unread count. This one had nothing behind it:
                there is no notification model anywhere in the app, so the dot
                asserted "something is waiting for you" that ICEFALL cannot
                know. Put it back the day notifications exist and not before.
              */}
              <button
                type="button"
                aria-label="Notifications"
                className="relative grid h-9 w-9 place-items-center rounded-full text-snow/90 transition-colors hover:bg-white/[0.07] hover:text-snow"
              >
                <Bell size={18} strokeWidth={1.5} />
              </button>
            </div>
          </header>

          {/* ---- Greeting and today's readiness ---------------------------- */}
          <div className="relative flex items-start justify-between gap-4 px-5 pb-1 pt-6">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-mist">{greeting()},</p>
              <h1 className="mt-1 truncate text-[38px] font-light leading-[1.05] tracking-[-0.03em] text-snow">
                {firstName}
              </h1>
              <p className="mt-3 max-w-[22ch] text-[13px] italic leading-[1.5] text-mist-dim">
                "The mountain is not a destination, it's a way of life."
              </p>
            </div>
            <Link to="/coach/readiness" className="mt-1 shrink-0" aria-label="Today's readiness">
              <ReadinessDial score={intel.readiness.score} />
            </Link>
          </div>

          {/* ---- Current objective — overlapping the foot of the hero ------ */}
          <div className="relative px-5 pt-6">
            {goal ? (
              <Card>
                <Link to="/goals" className="block">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="section-label text-azure">Current objective</p>
                      <h2 className="mt-2 truncate text-[26px] font-light leading-tight text-snow">
                        {goal.name}
                      </h2>
                      <p className="tnum mt-1 text-[13px] text-mist">
                        {elevationM !== null
                          ? `${fmtElevation(elevationM)} m`
                          : "Elevation not held"}
                      </p>
                    </div>
                    {goalMountain && (
                      <MountainThumb
                        peak={{
                          name: goal.name,
                          elevationM: elevationM ?? undefined,
                          lat,
                          lon,
                          curatedId: goal.mountainId,
                          wikipedia: goal.wikipedia,
                          photo: goal.photo,
                        }}
                        size={54}
                      />
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-azure transition-[width] duration-500"
                        style={{ width: `${Math.max(0, Math.min(100, goal.preparation))}%` }}
                      />
                    </div>
                    <span className="tnum shrink-0 text-[13px] text-azure">{goal.preparation}%</span>
                  </div>
                  {/* The real training block — never "expedition ready", which is
                      a clearance ICEFALL is forbidden to give. */}
                  <p className="section-label mt-2.5">
                    {currentWeek
                      ? `${currentWeek.block} · week ${currentWeek.index}`
                      : "Preparation"}
                  </p>
                </Link>

                {/* Four figures, all derivable. "Group 4 of 6" is absent by
                    design: with no backend a party can never have a second
                    member to count. */}
                <div className="mt-4 grid grid-cols-4 gap-2 border-t border-hairline pt-4">
                  <Stat
                    value={countdownValue(goal.targetDate)}
                    label={countdownLabel(goal.targetDate)}
                  />
                  <Stat
                    value={
                      checklist && checklist.result.applicable > 0
                        ? `${checklist.result.resolved}/${checklist.result.applicable}`
                        : "—"
                    }
                    label="Kit items"
                  />
                  <Stat value={`${goal.preparation}%`} label="Training" />
                  <Stat
                    value={
                      readinessKnown
                        ? `${Math.round(intel.readiness.score.value as number)}%`
                        : "—"
                    }
                    label="Readiness"
                  />
                </div>
              </Card>
            ) : (
              <Card>
                <p className="section-label text-azure">Current objective</p>
                <p className="mt-2 text-[13px] text-snow">No objective set.</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                  A plan, a kit list and a readiness read are all built from a mountain and a date.
                </p>
                <Link
                  to="/goals"
                  className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-azure"
                >
                  Set an objective <ChevronRight size={14} strokeWidth={1.8} />
                </Link>
              </Card>
            )}
          </div>
        </Rise>
      </Stagger>

      <Stagger className="px-5">
        {/* ---- Activity in progress ----------------------------------------
            Below the objective card rather than above the hero: the top bar now
            sits on the photograph, and nothing may be inserted between them. */}
        {active && activeType && ActiveIcon && (
          <Rise className="pt-3">
            <Link to={`/activity/live/${active.activityTypeId}`} className="block">
              <div className="flex items-center gap-3 rounded-card border border-azure/40 bg-azure/[0.06] p-4">
                <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-azure/40 text-azure">
                  <ActiveIcon size={18} strokeWidth={1.5} />
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-azure ring-2 ring-obsidian" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="section-label text-azure/85">Activity in progress</p>
                  <p className="tnum mt-1 truncate text-[13px] text-snow">
                    {activeType.label} · {fmtDistance(active.distanceM)}
                    {active.elevationGainM > 0 && ` · ${fmtElevation(active.elevationGainM)} ↑`}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-0.5 text-[13px] text-azure">
                  Resume
                  <ChevronRight size={15} strokeWidth={1.8} />
                </span>
              </div>
            </Link>
          </Rise>
        )}

        {/* ---- Today's plan ------------------------------------------------ */}
        <Rise className="pt-8">
          <SectionLabel
            action={
              <Link
                to="/coach"
                className="section-label flex items-center gap-1 text-mist transition-colors hover:text-azure"
              >
                View coach
                <ChevronRight size={11} strokeWidth={2.4} />
              </Link>
            }
          >
            Today's plan
          </SectionLabel>
          <Card className="mt-3">
            {today ? (
              /* The tick is a control, not a status dot, so it cannot live
                 inside the link to the session — an anchor may not contain a
                 button. Two siblings, one row. */
              <div className="flex items-center gap-4">
                <Link to="/coach/training" className="min-w-0 flex-1">
                  <p className="section-label text-azure">{FOCUS_LABELS[today.focus]}</p>
                  <h3 className="mt-2 truncate text-[19px] font-light text-snow">{today.title}</h3>
                  <div className="tnum mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-mist">
                    {/* Difficulty, not a heart-rate zone: ICEFALL has never
                        measured a threshold, so it prints none. */}
                    <Meta icon={Flame} text={`Difficulty ${today.difficulty}/5`} />
                    {today.distanceKm ? (
                      <Meta icon={Route} text={`${fmtDistance(today.distanceKm)} km`} />
                    ) : null}
                    {today.elevationM ? (
                      <Meta icon={TrendingUp} text={`${fmtElevation(today.elevationM)} m`} />
                    ) : null}
                  </div>
                </Link>
                <button
                  type="button"
                  disabled={!todayWeek}
                  aria-pressed={doneToday}
                  aria-label={
                    doneToday ? "Mark today's session not done" : "Mark today's session done"
                  }
                  onClick={() => {
                    if (!todayWeek) return;
                    // The fallback must match the value `useTraining` derived,
                    // or the first tap toggles away from the wrong baseline and
                    // appears to do nothing.
                    toggleSession(
                      todayWeek.index,
                      today.date,
                      satisfiedByActivity.has(today.date) || today.completed,
                    );
                  }}
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-colors",
                    doneToday
                      ? "border-summit/55 bg-summit/15 text-summit"
                      : "border-azure/45 text-azure hover:bg-azure/10",
                    !todayWeek && "opacity-40",
                  )}
                >
                  <Check size={18} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <p className="text-[13px] text-mist">
                No session scheduled today. Recovery is training.
              </p>
            )}
          </Card>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <TileLink
              to="/coach/nutrition"
              img="/img/onboarding-plan.jpg"
              label="Nutrition"
              title="Fuelling"
              detail={intel.briefing.nutrition}
            />
            <TileLink
              to="/coach/check-in"
              img="/img/onboarding-train.jpg"
              label="Recovery"
              title="Daily check-in"
              detail="Sleep, soreness and stress — what recovery is read from."
            />
          </div>
        </Rise>

        {/* ---- This week ---------------------------------------------------- */}
        <Rise className="pt-7">
          <SectionLabel
            action={
              <Link to="/activity" className="section-label transition-colors hover:text-azure">
                See all
              </Link>
            }
          >
            This week
          </SectionLabel>
          <Card className="mt-3">
            <div className="grid grid-cols-4 gap-2">
              <Figure icon={ActivityIcon} value={String(weekly.activities)} label="Activities" />
              <Figure icon={Clock} value={fmtHours(weekly.timeHours)} label="Duration" />
              <Figure icon={TrendingUp} value={fmtElevation(weekly.elevationM)} label="Elevation" />
              <Figure icon={Route} value={fmtDistance(weekly.distanceKm)} label="Distance" />
            </div>
            <MiniBars data={weekly.daily} activeIndex={todayIndex} className="mt-5" />
          </Card>
        </Rise>

        {/* ---- Conditions at your destination ------------------------------- */}
        {goal && elevationM !== null && lat !== undefined && lon !== undefined && (
          <Rise className="pt-7">
            <ConditionsPanel
              name={goal.name}
              elevationM={elevationM}
              lat={lat}
              lon={lon}
              goalId={goal.id}
            />
          </Rise>
        )}

        {/* ---- Recent activity ---------------------------------------------- */}
        <Rise className="pt-7">
          <SectionLabel
            action={
              <Link to="/activity" className="section-label transition-colors hover:text-azure">
                See all
              </Link>
            }
          >
            Recent activity
          </SectionLabel>
          {recent.length > 0 ? (
            <div className="mt-3 space-y-2.5">
              {recent.map((a) => (
                <ActivityCard key={a.id} activity={a} />
              ))}
            </div>
          ) : (
            <Card className="mt-3">
              <p className="text-[13px] text-mist">Nothing recorded yet.</p>
              <Link
                to="/activity/select"
                className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] text-azure"
              >
                Record your first activity <ChevronRight size={14} strokeWidth={1.8} />
              </Link>
            </Card>
          )}
        </Rise>

        {/* ---- Expedition checklist ----------------------------------------- */}
        {goal && (
          <Rise className="pt-7">
            <SectionLabel>Expedition checklist</SectionLabel>
            <Card className="mt-3">
              {checklist && checklist.result.applicable > 0 ? (
                <Link to={`/mountain/${goal.id}/checklist`} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="tnum text-[26px] font-light leading-none text-snow">
                        {checklist.result.resolved}
                        <span className="text-[15px] text-mist">
                          {" / "}
                          {checklist.result.applicable}
                        </span>
                      </p>
                      {/* "Items", not "tasks" — these are equipment and
                          documents derived from the peak. */}
                      <p className="section-label mt-1.5">Items accounted for</p>
                    </div>
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-tile border border-hairline bg-elevated/50 text-mist">
                      <Backpack size={24} strokeWidth={1.1} />
                    </span>
                  </div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                    <div
                      className="h-full rounded-full bg-azure"
                      style={{ width: `${checklist.result.overall}%` }}
                    />
                  </div>
                  {checklist.next ? (
                    <div className="mt-3.5 flex items-center gap-3 border-t border-hairline pt-3">
                      <span className="h-4 w-4 shrink-0 rounded-[5px] border border-hairline-strong" />
                      <div className="min-w-0 flex-1">
                        <p className="section-label">Next</p>
                        <p className="mt-0.5 truncate text-[13px] text-snow">
                          {checklist.next.label}
                        </p>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-mist-dim" />
                    </div>
                  ) : (
                    <p className="mt-3.5 border-t border-hairline pt-3 text-[12px] leading-relaxed text-mist">
                      All {checklist.result.applicable} applicable items are accounted for — held,
                      borrowed or hired.
                    </p>
                  )}
                </Link>
              ) : (
                <p className="text-[12.5px] leading-relaxed text-mist">
                  A kit list is derived from the mountain's altitude and terrain. This objective has
                  no elevation held, so ICEFALL will not guess at one.
                </p>
              )}
            </Card>
          </Rise>
        )}

        {/* ---- Training readiness ------------------------------------------- */}
        <Rise className="pt-7">
          <SectionLabel
            action={
              <Link
                to="/coach/readiness"
                className="section-label transition-colors hover:text-azure"
              >
                View analysis
              </Link>
            }
          >
            Training readiness
          </SectionLabel>
          <Card className="mt-3">
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                {/* The readiness engine writes this. No verdict copy is
                    invented here — "you're on track" is a judgement it is
                    explicitly forbidden to make. */}
                <p className="text-[12.5px] leading-relaxed text-mist">
                  {firstSentence(intel.readiness.explanation)}
                </p>
                <Link
                  to="/coach/readiness"
                  className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-azure"
                >
                  View analysis <ChevronRight size={14} strokeWidth={1.8} />
                </Link>
              </div>
              <ScoreRing score={intel.readiness.score} size={78} className="shrink-0" />
            </div>
          </Card>
        </Rise>

        {/* ---- Upcoming — only sessions the athlete actually planned -------- */}
        <Rise className="pt-7">
          <SectionLabel
            action={
              <Link to="/explore/groups" className="section-label transition-colors hover:text-azure">
                Groups
              </Link>
            }
          >
            Upcoming
          </SectionLabel>
          <UpcomingList sessions={groupSessions} />
        </Rise>

        {/* ---- People nearby — gated, and honestly empty -------------------- */}
        <Rise className="pt-7">
          <SectionLabel
            action={
              <Link to="/explore/people" className="section-label transition-colors hover:text-azure">
                Network
              </Link>
            }
          >
            People nearby
          </SectionLabel>
          {/* No avatars, and no placeholder faces: the athlete directory is
              deliberately empty until there is a backend, and an invented
              climbing partner is a hazard rather than a placeholder. A slim
              row, so an honest absence does not sit in a big empty box. */}
          <Link
            to="/explore/people"
            className="mt-3 flex items-center gap-3.5 border-y border-hairline py-3.5"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dashed border-hairline-strong text-mist-dim">
              <Users size={17} strokeWidth={1.5} />
            </span>
            <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-mist">
              {!networkOptIn || !locationOptIn
                ? "The Expedition Network and area sharing are both off. Nothing about you is shared, and nobody is listed."
                : NETWORK_NOT_CONNECTED_NOTICE}
            </p>
            <ChevronRight size={16} className="shrink-0 text-mist-dim" />
          </Link>
        </Rise>

        {/* ---- Gear for the objective --------------------------------------- */}
        {goal?.mountainId && sync.systemForMountain(goal.mountainId) && (
          <Rise className="pt-7">
            <Link to="/gear" className="block">
              <div className="relative overflow-hidden rounded-card border border-hairline">
                <img
                  src={`/img/${goal.mountainId}.jpg`}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full object-cover opacity-30"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-graphite via-graphite/85 to-transparent" />
                <div className="relative p-5">
                  <h3 className="text-[16px] text-snow">Gear up for {goal.name}</h3>
                  <p className="mt-1.5 max-w-[30ch] text-[11.5px] leading-relaxed text-mist">
                    The system this class of objective demands, including the technical items
                    ICEFALL does not make.
                  </p>
                  <span className="mt-3.5 inline-flex items-center gap-1.5 rounded-tile border border-azure/45 px-3.5 py-2 text-[12.5px] text-azure">
                    View gear guide
                  </span>
                </div>
              </div>
            </Link>
          </Rise>
        )}

        {/* ---- Mountain intelligence — the real screens, not articles ------- */}
        {goal && (
          <Rise className="pt-7">
            <SectionLabel>Mountain intelligence</SectionLabel>
            <p className="mt-2 text-[11.5px] leading-relaxed text-mist-dim">
              Derived for {goal.name} from its altitude, latitude and a live forecast — not
              editorial.
            </p>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              <IntelRow
                to={`/mountain/${goal.id}`}
                img="/img/expedition-hero.jpg"
                title="Command centre"
                detail={`Everything ICEFALL holds on ${goal.name}`}
              />
              <IntelRow
                to={`/mountain/${goal.id}/conditions`}
                img="/img/mont-blanc-3.jpg"
                title="Conditions by elevation"
                detail="Seven days, band by band, and your window"
              />
              <IntelRow
                to={`/mountain/${goal.id}/checklist`}
                img="/img/onboarding-plan.jpg"
                title="Kit & documents"
                detail="What this class of peak actually demands"
              />
              <IntelRow
                to={`/mountain/${goal.id}/benchmark`}
                img="/img/gran-paradiso.jpg"
                title="Benchmark"
                detail="Your recorded record against the objective"
              />
            </div>
          </Rise>
        )}

        {/* ---- Start -------------------------------------------------------- */}
        <Rise className="pt-7">
          <Link
            to="/activity/select"
            className="flex items-center justify-between rounded-card border border-azure/30 bg-azure/[0.06] px-5 py-4 transition-colors hover:bg-azure/[0.1]"
          >
            <div>
              <p className="section-label text-azure/80">Ready</p>
              <p className="mt-1.5 text-[15px] text-snow">Start an activity</p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-azure text-obsidian">
              <Plus size={18} strokeWidth={2} />
            </span>
          </Link>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `fmtCountdown` returns one string ("73 days to go"); the card wants the
 * figure and its unit on separate lines. Split rather than reformat, so both
 * come from the one function that already handles the timezone edge cases.
 */
function countdownValue(iso: string): string {
  const s = fmtCountdown(iso);
  const m = /^(\d[\d,]*)\s+(.*?)\s+to go$/.exec(s);
  return m ? m[1] : s;
}
function countdownLabel(iso: string): string {
  const s = fmtCountdown(iso);
  const m = /^(\d[\d,]*)\s+(.*?)\s+to go$/.exec(s);
  // Just the unit — "months to go" does not fit a quarter-width cell, and a
  // truncated "months to …" is worse than the word alone under the figure.
  return m ? m[2] : "";
}

/**
 * The hero's readiness dial — a segmented ring, drawn as ticks.
 *
 * The ring is not a stroked arc but 48 discrete marks around the circumference;
 * the lit ones carry the score and the rest stay on the hairline. Ticks, rather
 * than a dashed stroke, because the dash pattern of a stroked circle drifts as
 * the arc is cut and the last segment lands half-drawn.
 *
 * It keeps the important half of `ScoreRing`'s contract: an unknown score is an
 * em dash over a visibly INCOMPLETE ring — here every other tick is dropped, so
 * the ring is broken as well as unlit and cannot read as a measured zero. The
 * reason why is one tap away in the readiness card below, which renders the
 * full `ScoreRing` with its explanation.
 */
function ReadinessDial({ score }: { score: Score }) {
  const size = 92;
  const known = typeof score.value === "number" && Number.isFinite(score.value);
  const pct = known ? Math.max(0, Math.min(100, score.value as number)) : 0;

  const TICKS = 48;
  const lit = known ? Math.round((pct / 100) * TICKS) : 0;
  const c = size / 2;
  const outer = c - 1.5;
  const inner = outer - 7;

  const tick = (i: number) => {
    const a = (i / TICKS) * 2 * Math.PI;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return { x1: c + inner * cos, y1: c + inner * sin, x2: c + outer * cos, y2: c + outer * sin };
  };
  const indices = Array.from({ length: TICKS }, (_, i) => i);

  return (
    <div className="flex flex-col items-center">
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/*
            The track. Unlit, and half-density when there is nothing to read.
            `mist-dim` rather than the hairline token: this ring sits on a
            photograph, and 12% white vanishes over cloud.
          */}
          <g stroke="var(--ice-mist-dim)" strokeWidth={2} strokeLinecap="round">
            {indices
              .filter((i) => (known ? i >= lit : i % 2 === 0))
              .map((i) => (
                <line key={i} {...tick(i)} />
              ))}
          </g>
          {known && (
            <g
              stroke="var(--ice-azure)"
              strokeWidth={2}
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 3px var(--ice-azure-glow))" }}
            >
              {indices
                .filter((i) => i < lit)
                .map((i) => (
                  <line key={i} {...tick(i)} />
                ))}
            </g>
          )}
        </svg>
        <div className="absolute flex items-baseline">
          {known ? (
            <>
              <span className="tnum text-[27px] font-extralight leading-none text-snow">
                {Math.round(pct)}
              </span>
              <span className="text-[12px] font-light text-mist">%</span>
            </>
          ) : (
            <span className="text-[22px] font-extralight leading-none text-mist-dim">—</span>
          )}
        </div>
      </div>
      {/* The em dash in the ring already says the score is unknown; the label
          stays one short word so it cannot wrap under the dial. */}
      <p className="section-label mt-2 flex items-center gap-0.5 text-[8.5px] text-mist">
        Readiness
        <ChevronRight size={10} strokeWidth={2.4} />
      </p>
    </div>
  );
}

/** The coach's own prose, trimmed to its first sentence for a summary card. */
function firstSentence(text: string): string {
  const cut = text.indexOf(". ");
  return cut === -1 ? text : text.slice(0, cut + 1);
}

function Meta({ icon: Icon, text }: { icon: typeof Route; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon size={12} strokeWidth={1.6} className="text-mist-dim" />
      {text}
    </span>
  );
}

function Figure({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Route;
  value: string;
  label: string;
}) {
  return (
    <div className="min-w-0">
      <Icon size={13} strokeWidth={1.6} className="text-azure/70" />
      <p className="tnum mt-2 truncate text-[16px] font-light leading-none text-snow">{value}</p>
      <p className="section-label mt-1.5 truncate text-[8px]">{label}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="tnum truncate text-[20px] font-light leading-none text-snow">{value}</p>
      <p className="section-label mt-2 truncate text-[9px] leading-tight">{label}</p>
    </div>
  );
}

function TileLink({
  to,
  img,
  label,
  title,
  detail,
}: {
  to: string;
  img: string;
  label: string;
  title: string;
  detail: string;
}) {
  return (
    <Link to={to} className="block">
      <div className="relative h-[184px] overflow-hidden rounded-card border border-hairline">
        <img
          src={img}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/85 to-obsidian/45" />
        <div className="relative flex h-full flex-col p-3.5">
          <p className="section-label text-[9px] text-azure">{label}</p>
          <p className="mt-2 text-[17px] font-light leading-tight text-snow">{title}</p>
          <p className="mt-1.5 line-clamp-3 text-[12px] leading-[1.45] text-mist">{detail}</p>
          <span className="mt-auto grid h-8 w-8 place-items-center rounded-full border border-hairline-strong text-snow/85">
            <ArrowUpRight size={15} strokeWidth={1.7} />
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * A full-width row with a photograph — the design's list treatment, not a tile.
 * Squares in a grid read as app-launcher chrome; these read as a magazine
 * contents page, which is what the section is.
 */
function IntelRow({
  to,
  img,
  title,
  detail,
}: {
  to: string;
  img: string;
  title: string;
  detail: string;
}) {
  return (
    <Link to={to} className="flex items-center gap-3.5 py-3">
      <span className="h-[52px] w-[66px] shrink-0 overflow-hidden rounded-tile border border-hairline">
        <img src={img} alt="" aria-hidden className="h-full w-full object-cover" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-snow">{title}</span>
        <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">{detail}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-mist-dim" />
    </Link>
  );
}

/**
 * Sessions the athlete has actually planned with a group.
 *
 * The ICEFALL events fixture is deliberately not used here: it is invented, and
 * it ships without the disclaimer that travels with it on its own screen.
 */
function UpcomingList({
  sessions,
}: {
  sessions: {
    id: string;
    groupId: string;
    title: string;
    dayKey: string;
    time?: string;
    place?: string;
  }[];
}) {
  const upcoming = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return sessions
      .map((s) => ({ s, date: parseDay(s.dayKey) }))
      .filter((x): x is { s: (typeof sessions)[number]; date: Date } => x.date !== null)
      .filter((x) => x.date.getTime() >= start.getTime())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 3);
  }, [sessions]);

  if (upcoming.length === 0) {
    return (
      <Card className="mt-3">
        <p className="text-[13px] text-mist">Nothing planned.</p>
        <Link
          to="/explore/groups"
          className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] text-azure"
        >
          Plan a session with a group <ChevronRight size={14} strokeWidth={1.8} />
        </Link>
      </Card>
    );
  }

  return (
    <div className="mt-3 space-y-2.5">
      {upcoming.map(({ s, date }) => (
        <Link key={s.id} to={`/explore/groups/${s.groupId}`} className="block">
          <Card className="flex items-center gap-3.5">
            <div className="w-9 shrink-0 text-center">
              <p className="section-label text-[8px] text-azure/85">
                {date.toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}
              </p>
              <p className="tnum mt-0.5 text-[18px] font-light leading-none text-snow">
                {date.getDate()}
              </p>
            </div>
            <div className="min-w-0 flex-1 border-l border-hairline pl-3.5">
              <p className="truncate text-[13.5px] text-snow">{s.title}</p>
              <p className="mt-0.5 truncate text-[11.5px] text-mist-dim">
                {[s.place, s.time].filter(Boolean).join(" · ") || "Time not set"}
              </p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-mist-dim" />
          </Card>
        </Link>
      ))}
    </div>
  );
}

/**
 * Live conditions for the objective.
 *
 * `getMountainConditions` never throws and never invents a reading: a failed
 * request comes back with every value absent, which renders as an explicit
 * "unavailable" rather than as calm weather.
 */
function ConditionsPanel({
  name,
  elevationM,
  lat,
  lon,
  goalId,
}: {
  name: string;
  elevationM: number;
  lat: number;
  lon: number;
  goalId: string;
}) {
  const [data, setData] = useState<MountainConditions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void getMountainConditions({
      peakName: name,
      elevationM,
      lat,
      lon,
      signal: controller.signal,
    }).then((d) => {
      if (!controller.signal.aborted) {
        setData(d);
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [name, elevationM, lat, lon]);

  const c = data?.current;
  const temp = c?.temperatureC.value;
  const wind = c?.windKph.value;
  const precip = c?.precipitationMm.value;
  const vis = c?.visibilityM.value;
  const failed = Boolean(data?.error) || temp === null || temp === undefined;

  return (
    <>
      <SectionLabel>Conditions at your destination</SectionLabel>
      <Link to={`/mountain/${goalId}/conditions`} className="mt-3 block">
        <div className="relative overflow-hidden rounded-card border border-hairline">
          <img
            src="/img/mont-blanc-2.jpg"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-graphite via-graphite/90 to-graphite/70" />
          <div className="relative p-4">
            <p className="text-[12px] text-mist">{name}</p>

            {loading ? (
              <p className="mt-3 text-[12.5px] text-mist">Requesting the forecast…</p>
            ) : failed ? (
              <p className="mt-3 text-[12.5px] leading-relaxed text-mist">
                The forecast could not be loaded. ICEFALL will not show conditions it has not read —
                nothing here is a guess.
              </p>
            ) : (
              <div className="mt-3 flex items-center gap-4">
                <div className="flex shrink-0 items-center gap-2.5">
                  <CloudSun size={30} strokeWidth={1.2} className="text-azure/85" />
                  <div>
                    <p className="tnum text-[28px] font-light leading-none text-snow">
                      {Math.round(temp as number)}
                      <span className="text-[13px] text-mist">°C</span>
                    </p>
                    <p className="tnum mt-1 text-[10px] text-mist-dim">
                      at {fmtElevation(elevationM)} m
                    </p>
                  </div>
                </div>
                <div className="grid flex-1 grid-cols-3 gap-2 border-l border-hairline pl-4">
                  <Micro
                    icon={Wind}
                    label="Wind"
                    value={wind !== null && wind !== undefined ? `${Math.round(wind)} km/h` : "—"}
                  />
                  <Micro
                    icon={Droplets}
                    label="Precip"
                    value={
                      precip !== null && precip !== undefined ? `${precip.toFixed(1)} mm` : "—"
                    }
                  />
                  <Micro
                    icon={Eye}
                    label="Visibility"
                    value={
                      vis !== null && vis !== undefined
                        ? vis >= 1000
                          ? `${Math.round(vis / 1000)} km`
                          : `${Math.round(vis)} m`
                        : "—"
                    }
                  />
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
              <span className="text-[12.5px] text-azure">Full forecast</span>
              <ChevronRight size={15} strokeWidth={1.8} className="text-azure" />
            </div>
          </div>
        </div>
      </Link>
    </>
  );
}

function Micro({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wind;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <Icon size={13} strokeWidth={1.6} className="text-mist-dim" />
      <p className="tnum mt-1.5 truncate text-[11.5px] text-snow">{value}</p>
      <p className="section-label mt-0.5 truncate text-[8px]">{label}</p>
    </div>
  );
}
