import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, SectionLabel } from "@/components/ui/primitives";
import { Screen, ScreenHeader, SegmentedTabs } from "@/components/layout/chrome";
import { ActivityCalendar } from "@/components/domain/ActivityCalendar";
import { cn } from "@/lib/utils";
import {
  MODE_LABELS,
  fmtDistance,
  fmtDurationCompact,
  fmtElevation,
  fmtHours,
} from "@/lib/format";
import { summarise, useActivityFeed, useRecordedActivities } from "@/tracking/feed";
import type { Activity, SportMode } from "@/types";

/**
 * "Minimal timeline" — chosen 14 September 2026 from three redesign
 * directions built for review (see the ICEFALL handbook, §18.54). The other
 * two ("Trends & records", "Journal") and the three temporary
 * `/dev/activity-redesign-*` routes are removed; this is now simply the
 * page.
 *
 * The instinct here is the opposite of a chart-heavy or image-heavy page:
 * type and spacing carry it, not artwork.
 *  - No cards. Rows are separated by hairline rules and whitespace, per the
 *    house "no boxes" rule — the only element that reads as a distinct
 *    object is the consistency strip, and even that is a bare row of bars,
 *    not a panel.
 *  - The one deliberate flourish is `font-serif` (Instrument Serif) — already
 *    declared as a design token in `index.css` but unused anywhere in the
 *    app before this — used only for the two things worth making memorable:
 *    the big totals and the month names. Every number that has to be
 *    scanned and compared (the per-activity list) stays in the app's
 *    ordinary tabular sans, in fixed-width columns, so it lines up.
 *  - The "Consistency" strip answers "how many days this month has this
 *    athlete actually gone out", counted from real recorded activities
 *    grouped by calendar day — not an invented streak or score. A day with
 *    no activity draws as an empty tick, not a zero to feel bad about.
 *
 * The History/Calendar toggle predates this redesign and is unchanged:
 * Calendar renders `ActivityCalendar` exactly as it always has.
 */

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

  // Grouped by calendar month. `list` is already newest-first (see
  // `useActivityFeed`), and a Map keeps first-insertion order, so the groups
  // come out newest-first too without a second sort.
  const groups = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of list) {
      const d = new Date(a.startedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      const arr = map.get(key);
      if (arr) arr.push(a);
      else map.set(key, [a]);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      label: new Date(items[0].startedAt).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      }),
      items,
      totals: summarise(items),
    }));
  }, [list]);

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
        <>
          <div className="px-5">
            {/* ---- Filters — text, not pills; an underline instead of a chip --- */}
            <div className="no-scrollbar -mx-1 mt-5 flex gap-x-5 overflow-x-auto px-1">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "shrink-0 border-b pb-2 text-[12.5px] transition-colors",
                    filter === f.value
                      ? "border-azure text-snow"
                      : "border-transparent text-mist-dim hover:text-mist",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* ---- Totals — the masthead figures, set in the display serif ---- */}
            <div className="mt-7 flex items-start gap-8">
              <TotalFigure value={fmtDistance(totals.distanceKm, 0)} unit="km" label="Distance" />
              <TotalFigure value={fmtElevation(totals.elevationM)} unit="m" label="Ascent" />
              <TotalFigure value={fmtHours(totals.hours)} label="Time" />
            </div>

            {/* ---- Consistency — a real, honest read of this month ------------ */}
            <MonthPulse feed={feed} />
          </div>

          <div className="px-5 pb-8">
            {groups.length === 0 && (
              <p className="py-16 text-center text-[13px] text-mist-dim">Nothing recorded yet.</p>
            )}

            {groups.map((g, gi) => (
              <div key={g.key} className={cn(gi > 0 && "mt-7 border-t border-hairline pt-6")}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-serif text-[17px] italic tracking-tight text-snow">
                    {g.label}
                  </p>
                  <p className="tnum shrink-0 text-[11px] text-mist-dim">
                    {g.items.length} {g.items.length === 1 ? "activity" : "activities"}
                    {g.totals.count > 0 && (
                      <>
                        {" "}
                        · {fmtDistance(g.totals.distanceKm, 0)} km ·{" "}
                        {fmtElevation(g.totals.elevationM)} m
                      </>
                    )}
                  </p>
                </div>

                <div className="mt-1 divide-y divide-hairline">
                  {g.items.map((a) => (
                    <ActivityRow key={a.id} activity={a} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {view === "calendar" && <ActivityCalendar recorded={recorded} />}
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* TotalFigure — the one place this direction spends its display type         */
/* -------------------------------------------------------------------------- */

function TotalFigure({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div>
      <p className="font-serif text-[32px] italic leading-none tracking-tight text-snow">
        {value}
        {unit && (
          <span className="ml-1 font-sans text-[12px] font-normal not-italic text-mist">
            {unit}
          </span>
        )}
      </p>
      <p className="section-label mt-2.5">{label}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ActivityRow — flat, tabular, no card                                       */
/* -------------------------------------------------------------------------- */

function ActivityRow({ activity: a }: { activity: Activity }) {
  const d = new Date(a.startedAt);
  const day = d.getDate();
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();

  return (
    <Link to={`/activity/${a.id}`} className="flex items-center gap-3 py-3">
      <div className="w-8 shrink-0 text-center">
        <p className="tnum text-[14px] font-light leading-none text-snow">{day}</p>
        <p className="mt-1 text-[8.5px] tracking-[0.08em] text-mist-dim">{weekday}</p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] text-snow">
          {a.title}
          {a.simulated && (
            <span className="ml-2 text-[9.5px] uppercase tracking-[0.1em] text-alert/80">
              Sim
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-mist-dim">
          {MODE_LABELS[a.mode] ?? a.mode} · {a.location}
        </p>
      </div>

      {/* Fixed-width numeric columns, repeated identically on every row, so
          distance / elevation / time line up down the whole list. */}
      <div className="tnum grid shrink-0 grid-cols-[48px_48px_44px] gap-3 text-right text-[12px] text-mist">
        <span>
          {fmtDistance(a.distanceKm, 0)}
          <span className="ml-0.5 text-[9.5px] text-mist-dim">km</span>
        </span>
        <span>
          {fmtElevation(a.elevationGainM)}
          <span className="ml-0.5 text-[9.5px] text-mist-dim">m</span>
        </span>
        <span>{fmtDurationCompact(a.durationSec)}</span>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* MonthPulse — real day-by-day presence for the current calendar month       */
/* -------------------------------------------------------------------------- */

/**
 * Not a streak counter. Streaks imply a scoring system this app has no real
 * logic for — this only ever answers a question ICEFALL can actually
 * measure: which of the days that have happened so far this month carry a
 * recorded, non-simulated activity. Weight (bar height) is that day's real
 * elevation gain relative to the month's busiest day so far, matching the
 * same elevation-weighted convention `ActivityCalendar` already uses — a big
 * climbing day should look bigger than a short flat one, not the same size.
 */
function MonthPulse({ feed }: { feed: Activity[] }) {
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const monthIdx = now.getMonth();
  const daysElapsed = now.getDate();
  const monthName = now.toLocaleDateString("en-GB", { month: "long" });

  const byDay = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of feed) {
      if (a.simulated) continue;
      const d = new Date(a.startedAt);
      if (d.getFullYear() !== year || d.getMonth() !== monthIdx) continue;
      m.set(d.getDate(), (m.get(d.getDate()) ?? 0) + a.elevationGainM);
    }
    return m;
  }, [feed, year, monthIdx]);

  const peak = Math.max(1, ...byDay.values());
  const activeDays = byDay.size;

  return (
    <div className="mt-7 border-b border-hairline pb-6">
      <SectionLabel
        action={
          <p className="tnum text-[11px] text-mist-dim">
            <span className="text-snow">{activeDays}</span> of {daysElapsed} days active in{" "}
            {monthName}
          </p>
        }
      >
        Consistency
      </SectionLabel>

      <div className="mt-3 flex items-end gap-[3px]">
        {Array.from({ length: daysElapsed }, (_, i) => {
          const day = i + 1;
          const v = byDay.get(day) ?? 0;
          const pct = v > 0 ? Math.max(18, (v / peak) * 100) : 0;
          return (
            <div key={day} className="flex h-7 flex-1 items-end" title={`${day} ${monthName}`}>
              <div
                className={cn("w-full rounded-full", v > 0 ? "bg-azure/75" : "bg-white/[0.07]")}
                style={{ height: v > 0 ? `${pct}%` : "2px" }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
