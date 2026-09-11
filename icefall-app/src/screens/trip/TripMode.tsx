import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { QualifierBadge } from "@/components/coach/DataState";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Group } from "@/components/settings/kit";
import { Button } from "@/components/ui/primitives";
import { asAltitudeIllnessHistory } from "@/services/acclimatisation";
import { useApp, usePrimaryGoal } from "@/state/AppState";
import { readableDay } from "@/tracking/adjustments";
import { COMPUTED_ON_THIS_DEVICE, useConnectivity } from "@/trip/connectivity";
import { ESCALATION_HEADING, scoreLakeLouise, summariseCheck } from "@/trip/lakeLouise";
import { REST_NIGHT_DEFINITION, buildSchedule, describeTonight } from "@/trip/schedule";
import {
  INSURANCE_DISCLOSURE,
  TIMELINE_PROGRESS_CAVEAT,
  buildTimeline,
  statusFor,
  timelineProgress,
} from "@/trip/timeline";
import {
  daysBetween,
  storageWorks,
  todayISO,
  tripLengthProblem,
  useTrip,
  type Trip,
} from "@/trip/trip";

/**
 * TRIP MODE — the screen for somebody who is on the mountain, not planning one.
 *
 * ============================================================================
 * WHAT IT PROMISES, AND WHY THE PROMISE IS KEEPABLE
 * ============================================================================
 *
 * It works with no signal. Not "degrades gracefully" — works, completely, with
 * the radio off, because there is nothing on it that a network could supply:
 *
 *   · the trip, the nights and the checks are localStorage (`trip/trip.ts`);
 *   · the schedule is arithmetic over those nights and two constants from
 *     `services/acclimatisation.ts` (`trip/schedule.ts`);
 *   · the self-check is a pure function whose only import is `coach/safety.ts`,
 *     which imports nothing (`trip/lakeLouise.ts`);
 *   · the timeline is date arithmetic on the trip's own start date.
 *
 * Workbox precaches every hashed JS chunk (`vite.config.ts` globPatterns), so
 * this lazy route opens cold with no signal, and `navigateFallback` means a
 * deep link to /trip resolves offline too. `src/trip/offline.test.ts` walks the
 * import graph from this file and fails if anything reaching the network is
 * ever added to it.
 *
 * THE CONNECTIVITY LINE IS NOT `OfflineBanner`. That banner says "sample data,
 * not real", which is true of a demo build and would be a lie about an
 * athlete's own recorded nights. `trip/connectivity.ts` is this screen's own,
 * and it never claims to be online — see its header.
 *
 * ============================================================================
 * NOT GATED, AND THAT IS A SAFETY DECISION
 * ============================================================================
 *
 * There is no entitlement check on this route and there must never be one. The
 * self-check routes into the descent advice in `coach/safety.ts`; an app that
 * put that behind €9.99 would be selling the one thing it must give away.
 * `growth/tiers.ts` records the same decision beside the feature row.
 *
 * ============================================================================
 * NO BOXES. Flat rows, hairlines, spacing.
 */

/* -------------------------------------------------------------------------- */
/* Starting a trip                                                             */
/* -------------------------------------------------------------------------- */

