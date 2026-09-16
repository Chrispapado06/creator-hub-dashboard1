/**
 * MAP (brief M5, plan §3.3, §4.6; mockup spec §6).
 *
 * THE SHAPE, from the owner's mockup: the plot is the whole top of the screen,
 * with its captions in its own bottom-left corner and a numbered scale bar in
 * its bottom-right, and two buttons under it — filled azure RETRACE MY ROUTE
 * and outlined CENTRE ON ME. Everything else on the tab is a quiet flat row
 * beneath that. One hero, then rows.
 *
 * WHAT IS DRAWN, AND WHY IT IS NOT A MAP. No tile service the app uses permits
 * an area to be saved (plan §4.2): OpenFreeMap needs written permission,
 * OpenStreetMap's policy forbids offline use by name, Mapbox forbids the bulk
 * download that would fill its own cache, Esri forbids export, OpenTopoMap asks
 * us not to. The compliant answer — map packs cut from OpenStreetMap data and
 * served from ICEFALL's own site — is not built, so this ships the plan's §4.6
 * interim: a plot of what this phone genuinely holds, on no basemap at all,
 * saying so. The mockup's dark terrain is the one thing on it we may not draw,
 * so the caption slot says "No map saved" rather than carrying a picture that
 * would be the wrong mountain. "Map saved 2 days ago" is printed only over a
 * real saved pack.
 *
 * This is deliberately not Mapbox. Mapbox bills per map opening, and a tab
 * somebody switches to forty times a day is not the place for it (plan §4.5).
 *
 * Everything here works in airplane mode: the plot is arithmetic, the places
 * ship inside the app file, the breadcrumbs and pins are on this phone.
 */

import { useState } from "react";
import { Route, Routes } from "react-router-dom";

import { NO_CAMPS_RECORDED, NO_CAMPS_ON_ROUTE, OSM_ATTRIBUTION } from "@/data/mountainCamps";
import { cn } from "@/lib/utils";

import RetraceScreen from "./RetraceScreen";
import { ageLabel } from "./format";
import {
  FINDING_SATELLITES,
  NOT_A_HEADING,
  NO_ROUTE_LINE,
  STRAIGHT_LINE,
  distanceLabel,
} from "./mapModel";
import { SketchMap } from "./map/SketchMap";
import {
  NO_HAZARD_GEOMETRY,
  PIN_LABELS,
  PIN_NEEDS_FIX,
  PIN_OLD_SENTENCE,
  pinAddedLine,
  pinIsOld,
} from "./map/pins";
import { MAP_LICENCE_LINE, MAP_SOURCE_LICENCES, PLACE_SOURCE_LINE } from "./map/savedMap";
import { NORTH_IS_UP, NO_BASEMAP } from "./map/plot";
import { useMapPlot, useNow } from "./map/useMapPlot";
import { positionFreshness, useLivePosition, type KnownPosition } from "./position";
import { accuracyLabel, formatDecimal, fullDateTime, metresLabel } from "./sos";
import { BigButton, Row, SectionLabel, buttonClass } from "./ui";

const PLOT_EMPTY = "Nothing to plot yet. Find your position, or open a trip with recorded huts.";

/**
 * The mockup's two side-by-side controls. A shade smaller and tighter than the
 * shared `sm` button so `RETRACE MY ROUTE` reads on one line at 375 px — the
 * 64 px tap height is untouched.
 */
const PAIR_BUTTON = "w-full px-2 text-[12px] tracking-[0.06em]";

/** `map/*` in `App.tsx`, so retrace is a child here rather than a second lazy chunk. */
export default function MapTab() {
  return (
    <Routes>
      <Route index element={<MapScreen />} />
      <Route path="retrace" element={<RetraceScreen />} />
      <Route path="*" element={<MapScreen />} />
    </Routes>
  );
}

