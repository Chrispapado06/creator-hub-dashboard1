import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import { Screen } from "@/components/layout/chrome";
import { MountainPage } from "@/components/domain/MountainPage";
import { resolvePeak, type Peak } from "@/services/peaks";
import { enrichPeaks } from "@/services/peakWikidata";

/**
 * A discovered peak's own page.
 *
 * Everything on it is derived — elevation and position from OpenStreetMap,
 * grade and season from those two, photography and description from Wikimedia.
 * It uses the same layout as a curated mountain and as a goal, so the structure
 * never shifts underneath the athlete; only the depth of the data does.
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
        elevationM: peak.elevationM,
        lat: peak.lat,
        lon: peak.lon,
        country: peak.country,
        wikipedia: peak.wikipedia,
        photo: peak.photo,
        photoCredit: peak.photoCredit,
        objectiveId: peak.id,
        backTo: "/explore/routes",
      }}
    />
  );
}
