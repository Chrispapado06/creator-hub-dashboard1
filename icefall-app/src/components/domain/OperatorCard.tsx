import { Link } from "react-router-dom";
import { Globe, MapPin, MessageSquare, Star } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { useMountainImage } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import type { Operator } from "@/services/operators";

/**
 * An expedition company, in the approved directory layout.
 *
 * TWO KINDS OF ENTRY RENDER HERE and they must never look alike:
 *
 *   demo    placeholder businesses, added so this layout could be judged with a
 *           realistic page. The rating, reviews, years and price are INVENTED.
 *           Every one carries a azure DEMO badge.
 *   sample  the honest catalogue — no rating, no reviews, no years, no price,
 *           because ICEFALL holds none of those. They show certification and
 *           working altitude instead.
 *
 * The lead card is larger and carries the objective's photograph. Its
 * prominence comes from matching the athlete's mountain, never from payment —
 * there is no paid placement here and the list order is deterministic.
 */

/**
 * The operator mark. A real logo when the local mockup has one, otherwise a
 * monogram — the logos are gitignored, so a teammate cloning this repo gets
 * monograms and a working layout rather than four broken images.
 */
function Mark({ o, size }: { o: { name: string; logo?: string }; size: number }) {
  if (o.logo) {
    return (
      <span
        className="grid shrink-0 place-items-center overflow-hidden rounded-tile border border-hairline bg-obsidian/80 p-1.5 backdrop-blur"
        style={{ width: size, height: size }}
      >
        <img
          src={o.logo}
          alt=""
          aria-hidden
          className="max-h-full max-w-full object-contain"
          onError={(e) => {
            (e.currentTarget.parentElement as HTMLElement).textContent = monogram(o.name);
          }}
        />
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-tile border border-hairline bg-elevated/40 tracking-[0.06em] text-mist"
      style={{ width: size, height: size, fontSize: size > 44 ? 14 : 13 }}
    >
      {monogram(o.name)}
    </span>
  );
}

function monogram(name: string): string {
  const words = name.replace(/—.*$/, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "··";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const eur = (n: number) =>
  n >= 1000 ? `€${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `€${n}`;

export function OperatorCard({
  operator: o,
  peak,
  lead,
  rank,
  className,
}: {
  operator: Operator;
  /** The objective this enquiry is about. Drives the compose link and the art. */
  peak?: { name: string; elevationM: number; lat?: number; lon?: number; goalId?: string };
  lead?: boolean;
  /** Position in the list. Shown on non-lead cards, as in the approved design. */
  rank?: number;
  className?: string;
}) {
  // The photograph is of the MOUNTAIN, never of the company — ICEFALL has no
  // operator imagery and a stock alpine shot behind a business name would read
  // as theirs.
  const art = useMountainImage({
    name: peak?.name ?? "",
    elevationM: peak?.elevationM,
    lat: peak?.lat,
    lon: peak?.lon,
  });

  const composeHref = peak
    ? `/inbox/new?operator=${o.id}&peak=${encodeURIComponent(peak.name)}&elevation=${peak.elevationM}${peak.goalId ? `&goal=${peak.goalId}` : ""}`
    : `/explore/operator/${o.id}`;

  const price =
    o.priceFromEur !== undefined
      ? o.priceToEur !== undefined
        ? `${eur(o.priceFromEur)}–${eur(o.priceToEur)}`
        : `From ${eur(o.priceFromEur)}`
      : null;

  /* ---- Lead card -------------------------------------------------------- */

  if (lead) {
    return (
      <div className={cn("relative", className)}>
        {/* A deliberate exception to the no-shadows rule: the athlete asked for
            a azure glow on the lead slot. Kept low-opacity so it reads as a ring
            of light rather than a drop shadow. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-[3px] rounded-[18px]"
          style={{
            background:
              "radial-gradient(120% 120% at 50% 0%, oklch(0.6515 0.0722 79.9 / 0.35) 0%, transparent 70%)",
            filter: "blur(10px)",
          }}
        />
        <Card inset={false} className="relative overflow-hidden border-azure/45">
          {/* Ordering is by how well the listing covers THIS objective — never
              a paid position. When real operators list, this label has to stay
              earned by match quality, not sold as a slot. */}
          <div className="flex items-center gap-2 border-b border-azure/25 bg-azure/[0.08] px-4 py-2">
            <Star size={11} strokeWidth={2} className="text-azure" fill="currentColor" />
            <span className="section-label text-azure">Best recommended</span>
          </div>
          <div className="relative h-[120px] w-full overflow-hidden bg-slate">
            {peak?.name && (
              <img
                src={art.src}
                alt=""
                aria-hidden
                className={cn(
                  "absolute inset-0 h-full w-full object-cover",
                  art.real ? "opacity-70" : "opacity-35",
                )}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-graphite via-graphite/60 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-3.5">
              <Mark o={o} size={52} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[17px] font-light leading-tight text-snow">{o.name}</h3>
                  <Badge tone={o.demo ? "azure" : "neutral"}>
                    {o.demo ? "Demo" : "Sample listing"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[12px] text-mist">{o.certification}</p>
              </div>
            </div>
          </div>

          <div className="p-4">
            <Meta o={o} price={price} />
            {o.blurb && <p className="mt-3 text-[12.5px] leading-relaxed text-mist">{o.blurb}</p>}

            {o.popularObjectives && o.popularObjectives.length > 0 && (
              <div className="mt-3.5 rounded-tile border border-hairline bg-obsidian/40 p-3.5">
                {/* Not "popular" — there are no bookings to count. */}
                <p className="section-label">Objectives listed</p>
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {o.popularObjectives.map((x) => (
                    <li key={x} className="flex gap-2 text-[12px] text-mist">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Link to={composeHref} className="mt-4 block">
              <Button className="w-full">
                <MessageSquare size={15} strokeWidth={1.8} />
                View profile &amp; chat
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  /* ---- Standard card ---------------------------------------------------- */

  return (
    <Card className={className}>
      <div className="flex items-start gap-3.5">
        <span className="relative shrink-0">
          <Mark o={o} size={44} />
          {rank !== undefined && (
            <span className="tnum absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-hairline bg-obsidian text-[10px] text-mist-dim">
              {rank}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] text-snow">{o.name}</h3>
            <Badge tone={o.demo ? "azure" : "neutral"}>{o.demo ? "Demo" : "Sample listing"}</Badge>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-mist">{o.certification}</p>
          <Meta o={o} price={price} />
          {o.blurb && <p className="mt-2.5 text-[12px] leading-relaxed text-mist">{o.blurb}</p>}
        </div>
      </div>

      <Link to={composeHref} className="mt-3.5 block">
        <Button variant="secondary" className="w-full">
          <MessageSquare size={15} strokeWidth={1.8} />
          View profile &amp; chat
        </Button>
      </Link>
    </Card>
  );
}

/**
 * The facts row. Rating, reviews, years and price are demo-only; a sample
 * listing shows what ICEFALL genuinely holds instead.
 */
function Meta({ o, price }: { o: Operator; price: string | null }) {
  return (
    <>
      {o.demo && (o.rating !== undefined || o.yearsExperience !== undefined) && (
        <div className="tnum mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-mist">
          {o.rating !== undefined && (
            <span className="flex items-center gap-1.5">
              <Star size={12} strokeWidth={1.8} className="text-azure" fill="currentColor" />
              {o.rating.toFixed(1)}
              {o.reviewCount !== undefined && (
                <span className="text-mist-dim">({o.reviewCount} reviews)</span>
              )}
            </span>
          )}
          {o.yearsExperience !== undefined && (
            <>
              <span className="text-mist-dim" aria-hidden="true">
                ·
              </span>
              <span>{o.yearsExperience}+ years</span>
            </>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-mist-dim">
        {o.city && (
          <span className="flex items-center gap-1.5">
            <MapPin size={11} strokeWidth={1.6} />
            {o.city}
          </span>
        )}
        {o.coverage && (
          <span className="flex items-center gap-1.5">
            <Globe size={11} strokeWidth={1.6} />
            {o.coverage}
          </span>
        )}
        {!o.demo && (
          <span className="tnum">
            Replies within {o.responseHours} h · from {o.minElevationM.toLocaleString("en-GB")} m
          </span>
        )}
      </div>

      {price && (
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="section-label">Indicative</span>
          <span className="tnum text-[15px] font-light text-snow">{price}</span>
          {/* Invented, like every other figure on a demo card. */}
          <span className="text-[10px] text-mist-dim">per person</span>
        </div>
      )}
    </>
  );
}
