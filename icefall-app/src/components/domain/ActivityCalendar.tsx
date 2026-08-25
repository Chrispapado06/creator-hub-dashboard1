import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SectionLabel } from "@/components/ui/primitives";
import { fmtDate, fmtDistance, fmtElevation, fmtHours } from "@/lib/format";
import { activityById } from "@/tracking/activities";
import { personalBests, type PersonalBest } from "@/tracking/analysis";
import type { RecordedActivity } from "@/tracking/types";
import { cn } from "@/lib/utils";

/**
 * CALENDAR and PERFORMANCE — the two views the Activity tab was missing.
 *
 * The calendar's dot weight is driven by ELEVATION rather than distance or
 * count, because vertical is the currency of the athlete this app is for: a
 * 6 km day with 1,400 m of climb should look bigger than a flat 15 km, and on
 * a distance-weighted calendar it looks smaller.
 */

/* -------------------------------------------------------------------------- */
/* Calendar                                                                    */
/* -------------------------------------------------------------------------- */

type Metric = "elevation" | "distance" | "time" | "count";

const METRIC_LABEL: Record<Metric, string> = {
  elevation: "Elevation",
  distance: "Distance",
  time: "Time",
  count: "Activities",
};

export function ActivityCalendar({ recorded }: { recorded: RecordedActivity[] }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [metric, setMetric] = useState<Metric>("elevation");
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, RecordedActivity[]>();
    for (const a of recorded) {
      const key = a.startedAt.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return map;
  }, [recorded]);

  const valueOf = (list: RecordedActivity[]): number => {
    switch (metric) {
      case "elevation":
        return list.reduce((m, a) => m + a.elevationGainM, 0);
      case "distance":
        return list.reduce((m, a) => m + a.distanceM, 0);
      case "time":
        return list.reduce((m, a) => m + a.movingSec, 0);
      case "count":
        return list.length;
    }
  };

  // The month's own busiest day sets the scale, so a quiet month is not all
  // faint dots and a big month is not all full ones.
  const peak = useMemo(() => {
    let max = 0;
    for (const [key, list] of byDay) {
      if (!key.startsWith(month.toISOString().slice(0, 7))) continue;
      max = Math.max(max, valueOf(list));
    }
    return max || 1;
  }, [byDay, month, metric]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  // Monday-first, matching the training week everywhere else in the app.
  const leading = (first.getDay() + 6) % 7;

  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
    }),
  ];

  const selectedList = selected ? (byDay.get(selected) ?? []) : [];
  const monthList = [...byDay.entries()]
    .filter(([k]) => k.startsWith(month.toISOString().slice(0, 7)))
    .flatMap(([, v]) => v);

  return (
    <div className="px-5 pb-8">
      {/* ---- Month ------------------------------------------------------- */}
      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          aria-label="Previous month"
          className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
        >
          <ChevronLeft size={17} strokeWidth={1.7} />
        </button>
        <p className="text-[14px] uppercase tracking-[0.1em] text-snow">
          {month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </p>
        <button
          type="button"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          aria-label="Next month"
          className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
        >
          <ChevronRight size={17} strokeWidth={1.7} />
        </button>
      </div>

      {/* ---- Grid -------------------------------------------------------- */}
      <div className="mt-4 grid grid-cols-7 gap-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="pb-1 text-center text-[10px] text-mist-dim">
            {d}
          </span>
        ))}
        {cells.map((key, i) => {
          if (!key) return <span key={`pad-${i}`} />;
          const list = byDay.get(key) ?? [];
          const v = list.length ? valueOf(list) : 0;
          const weight = v > 0 ? Math.max(0.25, Math.min(1, v / peak)) : 0;
          const day = Number(key.slice(-2));
          const isSelected = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(isSelected ? null : key)}
              className={cn(
                "aspect-square rounded-tile border text-[11.5px] transition-colors",
                isSelected
                  ? "border-azure/60 bg-azure/[0.12] text-azure"
                  : list.length
                    ? "border-hairline text-snow hover:border-azure/40"
                    : "border-transparent text-mist-dim",
              )}
              style={
                list.length && !isSelected
                  ? { backgroundColor: `color-mix(in oklch, var(--ice-azure) ${weight * 26}%, transparent)` }
                  : undefined
              }
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* ---- Metric ------------------------------------------------------ */}
      <div className="mt-4 flex gap-1.5">
        {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMetric(m)}
            className={cn(
              "flex-1 rounded-pill border py-1.5 text-[11px] transition-colors",
              metric === m
                ? "border-azure/55 bg-azure/[0.12] text-azure"
                : "border-hairline-strong text-mist-dim hover:text-snow",
            )}
          >
            {METRIC_LABEL[m]}
          </button>
        ))}
      </div>

      {/* ---- The month, or the chosen day -------------------------------- */}
      <div className="mt-6">
        <SectionLabel>
          {selected ? fmtDate(selected, { day: "numeric" }) : "This month"}
        </SectionLabel>
        {(selected ? selectedList : monthList).length === 0 ? (
          <p className="mt-2.5 text-[12.5px] text-mist-dim">
            {selected ? "Nothing recorded on this day." : "Nothing recorded this month."}
          </p>
        ) : (
          <>
            {!selected && (
              <div className="tnum mt-2.5 flex gap-4 text-[12.5px] text-mist">
                <span>
                  <span className="text-snow">{monthList.length}</span> activities
                </span>
                <span>
                  <span className="text-snow">
                    {fmtElevation(monthList.reduce((m, a) => m + a.elevationGainM, 0))}
                  </span>{" "}
                  m
                </span>
                <span>
                  <span className="text-snow">
                    {fmtDistance(monthList.reduce((m, a) => m + a.distanceM, 0) / 1000, 0)}
                  </span>{" "}
                  km
                </span>
              </div>
            )}
            <div className="mt-3 space-y-2">
              {(selected ? selectedList : monthList).slice(0, 12).map((a) => (
                <Link
                  key={a.id}
                  to={`/activity/${a.id}`}
                  className="flex items-center gap-3 rounded-tile border border-hairline bg-graphite px-3.5 py-3 transition-colors hover:border-azure/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-snow">{a.title}</span>
                    <span className="tnum mt-0.5 block text-[11px] text-mist-dim">
                      {activityById(a.activityTypeId).label} ·{" "}
                      {fmtDistance(a.distanceM / 1000, 1)} km · +{fmtElevation(a.elevationGainM)} m
                    </span>
                  </span>
                  {a.simulated && (
                    <span className="shrink-0 rounded-pill border border-alert/45 px-2 py-[3px] text-[9px] uppercase tracking-[0.1em] text-alert">
                      Sim
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Performance                                                                 */
/* -------------------------------------------------------------------------- */

type Window = 7 | 30 | 90 | 365;

export function ActivityPerformance({ recorded }: { recorded: RecordedActivity[] }) {
  const [days, setDays] = useState<Window>(30);

  // Records come from real recordings only — a simulated track is not a record.
  const bests: PersonalBest[] = useMemo(() => personalBests(recorded), [recorded]);

  const window = useMemo(() => {
    const from = Date.now() - days * 86_400_000;
    return recorded.filter((a) => !a.simulated && new Date(a.startedAt).getTime() >= from);
  }, [recorded, days]);

  const totals = useMemo(
    () => ({
      activities: window.length,
      distanceKm: window.reduce((m, a) => m + a.distanceM, 0) / 1000,
      elevationM: window.reduce((m, a) => m + a.elevationGainM, 0),
      hours: window.reduce((m, a) => m + a.movingSec, 0) / 3600,
    }),
    [window],
  );

  return (
    <div className="px-5 pb-8">
      <div className="mt-5 flex gap-1.5">
        {([7, 30, 90, 365] as Window[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={cn(
              "flex-1 rounded-pill border py-1.5 text-[11.5px] transition-colors",
              days === d
                ? "border-azure/55 bg-azure/[0.12] text-azure"
                : "border-hairline-strong text-mist-dim hover:text-snow",
            )}
          >
            {d === 365 ? "12 months" : `${d} days`}
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2 border-y border-hairline py-4">
        <Figure value={String(totals.activities)} label="Activities" />
        <Figure value={fmtDistance(totals.distanceKm, 0)} unit="km" label="Distance" />
        <Figure value={fmtElevation(totals.elevationM)} unit="m" label="Elev. gain" />
        <Figure value={fmtHours(totals.hours)} label="Time" />
      </div>

      {totals.activities === 0 && (
        <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
          Nothing recorded in this window. Simulated activities are excluded from every figure on
          this screen.
        </p>
      )}

      <div className="mt-7">
        <SectionLabel>Personal bests</SectionLabel>
        {bests.length === 0 ? (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist-dim">
            No records yet. They are set by real recordings — a simulated activity never becomes a
            personal best.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-card border border-hairline bg-graphite">
            {bests.map((b, i) => (
              <Link
                key={b.id}
                to={`/activity/${b.activityId}`}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate/40",
                  i > 0 && "border-t border-hairline",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] text-snow">{b.label}</span>
                  <span className="mt-0.5 block text-[11px] text-mist-dim">
                    {fmtDate(b.achievedAt, { day: "numeric" })}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[15px] font-light text-azure">{b.value}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Figure({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div>
      <p className="tnum text-[17px] font-light leading-none text-snow">
        {value}
        {unit && <span className="text-[11px] text-mist"> {unit}</span>}
      </p>
      <p className="mt-1.5 text-[9.5px] uppercase tracking-[0.1em] text-mist-dim">{label}</p>
    </div>
  );
}
