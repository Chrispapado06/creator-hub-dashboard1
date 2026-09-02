import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { DEMO } from "@/offline/offline";
import type { Availability } from "@/guides/types";

/**
 * The date strip from the owner's "Find a Guide" mockup, 2026-08-31.
 *
 * Month header with arrows, a weekday row, a run of dates with the chosen range
 * filled, a dot under each day, and a Selected / Available / Limited legend —
 * copied.
 *
 * ── WHERE THE DOTS COME FROM, AND WHERE THEY DO NOT ─────────────────────────
 *
 * **ICEFALL holds no diary for any guide.** `Guide.availability` is a standing
 * status the guide set once — "taking work", "limited" — not a calendar, and
 * there is no per-date availability anywhere in the product. A dot claiming a
 * named guide is free on the 17th would be an appointment nobody made.
 *
 * So the dots are DEMO-ONLY and the component says which world it is in:
 *
 *   · Demo build (`SHOW_DEMO_DATA` or the offline bundle) — dots are drawn, the
 *     legend appears, and the screen looks like the drawing. Deterministic from
 *     the guide's id, so the same guide shows the same week every time; a
 *     calendar that reshuffles on each render is obviously fake and, worse,
 *     unusable for judging the design.
 *   · Production — the calendar still picks dates, because choosing when you
 *     want to climb is the athlete's own information and needs no diary. There
 *     are no dots, no legend, and a line saying availability is not known.
 *
 * That split is the whole reason this is safe to populate: the flag decides,
 * and production is unchanged.
 */

const WEEKDAY = ["M", "T", "W", "T", "F", "S", "S"];

/** Local `YYYY-MM-DD`. Never `toISOString()`, which is UTC and shifts the day west of Greenwich. */
function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * A stable pseudo-availability for a demo guide.
 *
 * Deterministic by (guide, day) so it never reshuffles between renders — the
 * honesty doctrine's rule for demo figures, and the difference between a
 * calendar you can evaluate and one that flickers.
 */
