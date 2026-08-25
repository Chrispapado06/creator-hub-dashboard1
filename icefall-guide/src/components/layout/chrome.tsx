import { useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Screen — scroll container with safe-area aware padding                     */
/* -------------------------------------------------------------------------- */

export function Screen({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "no-scrollbar relative flex-1 overflow-y-auto overscroll-contain",
        padded && "px-5",
        className,
      )}
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {children}
      {/* Clears the raised Start control in the tab bar. */}
      <div className="h-14" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ScreenHeader — title row, optional back button and trailing action         */
/* -------------------------------------------------------------------------- */

export function ScreenHeader({
  title,
  subtitle,
  back,
  action,
  className,
  large,
}: {
  title: string;
  subtitle?: string;
  back?: boolean | string;
  action?: React.ReactNode;
  className?: string;
  large?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <header className={cn("flex items-start gap-3 pb-5 pt-6", className)}>
      {back && (
        <button
          type="button"
          onClick={() => (typeof back === "string" ? navigate(back) : navigate(-1))}
          aria-label="Back"
          className="-ml-2 mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
        >
          <ChevronLeft size={20} strokeWidth={1.5} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1
          className={cn(
            "truncate font-light tracking-[-0.02em] text-snow",
            large ? "text-[28px]" : "text-[22px]",
          )}
        >
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[13px] text-mist">{subtitle}</p>}
      </div>
      {action && <div className="mt-0.5 shrink-0">{action}</div>}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* SegmentedTabs — ACTIVE / COMPLETED style switcher                          */
/* -------------------------------------------------------------------------- */

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);

  // Explore now carries five tabs, which overflow 375 px. The strip has always
  // scrolled, but silently: the fifth label was clipped with nothing to say it
  // could be reached, and selecting it from elsewhere left it off-screen.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={scroller}
        className="no-scrollbar flex gap-4 overflow-x-auto border-b border-hairline"
      >
        {tabs.map((t) => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              data-active={active}
              onClick={() => onChange(t.value)}
              className={cn(
                "relative shrink-0 pb-3 text-[10px] font-medium uppercase tracking-[0.12em] transition-colors",
                active ? "text-snow" : "text-mist-dim hover:text-mist",
              )}
            >
              {t.label}
              {active && (
                <motion.span
                  layoutId={`seg-${tabs.map((x) => x.value).join("")}`}
                  className="absolute inset-x-0 -bottom-px h-px bg-gold"
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </button>
          );
        })}
      </div>
      {/* A hairline fade so a clipped tab reads as scrollable rather than broken. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-obsidian to-transparent"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stagger helpers — the house entrance motion                                */
/* -------------------------------------------------------------------------- */

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};

export const rise = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const } },
};

export function Stagger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

export function Rise({
  children,
  className,
  ...rest
}: { children: React.ReactNode; className?: string } & React.ComponentProps<typeof motion.div>) {
  return (
    <motion.div variants={rise} className={className} {...rest}>
      {children}
    </motion.div>
  );
}