function StartTrip() {
  const goal = usePrimaryGoal();
  const { startTrip } = useTrip();
  const [name, setName] = useState(goal?.name ?? "");
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);

  const problem = end ? tripLengthProblem(start, end) : null;

  return (
    <>
      <Group label="Start a trip">
        <p className="text-[13px] leading-relaxed text-mist">
          A trip is a start date, an end date and — when you have one — an objective, which is
          where the elevation for the acclimatisation schedule comes from. It lives on this phone
          and nowhere else.
        </p>

        <label className="mt-4 block">
          <span className="section-label">What to call it</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={goal?.name ?? "Trip"}
            className="mt-1.5 h-11 w-full border-b border-hairline-strong bg-transparent text-[15px] text-snow placeholder:text-mist-dim focus:border-azure focus:outline-none"
          />
        </label>

        <div className="mt-4 flex gap-4">
          <label className="flex-1">
            <span className="section-label">Leaving</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1.5 h-11 w-full border-b border-hairline-strong bg-transparent text-[15px] text-snow focus:border-azure focus:outline-none"
            />
          </label>
          <label className="flex-1">
            <span className="section-label">Back</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1.5 h-11 w-full border-b border-hairline-strong bg-transparent text-[15px] text-snow focus:border-azure focus:outline-none"
            />
          </label>
        </div>

        {/* THE OBJECTIVE, AND WHAT ITS ABSENCE COSTS — said before the tap,
            not discovered afterwards on an empty schedule. */}
        <p className="mt-4 text-[13px] leading-relaxed text-mist">
          {goal
            ? `This trip will be attached to ${goal.name}${
                goal.elevationM ? `, ${goal.elevationM.toLocaleString("en-GB")} m` : ""
              }.${
                goal.elevationM
                  ? ""
                  : " That objective has no elevation on record, so there will be no acclimatisation schedule — ICEFALL will not invent one."
              }`
            : "You have no active objective, so this trip will have no elevation and no acclimatisation schedule. The self-check and the timeline work regardless."}
        </p>

        {(problem || error) && (
          <p className="mt-3 text-[13px] leading-relaxed text-danger">{problem ?? error}</p>
        )}

        <div className="mt-4">
          <Button
            size="md"
            disabled={!end || problem !== null}
            onClick={() => {
              const r = startTrip({
                name,
                goalId: goal?.id ?? null,
                peakName: goal?.name ?? null,
                peakElevationM: goal?.elevationM ?? null,
                startDate: start,
                endDate: end,
              });
              if ("error" in r) setError(r.error);
              else setError(null);
            }}
          >
            Start the trip
          </Button>
        </div>
      </Group>

      {/* THE SELF-CHECK IS REACHABLE WITHOUT A TRIP. It is the safety surface;
          making it wait behind a setup form would be the wrong order. */}
      <Group label="You do not need a trip for this">
        <Link
          to="/trip/check"
          className="-mx-5 flex w-full items-start gap-3.5 border-t border-hairline px-5 py-3.5 text-left transition-colors first:border-t-0 hover:bg-white/[0.03]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] text-snow">Altitude self-check</span>
            <span className="mt-1 block text-[11.5px] leading-relaxed text-mist">
              The Lake Louise questionnaire. Works offline, needs no trip, no account and no
              subscription.
            </span>
          </span>
        </Link>
      </Group>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The open trip                                                               */
/* -------------------------------------------------------------------------- */

function OpenTrip({ trip }: { trip: Trip }) {
  const today = todayISO();
  const { coachProfile } = useApp();
  const { nights, nightsOutside, checks, ticks, recordNight, clearNight, endTrip, tickTimelineItem } =
    useTrip();

  /* The health disclosure, narrowed. Passed ONLY here, where the athlete is the
     person reading the result — `ascentPaceFor`'s own requirement. */
  const history = asAltitudeIllnessHistory(coachProfile.altitudeIllness);

  const schedule = useMemo(
    () => buildSchedule(trip, nights, history, today),
    [trip, nights, history, today],
  );

  const timeline = useMemo(() => buildTimeline(trip), [trip]);
  const tickOf = (id: string) => ticks[`${trip.id}|${id}`] ?? null;
  const progress = timelineProgress(timeline, tickOf);

  const dayNumber = daysBetween(trip.startDate, today) + 1;
  const inTrip = today >= trip.startDate && today <= trip.endDate;
  const daysToGo = daysBetween(today, trip.startDate);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Tonight                                                             */}
      {/* ------------------------------------------------------------------ */}
      <Group label={inTrip ? `Day ${dayNumber} · tonight` : "Tonight"}>
        <p className="text-[15px] leading-relaxed text-snow">
          {inTrip
            ? describeTonight(schedule, today)
            : daysToGo > 0
              ? `This trip starts in ${daysToGo} day${daysToGo === 1 ? "" : "s"}, on ${readableDay(trip.startDate)}. The schedule below has a row for every night of it.`
              : `This trip's dates ended on ${readableDay(trip.endDate)}.`}
        </p>
        {schedule.caveat && (
          <p className="mt-3 text-[12.5px] leading-relaxed text-mist">{schedule.caveat}</p>
        )}
        {schedule.medicalNote && (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">{schedule.medicalNote}</p>
        )}
      </Group>

      {/* ------------------------------------------------------------------ */}
      {/* The self-check                                                      */}
      {/* ------------------------------------------------------------------ */}
      <Group label="Altitude self-check">
        <Link
          to="/trip/check"
          className="-mx-5 flex w-full items-start gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] text-snow">Fill in the Lake Louise questionnaire</span>
            <span className="mt-1 block text-[11.5px] leading-relaxed text-mist">
              Four questions and five warning signs. Offline, no subscription, and the advice
              appears before you finish the form.
            </span>
          </span>
        </Link>

        {checks.length === 0 ? (
          <p className="-mx-5 border-t border-hairline px-5 pt-3.5 text-[13px] leading-relaxed text-mist">
            No check has been filled in on this trip. That is a statement about the log, not about
            how anybody feels.
          </p>
        ) : (
          <div>
            {checks.slice(0, 8).map((c) => {
              /* RE-SCORED, NOT REPLAYED. The store keeps the answers; the
                 verdict is derived now, by the current rules. */
              const r = scoreLakeLouise(c.answers);
              return (
                <div key={c.id} className="-mx-5 border-t border-hairline px-5 py-3.5">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-[14px] text-snow">
                      {readableDay(c.date)} ·{" "}
                      {new Date(c.at).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p
                      className={`shrink-0 text-[12px] ${
                        r.escalation === "descend-now" || r.escalation === "stop-ascending"
                          ? "text-danger"
                          : "text-mist"
                      }`}
                    >
                      {ESCALATION_HEADING[r.escalation]}
                    </p>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-mist">
                    {summariseCheck(r)}
                    {c.altitudeM !== null ? ` · at ${c.altitudeM.toLocaleString("en-GB")} m` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Group>

      {/* ------------------------------------------------------------------ */}
      {/* The acclimatisation schedule                                        */}
      {/* ------------------------------------------------------------------ */}
      <Group label="Acclimatisation">
        {schedule.state !== "usable" ? (
          <p className="text-[14px] leading-relaxed text-snow">{schedule.note}</p>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-mist">{schedule.noItineraryNote}</p>
            <div className="mt-3">
              {schedule.nights.map((n) => {
                const editingThis = editing === n.date;
                return (
                  <div
                    key={n.date}
                    className="-mx-5 border-t border-hairline px-5 py-3.5 first:border-t-0"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <p className={`text-[14px] ${n.isToday ? "text-azure" : "text-snow"}`}>
                        {readableDay(n.date)}
                        {n.isToday ? " · tonight" : ""}
                      </p>
                      <p className="tnum shrink-0 text-[13px] text-snow">
                        {n.ceilingM !== null
                          ? `≤ ${n.ceilingM.toLocaleString("en-GB")} m`
                          : "no ceiling"}
                      </p>
                    </div>

                    <p className="mt-1 text-[12.5px] leading-relaxed text-mist">{n.ceilingReason}</p>

                    {n.restNightDue && (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-azure">
                        A rest night is due — {n.gainSinceRestM?.toLocaleString("en-GB")} m gained
                        since the last night that was no higher than the one before it.
                      </p>
                    )}

                    {n.exceededByM !== null && (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">
                        You slept {n.exceededByM.toLocaleString("en-GB")} m above that ceiling. That
                        is arithmetic about the schedule, not a symptom, and ICEFALL is not saying
                        anything is wrong.
                      </p>
                    )}

                    {/* The night's own recorded altitude — the one input the
                        whole schedule rests on. */}
                    {editingThis ? (
                      <div className="mt-2.5 flex items-center gap-2.5">
                        <input
                          autoFocus
                          inputMode="numeric"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder="metres"
                          className="h-10 flex-1 border-b border-hairline-strong bg-transparent text-[15px] text-snow placeholder:text-mist-dim focus:border-azure focus:outline-none"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const v = Number(draft);
                            if (Number.isFinite(v) && v >= -500 && v <= 9000)
                              recordNight(trip.id, n.date, v);
                            setEditing(null);
                          }}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(n.date);
                            setDraft(n.sleptAtM !== null ? String(n.sleptAtM) : "");
                          }}
                          className="text-[13px] text-azure hover:underline"
                        >
                          {n.sleptAtM !== null
                            ? `Slept at ${n.sleptAtM.toLocaleString("en-GB")} m`
                            : "Record where you slept"}
                        </button>
                        {n.sleptAtM !== null && (
                          <>
                            <QualifierBadge kind="self-reported" />
                            <button
                              type="button"
                              onClick={() => clearNight(trip.id, n.date)}
                              className="text-[12px] text-mist-dim hover:text-mist"
                            >
                              Clear
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="-mx-5 border-t border-hairline px-5 pt-3.5 text-[12.5px] leading-relaxed text-mist-dim">
              {REST_NIGHT_DEFINITION}
            </p>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist-dim">
              {schedule.attribution}
            </p>
          </>
        )}

        {nightsOutside.length > 0 && (
          <p className="-mx-5 mt-3.5 border-t border-hairline px-5 pt-3.5 text-[12.5px] leading-relaxed text-mist">
            {nightsOutside.length} recorded night
            {nightsOutside.length === 1 ? " falls" : "s fall"} outside this trip's dates and are not
            in the schedule above:{" "}
            {nightsOutside.map((n) => `${readableDay(n.date)} (${n.sleptAtM} m)`).join(", ")}. They
            have not been deleted.
          </p>
        )}
      </Group>

      {/* ------------------------------------------------------------------ */}
      {/* Before you go                                                       */}
      {/* ------------------------------------------------------------------ */}
      <Group label={`Before you go · ${progress.done} of ${progress.total} ticked`}>
        <div>
          {timeline.map((item) => {
            const tickedAt = tickOf(item.id);
            const status = statusFor(item, trip, today, tickedAt);
            return (
              <div
                key={item.id}
                className="-mx-5 border-t border-hairline px-5 py-3.5 first:border-t-0"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {/* THE LABEL COMES OUT WITH THE ROW. See timeline.ts. */}
                    {item.commercialLabel && (
                      <p className="section-label mb-1 text-mist-dim">{item.commercialLabel}</p>
                    )}
                    {item.to ? (
                      <Link to={item.to} className="text-[14px] text-snow hover:text-azure">
                        {item.title}
                      </Link>
                    ) : (
                      <p className="text-[14px] text-snow">{item.title}</p>
                    )}
                    <p className="mt-1 text-[12.5px] leading-relaxed text-mist">{item.detail}</p>
                    {item.noDestinationReason && (
                      <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">
                        {item.noDestinationReason}
                      </p>
                    )}
                    <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">
                      {item.authorityNote}
                    </p>
                    {item.kind === "insurance" && (
                      <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">
                        {INSURANCE_DISCLOSURE}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-[12px] ${
                        status.kind === "overdue" ? "text-danger" : "text-mist"
                      }`}
                    >
                      {status.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-mist-dim">{readableDay(item.dueDate)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => tickTimelineItem(trip.id, item.id, tickedAt === null)}
                  className="mt-2.5 text-[13px] text-azure hover:underline"
                >
                  {tickedAt ? "Untick" : "Tick this off"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="-mx-5 border-t border-hairline px-5 pt-3.5 text-[12.5px] leading-relaxed text-mist-dim">
          {TIMELINE_PROGRESS_CAVEAT}
        </p>
      </Group>

      {/* ------------------------------------------------------------------ */}
      {/* The trip itself                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Group label="This trip">
        <p className="text-[13px] leading-relaxed text-mist">
          {readableDay(trip.startDate)} to {readableDay(trip.endDate)}
          {trip.peakName ? ` · ${trip.peakName}` : ""}
          {trip.peakElevationM !== null
            ? ` · ${trip.peakElevationM.toLocaleString("en-GB")} m`
            : " · no elevation on record"}
          .
        </p>
        <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
          Stored on this phone only. ICEFALL has no trips table and nothing here syncs — reinstall
          the app and this is gone.
          {storageWorks()
            ? ""
            : " This phone is refusing to store anything right now, so what you record will last only until you close the app."}
        </p>
        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => endTrip(trip.id)}>
            Close this trip
          </Button>
        </div>
      </Group>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function TripMode() {
  const { trip } = useTrip();
  const net = useConnectivity();

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Trip"
          subtitle={trip ? trip.name : "Nothing open"}
          back="/coach"
          large
        />
      </div>

      <Stagger className="px-5">
        {/* THE CONNECTIVITY LINE. Never claims to be online — see
            trip/connectivity.ts. Flat, one line, no banner. */}
        <Rise>
          <div className="flex items-baseline justify-between gap-4 border-b border-hairline pb-3">
            <p className="text-[13px] text-snow">{COMPUTED_ON_THIS_DEVICE}</p>
            <p className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-mist-dim">
              {net.label}
            </p>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">{net.detail}</p>
        </Rise>

        {trip ? <OpenTrip trip={trip} /> : <StartTrip />}
      </Stagger>
    </Screen>
  );
}