function demoAvailability(seed: string, key: string): Availability {
  let h = 0;
  const s = `${seed}:${key}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
  if (h % 7 === 0) return "unavailable";
  if (h % 3 === 0) return "limited";
  return "available";
}

export function AvailabilityCalendar({
  seed,
  from,
  to,
  onPick,
  className,
  layout = "strip",
}: {
  /**
   * Seeds the demo pattern. A guide's id on their own screen; a stable
   * directory key on the search screen, which the owner's mockup also draws
   * with dots. Absent means no dots at all.
   */
  seed?: string;
  from: Date;
  to: Date;
  onPick?: (day: Date) => void;
  className?: string;
  /**
   * "month" draws the whole month at once, seven columns deep.
   *
   * The strip shows fourteen days and scrolls sideways, which is right in a
   * narrow row on a profile but wrong where this IS the date control: someone
   * picking climbing dates thinks in months, and a fortnight that hides the
   * rest behind a horizontal scroll makes them hunt for a date they can
   * already name. The search screen asks for "month"; everything else keeps
   * the strip it was drawn with.
   */
  layout?: "strip" | "month";
}) {
  const [anchor, setAnchor] = useState(() => new Date(from));
  const showDots = (SHOW_DEMO_DATA || DEMO) && seed !== undefined;

  // Fourteen days from the start of the anchor's week — the mockup shows a
  // single scrollable run of days rather than a month grid.
  const days = useMemo(() => {
    const start = new Date(anchor);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchor]);

  const cellW = "w-10";
  const cellH = "h-10";
  const dayText = "text-[13px]";
  const gap = "gap-1";

  /**
   * The anchor month as a Monday-first grid, padded so the columns line up.
   * Nulls are the blanks before the 1st and after the last — rendered as empty
   * cells rather than as days from the neighbouring months, which would be
   * tappable dates the header says you are not looking at.
   */
  const monthCells = useMemo(() => {
    if (layout !== "month") return [];
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7;
    const count = new Date(y, m + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let i = 1; i <= count; i++) cells.push(new Date(y, m, i));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [anchor, layout]);

  const fromKey = dayKey(from);
  const toKey = dayKey(to);

  return (
    <div className={cn("rounded-card border border-hairline bg-graphite p-4", className)}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1))}
          className="grid h-8 w-8 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
        >
          <ChevronLeft size={17} strokeWidth={1.7} />
        </button>
        <p className="text-[13.5px] text-snow">
          {anchor.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
        </p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1))}
          className="grid h-8 w-8 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
        >
          <ChevronRight size={17} strokeWidth={1.7} />
        </button>
      </div>

      {layout === "month" ? (
        <div className="mt-3">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY.map((w, i) => (
              <span
                key={`w-${i}`}
                className="py-1 text-center text-[10.5px] uppercase tracking-[0.06em] text-mist-dim"
              >
                {w}
              </span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthCells.map((d, i) => {
              if (!d) return <span key={`blank-${i}`} aria-hidden />;
              const key = dayKey(d);
              const isEnd = key === fromKey || key === toKey;
              const inRange = key > fromKey && key < toKey;
              const status = showDots && seed !== undefined ? demoAvailability(seed, key) : null;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onPick?.(d)}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center gap-1 rounded-full text-[13.5px] transition-colors",
                    isEnd
                      ? "bg-azure font-medium text-obsidian"
                      : inRange
                        ? "bg-azure/[0.18] text-snow"
                        : "text-snow hover:bg-white/[0.06]",
                  )}
                >
                  <span>{d.getDate()}</span>
                  {status && (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isEnd
                          ? "bg-obsidian/45"
                          : status === "available"
                            ? "bg-summit"
                            : status === "limited"
                              ? "bg-mist-dim"
                              : "bg-transparent",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
      <div className="no-scrollbar mt-3 overflow-x-auto">
        <div className="min-w-max">
          <div className={cn("flex", gap)}>
            {days.map((d, i) => (
              <span
                key={`w-${i}`}
                className={cn(
                  "text-center text-[10.5px] uppercase tracking-[0.06em] text-mist-dim",
                  cellW,
                )}
              >
                {WEEKDAY[(d.getDay() + 6) % 7]}
              </span>
            ))}
          </div>

          <div className={cn("mt-2 flex", gap)}>
            {days.map((d) => {
              const key = dayKey(d);
              const isEnd = key === fromKey || key === toKey;
              const inRange = key > fromKey && key < toKey;
              const status = showDots ? demoAvailability(seed, key) : null;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onPick?.(d)}
                  className={cn(
                    "grid place-items-center rounded-full transition-colors",
                    cellH,
                    cellW,
                    dayText,
                    isEnd
                      ? "bg-azure font-medium text-obsidian"
                      : inRange
                        ? "bg-azure/[0.18] text-snow"
                        : "text-snow hover:bg-white/[0.06]",
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {showDots && (
            <div className={cn("mt-2 flex", gap)}>
              {days.map((d) => {
                const status = demoAvailability(seed, dayKey(d));
                return (
                  <span key={`d-${dayKey(d)}`} className={cn("grid h-3 place-items-center", cellW)}>
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        status === "available"
                          ? "bg-summit"
                          : status === "limited"
                            ? "bg-mist-dim"
                            : "bg-transparent",
                      )}
                    />
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {showDots ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline pt-3">
          <Key className="bg-azure" label="Selected" />
          <Key className="bg-summit" label="Available" />
          <Key className="bg-mist-dim" label="Limited" />
        </div>
      ) : (
        /* Production. The calendar still picks dates — that is the athlete's own
           information — but claims nothing about who is free. */
        <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
          Pick the days you want to climb. ICEFALL holds no diary for any guide, so nothing here
          says whether somebody is free — that is the first thing to ask them.
        </p>
      )}
    </div>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-mist-dim">
      <span className={cn("h-1.5 w-1.5 rounded-full", className)} />
      {label}
    </span>
  );
}
