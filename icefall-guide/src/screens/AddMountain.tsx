import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ChevronLeft, Search } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Card, Tabs } from "@/components/ui/primitives";
import { inputClass } from "@/components/guide";
import { Photo } from "@/components/Photo";
import { PEAKS, REGIONS } from "@/data/peaks";
import { TREKS, TREK_REGIONS, regionLabel } from "@/data/treks";
import { useStoreScope } from "@/domain/sampleGate";
import { listing } from "@/domain/listing";
import { cn } from "@/lib/utils";

type Kind = "mountain" | "trek";
const TABS = [
  { value: "mountain" as const, label: "Mountains (52)" },
  { value: "trek" as const, label: "Treks (252)" },
];

interface Row {
  id: string;
  name: string;
  detail: string;
  region: string;
}

/**
 * ADD A MOUNTAIN OR TREK — picked from the catalogue, never typed free-hand.
 *
 * A guide chooses from the 52 peaks and 252 treks ICEFALL actually knows about,
 * so their listing joins the same catalogue a climber searches. Letting them
 * type "Mt Blanc" as free text is how one mountain becomes three records and a
 * climber searching Mont Blanc never finds them.
 *
 * Things already on the listing are shown as ADDED rather than hidden — a guide
 * looking for Everest and not finding it would reasonably conclude ICEFALL does
 * not have it.
 */
export default function AddMountain() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>("mountain");
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<string | null>(null);

  /* An empty dependency list froze this before `storeScope()` resolved, so
     every already-added route looked new and could be added twice. */
  const scope = useStoreScope();
  const already = useMemo(
    () => new Set(listing().routes.map((m) => `${m.kind}:${m.routeId}`)),
    /* `scope` is a cache-buster, not a closed-over value — `listing()` reads
       storage that eslint cannot see. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope],
  );

  const source: Row[] = useMemo(
    () =>
      kind === "mountain"
        ? PEAKS.map((p) => ({
            id: p.id,
            name: p.name,
            region: p.region,
            detail: [p.elevationM ? `${p.elevationM.toLocaleString("en-GB")} m` : "", p.country]
              .filter(Boolean)
              .join(" · "),
          }))
        : TREKS.map((t) => ({
            id: t.id,
            name: t.name,
            region: t.region,
            detail: [
              t.minDays
                ? `${t.minDays}${t.maxDays && t.maxDays !== t.minDays ? `–${t.maxDays}` : ""} days`
                : "",
              t.country,
            ]
              .filter(Boolean)
              .join(" · "),
          })),
    [kind],
  );

  const regions = kind === "mountain" ? REGIONS : TREK_REGIONS;

  const rows = source.filter((r) => {
    if (region && r.region !== region) return false;
    if (!q) return true;
    return `${r.name} ${r.detail}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <Screen>
      <Stagger>
        <Rise className="flex items-center gap-3 pb-4 pt-7">
          <Link to="/mountains" aria-label="Back" className="-ml-1 text-mist">
            <ChevronLeft size={22} strokeWidth={1.7} />
          </Link>
          <h1 className="text-[20px] font-light text-snow">Add to your listing</h1>
        </Rise>

        <Rise>
          <Tabs
            tabs={TABS}
            value={kind}
            onChange={(k) => {
              setKind(k);
              setRegion(null);
            }}
          />
        </Rise>

        <Rise className="pt-4">
          <label className="relative block">
            <Search
              size={15}
              strokeWidth={1.8}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-dim"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={kind === "mountain" ? "Search 52 peaks" : "Search 252 treks"}
              className={`${inputClass} pl-9`}
            />
          </label>
        </Rise>

        <Rise className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
          <Chip active={region === null} onClick={() => setRegion(null)} label="All" />
          {regions.map((r) => (
            <Chip
              key={r}
              active={region === r}
              onClick={() => setRegion(r)}
              label={kind === "trek" ? regionLabel(r) : r}
            />
          ))}
        </Rise>

        <Rise className="space-y-2 pt-4">
          {rows.slice(0, 60).map((r) => {
            const added = already.has(`${kind}:${r.id}`);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate(`/route/${kind}/${r.id}`)}
                className="block w-full text-left"
              >
                <Card
                  className={cn(
                    "transition-colors hover:border-hairline-strong",
                    added && "opacity-70",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Photo peak={r.id} kind={kind} alt="" className="h-12 w-12 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] text-snow">{r.name}</p>
                      <p className="tnum mt-0.5 truncate text-[11.5px] text-mist-dim">{r.detail}</p>
                    </div>
                    {added && (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] text-summit">
                        <Check size={13} strokeWidth={2.2} />
                        Added
                      </span>
                    )}
                  </div>
                </Card>
              </button>
            );
          })}

          {rows.length > 60 && (
            <p className="px-1 py-2 text-center text-[11.5px] text-mist-dim">
              Showing the first 60 of {rows.length}. Search to narrow it.
            </p>
          )}

          {rows.length === 0 && (
            <Card>
              <p className="py-5 text-center text-[12.5px] leading-relaxed text-mist-dim">
                Nothing matches that. If the {kind === "trek" ? "trek" : "peak"} you guide is
                missing, tell us — it gets added to the catalogue rather than to your listing alone.
              </p>
            </Card>
          )}
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-pill border px-3 py-1.5 text-[12px] transition-colors",
        active
          ? "border-azure bg-azure/15 text-azure"
          : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
      )}
    >
      {label}
    </button>
  );
}
