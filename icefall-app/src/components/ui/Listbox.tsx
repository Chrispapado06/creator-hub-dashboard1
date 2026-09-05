import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The select replacement — 11-CONTROLS-CONTRACT.
 *
 * A button opening a styled listbox popover. Arrow keys move, Enter picks,
 * Escape closes without picking, and past ~8 options typing filters the list —
 * the behaviours that make it BETTER than native, not just prettier. Native
 * `<select>` is retired from user surfaces because it renders the platform's
 * menu in the platform's colours and cannot show the chosen row's meaning.
 *
 * Same values, same handlers as the `<select>` it replaces: `value` in,
 * `onChange(value)` out, options as `{value, label}`.
 */

const TYPEAHEAD_AT = 8;

export interface ListboxOption {
  value: string;
  label: string;
}

export function Listbox({
  value,
  onChange,
  options,
  label,
  placeholder = "Choose…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ListboxOption[];
  /** Announced to screen readers. */
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const chosen = options.find((o) => o.value === value);
  const typeahead = options.length > TYPEAHEAD_AT;

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, filter]);

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
      setFilter("");
      const i = Math.max(0, options.findIndex((o) => o.value === value));
      setCursor(i);
      requestAnimationFrame(() => listRef.current?.focus());
    }
    // Reopening starts from the current value, never from stale filter state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the cursor on a row that still exists as the filter narrows.
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = visible[cursor];
      if (row) pick(row.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (typeahead && e.key === "Backspace") {
      setFilter((f) => f.slice(0, -1));
    } else if (typeahead && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      setFilter((f) => f + e.key);
    }
  };

  useEffect(() => {
    // Keep the active row in view as the keyboard moves.
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-12 w-full items-center gap-2.5 rounded-tile border border-hairline bg-elevated/40 px-3.5 text-left text-[14px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60",
          open ? "border-azure/50" : "hover:border-hairline-strong",
          chosen ? "text-snow" : "text-mist-dim",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{chosen ? chosen.label : placeholder}</span>
        <ChevronDown
          size={15}
          strokeWidth={1.7}
          aria-hidden="true"
          className={cn("shrink-0 text-mist-dim transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-card border border-hairline bg-graphite shadow-[var(--ice-shadow-pop)]">
          {typeahead && (
            <p className="border-b border-hairline px-3.5 py-2 text-[11.5px] text-mist-dim">
              {filter ? (
                <>
                  Typing: <span className="text-snow">{filter}</span>
                </>
              ) : (
                "Type to filter"
              )}
            </p>
          )}
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            tabIndex={0}
            onKeyDown={onKey}
            className="max-h-64 overflow-y-auto py-1 focus-visible:outline-none"
          >
            {visible.length === 0 && (
              <p className="px-3.5 py-3 text-[12.5px] text-mist-dim">Nothing matches.</p>
            )}
            {visible.map((o, i) => {
              const isChosen = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={isChosen}
                  data-index={i}
                  onClick={() => pick(o.value)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] transition-colors",
                    i === cursor ? "bg-white/[0.06] text-snow" : "text-mist hover:bg-white/[0.04]",
                    isChosen && "text-snow",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {isChosen && (
                    <Check size={14} strokeWidth={2} aria-hidden="true" className="shrink-0 text-azure" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
