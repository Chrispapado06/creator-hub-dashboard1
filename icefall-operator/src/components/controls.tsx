/**
 * The control kit — listbox, date field, date-range field.
 *
 * Implements icefall-sessions/11-CONTROLS-CONTRACT.md for the operator portal.
 * Native `<select>` and `<input type="date">` are retired from user-facing
 * surfaces; these are their replacements, built to be BETTER than native for
 * keyboard and screen-reader users, not just prettier.
 *
 * THEME RECONCILIATION (settled, recorded here per the sweep brief): the
 * contract file groups this portal with "the dark apps", but owner decision 18
 * and OP-09 made the operator portal LIGHT BY DEFAULT with a dark theme
 * option, all through tokens. This kit is therefore THEME-AWARE VIA THE
 * EXISTING TOKENS (bg-canvas/surface/raised/elevated, text-ink/muted/faint,
 * border-line, azure primary, bg-scrim) and is correct in both themes
 * automatically. Azure is the primary in both.
 *
 * BUTTONS: the existing `Button` in ui.tsx already satisfies the contract —
 * primary (azure), secondary/ghost (hairline, quiet), quiet, danger as its own
 * colour, real hover/disabled states with a `title` for the reason, and the
 * app-global :focus-visible ring in index.css. No second button ships from
 * this file, deliberately.
 *
 * DATES: values in and out of the date controls are ISO `YYYY-MM-DD` strings
 * or null — §6af stands. Display goes through formatDay ("31 Aug 2026"),
 * never raw dd/mm/yyyy, and never travels into storage. `strictIsoDay` is the
 * write-path parser: it refuses anything that does not round-trip. "Today" is
 * TODAY from @/domain/dates — the app's fixed clock — never `new Date()`.
 *
 * Popovers are anchored (absolute, z-30, hairline bg-surface), not modal —
 * no scrim, closed on outside click and Escape, focus returned to the opener.
 */

import {
  CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode,
} from "react";
import { formatDay, formatRange, parseDay, TODAY } from "@/domain/dates";

/* -------------------------------------------------------------------------- */
/* Day arithmetic — string in, string out, no local timezone anywhere         */
/* -------------------------------------------------------------------------- */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Date.UTC is timezone-free; month here is 1-based. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Weekday of a day, Monday-first (0 = Mon … 6 = Sun). */
function weekdayMon0(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/** `iso` shifted by `delta` whole days, via UTC arithmetic only. */
function shiftDay(iso: string, delta: number): string {
  const d = parseDay(iso);
  if (!d) return iso;
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + delta));
  return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * The write-path parser. Accepts exactly `YYYY-MM-DD` naming a real calendar
 * day, and returns it unchanged; everything else — wrong shape, month 13,
 * 31 Feb, trailing garbage — is refused with null, never coerced. Screens
 * that persist a date run it through here and show a refusal, per §6af.
 */
export function strictIsoDay(s: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  const day = Number(s.slice(8, 10));
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return isoOf(year, month, day) === s ? s : null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const WEEKDAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

/* -------------------------------------------------------------------------- */
/* Popover plumbing — RowMenu's outside-click + Escape idiom, plus focus      */
/* return to the opener, which a popover that contains focus must do          */
/* -------------------------------------------------------------------------- */

function useOutsideClose(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, ref, close]);
}

/** Anchored popover surface: hairline outline, no shadow, no scrim — §17. */
const POP_CLASS =
  "hairline absolute top-full left-0 z-30 mt-1 rounded-card bg-surface";

/** The trigger buttons share the app's input skin from ui.tsx's inputClass. */
const TRIGGER_CLASS =
  "flex w-full items-center gap-2 rounded-tile border border-line bg-elevated px-2.5 py-1.5 text-left text-[13px] transition-colors hover:border-azure disabled:cursor-not-allowed disabled:opacity-45";

function ControlLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span id={id} className="mb-1.5 block text-[12.5px] font-medium text-ink">
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Listbox                                                                    */
/* -------------------------------------------------------------------------- */

export interface ListboxOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * The styled `<select>` replacement. Plain string values so the sweep is
 * mechanical: `value` and `onChange` line up 1:1 with the native control they
 * replace — same values, same handler, new shell.
 *
 * Keyboard: Arrow keys move the active option, Home/End jump, Enter or Space
 * selects, Escape closes and returns focus to the button; when the list
 * exceeds 8 options, typing does typeahead over the labels.
 */
