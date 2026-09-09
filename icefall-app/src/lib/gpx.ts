import { toGpx } from "@/services/trailProfile";
import type { LatLon } from "@/services/trails";

/**
 * THE GPX FILE, AND THE ONE PLACE THAT SAYS WHY THERE ISN'T ONE.
 *
 * A DISABLED BUTTON HAS TO SAY WHY, AND THE REASON HAS TO BE TRUE. There are
 * two ways to have no file to write and they are not the same news: the line is
 * still coming, or it is not coming. `gpxBlocked` once read "The line is still
 * loading" for both, so a route whose geometry had genuinely failed sat under a
 * permanent, false "loading" and the reader waited for nothing.
 *
 * It returns `null` when there IS a file to write, so every control that offers
 * the file asks the same question and none of them can answer it differently.
 * The trail page's three offers used to carry three copies of these sentences
 * and only one had ever been corrected; the trek page is the fourth, and it
 * takes the wording from here rather than writing a fifth.
 */
export const GPX_STILL_LOADING = "The line is still loading";
export const GPX_NEVER_ARRIVED =
  "OpenStreetMap didn't send the line, so there is no file to write. This is a connection problem.";

export function gpxBlocked(points: number, waiting: boolean): string | null {
  if (points > 1) return null;
  return waiting ? GPX_STILL_LOADING : GPX_NEVER_ARRIVED;
}

/**
 * Saves a route as GPX.
 *
 * The line comes from the relation's own geometry, so the file carries OSM's
 * ODbL notice in its metadata — required, and the sort of thing that is easy to
 * leave out and hard to add back once the file is on somebody's watch.
 *
 * Takes the route's PATHS, not one array of points: where OSM holds a route as
 * pieces that do not meet, each piece is its own `<trkseg>` and the file says
 * nothing at all about the ground between them. See `toGpx`.
 */
export function downloadGpx(name: string, paths: LatLon[][]) {
  if (paths.every((p) => p.length < 2)) return;
  const blob = new Blob([toGpx(name, paths)], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${
    name
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "route"
  }.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}
