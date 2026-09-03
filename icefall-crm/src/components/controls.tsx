import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatDay } from "@/lib/utils";

/**
 * The CRM's control kit — 11-CONTROLS-CONTRACT.
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
 *
 * ── THE RE-SKIN ─────────────────────────────────────────────────────────────
 * The owner ruled "i dont see any change i want the designs 1:1", so the SHAPES
 * below are no longer the old light/gold reference. Each was read out of the
 * theme's own primitive and checked against it running on localhost:3100:
 *
 *   FIELD      = theme-ref/src/components/ui/select.tsx SelectTrigger:
 *                h-8, rounded-lg, `border border-input`, TRANSPARENT ground,
 *                pl-2.5 pr-2, text-sm, chevron size-4 in muted-foreground.
 *   POPOVER    = theme-ref/src/components/ui/popover.tsx PopoverContent:
 *                rounded-lg, bg-popover, shadow-md + `ring-1 ring-foreground/10`
 *                — which is exactly what --shadow-lift resolves to.
 *   option row = SelectItem: rounded-md, py-1, text-sm, and the highlighted row
 *                is `bg-accent text-accent-foreground` — a pale NEUTRAL, where
 *                this file used to paint butter-yellow.
 *   calendar   = theme-ref/src/components/ui/calendar.tsx: 28px cells at
 *                rounded-md, weekday headings `text-[0.8rem] font-normal
 *                text-muted-foreground` (NOT small-caps), the selected day
 *                `bg-primary text-primary-foreground` (near-black, white type,
 *                NOT gold), today and the in-range days `bg-muted`.
 *   range pills= theme-ref/src/components/ui/toggle.tsx, outline variant:
 *                h-8 rounded-lg bordered, and the SELECTED one is filled
 *                oklch(0.97) — measured #f5f5f5 on the theme's own file-manager
 *                view switcher. The theme marks a chosen toggle with a pale
 *                grey fill and nothing else; that is reproduced rather than
 *                improved, and `aria-pressed` is added so the state is also
 *                announced rather than only shown.
 *
 * `data-slot` on the interactive elements is deliberate: index.css draws the
 * app's own focus outline with `:focus-visible:not([data-slot])`, so a control
 * that carries the attribute opts out of it and shows the theme's own
 * `ring-[3px] ring-ring/50` instead of stacking two rings in two colours.
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

/** The theme's focus treatment, shared by every control in this file. */
const FOCUS =
  "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const FIELD =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-transparent py-1 pl-2.5 pr-2 " +
  "text-sm text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
  FOCUS;

const POPOVER = "absolute z-40 mt-1 rounded-lg bg-surface p-1 text-sm text-ink shadow-lift";

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
        data-slot="crm-select-trigger"
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
        {/* The theme's `data-placeholder:text-muted-foreground`. */}
        <span className={cn("truncate", !selected && "text-muted")}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} strokeWidth={2} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className={cn(POPOVER, "max-h-64 w-full min-w-[220px] overflow-y-auto")}
        >
          {options.length === 0 ? (
            /* A reason, not a placeholder. The wording is unchanged. */
            <p className="px-1.5 py-1.5 text-sm text-muted">Nothing to choose from.</p>
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
                  "flex cursor-default items-center justify-between gap-1.5 rounded-md py-1.5 pl-1.5 pr-2 text-sm",
                  i === active ? "bg-ui-accent text-accent-foreground" : "text-ink",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-[12px] text-muted">{o.hint}</span>}
                </span>
                {o.value === value && <Check size={16} strokeWidth={2} className="shrink-0" aria-hidden />}
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
  // The theme's `button_previous` / `button_next`: a ghost Button at --cell-size.
  const nav =
    "grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-ink " + FOCUS;
  return (
    <div className="w-[252px] select-none p-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <button type="button" data-slot="crm-cal-nav" aria-label="Previous month"
          onClick={() => onView(view.m === 0 ? { y: view.y - 1, m: 11 } : { y: view.y, m: view.m - 1 })}
          className={nav}>
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        {/* The theme's `caption_label`: text-sm font-medium. */}
        <p className="text-sm font-medium text-ink">{MONTHS[view.m]} {view.y}</p>
        <button type="button" data-slot="crm-cal-nav" aria-label="Next month"
          onClick={() => onView(view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 })}
          className={nav}>
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>
      <div role="grid" aria-label={`${MONTHS[view.m]} ${view.y}`}>
        <div role="row" className="grid grid-cols-7">
          {DOW.map((d) => (
            <span key={d} role="columnheader" className="py-1 text-center text-[0.8rem] font-normal text-muted">{d}</span>
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
                data-slot="crm-cal-day"
                aria-selected={isSelected(iso)}
                onClick={() => onPick(iso)}
                className={cn(
                  "tnum m-[1px] grid h-7 place-items-center rounded-md text-sm font-normal transition-colors",
                  FOCUS,
                  isSelected(iso)
                    ? "bg-primary text-primary-foreground"
                    : inRange?.(iso)
                      ? "bg-ui-muted text-ink"
                      : iso === today
                        ? "bg-ui-muted text-ink"
                        : "text-ink hover:bg-raised",
                )}
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
        data-slot="crm-date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ?? "Choose a date"}
        onClick={() => {
          if (!open && value) setView({ y: partsOf(value).y, m: partsOf(value).m });
          setOpen((o) => !o);
        }}
        className={cn(FIELD)}
      >
        <CalendarIcon size={16} strokeWidth={2} className="shrink-0 text-muted" aria-hidden />
        {/* No value is not a date and is not blank: the prompt stands in for it,
            in the theme's placeholder grey. */}
        <span className={cn(!value && "text-muted")}>{value ? formatDay(value) : placeholder}</span>
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

  /** The theme's outline Toggle. Chosen = a pale grey fill, measured #f5f5f5. */
  const pill = (on: boolean) =>
    cn(
      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-sm font-medium text-ink",
      "transition-colors hover:bg-raised",
      FOCUS,
      on ? "bg-raised" : "bg-transparent",
    );

  const bounds = useMemo(() => (value.kind === "custom" ? value : null), [value]);

  return (
    <div ref={root} className={cn("relative flex flex-wrap items-center gap-2", className)}>
      {presets.map((d) => (
        <button key={d} type="button" data-slot="crm-range-pill"
          aria-pressed={value.kind === "days" && value.days === d}
          className={pill(value.kind === "days" && value.days === d)}
          onClick={() => onChange({ kind: "days", days: d })}>
          {d} days
        </button>
      ))}
      {allowAll && (
        <button type="button" data-slot="crm-range-pill" aria-pressed={value.kind === "all"}
          className={pill(value.kind === "all")} onClick={() => onChange({ kind: "all" })}>
          All time
        </button>
      )}
      <button type="button" data-slot="crm-range-pill" aria-haspopup="dialog" aria-expanded={open}
        aria-pressed={value.kind === "custom"}
        className={pill(value.kind === "custom")}
        onClick={() => { setDraftStart(null); setOpen((o) => !o); }}>
        <CalendarIcon size={16} strokeWidth={2} aria-hidden /> {customLabel}
      </button>
      {open && (
        <div role="dialog" aria-label="Choose a date range" className={cn(POPOVER, "right-0 top-full")}>
          <p className="px-2 pt-1.5 text-sm text-muted">
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
