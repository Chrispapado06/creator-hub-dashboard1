import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity as ActivityIcon, ArrowUpRight, Backpack, Bell, Check, ChevronRight, Clock, CloudSun,
  Droplets, Eye, Flame, MessageCircle, Play, Route, Search, TrendingUp, Wind,
} from "lucide-react";
import { Button, Card, SectionLabel } from "@/components/ui/primitives";
import { MiniBars } from "@/components/ui/charts";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
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
import { getMountainConditions, type MountainConditions } from "@/services/conditions";
import { parseDay } from "@/network/groups";
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
/* -------------------------------------------------------------------------- */
/* The hero photograph, rotated daily                                         */
/* -------------------------------------------------------------------------- */

/**
 * Five mountain photographs, one per day.
 *
 * EVERY ONE IS CC0 OR PUBLIC DOMAIN, and that is a constraint rather than a
 * coincidence. `public/img/CREDITS.md` is explicit: CC BY and CC BY-SA files
 * "require the credit shown wherever the image is displayed publicly". A
 * full-bleed hero has nowhere to carry a photographer credit without becoming
 * clutter, so only attribution-free images may sit here.
 *
 * The image this replaces — `home-hero.jpg` — is CC BY-SA 4.0 by Maksym
 * Karmazin and was being shown with no credit anywhere. It is left OUT rather
 * than quietly kept. See the note filed against this change.
 *
 * `flip` is per-image because mirroring is a composition decision, not a
 * global one: the old hero was flipped because its peak sat on the left, under
 * the greeting. None of these five need it — their weight already falls right
 * or spreads evenly — but the flag stays so the next photograph can say so for
 * itself instead of inheriting someone else's answer.
 *
 * All five already ship in `public/img`, so the rotation adds no download and
 * nothing new for the service worker to precache.
 */
const HERO_IMAGES: readonly { src: string; flip: boolean }[] = [
  // 4 — Mount Rainier over meadow, Wonderland Trail. Public domain.
  { src: "/img/treks/wonderland-trail.jpg", flip: false },
  /*
   * 5 — the Tetons across a lake. Free use, no credit required.
   *
   * 750x540, the smallest of the six: it is a trek card's photograph, sized
   * for a card. At 2x it is about 1:1 in this slot and looks right; on a 3x
   * phone it is upscaled ~1.5x and will be softer than its neighbours. Kept
   * because it was chosen, and flagged rather than silently swapped.
   */
  { src: "/img/treks/teton-crest-trail.jpg", flip: false },
  // 8 — Denali at alpenglow, peak right. Public domain.
  { src: "/img/denali.jpg", flip: false },
  // 9 — Eiger north face at blue hour, peak right. CC0.
  { src: "/img/eiger.jpg", flip: false },
  // 10 — the Andes from above. CC0.
  { src: "/img/aconcagua.jpg", flip: false },
  // 19 — Hehuanshan under stars, Taiwan. CC0.
  { src: "/img/private-hero.jpg", flip: false },
];

/**
 * Today's photograph, by the LOCAL calendar day.
 *
 * `Date.UTC` applied to the local year/month/date turns the day the athlete is
 * actually living in into a stable ordinal. Using the raw timestamp instead
 * would roll the picture over at UTC midnight — the middle of the evening in
 * the Americas — which is the same class of bug as `f2cb54c`, and going through
 * UTC deliberately here is what avoids it rather than causes it: no local
 * midnight is skipped or repeated when the clocks change, because the ordinal
 * is built from calendar fields, not from elapsed time.
 */
function heroForToday(now: Date = new Date()): { src: string; flip: boolean } {
  const ordinal = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
  const n = HERO_IMAGES.length;
  return HERO_IMAGES[((ordinal % n) + n) % n]!;
}

