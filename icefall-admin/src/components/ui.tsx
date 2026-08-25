import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The small pieces every screen shares. Dense by design — this is a work tool. */

export function Card({
  children,
  className,
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface",
        pad && "p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("label", className)}>{children}</p>;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-tile font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-9 px-3.5 text-[13px]",
        variant === "primary" && "bg-accent text-white hover:bg-accent-ink",
        variant === "secondary" && "border border-line bg-surface text-ink hover:bg-raised",
        variant === "ghost" && "text-muted hover:bg-raised hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Avatar({
  name,
  size = 28,
  tone = "neutral",
}: {
  name: string;
  size?: number;
  tone?: "neutral" | "accent";
}) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  const ini = (w.length === 1 ? w[0].slice(0, 2) : (w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase();
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-medium",
        tone === "accent" ? "bg-accent-soft text-accent-ink" : "bg-raised text-muted ring-1 ring-line",
      )}
    >
      {ini || "··"}
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "green" | "amber" | "red";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2 py-[3px] text-[11px] font-medium",
        tone === "neutral" && "bg-raised text-muted ring-1 ring-line",
        tone === "accent" && "bg-accent-soft text-accent-ink",
        tone === "green" && "bg-[oklch(0.955_0.04_152)] text-[oklch(0.44_0.11_152)]",
        tone === "amber" && "bg-[oklch(0.962_0.05_84)] text-[oklch(0.48_0.1_70)]",
        tone === "red" && "bg-[oklch(0.958_0.03_22)] text-[oklch(0.5_0.15_22)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Says, on the face of the screen, that the numbers are invented.
 *
 * A dashboard is read as fact by default — that is the entire point of one — so
 * placeholder revenue needs saying out loud, every time, not once in a README.
 */
export function DemoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex gap-3 rounded-card border border-[oklch(0.88_0.06_84)] bg-[oklch(0.985_0.02_84)] px-4 py-3">
      <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full bg-[oklch(0.7_0.13_70)]" />
      <p className="text-[12.5px] leading-relaxed text-[oklch(0.42_0.07_70)]">{children}</p>
    </div>
  );
}

/** A page heading with optional actions on the right. */
export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-light tracking-[-0.01em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
