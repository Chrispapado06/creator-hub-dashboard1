import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The select replacement — one listbox for every choice on the site.
 *
 * Owner instruction 2026-08-31 (`11-CONTROLS-CONTRACT.md`): native `<select>`
 * is retired from user-facing surfaces. Seven sites carried one, each styled
 * inline, which is the drift pattern this codebase keeps paying for — so the
 * replacement is ONE component and the sites keep only their trigger skin.
 *
 * ── THE CONTRACT'S HARD LINE: BETTER THAN NATIVE, NOT JUST PRETTIER ─────────
 *
 * Native `<select>` gives keyboard users arrows, Enter, Escape and typeahead
 * for free. A styled replacement that loses any of those trades function for
 * looks, and "a pretty control that traps focus is worse than an ugly one that
 * works". So this implements the full listbox pattern:
 *
 *   • trigger: `aria-haspopup="listbox"`, `aria-expanded`; opens on click,
 *     Enter, Space, ArrowDown (native's behaviour).
 *   • popover: `role="listbox"` holding DOM focus, options are
 *     `role="option"` with `aria-selected`; the active row travels by
 *     `aria-activedescendant` so screen readers follow it.
 *   • ArrowUp/Down move · Home/End jump · Enter/Space pick · Escape closes
 *     and RETURNS FOCUS to the trigger (losing your place is a focus trap's
 *     quieter sibling).
 *   • typeahead when the list warrants it, same as native: letters accumulate
 *     into a buffer that resets after a pause and jump to the first match.
 *   • outside click closes; the active row scrolls into view.
 *
 * Values are whatever the caller stores — this never formats or translates
 * them (§6af: display never travels into storage).
 */

export interface ListboxOption {
  value: string;
  label: string;
}

export function Listbox({
  value,
  onChange,
  options,
  label,
  placeholder,
  triggerClassName,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ListboxOption[];
  /** What this choice IS, for assistive tech — "Sort treks", "Departure city". */
  label: string;
  /** Renders as a first, empty-valued option — "Any altitude", "All regions". */
  placeholder?: string;
  triggerClassName?: string;
  className?: string;
}) {
  const id = useId();
  const all = useMemo<ListboxOption[]>(
    () => (placeholder !== undefined ? [{ value: "", label: placeholder }, ...options] : options),
    [options, placeholder],
  );

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeBuf = useRef("");
  const typeAt = useRef(0);

  const selectedIndex = Math.max(0, all.findIndex((o) => o.value === value));
  const selected = all[selectedIndex];

  function openList() {
    setActive(selectedIndex);
    setOpen(true);
  }
  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }
  function pick(i: number) {
    const o = all[i];
    if (!o) return;
    onChange(o.value);
    close(true);
  }

  // Focus the list when it opens, so key events land without a second Tab.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  // The active row follows the keyboard into view.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // Outside click closes without stealing focus back.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function typeahead(key: string): boolean {
    // Native offers typeahead regardless of size; below ~8 the arrows are
    // faster anyway, but there is no reason to withhold it.
    if (key.length !== 1 || !/\S/.test(key)) return false;
    const now = Date.now();
    if (now - typeAt.current > 700) typeBuf.current = "";
    typeAt.current = now;
    typeBuf.current += key.toLowerCase();
    const from = typeBuf.current.length === 1 ? active + 1 : active;
    const order = [...all.keys()].map((i) => (from + i) % all.length);
    const hit = order.find((i) => all[i].label.toLowerCase().startsWith(typeBuf.current));
    if (hit !== undefined) setActive(hit);
    return hit !== undefined;
  }

  function onListKey(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => Math.min(all.length - 1, a + 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
        return;
      case "Home":
        e.preventDefault();
        setActive(0);
        return;
      case "End":
        e.preventDefault();
        setActive(all.length - 1);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(active);
        return;
      case "Escape":
        e.preventDefault();
        close(true);
        return;
      case "Tab":
        // Tab moves on; leaving the list open behind you is how focus gets lost.
        close(false);
        return;
      default:
        if (typeahead(e.key)) e.preventDefault();
    }
  }

  function onTriggerKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openList();
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? close(true) : openList())}
        onKeyDown={onTriggerKey}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 outline-none",
          "focus-visible:ring-2 focus-visible:ring-azure/60",
          triggerClassName,
        )}
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <ChevronDown
          size={13}
          strokeWidth={1.9}
          className={cn("shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
          className="absolute left-0 top-full z-30 mt-1.5 max-h-64 w-max min-w-full overflow-y-auto rounded-tile border border-hairline bg-elevated py-1.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)] outline-none"
        >
          {all.map((o, i) => (
            <li
              key={o.value || "∅"}
              id={`${id}-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              onPointerDown={(e) => {
                // pointerdown, not click: the outside-close listener also runs
                // on pointerdown, and losing the race would swallow the pick.
                e.preventDefault();
                pick(i);
              }}
              onPointerMove={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-[12.5px]",
                i === active ? "bg-slate text-snow" : "text-mist",
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check size={12} strokeWidth={2.2} className="shrink-0 text-azure" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
