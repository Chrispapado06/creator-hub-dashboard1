import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatDay } from "@/lib/utils";
import { GOLD } from "@/components/drawn";

/**
 * The CRM's control kit — 11-CONTROLS-CONTRACT, light/gold palette reference.
 *
 * Owner instruction: "replace old select dates or buttons and modernising it
 * through the entire apps we have." Native selects and dd/mm/yyyy date inputs
 * are retired from every staff-facing surface; this file is their one
 * replacement, and §6u applies — the BEHAVIOUR here is a contract shared with
 * the dark apps' kits, so an improvement belongs in the contract before it
 * belongs in a tree.
 *
 * The two rules that outrank prettiness:
 *   - Keyboard and screen-reader behaviour must not regress from native:
 *     arrows/Enter/Esc/Home/End everywhere, typeahead on lists, ARIA listbox
 *     and grid roles, focus-visible rings. A pretty control that traps focus
 *     is worse than an ugly one that works.
 *   - ISO underneath, always (§6af): these components SPEAK "31 Aug 2026" and
 *     TRADE in "2026-08-31". Display formats never travel into storage, and
 *     all day arithmetic is UTC so no timezone can shift a date by one.
 */

/* ── Shared popover plumbing ─────────────────────────────────────────────── */

/** Close on outside-click and Escape; returns the ref to put on the root. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const FIELD =
  "inline-flex h-10 items-center gap-2 rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none " +
  "focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50";
const POPOVER =
  "absolute z-40 mt-1.5 rounded-tile border border-line-soft bg-surface p-1 shadow-lift";

/* ── Select — the listbox that replaces every <select> ───────────────────── */

export interface SelectOption {
  value: string;
  label: string;
  /** Quiet second line on the option row. */
  hint?: string;
}

