import { useEffect, useState } from "react";
import { elevationOf, trailWays, type Elevation, type TrailWay } from "./trailProfile";

/**
 * What a route relation is made of, and what the ground does along it.
 *
 * Two requests in sequence, never in parallel: `trailWays` first — one Overpass
 * call that returns every member way WITH its tags and geometry — and then
 * Open-Meteo for the heights, sampled per member way. The order matters and so
 * does the sequencing; the note on `trailProfile.ts` records what happens when
 * three Overpass queries leave one client at once (17 calls in three seconds,
 * and the geometry came back empty).
 *
 * Lifted out of `TrailDetail`, which is where it was written, so the trek page
 * can use the SAME data path rather than growing a parallel one. A trek with a
 * matched OSM relation is, to every service below this line, a trail.
 */
export function useRouteFacts(osmId: number | undefined) {
  const [ways, setWays] = useState<TrailWay[] | null>(null);
  const [elevation, setElevation] = useState<Elevation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (osmId == null) return;
    let live = true;
    const ctrl = new AbortController();
    setLoading(true);
    setWays(null);
    setElevation(null);

    trailWays(osmId)
      .then(async (w) => {
        if (!live || w.length === 0) return;
        setWays(w);
        const e = await elevationOf(osmId, w, ctrl.signal);
        if (live) setElevation(e);
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
      ctrl.abort();
    };
  }, [osmId]);

  return { ways, elevation, loading };
}
