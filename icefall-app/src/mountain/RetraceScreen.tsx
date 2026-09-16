/**
 * RETRACE MY ROUTE (brief M5, plan §3.3 CORRECTED; mockup spec §6, second state).
 *
 * THE SHAPE, from the owner's mockup: the same plot as the Map tab, with the
 * walked track turned white and carrying arrows back the way you came; then one
 * block — grey caps BACK TO <place>, the distance as the screen's one hero,
 * a grey bearing line — and the two buttons, with the left one now STOP
 * RETRACE. Everything that explains the track sits quietly under that.
 *
 * What it is: distance and bearing back to where this walk started, and back to
 * the last camp the track was actually at, worked out from THIS phone's
 * breadcrumbs and your current fix.
 *
 * Three things it deliberately does not do:
 *   · It does not measure from the last breadcrumb. The bearing comes from the
 *     fix you have now, and is withheld outright when that fix is old — a
 *     direction from a 40-minute-old position is a direction from somewhere you
 *     are not standing. The hero slot then holds that sentence rather than a
 *     number, and keeps its place in the layout.
 *   · It does not join breadcrumbs across a gap. The track is counted in
 *     unbroken runs and the breaks are stated.
 *   · It does not turn the arrow with the phone's compass. A web heading may be
 *     measured from magnetic north, and nothing here knows the local difference
 *     — 15° wrong on Denali is worse than no needle (plan §3.3). North is up,
 *     and the compass reading is shown as a number beside it.
 *
 * No network, no map tiles, no AI. It works in airplane mode.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { CAMP_KIND_LABEL, campsFor } from "@/data/mountainCamps";
import { cn } from "@/lib/utils";

import { NO_TRACK_STORAGE_SENTENCE, useBreadcrumbRecorder } from "./breadcrumbs";
import { ageLabel, durationLabel } from "./format";
import {
  HEADING_NORTH_UNKNOWN,
  TRACK_GAPS_SENTENCE,
  headingFromOrientation,
  lastPlacePassed,
  type CompassHeading,
} from "./geo";
import { NOT_A_HEADING, STRAIGHT_LINE, distanceLabel, placeReadings, type Place } from "./mapModel";
import { SketchMap } from "./map/SketchMap";
import { useMapPlot, useNow } from "./map/useMapPlot";
import { MOUNTAIN_PATHS } from "./paths";
import { useLivePosition } from "./position";
import { formatDecimal, fullDateTime } from "./sos";
import { BigButton, HeroNumber, Row, SectionLabel, buttonClass } from "./ui";

const PLOT_EMPTY = "Nothing to draw back to yet. ICEFALL has saved none of this walk.";

/** The same side-by-side pair as the Map tab, so the two states look identical. */
const PAIR_BUTTON = "w-full px-2 text-[12px] tracking-[0.06em]";

/** "1.2 km" as a number and a unit, so the unit can be set a step lighter. */
function splitDistance(metres: number): { value: string; unit: string } {
  const label = distanceLabel(metres);
  const cut = label.lastIndexOf(" ");
  return cut === -1 ? { value: label, unit: "" } : { value: label.slice(0, cut), unit: label.slice(cut + 1) };
}

