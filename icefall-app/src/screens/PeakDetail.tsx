import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import { Screen } from "@/components/layout/chrome";
import { MountainPage } from "@/components/domain/MountainPage";
import { resolvePeak, type Peak } from "@/services/peaks";
import { enrichPeaks } from "@/services/peakWikidata";

/**
 * A discovered peak's own page — a REFERENCE ENTRY.
 *
 * Elevation and position from OpenStreetMap; range, prominence, isolation,
 * first ascent and the one-line description from Wikidata, each with its
 * source; the photograph resolved by entity, never by proximity. NO grade and
 * NO season — those used to be derived "from those two" here, and
 * `services/peakTier.ts` records why that stopped. The page shares its layout
 * with a curated mountain so the structure never shifts underneath the
 * athlete, and says in words which of the two kinds of page it is.
 */
export default function PeakDetail() {
  const { id } = useParams<{ id: string }>();
  const [peak, setPeak] = useState<Peak | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    resolvePeak(decodeURIComponent(id))
      .then(async (p) => {
        if (cancelled || !p) return p;
        // A deep link resolves the peak straight from OpenStreetMap, which has
        // no photograph and often only a local name — the list enriches on the
        // way in, so the page has to do the same or a shared URL looks poorer
        // than the card it came from.
        const [enriched] = await enrichPeaks([p]);
        return enriched ?? p;
      })
      .then((p) => {
        if (!cancelled) setPeak(p ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (peak === undefined) {
    return (
      <Screen>
        <div className="grid h-40 place-items-center">
          <p className="flex items-center gap-2 text-[12.5px] text-mist-dim">
            <Loader2 size={14} className="animate-spin" />
            Finding this peak…
          </p>
        </div>
      </Screen>
    );
  }

  if (!peak) return <Navigate to="/explore/mountains" replace />;
  // Curated objectives have real route detail — always prefer their own page.
  if (peak.curatedId) return <Navigate to={`/explore/mountain/${peak.curatedId}`} replace />;

  return (
    <MountainPage
      data={{
        name: peak.name,
        localName: peak.localName,
        englishName: peak.englishName,
        elevationM: peak.elevationM,
        lat: peak.lat,
        lon: peak.lon,
        country: peak.country,
        countrySource: peak.countrySource,
        wikipedia: peak.wikipedia,
        // The identity link. Without it the page has no harvested facts and
        // falls back to elevation alone, which is the thin page this whole
        // change exists to end.
        wikidata: peak.wikidata,
        photo: peak.photo,
        photoCredit: peak.photoCredit,
        objectiveId: peak.id,
        backTo: "/explore/routes",
      }}
    />
  );
}
