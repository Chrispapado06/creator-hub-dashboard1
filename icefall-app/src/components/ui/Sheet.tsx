import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * THE bottom sheet.
 *
 * Five screens each grew their own copy — Routes, Community, Guides,
 * TrailDetail and MountainPage — and they had drifted: different backdrop
 * opacities, different heights, two z-indexes, and only one of the five
 * animated or closed on Escape. A sheet is the most recognisable interaction
 * in the app, so it is defined once, taking its behaviour from the best of the
 * five (the Guides one):
 *
 *   · portalled into the phone shell, so it stays inside the phone frame on
 *     desktop instead of spilling across the browser window;
 *   · rises 48px on an eased curve, the house motion;
 *   · Escape closes it — a sheet a keyboard cannot dismiss is a trap;
 *   · a drag handle, a labelled dialog role, and one close affordance.
 */

function sheetRoot(): Element | null {
  if (typeof document === "undefined") return null;
  return document.querySelector("[data-phone-shell]") ?? document.body;
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const root = sheetRoot();
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (root === null) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-50 flex items-end bg-obsidian/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 48 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85%] w-full flex-col overflow-hidden rounded-t-card border-t border-hairline-strong bg-graphite"
      >
        <div className="shrink-0 px-5 pt-4">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
            <p id={titleId} className="truncate text-[14px] text-snow">
              {title}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:text-snow"
            >
              <X size={17} strokeWidth={1.7} />
            </button>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto px-5"
          style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          {children}
        </div>
      </motion.div>
    </motion.div>,
    root,
  );
}

/** A tappable row inside a sheet: title, one-line detail, optional lead icon. */
export function SheetRow({
  icon: Icon,
  title,
  detail,
  active,
  onClick,
}: {
  icon?: React.ComponentType<{
    size?: number | string;
    strokeWidth?: number | string;
    className?: string;
  }>;
  title: string;
  detail?: string;
  /** Marks the currently selected option with the azure dot. */
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 py-3.5 text-left"
    >
      {Icon && <Icon size={16} strokeWidth={1.7} className="shrink-0 text-azure" />}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[13.5px]", active ? "text-azure" : "text-snow")}>
          {title}
        </span>
        {detail && (
          <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">{detail}</span>
        )}
      </span>
      {active && <span className="h-2 w-2 shrink-0 rounded-full bg-azure" />}
    </button>
  );
}
