import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Filter, Footprints, Mountain as MountainIcon, Search, TrendingUp, X } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Sheet, SheetRow } from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";
import {
  LENGTH_BANDS,
  REGIONS_WITH_COUNTS,
  TREKS,
  TREK_DIFFICULTY_ORDER,
  filterTreks,
  trekAltitude,
  trekDuration,
  trekRegion,
  type LengthBandId,
  type Trek,
  type TrekDifficulty,
} from "@/treks";
import { trekImage, trekImageSubject } from "@/treks/images";

/**
 * EXPLORE → TREKS.
 *
 * The second commercial category, beside expeditions and separate from them.
 * An expedition climbs a summit; a trek walks to, around or between mountains,
 * and the two are bought by different people. Folding treks into the expedition
 * list would put a fortnight's walking at 5,364 m next to a two-month climb at
 * 8,849 m under one heading — which is the distinction a reader opens this
 * section to make.
 *
 * NO PRICES. Every card says "Price on enquiry", because that is true: a
 * starting price is an operator's commercial claim, no operator has given us
 * one for any of these 252 routes, and inventing them is exactly what a
 * marketplace must not do. It is also what the industry actually says.
 *
 * NO RATINGS AND NO SUCCESS RATES either, for the same reason — nobody has
 * rated these routes through this app, so there is no number to print.
 *
 * The trek scale is NOT the expedition scale, and the sheet says so.
 *
 * An expedition is graded Hard / Very hard / Extreme because the mildest thing
 * in that catalogue is a 4,000 m alpine ascent. The mildest thing here is a
 * valley walk. Reusing "Extreme" for the Snowman Trek and for K2 would flatten
 * a distinction that matters to whoever is choosing.
 */
const DIFFICULTY_DETAIL: Record<TrekDifficulty, string> = {
  Easy: "Waymarked, low, no navigation needed",
  Moderate: "Full days on a path, some ascent",
  Strenuous: "Long days, high passes or rough ground",
  "Very strenuous": "Sustained altitude, remote, or unmarked",
};

