import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { MiniMap } from "@/components/domain/MiniMap";
import { AnalysisChart, SeriesTabs, formatValue } from "@/components/domain/AnalysisChart";
import { useActivityById } from "@/tracking/feed";
import { fmtDistance, fmtElevation } from "@/lib/format";
import {
  SPLIT_MODE_LABEL, availableSeries, climbsFor, defaultSplitMode, pointAtDistance, seriesFor,
  splitsFor, type SeriesKind, type SplitMode,
} from "@/tracking/analysis";
import { cn } from "@/lib/utils";

/**
 * ANALYSIS — the charts, the splits and the climbs, sharing one cursor.
 *
 * The cursor is the whole idea: drag the elevation line to 8.4 km and the map
 * marker, the readout and every other series move to 8.4 km with it. One piece
 * of state (`cursorM`) owned here and handed down, rather than each chart
 * keeping its own idea of where you are pointing.
 *
 * Splits adapt to the discipline — a mountaineering day is cut by VERTICAL
 * metres because its kilometres are not comparable to each other, and a run is
 * cut by kilometre. Sections are the climbs the track actually contains, named
 * by what they are rather than invented as "Trailhead → Refuge".
 */
export default function ActivityAnalysis() {
  const { id } = useParams<{ id: string }>();
  const { activity, recorded } = useActivityById(id);

  const [kind, setKind] = useState<SeriesKind>("elevation");
  const [cursorM, setCursorM] = useState<number | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode | null>(null);

  const available = useMemo(() => (recorded ? availableSeries(recorded) : []), [recorded]);
  const series = useMemo(
    () => (recorded ? seriesFor(recorded, available.includes(kind) ? kind : available[0]) : []),
    [recorded, kind, available],
  );
  const climbs = useMemo(() => (recorded ? climbsFor(recorded) : []), [recorded]);
  const mode = splitMode ?? (recorded ? defaultSplitMode(recorded) : "1km");
  const splits = useMemo(() => (recorded ? splitsFor(recorded, mode) : []), [recorded, mode]);

  if (activity === undefined) return null;
  if (!id) return <Navigate to="/activity" replace />;

  if (!recorded || recorded.points.length < 2) {
    return (
      <Screen padded={false}>
        <div className="px-5">
          <ScreenHeader title="Analysis" back={`/activity/${id}`} />
        </div>
        <div className="px-5">
          <p className="text-[13px] leading-relaxed text-mist">
            This activity has no GPS track, so there is nothing to analyse. Charts, splits and
            climbs all come from recorded position data.
          </p>
        </div>
      </Screen>
    );
  }

  const at = cursorM !== null ? pointAtDistance(recorded, cursorM) : null;
  const activeKind = available.includes(kind) ? kind : available[0];
  const hhmm = (s: number) =>
    `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(
      Math.floor(s % 60),
    ).padStart(2, "0")}`;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title="Analysis" subtitle={recorded.title} back={`/activity/${id}`} />
      </div>

      <Stagger className="px-5 pb-8">
        {recorded.simulated && (
          <Rise>
            <div className="rounded-tile border border-alert/45 bg-alert/[0.08] px-3.5 py-2.5">
              <p className="text-[12px] text-alert">
                Simulated activity — these charts describe a generated track, and it counts towards
                nothing.
              </p>
            </div>
          </Rise>
        )}

        {/* ---- Map, following the cursor ---------------------------------- */}
        <Rise className={recorded.simulated ? "pt-3" : ""}>
          <div className="overflow-hidden rounded-card border border-hairline">
            <MiniMap
              lat={at?.lat ?? recorded.points[0].lat}
              lon={at?.lon ?? recorded.points[0].lon}
              zoom={at ? 14 : 12}
              className="h-[190px] w-full"
            />
          </div>
          {at && (
            <div className="tnum mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-mist">
              <span>
                <span className="text-snow">{fmtDistance(at.distanceM / 1000, 2)}</span> km
              </span>
              {at.altitudeSmoothed !== null && (
                <span>
                  <span className="text-snow">{fmtElevation(at.altitudeSmoothed)}</span> m
                </span>
              )}
              <span>
                <span className="text-snow">
                  {hhmm((at.t - recorded.points[0].t) / 1000)}
                </span>
              </span>
            </div>
          )}
        </Rise>

        {/* ---- Chart ------------------------------------------------------- */}
        {available.length > 0 ? (
          <>
            <Rise className="pt-5">
              <SeriesTabs available={available} value={activeKind} onChange={setKind} />
            </Rise>
            <Rise className="pt-3">
              <AnalysisChart
                series={series}
                kind={activeKind}
                cursorDistanceM={cursorM}
                onCursor={setCursorM}
              />
              <p className="mt-2 text-[10.5px] leading-relaxed text-mist-dim">
                Drag across the chart — the map and the figures above move with you.
              </p>
            </Rise>
          </>
        ) : (
          <Rise className="pt-5">
            <p className="text-[12.5px] leading-relaxed text-mist-dim">
              No series can be drawn from this recording.
            </p>
          </Rise>
        )}

        {/*
          HEART RATE — WHAT IS TRUE OF THIS RECORDING, NOT A BLANKET DENIAL.

          This line read "ICEFALL has no heart-rate pairing, so nothing was read
          from a strap or a watch" — on every activity, in every build,
          including one recorded with a paired strap. It is false:
          `tracking/sources/heartRate.ts` is a working Web Bluetooth heart-rate
          source, `recorder.pushHeartRate` takes its samples, and
          `RecordedActivity.avgHeartRateBpm` is the average it produced.
          Denying a feature that ships is the same class of error as claiming
          one that does not, and it is read by someone deciding whether a strap
          is worth buying.

          What is genuinely missing is the PER-POINT store: the recorder keeps a
          running average and the split averages and writes no reading onto each
          track point, so `seriesFor(…, "heartRate")` has nothing to plot even
          when a monitor was connected the whole way. That is the sentence
          below; the wiring that would draw a real trace is its own piece of
          work (`tracking/recorder.ts`, `tracking/types.ts`).
        */}
        {!available.includes("heartRate") && (
          <Rise className="pt-3">
            <p className="text-[11.5px] leading-relaxed text-mist-dim">
              {recorded.avgHeartRateBpm !== null
                ? `Heart rate — a monitor was connected and averaged ${Math.round(
                    recorded.avgHeartRateBpm,
                  )} bpm over this activity. ICEFALL does not yet store a reading against each point of the track, so there is no trace to draw here.`
                : "Heart rate — none recorded. ICEFALL pairs a Bluetooth heart-rate strap, and none was connected for this activity."}
            </p>
          </Rise>
        )}

        {/* ---- Splits ------------------------------------------------------ */}
        {splits.length > 0 && (
          <>
            <Rise className="pt-7">
              <div className="flex items-baseline justify-between gap-3">
                <SectionLabel>Splits</SectionLabel>
                <div className="flex gap-1.5">
                  {(["1km", "5km", "vertical100", "vertical500"] as SplitMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSplitMode(m)}
                      className={cn(
                        "rounded-pill border px-2.5 py-1 text-[10.5px] transition-colors",
                        mode === m
                          ? "border-azure/55 bg-azure/[0.12] text-azure"
                          : "border-hairline-strong text-mist-dim hover:text-snow",
                      )}
                    >
                      {SPLIT_MODE_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
            </Rise>
            <Rise className="pt-3">
              <div className="overflow-hidden rounded-card border border-hairline bg-graphite">
                <div className="flex items-center gap-3 border-b border-hairline px-4 py-2.5 text-[10px] uppercase tracking-[0.1em] text-mist-dim">
                  <span className="flex-1">Split</span>
                  <span className="w-16 text-right">Climb</span>
                  <span className="w-16 text-right">Time</span>
                  <span className="w-16 text-right">Pace</span>
                </div>
                {splits.map((s, i) => (
                  <div
                    key={`${s.label}-${i}`}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 text-[12.5px]",
                      i > 0 && "border-t border-hairline",
                    )}
                  >
                    <span className="flex-1 text-snow">{s.label}</span>
                    <span className="tnum w-16 text-right text-mist">
                      +{fmtElevation(s.elevationGainM)}
                    </span>
                    <span className="tnum w-16 text-right text-mist">{hhmm(s.durationSec)}</span>
                    <span className="tnum w-16 text-right text-mist-dim">
                      {s.paceSecPerKm ? `${formatValue(s.paceSecPerKm, "pace")}` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </Rise>
          </>
        )}

        {/* ---- Climbs ------------------------------------------------------ */}
        {climbs.length > 0 && (
          <>
            <Rise className="pt-7">
              <SectionLabel>Climbs on this route</SectionLabel>
              <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
                Sustained rises of 80 m or more, found in the track. ICEFALL does not know the names
                of the features you passed, so it does not invent them.
              </p>
            </Rise>
            <Rise className="pt-3">
              <div className="space-y-2">
                {climbs.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCursorM(c.startDistanceM)}
                    className="flex w-full items-center gap-3 rounded-tile border border-hairline bg-graphite px-3.5 py-3 text-left transition-colors hover:border-azure/40"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-azure/40 text-[11px] text-azure">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="tnum block text-[13.5px] text-snow">
                        +{fmtElevation(c.gainM)} m · {c.gradientPct}%
                      </span>
                      <span className="tnum mt-0.5 block text-[11px] text-mist-dim">
                        {fmtDistance(c.startDistanceM / 1000, 1)}–
                        {fmtDistance(c.endDistanceM / 1000, 1)} km · {hhmm(c.durationSec)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </Rise>
          </>
        )}

        <Rise className="pt-6">
          <Disclaimer>
            Elevation gain is an estimate from the device's barometer and GPS, not a survey. Pace is
            omitted below walking speed, where the reciprocal of a near-zero speed means nothing.
          </Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}
