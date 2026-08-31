import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A real date-range picker — the "check dates" the booking needs.
 *
 * Two months side by side, click a start then an end, disabled past days, azure
 * range fill. No calendar library: the arithmetic here is small and a dependency
 * that owns your dates is a dependency that owns your bugs. All dates are handled
 * as local calendar days (midnight local), which is what a person picking a
 * departure means — the money model converts to an instant at the edge.
 */

export interface DateRange {
  from: Date;
  to: Date;
}

const DAY = 86_400_000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function addDays(d: Date, n: number): Date {
  return startOfDay(new Date(d.getTime() + n * DAY));
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** Inclusive day count — 18→20 July is 3 days, the way a guide counts a trip.
 *  Clamped to ≥1 so a reversed range (only reachable via a crafted URL) can never
 *  drive a negative day count into the money model — matches `daysOf` in trip.ts. */
export function inclusiveDays(range: DateRange): number {
  return Math.max(1, Math.round((startOfDay(range.to).getTime() - startOfDay(range.from).getTime()) / DAY) + 1);
}

export function formatRange(range: DateRange): string {
  const from = range.from;
  const to = range.to;
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  if (sameDay(from, to)) return from.toLocaleDateString("en-GB", opts);
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  if (sameMonth) {
    return `${from.getDate()} – ${to.toLocaleDateString("en-GB", opts)}`;
  }
  return `${from.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${to.toLocaleDateString("en-GB", opts)}`;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** A LOCAL day key — never `toISOString`, which shifts a local midnight a day
    west of Greenwich. The oldest bug in this codebase, kept out on purpose. */
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function DateRangeField({
  value,
  onChange,
}: {
  value: DateRange | null;
  onChange: (r: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-tile border bg-obsidian/40 px-3.5 py-3 text-left transition-colors",
          open ? "border-azure/55" : "border-hairline hover:border-hairline-strong",
        )}
      >
        <span className="flex items-center gap-2.5">
          <CalendarDays size={15} strokeWidth={1.7} className="text-mist-dim" />
          <span className="text-[13.5px] text-snow">
            {value ? formatRange(value) : "Select your dates"}
          </span>
        </span>
        {value && (
          <span className="tnum text-[12px] text-mist-dim">
            {inclusiveDays(value)} {inclusiveDays(value) === 1 ? "day" : "days"}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(620px,calc(100vw-2.5rem))] rounded-card border border-hairline bg-elevated p-4 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.85)]">
          <Calendar
            value={value}
            onChange={(r) => {
              onChange(r);
              // Close once a full range is chosen; a single-day pick (from === to)
              // is still the "waiting for the end date" state, so stay open.
              if (!sameDay(r.from, r.to)) setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function Calendar({
  value,
  onChange,
}: {
  value: DateRange | null;
  onChange: (r: DateRange) => void;
}) {
  const today = startOfDay(new Date());
  const [month, setMonth] = useState<Date>(() =>
    value ? new Date(value.from.getFullYear(), value.from.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth(), 1),
  );
  // While the user has picked a start but not an end, we hold it here so the
  // next click completes the range rather than starting a new one.
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const maxMonth = addMonths(today, 18);

  function pick(day: Date) {
    if (day < today) return;
    if (!anchor) {
      setAnchor(day);
      onChange({ from: day, to: day });
      return;
    }
    if (day >= anchor) {
      onChange({ from: anchor, to: day });
    } else {
      onChange({ from: day, to: anchor });
    }
    setAnchor(null);
    setHover(null);
  }

  const canPrev = month > new Date(today.getFullYear(), today.getMonth(), 1);
  const canNext = month < maxMonth;

  /*
    Arrow keys move day-to-day through the visible grid — 11-CONTROLS-CONTRACT.
    Focus travels to the target day's own button (a roving focus, not a cursor
    state), so Enter/Space pick exactly what Tab-and-look already could, and
    screen readers hear each day as they move. Month paging stays on the
    prev/next buttons, which are themselves tabbable.
  */
  function onGridKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    const iso = (e.target as HTMLElement).getAttribute?.("data-day");
    if (delta === undefined || !iso) return;
    e.preventDefault();
    const [y, m, d] = iso.split("-").map(Number);
    const next = new Date(y, m, d + delta);
    (e.currentTarget.querySelector(`[data-day="${dayKey(next)}"]`) as HTMLButtonElement | null)?.focus();
  }

  return (
    <div onKeyDown={onGridKey}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => setMonth(addMonths(month, -1))}
          className="grid h-8 w-8 place-items-center rounded-full border border-hairline text-mist transition-colors hover:text-snow disabled:opacity-30"
        >
          <ChevronLeft size={16} strokeWidth={1.8} />
        </button>
        <span className="text-[12px] uppercase tracking-[0.14em] text-mist-dim">Pick your dates</span>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => setMonth(addMonths(month, 1))}
          className="grid h-8 w-8 place-items-center rounded-full border border-hairline text-mist transition-colors hover:text-snow disabled:opacity-30"
        >
          <ChevronRight size={16} strokeWidth={1.8} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <MonthGrid month={month} today={today} value={value} anchor={anchor} hover={hover} onHover={setHover} onPick={pick} />
        <div className="hidden sm:block">
          <MonthGrid month={addMonths(month, 1)} today={today} value={value} anchor={anchor} hover={hover} onHover={setHover} onPick={pick} />
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  month,
  today,
  value,
  anchor,
  hover,
  onHover,
  onPick,
}: {
  month: Date;
  today: Date;
  value: DateRange | null;
  anchor: Date | null;
  hover: Date | null;
  onHover: (d: Date | null) => void;
  onPick: (d: Date) => void;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startWeekday = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  // The range being previewed: either a committed range, or the anchor stretched
  // to whatever the cursor is over.
  let rangeFrom: Date | null = null;
  let rangeTo: Date | null = null;
  if (anchor && hover) {
    rangeFrom = hover >= anchor ? anchor : hover;
    rangeTo = hover >= anchor ? hover : anchor;
  } else if (value) {
    rangeFrom = value.from;
    rangeTo = value.to;
  }

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));

  return (
    <div>
      <p className="mb-2 text-center text-[13px] text-snow">
        {month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
      </p>
      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1 text-center text-[10.5px] uppercase tracking-[0.08em] text-mist-dim">
            {w}
          </span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} />;
          const past = day < today;
          const isFrom = rangeFrom && sameDay(day, rangeFrom);
          const isTo = rangeTo && sameDay(day, rangeTo);
          const inRange = rangeFrom && rangeTo && day > rangeFrom && day < rangeTo;
          const isEnd = isFrom || isTo;
          const isToday = sameDay(day, today);
          return (
            <button
              key={day.toISOString()}
              type="button"
              data-day={dayKey(day)}
              aria-label={day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              disabled={past}
              onMouseEnter={() => onHover(day)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onPick(day)}
              className={cn(
                "relative mx-auto grid h-9 w-9 place-items-center rounded-full text-[13px] transition-colors",
                past && "cursor-not-allowed text-mist-dim/40",
                !past && !isEnd && !inRange && "text-mist hover:bg-slate hover:text-snow",
                inRange && "rounded-none bg-azure/12 text-snow",
                isEnd && "bg-azure font-medium text-obsidian",
                // Today, marked — a ring, so it survives being inside a range.
                isToday && !isEnd && "ring-1 ring-inset ring-azure/50",
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
