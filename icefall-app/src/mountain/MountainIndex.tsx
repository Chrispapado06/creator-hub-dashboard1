/**
 * `/mountain` — a trip running today opens Now; otherwise "nothing is running"
 * (mockup spec §2).
 *
 * The screen for somebody who opened ICEFALL with no signal and nothing on.
 * REBUILT TO THE MOCKUP, 16 Sep 2026. It used to lead with a 40 px "No signal",
 * then a list, then four identical-looking rows at the bottom — five things of
 * roughly equal weight, which is the confusion the owner complained about.
 *
 * Now there is one obvious order, top to bottom:
 *   1. a small grey caps line saying where you are and that nothing is running;
 *   2. three full-width buttons, most important first — filled azure to start,
 *      azure outline to open the saved trip, red outline for SOS;
 *   3. a hairline, then SAVED ON THIS PHONE over flat rows of what this device
 *      genuinely holds.
 * Nothing is boxed: hairlines between rows and nothing else.
 *
 * WHAT IS NOT HERE ANY MORE. "Open full app" was a fourth row competing with
 * the three actions. It is one tap away in the shell menu (the chevron beside
 * MOUNTAIN MODE), which is where the Trip tab also reaches it, so it is not
 * lost — just no longer shouting alongside SOS.
 *
 * EVERY VALUE ON THIS SCREEN IS COUNTED, NEVER TYPED. The rescue-number count
 * comes from the data file, the trip count from the trip store, the position
 * age from the last fix. Where there is none, the row says so in the same slot
 * rather than disappearing.
 */

