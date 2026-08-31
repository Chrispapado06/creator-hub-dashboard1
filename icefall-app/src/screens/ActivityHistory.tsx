import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, SectionLabel, Metric } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { ActivityCalendar } from "@/components/domain/ActivityCalendar";
import { ActivityCard } from "@/components/domain/cards";
import { IcefallMark } from "@/components/ui/IcefallMark";
import { cn } from "@/lib/utils";
import { MODE_LABELS, fmtDistance, fmtElevation, fmtHours } from "@/lib/format";
import {
  summarise,
  useActivityFeed,
  useRecordedActivities,
  weeklyBuckets,
} from "@/tracking/feed";
import type { Activity, SportMode } from "@/types";

/* PH-02 — Performance and Routes removed at the owner's request. History and
   Calendar are two ways of reading the same recorded sessions; the other two
   were analyses layered on top of them. */
const VIEWS = [
  { value: "activities", label: "History" },
  { value: "calendar", label: "Calendar" },
] as const;

const FILTERS = [
  { value: "all", label: "All" },
  { value: "hiking", label: "Hiking" },
  { value: "mountaineering", label: "Alpine" },
  { value: "running", label: "Running" },
  { value: "climbing", label: "Climbing" },
  { value: "cycling", label: "Cycling" },
  { value: "ski-touring", label: "Ski" },
] as const;

export default function ActivityHistory() {
  const [view, setView] = useState<"activities" | "calendar">("activities");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");

  const feed = useActivityFeed();
  const recorded = useRecordedActivities();

  const list = useMemo(
    () => (filter === "all" ? feed : feed.filter((a) => a.mode === (filter as SportMode))),
    [feed, filter],
  );
  const totals = useMemo(() => summarise(list), [list]);

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Activity"
          subtitle={`${feed.filter((a) => !a.simulated).length} recorded`}
          action={
            <Button asChild size="icon" variant="secondary" aria-label="Start an activity">
              <Link to="/activity/select">
                <Plus size={18} strokeWidth={1.8} />
              </Link>
            </Button>
          }
        />
        <SegmentedTabs tabs={VIEWS} value={view} onChange={setView} />
      </div>

      {view === "activities" && (
        <div className="px-5">
          <div className="no-scrollbar mt-5 overflow-x-auto">
            <div className="flex gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] transition-colors",
                    filter === f.value
                      ? "border-azure/50 bg-azure/[0.08] text-snow"
                      : "border-hairline text-mist-dim hover:text-mist",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <Card className="mt-5">
            <div className="grid grid-cols-3 gap-2">
              <Metric size="sm" value={fmtDistance(totals.distanceKm, 0)} unit="km" label="Distance" />
              <Metric size="sm" value={fmtElevation(totals.elevationM)} unit="m" label="Ascent" />
              <Metric size="sm" value={fmtHours(totals.hours)} label="Time" />
            </div>
          </Card>

          <Stagger className="mt-5 space-y-2.5">
            {list.map((a) => (
              <Rise key={a.id}>
                <ActivityCard activity={a} />
              </Rise>
            ))}
            {list.length === 0 && (
              <p className="py-12 text-center text-[13px] text-mist-dim">Nothing recorded yet.</p>
            )}
          </Stagger>
        </div>
      )}

      {view === "calendar" && <ActivityCalendar recorded={recorded} />}
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                       */
/* -------------------------------------------------------------------------- */

function Stats({ feed, recordedCount }: { feed: Activity[]; recordedCount: number }) {
  const weeks = useMemo(() => weeklyBuckets(feed, 8), [feed]);
  const maxDist = Math.max(...weeks.map((w) => w.distanceKm), 1);

  const byMode = useMemo(() => {
    const m = new Map<string, { count: number; distanceKm: number; elevationM: number }>();
    for (const a of feed) {
      // Hand-rolled, so it needs the guard `summarise` now carries by itself.
      if (a.simulated) continue;
      const cur = m.get(a.mode) ?? { count: 0, distanceKm: 0, elevationM: 0 };
      m.set(a.mode, {
        count: cur.count + 1,
        distanceKm: cur.distanceKm + a.distanceKm,
        elevationM: cur.elevationM + a.elevationGainM,
      });
    }
    return [...m.entries()].sort((a, b) => b[1].distanceKm - a[1].distanceKm);
  }, [feed]);

  const maxModeDist = Math.max(...byMode.map(([, v]) => v.distanceKm), 1);
  const totals = summarise(feed);

  return (
    <Stagger className="px-5 pt-5">
      <Rise>
        <SectionLabel>Last eight weeks</SectionLabel>
        <Card className="mt-3">
          <div className="flex items-end justify-between gap-1.5">
            {weeks.map((w, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-24 w-full items-end justify-center">
                  <div
                    className={cn(
                      "w-full max-w-[10px] rounded-full",
                      i === weeks.length - 1 ? "bg-azure" : "bg-white/22",
                    )}
                    style={{ height: `${Math.max(4, (w.distanceKm / maxDist) * 100)}%` }}
                  />
                </div>
                <span className="tnum text-[9px] text-mist-dim">
                  {w.start.getDate()}/{w.start.getMonth() + 1}
                </span>
              </div>
            ))}
          </div>
          <p className="section-label mt-4">Distance per week</p>
        </Card>
      </Rise>

      <Rise className="pt-6">
        <SectionLabel>Totals</SectionLabel>
        <Card className="mt-3">
          <div className="grid grid-cols-2 gap-y-5">
            <Metric size="sm" value={String(totals.count)} label="Activities" />
            <Metric size="sm" value={fmtDistance(totals.distanceKm, 0)} unit="km" label="Distance" />
            <Metric size="sm" value={fmtElevation(totals.elevationM)} unit="m" label="Ascent" />
            <Metric size="sm" value={fmtHours(totals.hours)} label="Moving time" />
          </div>
          {totals.calories > 0 && (
            <p className="tnum mt-5 border-t border-hairline pt-4 text-[12px] text-mist-dim">
              {Math.round(totals.calories).toLocaleString("en-GB")} kcal estimated across all
              activities
            </p>
          )}
        </Card>
      </Rise>

      <Rise className="pt-6">
        <SectionLabel>Breakdown</SectionLabel>
        <Card className="mt-3" inset={false}>
          <div className="px-4">
            {byMode.map(([mode, v]) => (
              <div key={mode} className="border-b border-hairline py-3 last:border-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-snow">{MODE_LABELS[mode] ?? mode}</span>
                  <span className="tnum text-[12px] text-mist">
                    {fmtDistance(v.distanceKm, 0)} km · {v.count}
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-azure/70"
                    style={{ width: `${(v.distanceKm / maxModeDist) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Rise>

      {recordedCount === 0 && (
        <Rise className="pt-6">
          <p className="text-center text-[12px] leading-relaxed text-mist-dim">
            Personal records appear once you record an activity with ICEFALL.
          </p>
        </Rise>
      )}
    </Stagger>
  );
}

/* -------------------------------------------------------------------------- */
/* Journey — every route you have travelled, in one frame                     */

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-3 text-[13px] last:border-0">
      <span className="text-mist-dim">{label}</span>
      <span className="tnum text-snow">{value}</span>
    </div>
  );
}

