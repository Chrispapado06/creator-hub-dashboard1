import { Link } from "react-router-dom";
import { Clock, MapPin } from "lucide-react";
import { Badge, GuidePhoto, Rating, VerifiedTick } from "@/components/ui";
import { GuideCredentialMark } from "@/components/marks";
import { formatEur } from "@/money/model";
import type { Expedition, Guide } from "@/data/demo";
import { peakFallback, peakImage } from "@/app/peakPlate";

/**
 * These cards pointed at `/img/<peakId>.jpg` — a path where exactly six
 * photographs live. The catalogue has 52 peaks, so 45 images on the preview
 * landing page and the preview expeditions list rendered as broken boxes.
 *
 * The bundled photographs are under `/img/peaks/`, and `/app` has long since
 * settled how to reach them: `peakImage` for the path, `peakFallback` for a
 * drawn plate when the photograph is missing or fails. Never a photograph of a
 * different mountain — see peakPlate.ts.
 */

/** The Airbnb-style listing card for a guide. */
export function GuideCard({ guide }: { guide: Guide }) {
  return (
    <Link to={`/guides/${guide.id}`} className="group block">
      <div className="overflow-hidden rounded-card border border-hairline bg-graphite transition-colors group-hover:border-hairline-strong">
        {/* The photo is of the MOUNTAIN, never the guide — ICEFALL attaches no
            stock alpine shot to a person. */}
        <div className="relative h-44 overflow-hidden bg-slate">
          <img
            src={peakImage(guide.heroPeak)}
            onError={(ev) => {
              // Never a photograph of a different mountain — see peakPlate.ts.
              const el = ev.currentTarget;
              if (!el.dataset.fellBack) {
                el.dataset.fellBack = "1";
                el.src = peakFallback(guide.heroPeak);
              }
            }}
            alt=""
            aria-hidden
            className="h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-[1.04]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-graphite via-transparent to-transparent" />
          <span className="absolute bottom-3 left-3">
            <GuidePhoto name={guide.name} src={guide.photo} size={52} className="ring-2 ring-graphite" />
          </span>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[15px] text-snow">
                <span className="truncate">{guide.name}</span>
                <GuideCredentialMark verifiedOn={guide.verifiedOn} size={14} />
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-mist-dim">
                <MapPin size={11} strokeWidth={1.7} />
                {guide.basedIn}
              </p>
            </div>
            <Rating value={guide.rating} reviews={guide.reviews} />
          </div>

          <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-mist">
            {guide.headline}
          </p>

          <div className="mt-3.5 flex items-center justify-between border-t border-hairline pt-3">
            <span className="flex flex-wrap gap-1.5">
              {guide.mountains.slice(0, 2).map((m) => (
                <Badge key={m}>{m}</Badge>
              ))}
            </span>
            <span className="tnum text-[13px] text-snow">
              {formatEur(guide.dayRate)}
              <span className="text-[11px] text-mist-dim"> / day</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** The listing card for an expedition. */
export function ExpeditionCard({ expedition: e }: { expedition: Expedition }) {
  return (
    <Link to={`/expeditions/${e.id}`} className="group block">
      <div className="overflow-hidden rounded-card border border-hairline bg-graphite transition-colors group-hover:border-hairline-strong">
        <div className="relative h-36 overflow-hidden bg-slate">
          <img
            src={peakImage(e.heroPeak)}
            onError={(ev) => {
              const el = ev.currentTarget;
              if (!el.dataset.fellBack) {
                el.dataset.fellBack = "1";
                el.src = peakFallback(e.heroPeak);
              }
            }}
            alt=""
            aria-hidden
            className="h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-[1.04]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-graphite via-transparent to-transparent" />
          <span className="absolute right-3 top-3">
            <Badge tone="neutral" className="bg-obsidian/70 backdrop-blur">
              <Clock size={10} strokeWidth={2} />
              {e.durationDays} days
            </Badge>
          </span>
        </div>

        <div className="p-4">
          <p className="text-[14px] text-snow">{e.objective}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-mist-dim">
            {e.company}
            <VerifiedTick verifiedOn={e.verifiedOn} size={12} />
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
            <span className="text-[11.5px] text-mist-dim">{e.months}</span>
            <span className="tnum text-[13px] text-snow">
              <span className="text-[11px] text-mist-dim">from </span>
              {formatEur(e.fromEur)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
