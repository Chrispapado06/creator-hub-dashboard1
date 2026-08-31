import { useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { customRange, PRESETS, presetRange, rangeLabel, type DateRange, type PresetId } from "@/domain/range";
import { dayOffset, parseDay, startOfDay } from "@/lib/day";
import { cn } from "@/lib/utils";

/**
 * THE REPORTING WINDOW PICKER.
 *
 * INLINE, NOT A MODAL. It expands under the control that opened it and pushes
 * the page down. A sheet over the figures would hide the very numbers the guide
 * is changing the window to see, and this app's register is a phone read with
 * one hand — nothing here needs to trap focus.
 *
 * PRESETS FIRST, CUSTOM SECOND. Four taps cover almost every question a guide
 * actually asks ("how was the season", "how is this month"). The calendar is
 * there for the fifth, not in the way of the first four.
 *
 * THE CALENDAR IS A RANGE, AND IT SHOWS ITS WORK. First tap sets the start,
 * second sets the end, and tapping before the start begins again rather than
 * silently producing a backwards range — which would otherwise render as a
 * window with no days in it and every figure unavailable, with nothing on screen
 * saying why.
 */
export function RangePicker({
  value,
  onChange,
  onClose,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<PresetId>("season");
  const [monthOffset, setMonthOffset] = useState(0);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  const now = new Date();
  const cursor = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const firstWeekday = (cursor.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      dayOffset(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1), 0),
    ),
  ];

  const choosePreset = (id: PresetId) => {
    setPreset(id);
    if (id === "custom") {
      setStart(null);
      setEnd(null);
      return;
    }
    onChange(presetRange(id, now));
    onClose();
  };

  const tapDay = (day: string) => {
    if (start === null || (start !== null && end !== null)) {
      setStart(day);
      setEnd(null);
      return;
    }
    if (day < start) {
      // Backwards is a restart, not an error state and not a silent swap.
      setStart(day);
      return;
    }
    setEnd(day);
  };

  const apply = () => {
    const a = parseDay(start ?? "");
    const b = parseDay(end ?? start ?? "");
    if (!a || !b) return;
    onChange(customRange(a, b));
    onClose();
  };

  const inSelection = (day: string) =>
    start !== null && end !== null && day >= start && day <= end;

  return (
    <Card className="mt-3">
      <p className="section-label">Show me</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => choosePreset(p.id)}
            aria-pressed={preset === p.id}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-[12px] transition-colors",
              preset === p.id
                ? "border-azure bg-azure/15 text-azure"
                : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="mt-4 border-t border-hairline pt-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonthOffset((m) => m - 1)}
              className="text-mist hover:text-snow"
            >
              <ChevronLeft size={18} strokeWidth={1.7} />
            </button>
            <p className="tnum text-[13.5px] text-snow">{monthLabel}</p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonthOffset((m) => m + 1)}
              className="text-mist hover:text-snow"
            >
              <ChevronRight size={18} strokeWidth={1.7} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i} className="pb-1 text-center text-[9.5px] uppercase text-mist-dim">
                {d}
              </span>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <span key={`pad-${i}`} />;
              const d = parseDay(day);
              const isStart = day === start;
              const isEnd = day === end;
              const inner = inSelection(day) && !isStart && !isEnd;
              const isToday = d !== null && d.getTime() === startOfDay(now).getTime();
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => tapDay(day)}
                  className={cn(
                    "tnum grid h-8 place-items-center rounded-tile text-[12px] transition-colors",
                    (isStart || isEnd) && "bg-azure text-obsidian",
                    inner && "bg-azure/20 text-snow",
                    !isStart && !isEnd && !inner && "text-mist hover:bg-white/[0.05]",
                    isToday && !isStart && !isEnd && "ring-1 ring-snow/35",
                  )}
                >
                  {d?.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-hairline pt-3">
            <p className="tnum min-w-0 flex-1 truncate text-[12px] text-mist-dim">
              {start === null
                ? "Tap the first day"
                : end === null
                  ? "Now tap the last day"
                  : rangeLabel(parseDay(start)!, parseDay(end)!)}
            </p>
            <button
              type="button"
              onClick={apply}
              disabled={start === null}
              className="flex shrink-0 items-center gap-1.5 rounded-tile bg-azure px-3 py-1.5 text-[12px] font-medium text-obsidian disabled:opacity-40"
            >
              <Check size={13} strokeWidth={2.4} />
              Apply
            </button>
          </div>
        </div>
      )}

      <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
        Showing {value.label.toLowerCase()}. Every figure and the chart follow this window.
      </p>
    </Card>
  );
}
