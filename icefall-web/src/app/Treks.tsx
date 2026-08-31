import { useMemo } from "react";
import { Listbox } from "@/components/Listbox";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { TREK_DIFFICULTY_ORDER, TREK_REGIONS, type TrekDifficulty } from "@/data/trekTypes";
import { DURATION_BANDS, filterTreks, operatorsForTrek, populatedRegions, TREKS } from "@/data/treks";
import { TrekCard } from "./TrekCard";
import { cn } from "@/lib/utils";

/**
 * The trek index.
 *
 * Filters live in the QUERY STRING rather than in component state, so a
 * filtered view is a link: /app/treks?region=khumbu is what the Khumbu section
 * of a mountain page points at, and what a user can send someone. The expedition
 * tab learned this the hard way — its peak selection is state, so there was no
 * way to link to "expeditions on K2".
 */
export default function Treks() {
  const [params, setParams] = useSearchParams();

  const q = params.get("q") ?? "";
  const regionId = params.get("region") ?? "";
  const difficulty = (params.get("difficulty") ?? "") as TrekDifficulty | "";
  const duration = params.get("duration") ?? "";

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const results = useMemo(
    () => filterTreks({ q, regionId, difficulty, duration }),
    [q, regionId, difficulty, duration],
  );

  const regions = useMemo(() => populatedRegions(), []);
  const dirty = Boolean(q || regionId || difficulty || duration);
  const region = TREK_REGIONS.find((r) => r.id === regionId);

  return (
    <div className="mx-auto w-full max-w-[1320px] pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">
            {region ? region.name : "Treks"}
          </h1>
          <p className="mt-1.5 text-[13px] text-mist">
            {region
              ? region.blurb
              : "Walking routes to, around and between the mountains — no climbing required."}
          </p>
        </div>
        <p className="tnum text-[12px] text-mist-dim">
          {results.length} of {TREKS.length}
        </p>
      </div>

      {/* ---- Filters ------------------------------------------------------ */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <span className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim">
            <Search size={14} strokeWidth={1.9} />
          </span>
          <input
            value={q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Route, country or style"
            aria-label="Search treks"
            className="h-10 w-[260px] rounded-pill border border-hairline bg-graphite pl-9 pr-3 text-[12.5px] text-snow outline-none placeholder:text-mist-dim focus:border-azure/60"
          />
        </span>

        <Select
          value={regionId}
          onChange={(v) => set("region", v)}
          any="Anywhere"
          options={regions.map((r) => ({ value: r.region.id, label: `${r.region.name} (${r.count})` }))}
        />
        <Select
          value={difficulty}
          onChange={(v) => set("difficulty", v)}
          any="Any difficulty"
          options={TREK_DIFFICULTY_ORDER.map((d) => ({ value: d, label: d }))}
        />
        <Select
          value={duration}
          onChange={(v) => set("duration", v)}
          any="Any length"
          options={DURATION_BANDS.map((d) => ({ value: d, label: d }))}
        />

        {dirty && (
          <button
            type="button"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
            className="text-[12px] text-azure hover:text-azure-bright"
          >
            Clear
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <div className="mt-7 rounded-card border border-hairline bg-graphite p-6">
          <p className="text-[13px] text-mist">No trek matches those filters.</p>
        </div>
      ) : (
        <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((t) => (
            <TrekCard key={t.id} trek={t} operators={operatorsForTrek(t.id).length} />
          ))}
        </div>
      )}

      {/*
        Prices are absent from every card by design, and the page says why once
        rather than repeating "price on enquiry" without explanation.
      */}
      <p className="mt-10 border-l-2 border-summit/30 pl-4 text-[11px] leading-relaxed text-mist-dim">
        Route facts — duration, high point, season and grade — are published figures for each trek.
        Prices are not shown because no operator has quoted one to ICEFALL; what a trek costs
        depends on the operator, the group size and the season.
      </p>
    </div>
  );
}

function Select({
  value,
  onChange,
  any,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  any: string;
  options: { value: string; label: string }[];
}) {
  // Native select retired per 11-CONTROLS-CONTRACT; same value/onChange, new shell.
  return (
    <Listbox
      value={value}
      onChange={onChange}
      options={options}
      label={any}
      placeholder={any}
      triggerClassName={cn(
        "h-10 rounded-pill border px-3.5 text-[12.5px] transition-colors",
        value ? "border-azure bg-azure/10 text-azure" : "border-hairline bg-graphite text-mist",
      )}
    />
  );
}