export function Select({
  value, onChange, options, placeholder = "Choose…", className, disabled, ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const typed = useRef({ text: "", at: 0 });
  const root = useDismiss(open, () => setOpen(false));
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const show = () => {
    setOpen(true);
    const i = options.findIndex((o) => o.value === value);
    setActive(i >= 0 ? i : 0);
  };

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      show();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); pick(active); }
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Typeahead: accumulate for 700ms, jump to the first label match.
      const now = Date.now();
      const next = (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase();
      typed.current = { text: next, at: now };
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(next));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={cn(FIELD, "w-full justify-between text-left")}
      >
        <span className={cn("truncate", !selected && "text-faint")}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={14} strokeWidth={2} className={cn("shrink-0 text-faint transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className={cn(POPOVER, "max-h-64 w-full min-w-[220px] overflow-y-auto")}
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-faint">Nothing to choose from.</p>
          ) : (
            options.map((o, i) => (
              <div
                key={o.value}
                id={`${listId}-${i}`}
                data-idx={i}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(i); }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-[12.5px]",
                  i === active ? "bg-butter/40 text-ink" : "text-ink",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-[10.5px] text-faint">{o.hint}</span>}
                </span>
                {o.value === value && <Check size={13} strokeWidth={2.5} className="shrink-0" style={{ color: GOLD }} aria-hidden />}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── Day arithmetic — ISO in, ISO out, UTC throughout (§6af) ─────────────── */

const isoOf = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const partsOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m - 1, d };
};
const todayIso = () => {
  const n = new Date();
  return isoOf(n.getFullYear(), n.getMonth(), n.getDate());
};
export const shiftDays = (iso: string, days: number): string => {
  const { y, m, d } = partsOf(iso);
  const t = new Date(Date.UTC(y, m, d + days));
  return isoOf(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** One month grid. `isSelected`/`inRange` let single and range pickers share it. */
function MonthGrid({
  view, onView, onPick, isSelected, inRange,
}: {
  view: { y: number; m: number };
  onView: (v: { y: number; m: number }) => void;
  onPick: (iso: string) => void;
  isSelected: (iso: string) => boolean;
  inRange?: (iso: string) => boolean;
}) {
  const first = new Date(Date.UTC(view.y, view.m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first
  const daysIn = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const today = todayIso();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysIn }, (_, i) => isoOf(view.y, view.m, i + 1)),
  ];
  return (
    <div className="w-[252px] select-none p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <button type="button" aria-label="Previous month"
          onClick={() => onView(view.m === 0 ? { y: view.y - 1, m: 11 } : { y: view.y, m: view.m - 1 })}
          className="grid h-7 w-7 place-items-center rounded-[8px] text-muted hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40">
          <ChevronLeft size={14} strokeWidth={2} />
        </button>
        <p className="text-[12.5px] font-semibold text-ink">{MONTHS[view.m]} {view.y}</p>
        <button type="button" aria-label="Next month"
          onClick={() => onView(view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 })}
          className="grid h-7 w-7 place-items-center rounded-[8px] text-muted hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40">
          <ChevronRight size={14} strokeWidth={2} />
        </button>
      </div>
      <div role="grid" aria-label={`${MONTHS[view.m]} ${view.y}`}>
        <div role="row" className="grid grid-cols-7">
          {DOW.map((d) => (
            <span key={d} role="columnheader" className="py-1 text-center text-[10px] font-semibold uppercase text-faint">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((iso, i) =>
            iso === null ? (
              <span key={`x${i}`} aria-hidden />
            ) : (
              <button
                key={iso}
                type="button"
                role="gridcell"
                aria-selected={isSelected(iso)}
                onClick={() => onPick(iso)}
                className={cn(
                  "tnum m-[1px] grid h-8 place-items-center rounded-[8px] text-[12px] focus-visible:ring-2 focus-visible:ring-accent/40",
                  isSelected(iso) ? "font-bold text-white" : inRange?.(iso) ? "bg-butter/40 text-ink" : "text-ink hover:bg-raised",
                  iso === today && !isSelected(iso) && "ring-1 ring-line",
                )}
                style={isSelected(iso) ? { background: GOLD } : undefined}
              >
                {partsOf(iso).d}
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/* ── DateButton — the single-date replacement for <input type="date"> ────── */

export function DateButton({
  value, onChange, placeholder = "Pick a date", className, ariaLabel,
}: {
  /** ISO yyyy-mm-dd, or "" for unset. */
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const seed = value || todayIso();
  const [view, setView] = useState(() => ({ y: partsOf(seed).y, m: partsOf(seed).m }));
  const root = useDismiss(open, () => setOpen(false));

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ?? "Choose a date"}
        onClick={() => {
          if (!open && value) setView({ y: partsOf(value).y, m: partsOf(value).m });
          setOpen((o) => !o);
        }}
        className={cn(FIELD)}
      >
        <CalendarIcon size={13} strokeWidth={2} className="shrink-0 text-faint" aria-hidden />
        <span className={cn(!value && "text-faint")}>{value ? formatDay(value) : placeholder}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Calendar" className={POPOVER}>
          <MonthGrid
            view={view}
            onView={setView}
            isSelected={(iso) => iso === value}
            onPick={(iso) => { onChange(iso); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}

/* ── RangeControl — preset pills + a custom range calendar ───────────────── */

export type RangeValue =
  | { kind: "days"; days: number }
  | { kind: "all" }
  | { kind: "custom"; start: string; end: string };

/** [startIso, endIso] the value covers today — null start means unbounded. */
export function rangeBounds(v: RangeValue): { start: string | null; end: string } {
  if (v.kind === "all") return { start: null, end: todayIso() };
  if (v.kind === "days") return { start: shiftDays(todayIso(), -(v.days - 1)), end: todayIso() };
  return { start: v.start, end: v.end };
}

export function RangeControl({
  value, onChange, presets = [7, 30, 90], allowAll = true, className,
}: {
  value: RangeValue;
  onChange: (v: RangeValue) => void;
  presets?: number[];
  allowAll?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState<string | null>(null);
  const t = todayIso();
  const [view, setView] = useState(() => ({ y: partsOf(t).y, m: partsOf(t).m }));
  const root = useDismiss(open, () => setOpen(false));

  const customLabel =
    value.kind === "custom" ? `${formatDay(value.start)} – ${formatDay(value.end)}` : "Custom";

  const pill = (on: boolean) =>
    cn(
      "rounded-pill border px-3 py-1.5 text-[12px] font-medium focus-visible:ring-2 focus-visible:ring-accent/40 outline-none",
      on ? "border-[#C79049] bg-butter/40 text-ink" : "border-line-soft bg-surface text-muted hover:text-ink",
    );

  const bounds = useMemo(() => (value.kind === "custom" ? value : null), [value]);

  return (
    <div ref={root} className={cn("relative flex flex-wrap items-center gap-1.5", className)}>
      {presets.map((d) => (
        <button key={d} type="button" className={pill(value.kind === "days" && value.days === d)}
          onClick={() => onChange({ kind: "days", days: d })}>
          {d} days
        </button>
      ))}
      {allowAll && (
        <button type="button" className={pill(value.kind === "all")} onClick={() => onChange({ kind: "all" })}>
          All time
        </button>
      )}
      <button type="button" aria-haspopup="dialog" aria-expanded={open}
        className={cn(pill(value.kind === "custom"), "flex items-center gap-1.5")}
        onClick={() => { setDraftStart(null); setOpen((o) => !o); }}>
        <CalendarIcon size={12} strokeWidth={2} aria-hidden /> {customLabel}
      </button>
      {open && (
        <div role="dialog" aria-label="Choose a date range" className={cn(POPOVER, "right-0 top-full")}>
          <p className="px-3 pt-2 text-[11.5px] text-faint">
            {draftStart ? `From ${formatDay(draftStart)} — now pick the end day.` : "Pick the first day of the range."}
          </p>
          <MonthGrid
            view={view}
            onView={setView}
            isSelected={(iso) =>
              iso === draftStart || (bounds !== null && (iso === bounds.start || iso === bounds.end))}
            inRange={(iso) =>
              bounds !== null && draftStart === null && iso > bounds.start && iso < bounds.end}
            onPick={(iso) => {
              if (draftStart === null) {
                setDraftStart(iso);
              } else {
                const [s, e] = iso < draftStart ? [iso, draftStart] : [draftStart, iso];
                onChange({ kind: "custom", start: s, end: e });
                setDraftStart(null);
                setOpen(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
