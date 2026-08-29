import { Plus, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, SectionLabel, Metric } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { ActivityCalendar, ActivityPerformance } from "@/components/domain/ActivityCalendar";
import { ActivityCard } from "@/components/domain/cards";
import { IcefallMark } from "@/components/ui/IcefallMark";
import { cn } from "@/lib/utils";
import { MODE_LABELS, fmtDistance, fmtElevation, fmtHours } from "@/lib/format";
import {
  summarise,
  useActivityFeed,
  useAllTimeRecords,
  useLifetimePoints,
  useRecordedActivities,
  weeklyBuckets,
} from "@/tracking/feed";
import type { Activity, SportMode } from "@/types";

const VIEWS = [
  { value: "activities", label: "History" },
  { value: "calendar", label: "Calendar" },
  { value: "performance", label: "Performance" },
  { value: "journey", label: "Routes" },
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
  const [view, setView] = useState<"activities" | "calendar" | "performance" | "journey">(
    "activities",
  );
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");

  const feed = useActivityFeed();
  const recorded = useRecordedActivities();
  const lifetimePoints = useLifetimePoints();

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
          subtitle={`${feed.filter((a) => !a.simulated).length} recorded · ${lifetimePoints.toLocaleString("en-GB")} points`}
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
      {view === "performance" && <ActivityPerformance recorded={recorded} />}
      {view === "journey" && <Journey feed={feed} lifetimePoints={lifetimePoints} />}
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
/* -------------------------------------------------------------------------- */

function Journey({ feed, lifetimePoints }: { feed: Activity[]; lifetimePoints: number }) {
  const recorded = useRecordedActivities();

  const year = new Date().getFullYear();
  // Simulated sessions are dropped before the year card, not after: the totals
  // beneath it, the highest point, the longest activity and the overlaid routes
  // all read as a year of real climbing, and one indoor simulator run drawn
  // among them would be claiming a day nobody spent outside.
  const thisYear = useMemo(
    () =>
      feed.filter((a) => !a.simulated && new Date(a.startedAt).getFullYear() === year),
    [feed, year],
  );
  const totals = useMemo(() => summarise(thisYear), [thisYear]);

  const highest = useMemo(() => {
    let best = 0;
    for (const a of thisYear) best = Math.max(best, ...a.track.map((p) => p.ele));
    return best;
  }, [thisYear]);

  const longest = useMemo(
    () => thisYear.reduce((b, a) => (a.distanceKm > (b?.distanceKm ?? 0) ? a : b), thisYear[0]),
    [thisYear],
  );

  // All-time bests across every recording. This previously showed only the
  // records set by the *latest* activity, mislabelled as personal records.
  const bestRecords = useAllTimeRecords();

  return (
    <Stagger className="px-5 pt-5">
      <Rise>
        <Card inset={false} className="overflow-hidden">
          {/* All routes overlaid — the shape of a year outdoors. */}
          <div className="relative aspect-square bg-obsidian">
            <svg viewBox="0 0 320 320" className="h-full w-full">
              {thisYear.slice(0, 40).map((a, i) => (
                <path
                  key={a.id}
                  d={a.track
                    .map(
                      (p, j) =>
                        `${j === 0 ? "M" : "L"}${(26 + p.x * 268).toFixed(1)} ${(26 + p.y * 268).toFixed(1)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke="var(--ice-azure)"
                  strokeOpacity={0.16 + (i % 5) * 0.05}
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
            </svg>
            <div className="absolute inset-x-0 bottom-0 scrim-bottom p-4">
              <p className="section-label">My {year}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-5 p-4">
            <Metric size="sm" value={fmtDistance(totals.distanceKm, 0)} unit="km" label="Distance" />
            <Metric size="sm" value={fmtElevation(totals.elevationM)} unit="m" label="Vertical" />
            <Metric size="sm" value={String(totals.count)} label="Activities" />
            <Metric size="sm" value={fmtHours(totals.hours)} label="Time outdoors" />
          </div>
        </Card>
      </Rise>

      <Rise className="pt-6">
        <SectionLabel>Your year so far</SectionLabel>
        <Card className="mt-3" inset={false}>
          <div className="px-4">
            <Line label="Highest point" value={highest ? `${fmtElevation(highest)} m` : "—"} />
            <Line
              label="Longest activity"
              value={longest ? `${fmtDistance(longest.distanceKm)} km` : "—"}
            />
            <Line label="ICEFALL points" value={lifetimePoints.toLocaleString("en-GB")} />
          </div>
        </Card>
      </Rise>

      {bestRecords.length > 0 && (
        <Rise className="pt-6">
          <SectionLabel>Personal records</SectionLabel>
          <div className="mt-3 space-y-2.5">
            {bestRecords.map((r) => (
              <Card key={r.id} className="border-summit/20 bg-summit/[0.04]">
                <div className="flex items-center gap-3">
                  <Trophy size={15} strokeWidth={1.5} className="shrink-0 text-summit" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-snow">{r.label}</p>
                    <p className="tnum text-[11px] text-mist-dim">{r.value}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Rise>
      )}

      <Rise className="pt-6">
        <Card className="border-azure/20 bg-azure/[0.04]">
          <div className="flex items-center gap-3">
            <IcefallMark className="h-4 shrink-0 text-azure" />
            <p className="text-[12px] leading-relaxed text-snow/85">
              Your annual recap is assembled at the end of the season, from everything recorded
              here.
            </p>
          </div>
        </Card>
      </Rise>
    </Stagger>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-3 text-[13px] last:border-0">
      <span className="text-mist-dim">{label}</span>
      <span className="tnum text-snow">{value}</span>
    </div>
  );
}