import type { ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { MOUNTAINS } from "@/data/mock/mountains";
import { rescueFor } from "@/data/mountainRescue";
import { cn } from "@/lib/utils";
import { activeSessionSummary } from "@/tracking/activeSession";
import { useConnectivity } from "@/trip/connectivity";
import { resumeTrip, useTrip } from "@/trip/trip";

import { useEmergencyInfo } from "./emergencyInfo";
import { ageLabel } from "./format";
import { enterMountainMode } from "./mode";
import { MOUNTAIN_PATHS } from "./paths";
import { useLastKnownPosition } from "./position";
import { tripDay, useMountainTrip } from "./trip";
import { BigButton, Row, SectionLabel, buttonClass } from "./ui";

/** Counted from the data, never typed: mountains with a sourced rescue record. */
const MOUNTAINS_WITH_NUMBERS = MOUNTAINS.filter((m) => rescueFor(m.id) !== null).length;

/** The saved-trip button: which trip, and the honest note about its dates. */
interface SavedTrip {
  name: string;
  /** Null when there is nothing to qualify. */
  note: string | null;
  open: () => void;
}

export default function MountainIndex() {
  const { trip, runningToday, today } = useMountainTrip();
  if (trip && runningToday) return <Navigate to={MOUNTAIN_PATHS.now} replace />;
  return <NothingRunning ownTrip={trip ? { name: trip.name, day: tripDay(trip, today) } : null} />;
}

/** "Starts in 3 days" / "Dates have passed" / "Closed" — never "today". */
function dateNote(day: ReturnType<typeof tripDay>): string {
  if (day.kind === "before") return `Starts in ${day.daysToGo} day${day.daysToGo === 1 ? "" : "s"}`;
  if (day.kind === "after") return "Dates have passed";
  return "Closed";
}

function NothingRunning({
  ownTrip,
}: {
  ownTrip: { name: string; day: ReturnType<typeof tripDay> } | null;
}) {
  const navigate = useNavigate();
  const signal = useConnectivity();
  const { trips } = useTrip();
  const position = useLastKnownPosition();
  const emergencyInfo = useEmergencyInfo();
  const recording = activeSessionSummary();
  const offline = signal.state === "unreachable";
  const closed = trips.filter((t) => t.endedAt);

  /* ONE saved-trip button, or none at all — the mockup has no slot for a list.
     The athlete's own trip wins; otherwise the most recently closed one. The
     others stay counted in "Your trips" below, and reopening one of those is
     the full app's job. */
  const saved: SavedTrip | null = ownTrip
    ? { name: ownTrip.name, note: dateNote(ownTrip.day), open: () => navigate(MOUNTAIN_PATHS.trip) }
    : closed.length > 0
      ? {
          name: closed[0].name,
          note: "Saved on this phone",
          open: () => {
            resumeTrip(closed[0].id);
            navigate(MOUNTAIN_PATHS.trip);
          },
        }
      : null;

  return (
    <div className="flex min-h-full flex-col pb-8">
      <section className="px-5 pt-6" aria-label="What to do">
        {/* The state, small and grey. This screen's weight is in the azure
            button under it, not in a word — there is no number to be a hero. */}
        <SectionLabel as="h1">
          {offline ? "No signal · Nothing running" : "Nothing running"}
        </SectionLabel>

        <div className="mt-4 flex flex-col gap-3">
          {/* Entering the mode BEFORE navigating is what keeps the tracker from
              behaving like the full app's, so this is a Link with an onClick
              rather than <BigButton to=…>, which takes no handler. */}
          <Link
            to="/activity/select"
            onClick={enterMountainMode}
            className={cn(buttonClass("azure"), "no-underline")}
          >
            Start an activity
          </Link>

          {saved && (
            <BigButton variant="azure-outline" onClick={saved.open} sub={saved.note}>
              Open saved trip · {saved.name}
            </BigButton>
          )}

          <BigButton variant="red-outline" to={MOUNTAIN_PATHS.sos}>
            SOS
          </BigButton>
        </div>
      </section>

      <section className="mt-8 border-t border-hairline pt-5" aria-labelledby="saved-heading">
        <SectionLabel as="h2" id="saved-heading" className="px-5 pb-1">
          Saved on this phone
        </SectionLabel>

        {/* The SOS screen is where emergency info is held and edited; there is
            no second copy of it to send somebody to. */}
        <Row to={MOUNTAIN_PATHS.sos} chevron>
          <RowTitle>Emergency info</RowTitle>
          <RowValue>{emergencyInfo ? "Saved" : "Not filled in"}</RowValue>
        </Row>

        <Row>
          <RowTitle>Emergency numbers</RowTitle>
          <RowValue>
            {MOUNTAINS_WITH_NUMBERS} mountain{MOUNTAINS_WITH_NUMBERS === 1 ? "" : "s"}
          </RowValue>
        </Row>

        <Row to={MOUNTAIN_PATHS.body} chevron>
          <RowTitle>Symptom check</RowTitle>
        </Row>

        <Row>
          <RowTitle>Your trips</RowTitle>
          <RowValue>{trips.length === 0 ? "None saved" : trips.length}</RowValue>
        </Row>

        {recording && (
          <Row to={`/activity/live/${recording.activityTypeId}`} chevron>
            <RowTitle tone="alert">Unfinished recording · open it</RowTitle>
          </Row>
        )}

        <Row>
          <RowTitle>Last position</RowTitle>
          <RowValue>{position ? ageLabel(Date.now() - position.at) : "None yet"}</RowValue>
        </Row>

        <p className="border-t border-hairline px-5 pt-3 text-[15px] leading-snug text-mist">
          Kept on this phone only. Nothing here needs a signal.
        </p>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The two halves of a saved-on-this-phone row                                 */
/* -------------------------------------------------------------------------- */

function RowTitle({ children, tone }: { children: ReactNode; tone?: "alert" }) {
  return <span className={cn("m-text-body", tone === "alert" ? "text-alert" : "text-snow")}>{children}</span>;
}

function RowValue({ children }: { children: ReactNode }) {
  return <span className="m-text-label shrink-0 text-right text-mist">{children}</span>;
}
