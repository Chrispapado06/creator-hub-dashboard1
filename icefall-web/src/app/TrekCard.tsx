import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, Clock, Gauge, MountainSnow, Users } from "lucide-react";
import { Badge } from "@/components/ui";
import { trekAltitude, trekDuration, type Trek } from "@/data/trekTypes";
import { trekImage, trekPlate } from "./trekImages";
import { cn } from "@/lib/utils";

/**
 * A trek, as a card.
 *
 * Deliberately the SAME shape, spacing and hover behaviour as the expedition
 * cards — a trek is a second product in the same shop, not a different shop.
 * What separates them is the badge, the vocabulary (days and a high point
 * rather than a summit and a success rate) and the accent on the style chip.
 *
 * WHAT IT REFUSES TO SHOW. There is no price on any of these, because no
 * operator has quoted one; the card says "Price on enquiry", which is honest
 * and is what the industry says anyway. Any other unknown prints "Not
 * specified" rather than a plausible number.
 */
export function TrekCard({
  trek,
  operators = 0,
  className,
}: {
  trek: Trek;
  /** How many companies in the directory run it. */
  operators?: number;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-card border border-hairline bg-graphite transition-colors hover:border-summit/45",
        className,
      )}
    >
      <Link to={`/app/trek/${trek.id}`} className="relative block h-[168px] shrink-0">
        <img
          src={trekImage(trek)}
          alt=""
          aria-hidden
          loading="lazy"
          onError={(ev) => {
            const el = ev.currentTarget;
            if (!el.dataset.fellBack) {
              el.dataset.fellBack = "1";
              el.src = trekPlate(trek.id);
            }
          }}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 scrim-bottom" />

        {/*
          The category badge, in the summit green rather than the azure the
          expedition cards use. Two products in one list have to be tellable
          apart at a glance, and colour does that faster than reading.
        */}
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-pill bg-summit/85 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.11em] text-obsidian">
          <MountainSnow size={10} strokeWidth={2.2} />
          Trek
        </span>

        <span className="absolute inset-x-0 bottom-0 p-4">
          <span className="block text-[15px] leading-tight text-snow">{trek.name}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-mist">{trek.country}</span>
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="grid grid-cols-3 gap-2 border-b border-hairline pb-3">
          <Fact icon={Clock} label="Duration" value={trekDuration(trek)} />
          <Fact icon={Gauge} label="Difficulty" value={trek.difficulty ?? "Not specified"} />
          <Fact icon={MountainSnow} label="High point" value={trekAltitude(trek)} />
        </div>

        <p className="mt-3 clamp-2 text-[12px] leading-relaxed text-mist">{trek.summary}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="azure">{trek.style}</Badge>
          {trek.season && (
            <span className="flex items-center gap-1.5 text-[11px] text-mist-dim">
              <CalendarDays size={11} strokeWidth={1.8} />
              {trek.season}
            </span>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <span>
            {/*
              NOT a price. No operator has quoted us one, and 250 invented
              "from" figures is exactly the kind of number a marketplace must
              never make up.
            */}
            <span className="section-label block">Cost</span>
            <span className="mt-1 block text-[12.5px] text-mist">Price on enquiry</span>
          </span>
          <span className="flex items-center gap-2">
            {operators > 0 && (
              <span className="flex items-center gap-1.5 text-[11.5px] text-mist-dim">
                <Users size={12} strokeWidth={1.8} />
                <span className="tnum">{operators}</span>
              </span>
            )}
            <Link
              to={`/app/trek/${trek.id}`}
              className="flex items-center gap-1 rounded-pill border border-summit/45 px-3.5 py-1.5 text-[12px] text-summit transition-colors hover:border-summit hover:text-snow"
            >
              View trek
              <ChevronRight size={13} strokeWidth={2} />
            </Link>
          </span>
        </div>
      </div>
    </article>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  const unknown = value === "Not specified";
  return (
    <span className="min-w-0">
      <span className="flex items-center gap-1 text-[9.5px] uppercase tracking-[0.1em] text-mist-dim">
        <Icon size={10} strokeWidth={1.8} />
        {label}
      </span>
      <span
        className={cn(
          "tnum mt-1 block truncate",
          unknown ? "text-[10.5px] text-mist-dim" : "text-[12px] text-snow",
        )}
      >
        {value}
      </span>
    </span>
  );
}