export function Listbox({
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled,
  label,
}: {
  value: string | null;
  options: ListboxOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ buffer: string; at: number }>({ buffer: "", at: 0 });
  const baseId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  const openList = () => {
    if (disabled) return;
    const i = options.findIndex((o) => o.value === value);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  };

  const closeList = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useOutsideClose(open, rootRef, () => setOpen(false));

  // Focus moves into the list while it is open; aria-activedescendant tracks.
  useLayoutEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  // Keep the active option in view as arrows move it.
  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`${baseId}-opt-${active}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active, baseId]);

  const pick = (i: number) => {
    const opt = options[i];
    if (!opt) return;
    onChange(opt.value);
    closeList(true);
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeList(true);
    } else if (e.key === "Tab") {
      closeList(false);
    } else if (options.length > 8 && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Typeahead over the labels, native-select style, once the list is
      // long enough that arrowing is a chore (~8 per the contract).
      const now = Date.now();
      const t = typeahead.current;
      t.buffer = (now - t.at > 600 ? "" : t.buffer) + e.key.toLowerCase();
      t.at = now;
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(t.buffer));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {label && <ControlLabel id={`${baseId}-label`}>{label}</ControlLabel>}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? `${baseId}-label ${baseId}-value` : undefined}
        onClick={() => (open ? closeList(true) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openList();
          }
        }}
        className={TRIGGER_CLASS}
      >
        <span id={`${baseId}-value`} className={`min-w-0 flex-1 truncate ${selected ? "text-ink" : "text-faint"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className="shrink-0 text-faint" aria-hidden />
      </button>
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={label ? `${baseId}-label` : undefined}
          aria-activedescendant={`${baseId}-opt-${active}`}
          onKeyDown={onListKeyDown}
          className={`${POP_CLASS} max-h-64 w-full min-w-[180px] overflow-y-auto py-1 outline-none`}
        >
          {options.map((opt, i) => (
            <li
              key={opt.value}
              id={`${baseId}-opt-${i}`}
              role="option"
              aria-selected={opt.value === value}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault() /* keep focus in the list */}
              onClick={() => pick(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[12.5px] transition-colors ${
                i === active ? "bg-raised text-ink" : "text-ink"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{opt.label}</span>
                {opt.hint && <span className="block truncate text-[11px] text-faint">{opt.hint}</span>}
              </span>
              {opt.value === value && <Check size={13} className="shrink-0 text-azure" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Calendar panel — shared by DateField and DateRangeField                    */
/* -------------------------------------------------------------------------- */

interface MonthView {
  year: number;
  month: number;
}

function monthOf(iso: string): MonthView {
  const d = parseDay(iso);
  return d ? { year: d.year, month: d.month } : monthOf(TODAY);
}

function addMonths(v: MonthView, delta: number): MonthView {
  const zero = v.year * 12 + (v.month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (((zero % 12) + 12) % 12) + 1 };
}

function clampIso(iso: string, min?: string, max?: string): string {
  // Lexicographic comparison is correct for YYYY-MM-DD.
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/**
 * One month grid with roving-tabindex day navigation. Arrow keys move the
 * focused day (crossing month edges turns the page), Enter picks it, Escape
 * bubbles to the owning popover which closes and returns focus to its opener.
 * Out-of-range days keep `aria-disabled` rather than `disabled` so arrowing
 * over them never drops keyboard focus on the floor.
 */
function CalendarPanel({
  initialIso,
  isSelected,
  isInRange,
  isDisabled,
  onPick,
  autoFocus,
  focusRequest,
}: {
  initialIso: string;
  isSelected: (iso: string) => boolean;
  isInRange?: (iso: string) => boolean;
  isDisabled?: (iso: string) => boolean;
  onPick: (iso: string) => void;
  autoFocus?: boolean;
  /** Bumps when the owner wants the grid re-focused (the Custom preset). */
  focusRequest?: number;
}) {
  const [view, setView] = useState<MonthView>(() => monthOf(initialIso));
  const [focusIso, setFocusIso] = useState(initialIso);
  const wantFocus = useRef(Boolean(autoFocus));
  const gridRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`);
    el?.focus();
  });

  useEffect(() => {
    if (focusRequest === undefined || focusRequest === 0) return;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`);
    el?.focus();
  }, [focusRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveFocus = (deltaDays: number) => {
    const next = shiftDay(focusIso, deltaDays);
    setFocusIso(next);
    setView(monthOf(next));
    wantFocus.current = true;
  };

  const turnPage = (delta: number) => {
    const nextView = addMonths(view, delta);
    setView(nextView);
    // Keep the focus day meaningful in the new month, without stealing focus
    // from the month button the user is pressing.
    const d = parseDay(focusIso);
    if (d) {
      const day = Math.min(d.day, daysInMonth(nextView.year, nextView.month));
      setFocusIso(isoOf(nextView.year, nextView.month, day));
    }
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); moveFocus(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); moveFocus(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(-7); }
    else if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(7); }
    else if (e.key === "PageUp") { e.preventDefault(); turnPage(-1); wantFocus.current = true; }
    else if (e.key === "PageDown") { e.preventDefault(); turnPage(1); wantFocus.current = true; }
  };

  const count = daysInMonth(view.year, view.month);
  const lead = weekdayMon0(view.year, view.month, 1);
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => i + 1),
  ];

  return (
    <div className="w-[252px] p-3 select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => turnPage(-1)}
          aria-label="Previous month"
          className="rounded-tile p-1 text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <ChevronLeft size={14} aria-hidden />
        </button>
        <div className="text-[12.5px] font-semibold text-ink" aria-live="polite">
          {MONTH_NAMES[view.month - 1]} {view.year}
        </div>
        <button
          type="button"
          onClick={() => turnPage(1)}
          aria-label="Next month"
          className="rounded-tile p-1 text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <ChevronRight size={14} aria-hidden />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7">
        {WEEKDAY_HEADERS.map((w) => (
          <div key={w} className="grid h-7 place-items-center text-[10px] font-medium tracking-[0.08em] text-faint uppercase" aria-hidden>
            {w}
          </div>
        ))}
      </div>
      <div ref={gridRef} role="group" aria-label="Calendar days" onKeyDown={onGridKeyDown} className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} aria-hidden />;
          const iso = isoOf(view.year, view.month, day);
          const selected = isSelected(iso);
          const inRange = !selected && Boolean(isInRange?.(iso));
          const off = Boolean(isDisabled?.(iso));
          const today = iso === TODAY;
          const skin = selected
            ? "bg-azure font-semibold text-canvas"
            : inRange
              ? "bg-azure-soft text-azure-ink"
              : off
                ? "text-faint opacity-50"
                : today
                  ? "hairline font-semibold text-azure-ink hover:bg-raised"
                  : "text-ink hover:bg-raised";
          return (
            <button
              key={iso}
              type="button"
              data-iso={iso}
              tabIndex={iso === focusIso ? 0 : -1}
              aria-disabled={off || undefined}
              aria-current={today ? "date" : undefined}
              aria-pressed={selected}
              aria-label={formatDay(iso)}
              onClick={() => {
                setFocusIso(iso);
                if (!off) onPick(iso);
              }}
              className={`tnum mx-auto grid h-8 w-8 place-items-center rounded-tile text-[12.5px] transition-colors ${skin} ${off ? "cursor-not-allowed" : ""}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DateField — the single-date `<input type="date">` replacement              */
/* -------------------------------------------------------------------------- */

/**
 * A button showing the chosen day as "31 Aug 2026" (never dd/mm/yyyy),
 * opening an inline calendar popover. Value in and out is an ISO
 * `YYYY-MM-DD` string or null — the display format never travels.
 */
export function DateField({
  value,
  onChange,
  min,
  max,
  label,
  clearable,
  placeholder = "Pick a date",
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  min?: string;
  max?: string;
  label?: string;
  clearable?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useOutsideClose(open, rootRef, () => setOpen(false));

  const valid = value ? strictIsoDay(value) : null;
  const initialIso = clampIso(valid ?? TODAY, min, max);

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (open && e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        }
      }}
    >
      {label && <ControlLabel id={`${baseId}-label`}>{label}</ControlLabel>}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={label ? `${baseId}-label ${baseId}-value` : undefined}
        onClick={() => (open ? close(true) : setOpen(true))}
        className={TRIGGER_CLASS}
      >
        <CalendarDays size={14} className="shrink-0 text-faint" aria-hidden />
        <span id={`${baseId}-value`} className={`min-w-0 flex-1 truncate ${valid ? "text-ink" : "text-faint"}`}>
          {valid ? formatDay(valid) : placeholder}
        </span>
      </button>
      {open && (
        <div role="dialog" aria-label={label ?? "Choose a date"} className={POP_CLASS}>
          <CalendarPanel
            autoFocus
            initialIso={initialIso}
            isSelected={(iso) => iso === valid}
            isDisabled={(iso) => Boolean((min && iso < min) || (max && iso > max))}
            onPick={(iso) => {
              onChange(iso);
              close(true);
            }}
          />
          {clearable && valid && (
            <div className="border-t border-line-soft px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  close(true);
                }}
                className="rounded-tile px-2 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-raised hover:text-ink"
              >
                Clear date
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DateRangeField — one calendar, start/end chips, preset pills               */
/* -------------------------------------------------------------------------- */

export interface DateRange {
  from: string | null;
  to: string | null;
}

export interface RangePreset {
  label: string;
  /**
   * A preset with `days` selects the trailing window ENDING at TODAY — this
   * is a reporting range in an app with a fixed clock, so "7 days" means the
   * 7 calendar days up to and including TODAY. A preset without `days`
   * ("Custom") just moves focus into the calendar.
   */
  days?: number;
}

/**
 * The range picker for reporting screens. Picking works like every calendar
 * range control: the first pick sets the start (onChange fires with
 * `{from, to: null}`), the second completes it — picks are swapped if the
 * second is earlier, so the emitted range is always ordered.
 */
export function DateRangeField({
  value,
  onChange,
  presets,
  label,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
  presets?: RangePreset[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [focusBump, setFocusBump] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useOutsideClose(open, rootRef, () => setOpen(false));

  const from = value.from ? strictIsoDay(value.from) : null;
  const to = value.to ? strictIsoDay(value.to) : null;
  const hasRange = Boolean(from || to);

  const pick = (iso: string) => {
    if (!from || (from && to)) {
      onChange({ from: iso, to: null });
    } else {
      onChange(iso < from ? { from: iso, to: from } : { from, to: iso });
    }
  };

  const presetFor = (days: number): DateRange => ({
    from: shiftDay(TODAY, -(days - 1)),
    to: TODAY,
  });

  const presetActive = (p: RangePreset): boolean => {
    if (p.days === undefined) return false;
    const r = presetFor(p.days);
    return from === r.from && to === r.to;
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(e) => {
        if (open && e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        }
      }}
    >
      {label && <ControlLabel id={`${baseId}-label`}>{label}</ControlLabel>}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={label ? `${baseId}-label ${baseId}-value` : undefined}
        onClick={() => (open ? close(true) : setOpen(true))}
        className={TRIGGER_CLASS}
      >
        <CalendarDays size={14} className="shrink-0 text-faint" aria-hidden />
        <span id={`${baseId}-value`} className={`tnum min-w-0 flex-1 truncate ${hasRange ? "text-ink" : "text-faint"}`}>
          {hasRange ? formatRange(from, to) : "Pick a range"}
        </span>
      </button>
      {open && (
        <div role="dialog" aria-label={label ?? "Choose a date range"} className={POP_CLASS}>
          {presets && presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-line-soft px-3 pt-3 pb-2.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={presetActive(p)}
                  onClick={() => {
                    if (p.days === undefined) {
                      setFocusBump((n) => n + 1); // Custom: focus the calendar
                    } else {
                      onChange(presetFor(p.days));
                    }
                  }}
                  className={`rounded-pill px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                    presetActive(p)
                      ? "bg-azure text-canvas"
                      : "hairline bg-surface text-muted hover:bg-raised hover:text-ink"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 pt-3">
            <span className={`tnum inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium ${from ? "bg-azure-soft text-azure-ink" : "bg-canvas text-faint"}`}>
              {from ? formatDay(from) : "Start"}
            </span>
            <span className="text-[11px] text-faint" aria-hidden>–</span>
            <span className={`tnum inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium ${to ? "bg-azure-soft text-azure-ink" : "bg-canvas text-faint"}`}>
              {to ? formatDay(to) : "End"}
            </span>
          </div>
          <CalendarPanel
            autoFocus
            focusRequest={focusBump}
            initialIso={to ?? from ?? TODAY}
            isSelected={(iso) => iso === from || iso === to}
            isInRange={(iso) => Boolean(from && to && iso > from && iso < to)}
            onPick={pick}
          />
        </div>
      )}
    </div>
  );
}
