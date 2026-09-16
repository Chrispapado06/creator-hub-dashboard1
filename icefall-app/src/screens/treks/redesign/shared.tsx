import { Link } from "react-router-dom";
import { useState } from "react";
import { useTrailLine } from "@/components/domain/TrailShape";
import { useRouteFacts } from "@/services/routeFacts";
import { savedMapStyle } from "@/components/map/icefallStyle";
import { gpxBlocked } from "@/lib/gpx";
import { followBlocked } from "@/tracking/follow";
import type { TrekRoute } from "@/treks/route";

/**
 * THREE DRAFT DIRECTIONS FOR THE TREK DETAIL PAGE — owner's flight note,
 * 15 Sep 2026: "Page redesign - 3 variations minimum... Remove all boxes
 * dont make it look boxie + remove the unessecary text and info about how
 * line is matched or not."
 *
 * Copies the pattern the Activity History redesign used (handbook §18.54):
 * each direction is a real screen reading the live trek data, mounted at its
 * own temporary `/dev/treks-redesign-{a,b,c}/:id` route so the production
 * `/explore/trek/:id` page — `screens/treks/TrekDetail.tsx` — is never
 * touched. Once the owner picks one, fold it into that file and delete this
 * folder and the three routes, exactly as ActivityHistory.tsx's own header
 * comment records for its redesign.
 *
 * WHAT "REMOVE HOW THE LINE IS MATCHED" MEANT HERE. The live page carries a
 * whole disclosed section — a toggle ("How this line was matched"), the
 * matching script's evidence sentences, a confidence sentence, and a link to
 * check the relation on OpenStreetMap — plus an explanatory sentence above
 * the map ("ICEFALL matched the two; it did not draw this line…"). That is
 * the text these three directions all drop. What they all KEEP is the
 * standing safety disclaimer ("This line is OpenStreetMap data, surveyed by
 * volunteers…") — that is not "matched" text, it is the safety deferral this
 * app carries everywhere a mapped line is followed, and it is not this task's
 * call to remove it. Also kept, per the live file's own note that it "must
 * not be lost to a redesign": the photo-subject line under the hero
 * ("This is Mont Blanc, a mountain the route visits — not a photograph of
 * the route"), which is a photo-licensing fact, not a route-matching one.
 *
 * WHAT STAYS OUT OF SCOPE. The Companies tab's operator cards
 * (`OperatorCard`) are a shared component drawn on the mountain and peak
 * pages too — restyling it is a bigger change than a Treks-only redesign and
 * is left alone here, boxed corners and all. Its own "matched to country and
 * altitude" sentence is a different claim (operator matching, not line
 * matching) and the file that owns it calls it load-bearing, so it is
 * unchanged.
 */

/** The one real trek every draft opens on when no id is given. It has a
 *  matched OSM relation, so it is the one demo id that exercises the map,
 *  the elevation profile and the GPX/Start Route controls — the parts of
 *  the page a reviewer most needs to see. */
export const DEFAULT_REDESIGN_TREK_ID = "tour-du-mont-blanc";

/**
 * The mapped line for a trek's route, and everything the old "how matched"
 * section used to compute alongside it — minus the evidence/confidence text
 * itself, which none of the three directions print.
 */
export function useMappedRoute(route: TrekRoute | undefined) {
  const facts = useRouteFacts(route?.osmId);
  const { line, paths, loading: lineLoading, failed: lineFailed } = useTrailLine(
    route?.osmId,
    !facts.loading,
  );
  const [style] = useState(savedMapStyle);

  const waiting = lineLoading || facts.loading;
  const haveLine = line.length > 1;
  const blocked = gpxBlocked(line.length, waiting);
  const followStopped = followBlocked(line.length, waiting);

  return { line, paths, facts, style, waiting, haveLine, blocked, followStopped, lineFailed };
}

/** Gaps between elevation readings, in km — same arithmetic the live page
 *  uses, so the "at least" caption means the same thing here. */
export const sampleSpacing = (lengthKm: number, samples: number) =>
  samples > 1 ? lengthKm / (samples - 1) : lengthKm;

/**
 * The banner every draft carries at its top, so nobody mistakes a review
 * route for the live page it is standing in for.
 */
export function DraftBanner({ current }: { current: "a" | "b" | "c" }) {
  const links: { id: "a" | "b" | "c"; label: string }[] = [
    { id: "a", label: "A · Field notes" },
    { id: "b", label: "B · One scroll" },
    { id: "c", label: "C · Brief" },
  ];
  return (
    <div className="on-dark sticky top-0 z-30 flex items-center gap-3 border-b border-hairline-strong bg-obsidian/90 px-4 py-2 text-[11px] backdrop-blur">
      <Link to="/explore/treks" className="text-mist-dim underline underline-offset-2">
        Exit
      </Link>
      <span className="text-mist-dim">Design review — not the live page</span>
      <span className="ml-auto flex gap-2">
        {links.map((l) => (
          <Link
            key={l.id}
            to={`/dev/treks-redesign-${l.id}/${DEFAULT_REDESIGN_TREK_ID}`}
            className={
              l.id === current
                ? "rounded-full bg-azure/15 px-2 py-1 text-azure"
                : "rounded-full px-2 py-1 text-mist-dim hover:text-mist"
            }
          >
            {l.label}
          </Link>
        ))}
      </span>
    </div>
  );
}
