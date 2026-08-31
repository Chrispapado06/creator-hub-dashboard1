import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Button({
  children, variant = "primary", size = "md", className, ...rest
}: {
  children: ReactNode; variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-tile font-medium transition-colors disabled:opacity-50",
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

export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={cn("rounded-card border border-line bg-surface", pad && "p-4", className)}>{children}</div>;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("label", className)}>{children}</p>;
}

export function Pill({
  children, tone = "neutral", className,
}: { children: ReactNode; tone?: "neutral" | "accent" | "green" | "amber" | "red"; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-pill px-2 py-[2px] text-[11px] font-medium",
      tone === "neutral" && "bg-raised text-muted ring-1 ring-line",
      tone === "accent" && "bg-accent-soft text-accent-ink",
      tone === "green" && "bg-[oklch(0.955_0.04_155)] text-[oklch(0.44_0.11_155)]",
      tone === "amber" && "bg-[oklch(0.962_0.05_75)] text-[oklch(0.48_0.1_60)]",
      tone === "red" && "bg-[oklch(0.958_0.03_25)] text-[oklch(0.5_0.16_25)]",
      className,
    )}>
      {children}
    </span>
  );
}

export function Avatar({ name, size = 26, tone = "neutral" }: { name: string; size?: number; tone?: "neutral" | "accent" }) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  const ini = (w.length === 1 ? w[0].slice(0, 2) : (w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase();
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)) }}
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold",
        tone === "accent" ? "bg-accent-soft text-accent-ink" : "bg-raised text-muted ring-1 ring-line")}
    >{ini || "··"}</span>
  );
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A standard data table shell — dense rows, sticky header. */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <Card pad={false} className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {head.map((h) => <th key={h} className="label px-4 py-2.5">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">{children}</tbody>
      </table>
    </Card>
  );
}

export function EmptyState({ title, body, icon: Icon, action }: {
  title: string; body: string; icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-card border border-dashed border-line bg-raised px-6 py-16 text-center">
      <Icon size={28} strokeWidth={1.5} className="text-faint" />
      <p className="mt-3 text-[14px] font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-[38ch] text-[12.5px] leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
