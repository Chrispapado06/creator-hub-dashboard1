/**
 * EVERYTHING THE MAP SURFACE NEEDS, gathered once (mockup spec §6).
 *
 * The Map tab and the retrace state draw the same plot — the same places, the
 * same pins, the same track, the same fix — so they read it through one hook
 * rather than two copies that can drift apart. This file decides nothing new:
 * it assembles what `mapModel`, `map/pins`, `map/savedMap`, `breadcrumbs`,
 * `geo` and `position` already work out, and hands the view arithmetic in
 * `map/plot` a box to fit into.
 *
 * Nothing here fetches. Every input is on this phone.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { mountainById } from "@/data/mock/mountains";
import { CAMP_KIND_LABEL, HARVEST_DATE, campsFor } from "@/data/mountainCamps";

import { useTrackCrumbs } from "../breadcrumbs";
import { trackShape, type TrackShape } from "../geo";
import { campsAreOld, placeReadings, type Place } from "../mapModel";
import {
  positionFreshness,
  useLastKnownPosition,
  type KnownPosition,
  type PositionFreshness,
} from "../position";
import { metresLabel } from "../sos";
import { useMountainTrip } from "../trip";
import { useMapPins, type MapPin, type UseMapPins } from "./pins";
import {
  MAX_METRES_PER_PIXEL,
  centreView,
  fitView,
  resizeView,
  type PlotPoint,
  type PlotView,
} from "./plot";
import { mapCaption, useSavedMap, type UseSavedMap } from "./savedMap";
import type { PlotPlace } from "./SketchMap";

/** A clock that also catches up when the phone comes back from a locked screen. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs]);
  return now;
}

/** One saved breadcrumb, as `useTrackCrumbs` hands them over. */
type Crumb = ReturnType<typeof useTrackCrumbs>["crumbs"][number];

export interface MapPlot {
  trip: ReturnType<typeof useMountainTrip>["trip"];
  mountain: ReturnType<typeof mountainById>;
  /** The summit and the recorded camps, with their real coordinates. */
  places: Place[];
  campRecord: ReturnType<typeof campsFor>;
  campsOld: boolean;
  plotPlaces: PlotPlace[];
  pins: MapPin[];
  pinStore: UseMapPins;
  crumbs: Crumb[];
  shape: TrackShape<Crumb>;
  runs: PlotPoint[][];
  last: KnownPosition | null;
  freshness: PositionFreshness | null;
  /** The fix as the plot may draw it — null once it is too old to be "here". */
  plotFix: { lat: number; lon: number; accuracyM: number | null } | null;
  readings: ReturnType<typeof placeReadings>;
  savedMap: UseSavedMap;
  caption: string;
  view: PlotView | null;
  setView: (v: PlotView) => void;
  onSize: (w: number, h: number) => void;
  fitAll: () => void;
  centreOnMe: () => void;
  canCentre: boolean;
  /** Something real to draw. False keeps the honest empty line in the box. */
  hasPlot: boolean;
}

