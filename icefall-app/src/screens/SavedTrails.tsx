import { useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, MapPin, Navigation } from "lucide-react";
import { Screen, ScreenHeader, Rise, Stagger } from "@/components/layout/chrome";
import { TrailImage } from "@/components/domain/TrailImage";
import { savedTrails, unsaveTrail, type SavedTrail } from "@/services/savedTrails";
import { NETWORK_LABEL } from "@/services/trails";
import { fmtDistance } from "@/lib/format";
import { mapsDirectionsUrl, openMaps } from "@/lib/maps";
import { cn } from "@/lib/utils";

/**
 * Every trail the athlete has bookmarked — reachable from Profile, where the
 * old "Share Profile" row used to be the only thing next to Share.
 *
 * Reads straight from `savedTrails()`: device-local storage, same as the Save
 * button on the trail itself. There is no separate "did this save actually
 * work" state to get out of sync — this list and that button read the same
 * source.
 */
export default function SavedTrails() {
  const [trails, setTrails] = useState<SavedTrail[]>(() => savedTrails());

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title="Saved trails" back="/profile" />
      </div>

      {trails.length === 0 ? (
        <div className="px-5 pt-6 text-center">
          <Bookmark size={28} strokeWidth={1.3} className="mx-auto text-mist-dim" />
          <p className="mt-3 text-[14px] text-snow">Nothing saved yet</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist-dim">
            Tap the compass icon on any trail card to keep it here.
          </p>
        </div>
      ) : (
        <Stagger className="space-y-3 px-5">
          {trails.map((t) => (
            <Rise key={t.osmId}>
              <SavedTrailCard
                trail={t}
                onUnsave={() => setTrails(unsaveTrail(t.osmId))}
              />
            </Rise>
          ))}
        </Stagger>
      )}
    </Screen>
  );
}

function SavedTrailCard({ trail, onUnsave }: { trail: SavedTrail; onUnsave: () => void }) {
  return (
    <Link to={`/explore/trail/${trail.osmId}`} className="block">
      <div className="overflow-hidden rounded-card border border-hairline bg-graphite transition-colors hover:border-hairline-strong">
        <div className="relative h-[130px] bg-slate">
          <TrailImage
            osmId={trail.osmId}
            lat={trail.lat}
            lon={trail.lon}
            name={trail.localName ?? trail.name}
            className="absolute inset-0 h-full w-full"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-graphite/95 via-transparent to-obsidian/30" />

          {trail.network && (
            <span
              className={cn(
                "absolute left-3 top-3 rounded-pill border border-hairline-strong bg-obsidian/75 px-2.5 py-1 text-[10.5px] text-snow backdrop-blur",
              )}
            >
              {NETWORK_LABEL[trail.network]}
            </span>
          )}
          {trail.ref && (
            <span className="absolute right-3 top-3 rounded-pill border border-azure/45 bg-obsidian/75 px-2.5 py-1 text-[10.5px] text-azure backdrop-blur">
              {trail.ref}
            </span>
          )}

          <button
            type="button"
            aria-label={`Remove ${trail.name} from saved`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onUnsave();
            }}
            className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full border border-azure/45 bg-obsidian/80 text-azure backdrop-blur transition-colors hover:bg-azure/20"
          >
            <Bookmark size={14} strokeWidth={1.8} fill="currentColor" />
          </button>
          <button
            type="button"
            aria-label={`Directions to ${trail.name}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openMaps(mapsDirectionsUrl({ lat: trail.lat, lon: trail.lon }));
            }}
            className="absolute bottom-3 right-14 grid h-9 w-9 place-items-center rounded-full border border-hairline-strong bg-obsidian/80 text-snow backdrop-blur transition-colors hover:border-azure/50"
          >
            <Navigation size={14} strokeWidth={1.8} />
          </button>
        </div>

        <div className="p-4">
          <h3 className="text-[15px] leading-snug text-snow">{trail.localName ?? trail.name}</h3>
          <div className="mt-1.5 flex items-center gap-3 text-[11.5px] text-mist-dim">
            {trail.lengthKm != null && (
              <span className="tnum flex items-center gap-1">
                <MapPin size={11} strokeWidth={1.8} />
                {fmtDistance(trail.lengthKm, 1)} km
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
