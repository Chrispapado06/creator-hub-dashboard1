import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The single-date control — 11-CONTROLS-CONTRACT.
 *
 * A button carrying the chosen date as words ("31 Aug 2026", never raw
 * dd/mm/yyyy) that opens an inline month-grid popover: arrow keys move a day at
 * a time, PageUp/PageDown a month, Enter picks, Escape closes without picking.
 * Today is ringed, the chosen day is filled.
 *
 * Values are ISO `YYYY-MM-DD` strings in BOTH directions — §6af: the display
 * format exists only inside the button label, and never travels into storage.
 * Parsing is strict and LOCAL: `new Date(iso)` is UTC midnight, which is
 * yesterday west of Greenwich — the bug this project has fixed repeatedly, so
 * this file splits the parts and uses the local constructor.
 *
 * Replaces `<input type="date">`, which rendered the platform's spinner in the
 * platform's colours and format, took typed input the screen then had to
 * distrust, and looked like a form control from a different app.
 */

const DAY_HEAD = ["M", "T", "W", "T", "F", "S", "S"];

function parseIsoLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // Rejects 2027-02-31, which the constructor would roll silently into March.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

function toIso(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function DateField({
  value,
  onChange,
  min,
  max,
  label,
  placeholder = "Choose a date",
  className,
}: {
  /** ISO `YYYY-MM-DD`, or "" for unset. */
  value: string;
  onChange: (iso: string) => void;
  /** ISO bounds, inclusive. Days outside are rendered but refuse the pick. */
  min?: string;
  max?: string;
  /** Announced to screen readers; the visible label is the caller's business. */
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = useMemo(() => parseIsoLocal(value), [value]);
  /** The day the keyboard is on. Starts at the chosen day, else today. */
  const [cursor, setCursor] = useState<Date>(() => chosen ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const gridId = useId();

  // Outside click and Escape both close without changing the value.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setCursor(chosen ?? new Date());
      // Focus the grid so arrow keys work immediately.
      requestAnimationFrame(() => gridRef.current?.focus());
    }
    // The cursor deliberately re-syncs to the value each time the popover
    // opens, not while it is closed — reopening always starts from the truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const inBounds = (d: Date) => {
    const iso = toIso(d);
    if (min && iso < min) return false;
    if (max && iso > max) return false;
    return true;
  };

  const pick = (d: Date) => {
    if (!inBounds(d)) return;
    onChange(toIso(d));
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = (days: number) => {
      e.preventDefault();
      setCursor((c) => new Date(c.getFullYear(), c.getMonth(), c.getDate() + days));
    };
    if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowUp") step(-7);
    else if (e.key === "ArrowDown") step(7);
    else if (e.key === "PageUp") {
      e.preventDefault();
      setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, c.getDate()));
    } else if (e.key === "PageDown") {
      e.preventDefault();
      setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, c.getDate()));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(cursor);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  /** The weeks of the cursor's month, Monday-first, padded with nulls. */
  const weeks = useMemo(() => {
    const y = cursor.getFullYear();
    const mo = cursor.getMonth();
    const first = new Date(y, mo, 1);
    const lead = (first.getDay() + 6) % 7;
    const count = new Date(y, mo + 1, 0).getDate();
    const cells: (Date | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: count }, (_, i) => new Date(y, mo, i + 1)),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const out: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cursor]);

  const todayIso = toIso(new Date());
  const cursorIso = toIso(cursor);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-12 w-full items-center gap-2.5 rounded-tile border border-hairline bg-elevated/40 px-3.5 text-left text-[14px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60",
          open ? "border-azure/50" : "hover:border-hairline-strong",
          chosen ? "text-snow" : "text-mist-dim",
        )}
      >
        <CalendarIcon size={15} strokeWidth={1.7} aria-hidden="true" className="shrink-0 text-mist-dim" />
        <span className="tnum min-w-0 flex-1 truncate">
          {/* Formatted from the LOCAL-parsed date, not via `fmtDate(value)`:
              that helper does `new Date(iso)`, which for a bare YYYY-MM-DD is
              UTC midnight — the previous day west of Greenwich. This control
              must not display a different day from the one it stores. */}
          {chosen
            ? chosen.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
            : placeholder}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${label} calendar`}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-card border border-hairline bg-graphite p-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              className="grid h-8 w-8 place-items-center rounded-full text-mist transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
            >
              <ChevronLeft size={16} strokeWidth={1.7} />
            </button>
            <p className="text-[13px] text-snow">
              {cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
            </p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
              className="grid h-8 w-8 place-items-center rounded-full text-mist transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
            >
              <ChevronRight size={16} strokeWidth={1.7} />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 text-center">
            {DAY_HEAD.map((d, i) => (
              <span key={i} className="py-1 text-[10px] uppercase tracking-[0.1em] text-mist-dim">
                {d}
              </span>
            ))}
          </div>

          <div
            ref={gridRef}
            id={gridId}
            role="grid"
            aria-label={label}
            tabIndex={0}
            onKeyDown={onKey}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/40 rounded-[10px]"
          >
            {weeks.map((week, wi) => (
              <div key={wi} role="row" className="grid grid-cols-7">
                {week.map((d, di) => {
                  if (!d) return <span key={di} />;
                  const iso = toIso(d);
                  const isChosen = value === iso;
                  const isToday = iso === todayIso;
                  const isCursor = iso === cursorIso;
                  const disabled = !inBounds(d);
                  return (
                    <button
                      key={di}
                      type="button"
                      role="gridcell"
                      aria-selected={isChosen}
                      aria-current={isToday ? "date" : undefined}
                      disabled={disabled}
                      onClick={() => pick(d)}
                      className={cn(
                        "tnum mx-auto my-0.5 grid h-9 w-9 place-items-center rounded-full text-[12.5px] transition-colors",
                        disabled
                          ? "text-mist-dim/40"
                          : isChosen
                            ? "bg-azure text-obsidian"
                            : "text-snow hover:bg-white/[0.06]",
                        isToday && !isChosen && "border border-azure/50",
                        isCursor && !isChosen && "ring-1 ring-azure/40",
                      )}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