export function useMapPlot(now: number): MapPlot {
  const { trip, today } = useMountainTrip();
  const last = useLastKnownPosition();
  const { crumbs } = useTrackCrumbs();
  const pinStore = useMapPins(trip?.id ?? null);
  const savedMap = useSavedMap(trip?.id ?? null);

  const mountain = trip?.mountainId ? mountainById(trip.mountainId) : undefined;
  const campRecord = campsFor(trip?.mountainId ?? undefined);
  const campsOld = campsAreOld(HARVEST_DATE, today);

  const places = useMemo<Place[]>(() => {
    const list: Place[] = [];
    if (trip?.summit) {
      list.push({
        name: trip.peakName ?? "Summit",
        lat: trip.summit.lat,
        lon: trip.summit.lon,
        elevationM: trip.peakElevationM,
        kind: "Summit",
      });
    }
    for (const c of campRecord?.camps ?? []) {
      list.push({ name: c.name, lat: c.lat, lon: c.lon, elevationM: c.elevationM, kind: CAMP_KIND_LABEL[c.kind] });
    }
    return list;
  }, [trip, campRecord]);

  const readings = placeReadings(places, last, now);
  const freshness = last ? positionFreshness(last, now) : null;
  /* Past an hour the position is not drawn at all: a dot is read as "here", and
     an hour-old dot is a claim about where somebody is standing (plan §3.0). */
  const plotFix = useMemo(
    () => (last && freshness !== "silent" ? { lat: last.lat, lon: last.lon, accuracyM: last.accuracyM } : null),
    [last, freshness],
  );

  const shape = useMemo(() => trackShape(crumbs), [crumbs]);
  const runs = useMemo<PlotPoint[][]>(
    () => shape.segments.map((seg) => seg.map((c) => ({ lat: c.lat, lon: c.lon }))),
    [shape],
  );

  /* The altitude beside the name is the record's own, and absent where the
     record holds none — the mockup's "Mont Blanc 4,806 m" is an example of the
     shape, not a number to reach for. */
  const plotPlaces = useMemo<PlotPlace[]>(
    () =>
      places.map((p) => ({
        lat: p.lat,
        lon: p.lon,
        name: p.name,
        elevationLabel: p.elevationM === null ? null : metresLabel(p.elevationM),
        kind: p.kind === "Summit" ? "summit" : "camp",
        greyed: p.kind !== "Summit" && campsOld,
      })),
    [places, campsOld],
  );

  const pins = pinStore.pins;

  /* The mountain: the recorded places, the track and the pins. */
  const onTheHill = useMemo<PlotPoint[]>(() => {
    const all: PlotPoint[] = plotPlaces.map((p) => ({ lat: p.lat, lon: p.lon }));
    for (const run of runs) for (const p of run) all.push(p);
    for (const pin of pins) all.push({ lat: pin.lat, lon: pin.lon });
    return all;
  }, [plotPlaces, runs, pins]);

  const everything = useMemo<PlotPoint[]>(
    () => (plotFix ? [...onTheHill, { lat: plotFix.lat, lon: plotFix.lon }] : onTheHill),
    [onTheHill, plotFix],
  );

  /*
   * Fitting everything INCLUDING the fix is right on the mountain and wrong at
   * home: a phone a continent away from the trip pushes the fit past the
   * zoom-out ceiling, and the plot then holds nothing at all — a black box that
   * reads as broken. So when that happens the fit falls back to the mountain,
   * and the fix keeps its honest "off this plot" line with Centre on me beside
   * it. Nothing is hidden; the drawing is just put where something is.
   */
  const fitBest = useCallback(
    (w: number, h: number): PlotView | null => {
      /* The padding keeps hut labels clear of the plot's own furniture — the
         captions bottom-left, the scale bar bottom-right, the zoom pad top-right. */
      const box = { width: w, height: h, paddingPx: 56 };
      const all = fitView(everything, box);
      if (all && all.metresPerPixel >= MAX_METRES_PER_PIXEL && onTheHill.length) {
        return fitView(onTheHill, box) ?? all;
      }
      return all;
    },
    [everything, onTheHill],
  );

  const [view, setView] = useState<PlotView | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onSize = useCallback((w: number, h: number) => {
    setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
  }, []);

  useEffect(() => {
    if (!size) return;
    setView((v) => (v ? resizeView(v, size.w, size.h) : v));
  }, [size]);

  /* Fit once, when there is a box and something to draw. After that the view is
     the athlete's: nothing re-centres under their thumb while they are reading it. */
  useEffect(() => {
    if (!size || !everything.length) return;
    setView((v) => v ?? fitBest(size.w, size.h));
  }, [size, everything, fitBest]);

  const fitAll = useCallback(() => {
    if (!size || !everything.length) return;
    const next = fitBest(size.w, size.h);
    if (next) setView(next);
  }, [size, everything, fitBest]);

  const centreOnMe = useCallback(() => {
    if (!plotFix) return;
    setView((v) => (v ? centreView(v, plotFix) : v));
  }, [plotFix]);

  return {
    trip,
    mountain,
    places,
    campRecord,
    campsOld,
    plotPlaces,
    pins,
    pinStore,
    crumbs,
    shape,
    runs,
    last,
    freshness,
    plotFix,
    readings,
    savedMap,
    caption: mapCaption(savedMap.state),
    view,
    setView,
    onSize,
    fitAll,
    centreOnMe,
    canCentre: plotFix !== null,
    hasPlot: everything.length > 0,
  };
}