function MapScreen() {
  const now = useNow(1000);
  const plot = useMapPlot(now);
  const [watching, setWatching] = useState(false);
  const live = useLivePosition(watching);
  const [licenceOpen, setLicenceOpen] = useState(false);

  const { trip, mountain, places, readings, campRecord, campsOld, savedMap, pinStore } = plot;
  const pins = plot.pins;
  const canPin = Boolean(trip && plot.last && (plot.freshness === "fresh" || plot.freshness === "aged"));

  return (
    <div className="pb-10">
      <SketchMap
        view={plot.view}
        onView={plot.setView}
        onSize={plot.onSize}
        places={plot.plotPlaces}
        pins={pins}
        runs={plot.runs}
        fix={plot.plotFix}
        fixGreyed={plot.freshness === "stale"}
        routeLine={null}
        savedCaption={plot.caption}
        onFitAll={plot.hasPlot ? plot.fitAll : undefined}
        emptyLine={PLOT_EMPTY}
      />

      {/* The mockup's two controls. Retrace stays reachable with nothing
          recorded: the screen it opens is the one that explains why. */}
      <div className="grid grid-cols-2 gap-3 px-5 pt-4">
        <BigButton variant="azure" size="sm" className={PAIR_BUTTON} to="retrace">
          Retrace my route
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
      {!plot.canCentre && (
        <p className="px-5 pt-2 text-[14px] leading-snug text-mist">
          Centre on me needs a position. Find one below.
        </p>
      )}

      <p className="px-5 pt-4 text-[15px] leading-snug text-mist">
        {savedMap.state.kind === "saved" ? savedMap.state.line : savedMap.state.sentence}
      </p>
      <p className="px-5 pt-2 text-[14px] leading-snug text-mist-dim">
        {NO_BASEMAP} {NORTH_IS_UP}{" "}
        {plot.freshness === "silent" &&
          "Your position is too old to draw. It is on the SOS screen with its time."}
      </p>

      <section className="mt-8" aria-labelledby="position-heading">
        <SectionLabel as="h2" id="position-heading" className="px-5 pb-2">
          Your position
        </SectionLabel>
        <PositionBlock pos={plot.last} now={now} />
        <LiveStatus status={live.status} startedAt={live.startedAt} now={now} />
        <div className="border-t border-hairline px-5 py-4">
          <BigButton
            variant={watching ? "azure-outline" : "azure"}
            onClick={() => setWatching((w) => !w)}
          >
            {watching ? "Stop GPS" : "Find my position"}
          </BigButton>
          {watching && (
            <p className="mt-2 text-[14px] leading-snug text-mist">
              GPS stops when you lock the phone or leave ICEFALL.
            </p>
          )}
        </div>
      </section>

      {trip && (
        <section className="mt-10" aria-labelledby="places-heading">
          <SectionLabel as="h2" id="places-heading" className="px-5 pb-2">
            {mountain ? `On ${mountain.name}` : "Places"}
          </SectionLabel>

          {places.length === 0 ? (
            <Row className="text-[17px] text-mist">ICEFALL holds no coordinates for this trip.</Row>
          ) : (
            <>
              {readings.kind === "withheld" && (
                <p className="border-t border-hairline px-5 py-3 text-[17px] leading-snug text-snow">
                  {readings.sentence}
                </p>
              )}
              {readings.kind === "none" && (
                <p className="px-5 pb-3 text-[15px] leading-snug text-mist">
                  Find your position to see how far these are.
                </p>
              )}
              <ul>
                {places.map((p, i) => {
                  const r = readings.kind === "readings" ? readings.readings[i] : null;
                  const isCamp = p.kind !== "Summit";
                  const old = isCamp && campsOld;
                  return (
                    <li key={`${p.name}-${i}`}>
                      <Row className="items-start py-3">
                        <span className="min-w-0">
                          <span className={cn("block text-[19px] leading-snug", old ? "text-mist" : "text-snow")}>
                            {p.name}
                          </span>
                          <span className="mt-1 block text-[15px] text-mist">
                            {p.kind}
                            {p.elevationM !== null && (
                              <span className="tabular-nums"> · {metresLabel(p.elevationM)}</span>
                            )}
                          </span>
                          <span className="mt-1 block text-[14px] tabular-nums text-mist-dim">
                            {formatDecimal(p.lat, "lat")}, {formatDecimal(p.lon, "lon")}
                          </span>
                        </span>
                        {r && r.withinAccuracy && (
                          <span className="shrink-0 text-right text-[17px] leading-snug text-snow">
                            Here
                            <span className="block text-[15px] text-mist">within GPS error</span>
                          </span>
                        )}
                        {r && !r.withinAccuracy && (
                          <span className="shrink-0 text-right">
                            <span className="block text-[28px] leading-tight tabular-nums text-snow">
                              {distanceLabel(r.distanceM)}
                            </span>
                            <span className="block text-[17px] tabular-nums text-mist">
                              {r.point} · {r.bearingDeg}°
                            </span>
                          </span>
                        )}
                      </Row>
                    </li>
                  );
                })}
              </ul>
              {readings.kind === "readings" && (
                <p className="border-t border-hairline px-5 pt-3 text-[14px] leading-snug text-mist">
                  {STRAIGHT_LINE} {NOT_A_HEADING}
                </p>
              )}
            </>
          )}

          {campRecord === null && trip.mountainId && (
            <p className="border-t border-hairline px-5 pt-3 text-[14px] leading-snug text-mist">{NO_CAMPS_RECORDED}</p>
          )}
          {campRecord && campRecord.camps.length === 0 && (
            <p className="border-t border-hairline px-5 pt-3 text-[14px] leading-snug text-mist">{NO_CAMPS_ON_ROUTE}</p>
          )}
          {campRecord && campRecord.camps.length > 0 && (
            <p className="px-5 pt-2 text-[14px] leading-snug text-mist-dim">
              {campsOld && "Hut data is over a year old. "}
              {OSM_ATTRIBUTION}
            </p>
          )}
          {trip.routeName && <p className="px-5 pt-2 text-[14px] leading-snug text-mist-dim">{NO_ROUTE_LINE}</p>}
        </section>
      )}

      {trip && (
        <section className="mt-10" aria-labelledby="pins-heading">
          <SectionLabel as="h2" id="pins-heading" className="px-5 pb-2">
            Pins you added
          </SectionLabel>
          <p className="px-5 pb-3 text-[15px] leading-snug text-mist">{NO_HAZARD_GEOMETRY}</p>

          {pins.length === 0 && <Row className="text-[17px] text-mist">No pins on this trip.</Row>}
          <ul>
            {pins.map((pin) => {
              const old = pinIsOld(pin, now);
              return (
                <li key={pin.id}>
                  <Row className="items-start py-3">
                    <span className="min-w-0">
                      <span className="block text-[19px] leading-snug text-alert">{pin.label}</span>
                      <span className="mt-1 block text-[15px] text-mist">{pinAddedLine(pin, now)}</span>
                      <span className="mt-1 block text-[14px] tabular-nums text-mist-dim">
                        {formatDecimal(pin.lat, "lat")}, {formatDecimal(pin.lon, "lon")} · {fullDateTime(pin.addedAt)}
                      </span>
                      {old && <span className="mt-1 block text-[14px] leading-snug text-mist">{PIN_OLD_SENTENCE}</span>}
                    </span>
                  </Row>
                  <button
                    type="button"
                    onClick={() => void pinStore.remove(pin.id)}
                    className="min-h-16 w-full px-5 text-left text-[17px] text-mist"
                  >
                    Remove this pin
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-hairline px-5 pt-4">
            <p className="text-[15px] leading-snug text-mist">
              {canPin ? "Drop a pin where you are standing." : PIN_NEEDS_FIX}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {PIN_LABELS.map((label) => (
                <button
                  key={label}
                  type="button"
                  disabled={!canPin}
                  onClick={() => {
                    if (plot.last)
                      void pinStore.add(
                        { lat: plot.last.lat, lon: plot.last.lon, accuracyM: plot.last.accuracyM },
                        label,
                      );
                  }}
                  className={cn(buttonClass("amber-outline", "sm"), !canPin && "opacity-45")}
                >
                  {label}
                </button>
              ))}
            </div>
            {!pinStore.storageOk && (
              <p className="mt-3 text-[15px] leading-snug text-alert">
                This phone would not keep the pin. It is on the screen until you close ICEFALL, and no longer.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="mt-10" aria-labelledby="licence-heading">
        <SectionLabel as="h2" id="licence-heading" className="px-5 pb-2">
          Where this comes from
        </SectionLabel>
        <p className="border-t border-hairline px-5 py-3 text-[15px] leading-snug text-mist">{MAP_LICENCE_LINE}</p>
        {savedMap.state.kind === "none" && (
          <p className="px-5 pb-3 text-[15px] leading-snug text-mist">{savedMap.state.licence}</p>
        )}
        <p className="px-5 pb-3 text-[15px] leading-snug text-mist">{PLACE_SOURCE_LINE}</p>
        {savedMap.state.kind === "saved" && savedMap.state.sourceNote && (
          <p className="px-5 pb-3 text-[14px] leading-snug text-mist-dim">{savedMap.state.sourceNote}</p>
        )}
        {!savedMap.storageOk && savedMap.storageSentence && (
          <p className="px-5 pb-3 text-[15px] leading-snug text-alert">{savedMap.storageSentence}</p>
        )}
        <Row onClick={() => setLicenceOpen((o) => !o)} className="text-[17px] text-snow">
          {licenceOpen ? "Hide what each map service allows" : "What each map service allows"}
        </Row>
        {licenceOpen && (
          <ul>
            {MAP_SOURCE_LICENCES.map((s) => (
              <li key={s.source} className="border-t border-hairline px-5 py-3">
                <p className="text-[17px] leading-snug text-snow">{s.source}</p>
                <p className="mt-1 text-[15px] leading-snug text-mist">{s.usedFor}</p>
                <p className="mt-1 text-[15px] leading-snug text-mist">{s.position}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Plan §3.0 position rule: fresh plain, aged with its age, stale greyed, silent withheld. */
function PositionBlock({ pos, now }: { pos: KnownPosition | null; now: number }) {
  if (!pos) {
    return <Row className="text-[17px] text-mist">No position yet.</Row>;
  }
  const freshness = positionFreshness(pos, now);
  const age = ageLabel(now - pos.at);

  if (freshness === "silent") {
    return (
      <div className="border-t border-hairline px-5 py-3">
        <p className="text-[17px] leading-snug text-mist">
          Your last position is {age.replace(/ ago$/, "")} old, so it is not shown as where you are. It is on the SOS
          screen with its time.
        </p>
      </div>
    );
  }

  const stale = freshness === "stale";
  const accuracy = accuracyLabel(pos.accuracyM);
  const altAccuracy = accuracyLabel(pos.altitudeAccuracyM);

  return (
    <div className="border-t border-hairline px-5 py-3">
      <p className={cn("text-[32px] font-light leading-tight tabular-nums", stale ? "text-mist-dim" : "text-snow")}>
        {formatDecimal(pos.lat, "lat")}
        <br />
        {formatDecimal(pos.lon, "lon")}
      </p>
      <p className={cn("mt-2 text-[17px] tabular-nums", stale ? "text-mist-dim" : "text-mist")}>
        {accuracy ? `${accuracy} · ` : ""}
        {pos.altitudeM !== null
          ? `${metresLabel(pos.altitudeM)}${altAccuracy ? ` ${altAccuracy}` : ""} · GPS`
          : "No altitude in this fix"}
      </p>
      <p className={cn("mt-1 text-[15px]", stale ? "font-semibold text-alert" : "text-mist")}>
        {stale ? `Old position · ${age} · ${fullDateTime(pos.at)}` : freshness === "aged" ? age : "Now"}
      </p>
    </div>
  );
}

function LiveStatus({
  status,
  startedAt,
  now,
}: {
  status: ReturnType<typeof useLivePosition>["status"];
  startedAt: number | null;
  now: number;
}) {
  if (status === "off" || status === "live") return null;
  const text =
    status === "searching"
      ? `${FINDING_SATELLITES} ${Math.max(0, Math.round((now - (startedAt ?? now)) / 1000))} s so far.`
      : status === "denied"
        ? "Location is turned off for ICEFALL. Allow it in your phone's settings."
        : status === "unsupported"
          ? "This phone's browser gives ICEFALL no GPS."
          : "GPS could not get a fix. Try again in the open, away from walls and faces.";
  return <p className="border-t border-hairline px-5 py-3 text-[15px] leading-snug text-mist">{text}</p>;
}