export default function Treks() {
  const [q, setQ] = useState("");
  const [regionId, setRegionId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<TrekDifficulty | null>(null);
  const [length, setLength] = useState<LengthBandId | null>(null);
  const [sheet, setSheet] = useState<null | "region" | "difficulty" | "length">(null);

  const results = useMemo(
    () => filterTreks(TREKS, { query: q, regionId, difficulty, length }),
    [q, regionId, difficulty, length],
  );

  const activeCount = [regionId, difficulty, length].filter(Boolean).length;
  const clearAll = () => {
    setRegionId(null);
    setDifficulty(null);
    setLength(null);
  };

  return (
    <Screen>
      <Rise>
        <header className="pt-2">
          <h1 className="text-2xl font-semibold tracking-tight text-mist">Treks</h1>
          <p className="mt-1 text-sm text-mist/60">
            Walking routes to, around and between the mountains — no climbing required.
          </p>
        </header>
      </Rise>

      <Rise>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Route, country or style"
            className="h-11 w-full rounded-2xl border border-mist/12 bg-slate/60 pl-9 pr-9 text-sm text-mist placeholder:text-mist/40 focus:border-azure/50 focus:outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-mist/40"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </Rise>

      <Rise>
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
          <Chip active={!!regionId} onClick={() => setSheet("region")}>
            {regionId ? (trekRegion(regionId)?.name ?? "Region") : "Anywhere"}
          </Chip>
          <Chip active={!!difficulty} onClick={() => setSheet("difficulty")}>
            {difficulty ?? "Any difficulty"}
          </Chip>
          <Chip active={!!length} onClick={() => setSheet("length")}>
            {LENGTH_BANDS.find((b) => b.id === length)?.label ?? "Any length"}
          </Chip>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs text-mist/50 underline underline-offset-4"
            >
              Clear
            </button>
          )}
        </div>
      </Rise>

      <p className="mt-3 text-xs tabular-nums text-mist/45">
        {results.length} of {TREKS.length}
      </p>

      {results.length === 0 ? (
        <Card className="mt-4 p-6 text-center">
          <Filter className="mx-auto h-5 w-5 text-mist/30" />
          <p className="mt-3 text-sm text-mist/70">No route matches those filters.</p>
          <Button variant="secondary" className="mt-4" onClick={clearAll}>
            Clear filters
          </Button>
        </Card>
      ) : (
        <Stagger className="mt-4 space-y-3">
          {results.map((t) => (
            <TrekCard key={t.id} trek={t} />
          ))}
        </Stagger>
      )}

      {sheet && (
        <Sheet
          title={sheet === "region" ? "Region" : sheet === "difficulty" ? "Difficulty" : "Length"}
          onClose={() => setSheet(null)}
        >
          {sheet === "region" && (
            <>
              <SheetRow
                title="Anywhere"
                detail={`All ${TREKS.length} routes`}
                active={!regionId}
                onClick={() => { setRegionId(null); setSheet(null); }}
              />
              {REGIONS_WITH_COUNTS.map((r) => (
                <SheetRow
                  key={r.id}
                  title={r.name}
                  detail={`${r.count} ${r.count === 1 ? "route" : "routes"} · ${r.country}`}
                  active={regionId === r.id}
                  onClick={() => { setRegionId(r.id); setSheet(null); }}
                />
              ))}
            </>
          )}

          {sheet === "difficulty" && (
            <>
              <SheetRow
                title="Any difficulty"
                active={!difficulty}
                onClick={() => { setDifficulty(null); setSheet(null); }}
              />
              {TREK_DIFFICULTY_ORDER.map((d) => (
                <SheetRow
                  key={d}
                  title={d}
                  detail={DIFFICULTY_DETAIL[d]}
                  active={difficulty === d}
                  onClick={() => { setDifficulty(d); setSheet(null); }}
                />
              ))}
            </>
          )}

          {sheet === "length" && (
            <>
              <SheetRow
                title="Any length"
                active={!length}
                onClick={() => { setLength(null); setSheet(null); }}
              />
              {LENGTH_BANDS.map((b) => (
                <SheetRow
                  key={b.id}
                  title={b.label}
                  active={length === b.id}
                  onClick={() => { setLength(b.id); setSheet(null); }}
                />
              ))}
            </>
          )}
        </Sheet>
      )}

    </Screen>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition",
        active
          ? "border-azure/50 bg-azure/12 text-azure"
          : "border-mist/12 bg-slate/50 text-mist/70",
      )}
    >
      {children}
    </button>
  );
}

export function TrekCard({ trek }: { trek: Trek }) {
  const subject = trekImageSubject(trek);
  return (
    <Link to={`/explore/trek/${trek.id}`} className="block">
      <Card className="overflow-hidden p-0">
        <div className="relative h-36 w-full overflow-hidden bg-slate">
          <img
            src={trekImage(trek)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <Badge tone="azure" className="absolute left-3 top-3 bg-obsidian/70 backdrop-blur">
            <Footprints className="mr-1 h-3 w-3" />
            Trek
          </Badge>
          {/* A card showing the mountain rather than the route says so — or the
              photograph quietly claims to be the walk. */}
          {subject && (
            <p className="absolute inset-x-0 bottom-0 bg-obsidian/70 px-3 py-1 text-[10px] text-mist/70 backdrop-blur">
              {subject} — the mountain this route visits
            </p>
          )}
        </div>

        <div className="p-4">
          <h3 className="text-base font-medium leading-tight text-mist">{trek.name}</h3>
          <p className="mt-0.5 text-xs text-mist/55">{trek.country}</p>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Fact icon={Clock} label="Duration" value={trekDuration(trek)} />
            <Fact icon={TrendingUp} label="Difficulty" value={trek.difficulty ?? "Not specified"} />
            <Fact icon={MountainIcon} label="High point" value={trekAltitude(trek)} />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge>{trek.style}</Badge>
              {trek.season && <span className="text-[11px] text-mist/45">{trek.season}</span>}
            </div>
            {/* Not a price. No operator has quoted one for any of these. */}
            <span className="shrink-0 text-xs text-mist/55">Price on enquiry</span>
          </div>
        </div>
      </Card>
    </Link>
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
  return (
    <div className="rounded-xl bg-obsidian/40 p-2">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-mist/40">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-0.5 text-xs tabular-nums text-mist/85">{value}</p>
    </div>
  );
}