export default function Home() {
  const { user, toggleSession } =
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

  /*
   * The seven circles under "This week".
   *
   * Built from `todayWeek` — the week that actually contains today — and read
   * through the same `completedByDate` / `satisfiedByActivity` pair the tick on
   * the session card writes. Deriving it any other way is how a strip starts
   * disagreeing with the control directly above it.
   *
   * Rest days count as neither done nor outstanding: the denominator is
   * PRESCRIBED sessions, so an athlete who rests when told to is not marked
   * down for it.
   */
  const weekDays = useMemo(() => {
    if (!todayWeek) return [];
    const todayKey = today?.date ?? null;
    return todayWeek.days.map((d, i) => {
      // `parseDay` is the strict parser and returns null on anything it cannot
      // read as a real calendar date. The array position is the honest
      // fallback: a week is seven days from its start, so index IS the weekday
      // when the string is unreadable. Never `new Date(iso)` here — that is UTC
      // midnight, which is the previous day west of Greenwich.
      const parsed = parseDay(d.date);
      return {
      date: d.date,
      label: DAY_INITIALS[parsed ? (parsed.getDay() + 6) % 7 : i % 7],
      rest: d.focus === "rest",
      done: completedByDate.get(d.date) === true || satisfiedByActivity.has(d.date) || d.completed,
      isToday: d.date === todayKey,
      };
    });
  }, [todayWeek, today, completedByDate, satisfiedByActivity]);

  const weekPrescribed = weekDays.filter((d) => !d.rest).length;
  const weekDone = weekDays.filter((d) => !d.rest && d.done).length;

  const goalMountain = goal?.mountainId ? sync.mountainById(goal.mountainId) : undefined;
  const elevationM = goal?.elevationM ?? goalMountain?.elevationM ?? null;
  const lat = goal?.lat ?? goalMountain?.coords.lat;
  const lon = goal?.lon ?? goalMountain?.coords.lon;

  const active = activeSessionSummary();
  const activeType = active ? activityById(active.activityTypeId) : null;
  const ActiveIcon = active ? ACTIVITY_ICON[active.activityTypeId] : null;

  /* PH-06 — the equipment checklist memo went with the checklist block.
     The list itself lives on `/mountain/:id/checklist`, which Home still links
     to from Mountain intelligence. */

  // Recomputed each render rather than memoised: it is two arithmetic
  // operations, and a value cached for the session would hold yesterday's
  // picture for anyone who leaves the app open across midnight.
  const hero = heroForToday();

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
              One of five, chosen by the calendar day — see `HERO_IMAGES`.

              Mirroring is per-photograph. It costs nothing to flip one: this is
              scenery, not a map, so left-right carries no meaning to mislead —
              but it is only worth doing when a peak would otherwise sit under
              the greeting, which is why the flag lives on the image.
            */}
            <img
              src={hero.src}
              alt=""
              className={cn("h-full w-full object-cover", hero.flip && "scale-x-[-1]")}
            />
            {/* Two scrims. The vertical one dissolves the picture into the
                canvas rather than ending it on a hard edge; the horizontal one
                holds the left third dark enough for the greeting to read over
                cloud, which is the brightest thing these photographs do.

                LIGHTENED at the owner's request — "why are the pictures soo
                dark". They were 80% and 70% at their strongest, and because the
                two multiply, the top-left corner was landing at about 94%
                black: the photograph was almost entirely scrim there. Now 55%
                and 55%, which multiplies to roughly 80% in that corner and
                drops the middle of the picture from ~59% to ~40%.

                They cannot go to nothing. The greeting is white type sitting
                directly on the photograph, and these six include an aerial of
                bright cloud — the scrim is what keeps a name readable over it.
                The bottom stop stays fully opaque so the picture still
                dissolves into the canvas behind the objective card. */}
            <div className="absolute inset-0 bg-gradient-to-b from-obsidian/55 via-obsidian/20 to-obsidian" />
            <div className="absolute inset-0 bg-gradient-to-r from-obsidian/55 via-obsidian/15 to-transparent" />
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
              <Link
                to="/notifications"
                aria-label="Notifications"
                className="relative grid h-9 w-9 place-items-center rounded-full text-snow/90 transition-colors hover:bg-white/[0.07] hover:text-snow"
              >
                <Bell size={18} strokeWidth={1.5} />
              </Link>
            </div>
          </header>

          {/* ---- Greeting and today's readiness ---------------------------- */}
          {/*
            A soft shadow on the type instead of a heavier scrim on the picture.

            Lightening the gradients let the photographs through, and the cost
            landed on the dimmest line — the italic quote, which sits over the
            brightest part of an aerial. Darkening the scrim again would have
            undone the thing that was asked for. Shadowing only the text keeps
            the mountain bright AND the words readable, and it costs nothing on
            the dark photographs where it is invisible.
          */}
          <div
            className="relative flex items-start justify-between gap-4 px-5 pb-1 pt-6"
            style={{ textShadow: "0 1px 12px rgba(5,7,11,0.85), 0 1px 3px rgba(5,7,11,0.7)" }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-mist">{greeting()},</p>
              <h1 className="mt-1 truncate text-[38px] font-light leading-[1.05] tracking-[-0.03em] text-snow">
                {firstName}
              </h1>
              <p className="mt-3 max-w-[22ch] text-[13px] italic leading-[1.5] text-mist">
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

                {/* PH-06 — TWO figures, and the countdown is in DAYS.
                    Kit items and Training came out at the owner's request. The
                    countdown was "8 months", which is the shape of a number you
                    plan around rather than train against; days is the unit that
                    changes every morning. Both remaining figures are still
                    derivable, and readiness still renders an em dash rather
                    than a zero when it cannot be computed. */}
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-hairline pt-4">
                  <Stat value={daysToGoValue(goal.targetDate)} label={daysToGoLabel(goal.targetDate)} />
                  <Stat
                    value={
                      readinessKnown
                        ? `${Math.round(intel.readiness.score.value as number)}%`
                        : "—"
                    }
                    label="Readiness"
                  />
                </div>

                {/* The objective's weather, inside the objective's card. Needs a
                    position to ask about, so it appears only when the mountain
                    has coordinates and an elevation — never as an empty slot. */}
                {elevationM !== null && lat !== undefined && lon !== undefined && (
                  <ConditionsPanel
                    name={goal.name}
                    elevationM={elevationM}
                    lat={lat}
                    lon={lon}
                    goalId={goal.id}
                  />
                )}
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

        {/* PH-06 moved the forecast to sit under the objective; it is now INSIDE
            the objective's card, so there is no separate section here. The
            mountain and its weather are one thing to read, not two. */}

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
              <div>
                <Link to="/coach/training" className="min-w-0 flex-1">
                  <p className="section-label text-azure">{FOCUS_LABELS[today.focus]}</p>
                  <h3 className="mt-2 truncate text-[19px] font-light text-snow">{today.title}</h3>
                  {/* `phone-5.png` leads with the duration in azure beside a
                      clock, at the size of a headline figure. It is the number
                      an athlete plans their evening around. */}
                  <div className="tnum mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-mist">
                    {today.durationMin ? (
                      <span className="flex items-center gap-1.5 text-[14px] text-azure">
                        <Clock size={14} strokeWidth={1.8} aria-hidden="true" />
                        {today.durationMin} min
                      </span>
                    ) : null}
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

                  {/* The sentence under the rule in the drawing. */}
                  {today.detail ? (
                    <p className="mt-3 border-t border-hairline pt-3 text-[13px] leading-relaxed text-mist">
                      {today.detail}
                    </p>
                  ) : null}
                </Link>
                {/* The drawing's two controls, side by side under the rule:
                    a filled Start Session and an outlined Mark as Done. They
                    replace a single round tick sitting to the right of the
                    title — which said nothing about what it did, and offered no
                    way to begin the session it described. */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Button asChild size="lg">
                    <Link to="/activity/select">
                      <Play size={15} strokeWidth={2} />
                      Start session
                    </Link>
                  </Button>

                  <Button
                    variant="secondary"
                    size="lg"
                    disabled={!todayWeek}
                    aria-pressed={doneToday}
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
                    className={cn(doneToday && "border-summit/55 text-summit")}
                  >
                    <Check size={15} strokeWidth={2} />
                    {doneToday ? "Done" : "Mark as done"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-mist">
                No session scheduled today. Recovery is training.
              </p>
            )}

          {/* ---- Session plan ---------------------------------------------
              The vertical timeline `phone-5.png` draws. It renders on every
              build, not behind a flag — the layout is the production design.

              What ICEFALL actually prescribes is a session and a LENGTH. It
              does not hold a per-athlete segment breakdown, so the minutes on
              each row are that length divided by a standard structure, and the
              card says so in one line rather than presenting the split as a
              coached prescription.

              The drawing's own text reads "Steady pace in Zone 2" and "Bring
              HR down gradually". Neither ships. ICEFALL has measured nobody's
              heart and holds no threshold to divide one against, so there is no
              zone to name — effort stays in words until a device pairs. -- */}
          {today && today.durationMin ? (
            /* A SECTION of the session's card, not a card beside it. Owner:
               "session plan should also be connected to the endurance box."
               It is the same session broken down — it was never separate
               information, only a separate border. */
            <div className="mt-5 border-t border-hairline pt-4">
              <>
                <SectionLabel>Session plan</SectionLabel>
                <ol className="mt-3.5">
                  {sessionSegments(today.durationMin, today.detail).map((seg, i, all) => (
                    <li key={seg.name} className="flex gap-3.5">
                      {/* The rail: a dot per row, joined by a line that stops
                          at the last one rather than trailing into nothing. */}
                      <div className="flex w-3 shrink-0 flex-col items-center">
                        <span
                          className={cn(
                            "mt-1.5 h-3 w-3 shrink-0 rounded-full border",
                            i === 0 ? "border-azure bg-azure" : "border-mist-dim",
                          )}
                        />
                        {i < all.length - 1 && <span className="w-px flex-1 bg-hairline" />}
                      </div>

                      <div
                        className={cn(
                          "flex min-w-0 flex-1 gap-4 pb-4",
                          i < all.length - 1 && "border-b border-hairline",
                          i > 0 && "pt-0.5",
                        )}
                      >
                        <div className="w-[88px] shrink-0">
                          <p className="text-[14.5px] text-snow">{seg.name}</p>
                          {/* An em dash where there are no minutes, as the
                              drawing does on its own last row — never a zero. */}
                          <p className="tnum mt-0.5 text-[12.5px] text-mist">
                            {seg.minutes === null ? "—" : `${seg.minutes} min`}
                          </p>
                        </div>
                        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-mist">
                          {seg.note}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>

                <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">
                  {SEGMENTS_ARE_A_STANDARD_SHAPE}
                </p>
              </>
            </div>
          ) : null}
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
            {/* ---- The day strip `phone-5.png` draws --------------------------
                Seven circles Mon–Sun: a tick where the session is done, a ring
                on today, an empty circle ahead. Real data throughout —
                `completedByDate` is the same map the tick on the session card
                writes to, so the strip cannot disagree with it.

                The count reads "3 of 7 completed" in the drawing. It counts
                PRESCRIBED sessions, not days: a week with two rest days has
                five, and calling it "of 7" would mark an athlete down for
                resting when they were told to. ------------------------------ */}
            {weekDays.length > 0 && (
              <div className="mb-5">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <p className="section-label">Sessions</p>
                  <p className="tnum text-[12px] text-mist">
                    {weekDone} of {weekPrescribed} completed
                  </p>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map((d) => (
                    <div key={d.date} className="flex flex-col items-center gap-2">
                      <span
                        className={cn(
                          "text-[11px]",
                          d.isToday ? "text-snow" : "text-mist-dim",
                        )}
                      >
                        {d.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid h-7 w-7 place-items-center rounded-full border",
                          d.done
                            ? "border-azure bg-azure/15 text-azure"
                            : d.isToday
                              ? "border-2 border-azure"
                              : "border-hairline-strong",
                        )}
                      >
                        {d.done && <Check size={13} strokeWidth={2.4} />}
                      </span>
                      {/* Said for a screen reader, since the ring alone carries
                          "today" and a tick alone carries "done". */}
                      <span className="sr-only">
                        {d.label}
                        {d.isToday ? ", today" : ""}
                        {d.rest ? ", rest day" : d.done ? ", completed" : ", not completed"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-2">
              <Figure icon={ActivityIcon} value={String(weekly.activities)} label="Activities" />
              <Figure icon={Clock} value={fmtHours(weekly.timeHours)} label="Duration" />
              <Figure icon={TrendingUp} value={fmtElevation(weekly.elevationM)} label="Elevation" />
              <Figure icon={Route} value={fmtDistance(weekly.distanceKm)} label="Distance" />
            </div>
            <MiniBars data={weekly.daily} activeIndex={todayIndex} className="mt-5" />
          </Card>
        </Rise>

        {/* PH-06 — REMOVED FROM HOME at the owner's request: Recent activity,
            Expedition checklist, Upcoming, People nearby, and the "Start an
            activity" card. Each still exists on its own screen; Home stops
            being a directory of the app and keeps the objective, the plan, the
            week, the weather and readiness. The Start control is on the tab bar
            already, which is why the card was redundant rather than merely
            surplus. */}

        {/* PH-35 — TRAINING READINESS REMOVED FROM HOME at the owner's request.
            The score itself is NOT gone: it still rides in the hero dial at the
            top of this screen, still reads "—" when it cannot be computed, and
            `/coach/readiness` remains the place that explains it. What went is
            the duplicate panel two thirds of the way down, which restated a
            number already on screen and sent you to the same analysis. */}

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

      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * DAYS TO THE OBJECTIVE — PH-06.
 *
 * `fmtCountdown` rolls up to months past 30 days and to years past 24 months,
 * which is right for a list of goals and wrong here: the owner asked for days,
 * because "8 months" is a number you plan around and a day count is one you
 * train against. It changes every morning, which is the point.
 *
 * NOT a change to `fmtCountdown` itself — that is shared by nine other
 * surfaces (Goals, Coach, People, Conditions, MountainPage, cards) where the
 * rolled-up form is the right one. Local to the hero, deliberately.
 *
 * `parseDay` is not used because `targetDate` is a full ISO instant rather than
 * a bare `YYYY-MM-DD`, so the UTC-midnight trap does not apply; the ceiling is
 * taken against the same clock `fmtCountdown` uses so the two never disagree
 * about which day it is.
 */
function daysToGo(iso: string, now = new Date()): number | null {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - now.getTime()) / 86_400_000);
}

function daysToGoValue(iso: string): string {
  const d = daysToGo(iso);
  if (d === null) return "—";
  if (d < 0) return "—";
  return d.toLocaleString("en-GB");
}

function daysToGoLabel(iso: string): string {
  const d = daysToGo(iso);
  if (d === null) return "";
  if (d < 0) return "Date passed";
  if (d === 0) return "Today";
  return d === 1 ? "day to go" : "days to go";
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

/**
 * Live conditions for the objective.
 *
 * `getMountainConditions` never throws and never invents a reading: a failed
 * request comes back with every value absent, which renders as an explicit
 * "unavailable" rather than as calm weather.
 */
function ConditionsPanel({
  /** Used to request the forecast. Not rendered — the card prints it above. */
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
    /*
      A SECTION OF THE OBJECTIVE CARD, not a card of its own.

      Owner: "connect this to the current objective box together." They were two
      boxes saying the same mountain's name twice — the forecast IS the
      objective's forecast, and reading it as separate information was the
      thing to fix.

      A sibling `Link`, not a nested one: the card's upper half already links to
      /goals, and an anchor inside an anchor is invalid. The two live side by
      side inside the card, so tapping the summit goes to the objective and
      tapping the weather goes to the forecast.

      The name is gone from here — the card prints it at 26px two rows up — but
      "at N m" stays: it is what ties the temperature to an ALTITUDE rather than
      to the mountain in general, and a summit reading presented as the
      mountain's weather is the kind of number someone packs against.
    */
    <Link
      to={`/mountain/${goalId}/conditions`}
      className="mt-4 block border-t border-hairline pt-4"
    >
      <p className="section-label">Conditions at your destination</p>

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
              <p className="tnum mt-1 text-[10px] text-mist-dim">at {fmtElevation(elevationM)} m</p>
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
              value={precip !== null && precip !== undefined ? `${precip.toFixed(1)} mm` : "—"}
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

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[12.5px] text-azure">Full forecast</span>
        <ChevronRight size={15} strokeWidth={1.8} className="text-azure" />
      </div>
    </Link>
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

/**
 * Why the split is stated rather than implied.
 *
 * ICEFALL prescribes a session and a length. It does not hold a per-athlete
 * segment breakdown, and dividing the length by a conventional shape is not the
 * same as a coach deciding how this athlete should spend the hour. The line is
 * rendered verbatim under the timeline so nobody reads the minutes as
 * individually prescribed.
 */
/** Mon-first, matching the strip's column order and `todayIndex` above. */
const DAY_INITIALS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const SEGMENTS_ARE_A_STANDARD_SHAPE =
  "ICEFALL prescribes the session and its length. The split across warm-up, main set and finish is the standard shape of a session, not a breakdown chosen for you.";

interface SessionSegment {
  name: string;
  /** `null` where there is no duration to give. Never a zero. */
  minutes: number | null;
  note: string;
}

/**
 * The timeline rows for a session of `durationMin`.
 *
 * A 15 / 70 / 15 split, rounded to whole minutes, with the remainder pushed
 * into the main set so the three always sum back to the prescribed length —
 * a timeline whose parts do not add up to its own total is worse than no
 * timeline.
 */
function sessionSegments(durationMin: number, detail?: string): SessionSegment[] {
  const warm = Math.max(5, Math.round((durationMin * 0.15) / 5) * 5);
  const finish = Math.max(5, Math.round((durationMin * 0.15) / 5) * 5);
  const main = durationMin - warm - finish;

  // A session too short to divide is left whole rather than split into
  // fragments that misrepresent it.
  if (main < 10) {
    return [
      { name: "The session", minutes: durationMin, note: detail ?? "Complete as prescribed." },
    ];
  }

  return [
    {
      name: "Warm up",
      minutes: warm,
      note: "Easy pace. Posture and relaxed breathing before the effort starts.",
    },
    {
      name: "Main set",
      minutes: main,
      // No zone. ICEFALL has measured no heart and holds no threshold.
      note: detail ?? "Hold an even effort you could sustain for longer than this.",
    },
    { name: "Finish", minutes: finish, note: "Easy cool down. Let the effort come off gradually." },
    { name: "Focus", minutes: null, note: "Stay calm and consistent. Discipline over intensity." },
  ];
}