export default function RetraceScreen() {
  const now = useNow(1000);
  const plot = useMapPlot(now);
  const recorder = useBreadcrumbRecorder();
  const [watching, setWatching] = useState(true);
  const live = useLivePosition(watching);
  const compass = useCompass();

  const { trip, shape, crumbs, last: fix } = plot;

  const camps = useMemo(
    () =>
      (campsFor(trip?.mountainId ?? undefined)?.camps ?? []).map((c) => ({
        name: c.name,
        lat: c.lat,
        lon: c.lon,
        elevationM: c.elevationM,
        kind: CAMP_KIND_LABEL[c.kind],
      })),
    [trip?.mountainId],
  );

  const passed = useMemo(() => lastPlacePassed(crumbs, camps), [crumbs, camps]);

  const targets = useMemo<{ place: Place; title: string; note: string }[]>(() => {
    const list: { place: Place; title: string; note: string }[] = [];
    if (passed) {
      list.push({
        place: passed.place,
        title: passed.place.name,
        note: `Your track was here ${ageLabel(now - passed.at)}`,
      });
    }
    if (shape.first) {
      list.push({
        place: {
          name: "Start of this walk",
          lat: shape.first.lat,
          lon: shape.first.lon,
          elevationM: shape.first.altitudeM,
          kind: "Where the track begins",
        },
        title: "Start of this walk",
        note: `First saved ${ageLabel(now - shape.first.t)}`,
      });
    }
    return list;
  }, [passed, shape.first, now]);

  const [chosen, setChosen] = useState(0);
  const target = targets[Math.min(chosen, Math.max(0, targets.length - 1))] ?? null;
  const readings = placeReadings(
    targets.map((t) => t.place),
    fix,
    now,
  );
  const reading =
    readings.kind === "readings"
      ? (readings.readings[Math.min(chosen, readings.readings.length - 1)] ?? null)
      : null;

  return (
    <div className="pb-10">
      <SketchMap
        view={plot.view}
        onView={plot.setView}
        onSize={plot.onSize}
        places={plot.plotPlaces}
        pins={plot.pins}
        runs={plot.runs}
        fix={plot.plotFix}
        fixGreyed={plot.freshness === "stale"}
        retrace
        routeLine={null}
        savedCaption={plot.caption}
        onFitAll={plot.hasPlot ? plot.fitAll : undefined}
        emptyLine={PLOT_EMPTY}
      />

      {/* THE ONE HERO — the distance back, or the honest sentence in its place. */}
      <section className="px-5 pt-6" aria-labelledby="back-heading">
        <SectionLabel as="h2" id="back-heading">
          {target ? `Back to ${target.title}` : "The way back"}
        </SectionLabel>

        {/* EXACTLY ONE of these. Two honest sentences stacked in the hero slot
            is the confusion the owner complained about, in miniature. */}
        {!target ? (
          <p className="mt-2 m-text-title leading-tight text-mist">
            ICEFALL has not saved any of this walk yet, so there is nowhere to point back to.
          </p>
        ) : readings.kind === "none" ? (
          <p className="mt-2 m-text-title leading-tight text-mist">
            No position yet, so ICEFALL cannot say which way it is from here.
          </p>
        ) : readings.kind === "withheld" ? (
          <p className="mt-2 m-text-title leading-tight text-mist">{readings.sentence}</p>
        ) : reading && reading.withinAccuracy ? (
          <p className="mt-2 m-text-title text-snow">You are here, within the GPS error.</p>
        ) : reading ? (
          <>
            <HeroNumber className="mt-2" {...splitDistance(reading.distanceM)} />
            <p className="mt-3 text-[17px] tabular-nums text-mist">
              bearing {reading.bearingDeg}° {reading.point}
            </p>
          </>
        ) : null}
      </section>

      <div className="grid grid-cols-2 gap-3 px-5 pt-5">
        <BigButton variant="azure" size="sm" className={PAIR_BUTTON} to={MOUNTAIN_PATHS.map}>
          Stop retrace
        </BigButton>
        <BigButton
          variant="azure-outline"
          size="sm"
          className={PAIR_BUTTON}
          onClick={plot.centreOnMe}
          disabled={!plot.canCentre}
        >
          Centre on me
        </BigButton>
      </div>

      <p className="px-5 pt-4 text-[15px] leading-snug text-mist">{TRACK_GAPS_SENTENCE}</p>

      {recorder.storageError && (
        <p className="mt-4 border-t border-hairline px-5 py-3 text-[17px] leading-snug text-alert">
          {NO_TRACK_STORAGE_SENTENCE}
        </p>
      )}

      {targets.length > 1 && (
        <section className="mt-8" aria-labelledby="target-heading">
          <SectionLabel as="h2" id="target-heading" className="px-5 pb-2">
            Walk back to
          </SectionLabel>
          <div className="flex gap-3 px-5">
            {targets.map((t, i) => (
              <button
                key={t.title}
                type="button"
                onClick={() => setChosen(i)}
                aria-pressed={i === chosen}
                className={cn(buttonClass(i === chosen ? "azure" : "azure-outline", "sm"), "w-full")}
              >
                {t.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {target && (
        <section className="mt-8" aria-labelledby="where-heading">
          <SectionLabel as="h2" id="where-heading" className="px-5 pb-2">
            Where it is
          </SectionLabel>
          <div className="border-t border-hairline px-5 py-3">
            <p className="text-[17px] tabular-nums text-snow">
              {formatDecimal(target.place.lat, "lat")}, {formatDecimal(target.place.lon, "lon")}
            </p>
            <p className="mt-1 text-[15px] text-mist">{target.note}</p>
          </div>
          {readings.kind === "withheld" && (
            <p className="border-t border-hairline px-5 py-3 text-[15px] leading-snug text-mist">
              This is the one thing left that is true: where {target.title} is, and when your track was last near it.
            </p>
          )}
          {reading && !reading.withinAccuracy && (
            <div className="border-t border-hairline px-5 py-5">
              <Dial bearingDeg={reading.bearingDeg} heading={compass.heading} />
              <p className="mt-4 text-[14px] leading-snug text-mist">
                {STRAIGHT_LINE} {NOT_A_HEADING}
              </p>
            </div>
          )}
        </section>
      )}

      <Compass state={compass} />

      <section className="mt-10" aria-labelledby="track-heading">
        <SectionLabel as="h2" id="track-heading" className="px-5 pb-2">
          What is saved of this walk
        </SectionLabel>
        <Row className="text-[17px] text-snow">
          <span>Points</span>
          <span className="tabular-nums">{shape.points}</span>
        </Row>
        <Row className="text-[17px] text-snow">
          <span>Breaks in the track</span>
          <span className="tabular-nums">{shape.gaps}</span>
        </Row>
        {shape.first && (
          <Row className="text-[17px] text-snow">
            <span>Saved over</span>
            <span className="tabular-nums">{durationLabel(shape.spanMs)}</span>
          </Row>
        )}
        {shape.walkedM > 0 && (
          <Row className="items-start py-3 text-[17px] text-snow">
            <span>
              Along the track
              <span className="mt-1 block text-[14px] text-mist">at least — the breaks are not counted</span>
            </span>
            <span className="tabular-nums">{distanceLabel(shape.walkedM)}</span>
          </Row>
        )}
        {shape.last && (
          <p className="border-t border-hairline px-5 py-3 text-[15px] leading-snug text-mist">
            Last saved {ageLabel(now - shape.last.t)} · {fullDateTime(shape.last.t)}
          </p>
        )}
        {camps.length === 0 && (
          <p className="border-t border-hairline px-5 py-3 text-[15px] leading-snug text-mist">
            ICEFALL holds no camps or huts for this trip, so it can only point you back to where the track started.
          </p>
        )}
        {camps.length > 0 && !passed && (
          <p className="border-t border-hairline px-5 py-3 text-[15px] leading-snug text-mist">
            Your track has not been at a recorded camp, so none is offered to walk back to.
          </p>
        )}
      </section>

      <div className="mt-10 px-5">
        <BigButton variant={watching ? "azure-outline" : "azure"} onClick={() => setWatching((w) => !w)}>
          {watching ? "Stop GPS" : "Find my position"}
        </BigButton>
        <p className="mt-2 text-[14px] leading-snug text-mist">
          {live.status === "denied"
            ? "This phone is not letting ICEFALL use your position."
            : "GPS stops when you lock the phone or leave ICEFALL. The track has gaps wherever that happened."}
        </p>
      </div>
    </div>
  );
}

/**
 * North is at the top and stays there. The long arrow is the bearing to the
 * target; the short mark, when there is one, is where the phone is pointing.
 * No animation: the screen is being read in the cold, and reduced motion is the
 * house default.
 */
function Dial({ bearingDeg, heading }: { bearingDeg: number; heading: CompassHeading | null }) {
  // North is up, so a direction of X degrees is drawn X degrees round the dial.
  const phone = heading ? heading.headingDeg : null;
  return (
    <svg
      viewBox="0 0 200 200"
      className="mx-auto block h-44 w-44"
      role="img"
      aria-label={`Bearing ${bearingDeg} degrees, north at the top`}
    >
      <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="1" className="text-hairline" />
      <text x="100" y="22" textAnchor="middle" className="fill-current text-mist" fontSize="16">
        N
      </text>
      {phone !== null && (
        <g transform={`rotate(${phone} 100 100)`}>
          <line x1="100" y1="100" x2="100" y2="24" stroke="currentColor" strokeWidth="2" className="text-mist-dim" />
        </g>
      )}
      <g transform={`rotate(${bearingDeg} 100 100)`}>
        <line
          x1="100"
          y1="118"
          x2="100"
          y2="46"
          stroke="currentColor"
          strokeWidth="8"
          className="text-snow"
          strokeLinecap="round"
        />
        <path d="M100 26 L118 58 L82 58 Z" className="fill-current text-snow" />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* The phone's compass                                                         */
/* -------------------------------------------------------------------------- */

type CompassState = "unsupported" | "needs-permission" | "denied" | "listening" | "no-reading" | "reading";

interface UseCompass {
  state: CompassState;
  heading: CompassHeading | null;
  ask: () => void;
}

interface OrientationCtor {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
}

/**
 * iOS — and now Android too — will not give a heading without a user gesture,
 * so this never asks on its own. `ask` is wired to a button.
 */
function useCompass(): UseCompass {
  const [state, setState] = useState<CompassState>(() =>
    typeof window === "undefined" || typeof window.DeviceOrientationEvent === "undefined"
      ? "unsupported"
      : "needs-permission",
  );
  const [heading, setHeading] = useState<CompassHeading | null>(null);
  const [on, setOn] = useState(false);
  const gotOne = useRef(false);

  useEffect(() => {
    if (!on || typeof window === "undefined") return;
    const handle = (e: Event) => {
      const h = headingFromOrientation(e as DeviceOrientationEvent);
      if (!h) return;
      gotOne.current = true;
      setHeading((prev) => (prev && Math.round(prev.headingDeg) === Math.round(h.headingDeg) ? prev : h));
      setState("reading");
    };
    const absolute = "ondeviceorientationabsolute" in window;
    const name = absolute ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(name, handle as EventListener);
    // A phone with no magnetometer fires nothing at all, or fires without an
    // absolute heading. Either way the screen must say so rather than wait.
    const t = setTimeout(() => {
      if (!gotOne.current) setState("no-reading");
    }, 3000);
    return () => {
      clearTimeout(t);
      window.removeEventListener(name, handle as EventListener);
    };
  }, [on]);

  const ask = () => {
    if (typeof window === "undefined" || typeof window.DeviceOrientationEvent === "undefined") {
      setState("unsupported");
      return;
    }
    const ctor = window.DeviceOrientationEvent as unknown as OrientationCtor;
    if (typeof ctor.requestPermission === "function") {
      void ctor
        .requestPermission()
        .then((answer) => {
          if (answer === "granted") {
            setOn(true);
            setState("listening");
          } else {
            setState("denied");
          }
        })
        .catch(() => setState("denied"));
      return;
    }
    setOn(true);
    setState("listening");
  };

  return { state, heading, ask };
}

function Compass({ state }: { state: UseCompass }) {
  const sentence =
    state.state === "unsupported"
      ? "This phone's browser has no compass."
      : state.state === "denied"
        ? "You said no to the compass. Your phone's settings can change that."
        : state.state === "no-reading"
          ? "This phone did not give a compass reading. The bearing above is from the map."
          : null;

  return (
    <section className="mt-10" aria-labelledby="compass-heading">
      <SectionLabel as="h2" id="compass-heading" className="px-5 pb-2">
        Compass
      </SectionLabel>
      {state.state === "needs-permission" && (
        <div className="border-t border-hairline px-5 py-4">
          <BigButton variant="azure-outline" onClick={state.ask}>
            Use my phone&rsquo;s compass
          </BigButton>
          <p className="mt-2 text-[14px] leading-snug text-mist">
            Your phone asks first, and it only asks when you tap.
          </p>
        </div>
      )}
      {state.state === "listening" && <Row className="text-[17px] text-mist">Waiting for a reading…</Row>}
      {state.heading && state.state === "reading" && (
        <>
          <Row className="text-[17px] text-snow">
            <span>Phone is pointing</span>
            <span className="text-[28px] tabular-nums">{Math.round(state.heading.headingDeg)}°</span>
          </Row>
          <p className="border-t border-hairline px-5 py-3 text-[14px] leading-snug text-mist">
            {HEADING_NORTH_UNKNOWN}
          </p>
        </>
      )}
      {sentence && (
        <p className="border-t border-hairline px-5 py-3 text-[17px] leading-snug text-snow">{sentence}</p>
      )}
    </section>
  );
}
