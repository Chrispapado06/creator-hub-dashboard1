import type { ReactNode } from "react";
import { Check, ChevronDown, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The pieces every screen shares.
 *
 * Shapes follow the owner's second mockup: generous rounding, soft shadow
 * instead of hairline borders, and a great deal of air. A dense CRM cannot be as
 * airy as a therapist's dashboard with six things on it — there are tables here
 * with nine columns — so the compromise is that CONTAINERS are soft and roomy
 * while the rows inside them stay tight enough to compare.
 */

export function Card({
  children,
  className,
  pad = true,
  tone = "surface",
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
  /** `panel` is the recessed grey the mockup uses for a whole right-hand column. */
  tone?: "surface" | "panel";
}) {
  return (
    <div
      className={cn(
        "rounded-card",
        tone === "surface" ? "bg-surface shadow-soft" : "bg-panel",
        pad && "p-5",
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
  /** `primary` is the mockup's black pill. One per screen, at most. */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        "disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "h-8 px-3.5 text-[12.5px]" : "h-10 px-5 text-[13px]",
        variant === "primary" && "bg-solid text-primary-foreground hover:opacity-90",
        variant === "secondary" && "border border-line bg-surface text-ink hover:bg-raised",
        variant === "ghost" && "text-muted hover:bg-raised hover:text-ink",
        variant === "danger" && "border border-line bg-surface text-bad hover:bg-raised",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Avatar({
  name,
  size = 32,
  tone = "neutral",
}: {
  name: string;
  size?: number;
  tone?: "neutral" | "accent" | "solid";
}) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  const ini = (w.length === 1 ? w[0].slice(0, 2) : (w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase();
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-medium",
        tone === "accent" && "bg-accent-soft text-accent-ink",
        tone === "solid" && "bg-solid text-primary-foreground",
        tone === "neutral" && "bg-raised text-muted ring-1 ring-line",
      )}
    >
      {ini || "··"}
    </span>
  );
}

/** A count in a black circle, as the mockup draws "+16". */
export function CountBubble({ children }: { children: ReactNode }) {
  return (
    <span className="tnum grid h-9 min-w-9 shrink-0 place-items-center rounded-full bg-solid px-2 text-[12.5px] font-medium text-primary-foreground">
      {children}
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
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-[4px] text-[11.5px] font-medium",
        tone === "neutral" && "bg-raised text-muted ring-1 ring-line",
        tone === "accent" && "bg-accent-soft text-accent-ink",
        // The theme's own status-badge recipe: the status colour at 10% for the
        // fill and at full strength for the type. Measured on its analytics KPI
        // strip (`bg-green-500/10 text-green-700`) and its destructive badge
        // (`bg-destructive/10 text-destructive`). `ok` / `warn` / `bad` already
        // hold exactly those three values — green-700, amber-600, destructive —
        // so this is the theme's recipe written in this app's token names
        // rather than three more colours typed into the markup.
        tone === "green" && "bg-ok/10 text-ok",
        tone === "amber" && "bg-warn/10 text-warn",
        tone === "red" && "bg-bad/10 text-bad",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The mockup's status control: a filled circular glyph, the word, a chevron.
 *
 * The chevron is drawn because the mockup draws it, and it is NOT interactive
 * here — nothing in this build can change a status from a list row yet. A
 * control that looks like it does something and does not is the same class of
 * problem as a figure that looks measured and is not, so it is rendered with
 * `aria-hidden` and no button around it.
 */
export function StatusChip({
  state,
  label,
}: {
  state: "ok" | "pending" | "bad" | "neutral";
  label: string;
}) {
  const Icon = state === "ok" ? Check : state === "bad" ? X : Clock;
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-ink">
      <span
        className={cn(
          "grid h-5 w-5 place-items-center rounded-full text-white",
          // A FILL carrying a white glyph, so these take the status colours at
          // full strength, not the 10% wash the Pill above uses. All four were
          // hand-mixed oklch; all four now read the tokens. `ok` lands darker
          // than the old 0.62 (green-700 is 0.527) and `bad` darker than 0.60,
          // so the white check and cross gain contrast rather than lose it.
          state === "ok" && "bg-ok",
          state === "pending" && "bg-warn",
          state === "bad" && "bg-bad",
          state === "neutral" && "bg-muted-foreground",
        )}
      >
        {state === "neutral" ? null : <Icon size={12} strokeWidth={3} />}
      </span>
      {label}
      <ChevronDown size={14} strokeWidth={2} className="text-faint" aria-hidden />
    </span>
  );
}

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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[31px] font-extrabold leading-tight tracking-[-0.025em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A figure, or the reason there isn't one.
 *
 * `value` of `null` renders the reason in muted text — never a dash and never a
 * zero. This is the smallest place the honesty doctrine lives and the one used
 * most often: a dashboard is read as fact by default, so a tile that cannot say
 * what it means has to say why.
 *
 * NOTE WHAT HAPPENS TO THE COLOUR. A toned tile with no figure DROPS TO PLAIN
 * SURFACE. The pastels in the mockup are attached to numbers; a butter-yellow
 * card carrying an explanation of why there is no number would read, at a
 * glance and across a room, exactly like a card carrying one.
 */
export function Stat({
  label,
  value,
  reason,
  hint,
  tone = "plain",
  icon,
}: {
  label: string;
  value: string | null;
  reason?: string;
  hint?: string;
  tone?: "plain" | "butter" | "sky" | "lilac" | "mint";
  icon?: ReactNode;
}) {
  const toned = value !== null && tone !== "plain";
  return (
    <div
      className={cn(
        "relative flex min-h-[148px] flex-col justify-between rounded-card p-5",
        !toned && "bg-surface shadow-soft",
        toned && tone === "butter" && "bg-butter",
        toned && tone === "sky" && "bg-sky",
        toned && tone === "lilac" && "bg-lilac",
        toned && tone === "mint" && "bg-mint",
      )}
    >
      <p className={cn("text-[14px] font-semibold", toned ? "text-ink" : "text-muted")}>{label}</p>

      {value === null ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-faint">{reason ?? "Not recorded"}</p>
      ) : (
        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="tnum text-[42px] font-bold leading-none tracking-[-0.03em] text-ink">{value}</p>
          {icon && (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface/70 text-ink">
              {icon}
            </span>
          )}
        </div>
      )}

      {hint && value !== null && (
        <p className={cn("mt-2.5 text-[12px]", toned ? "text-ink/65" : "text-faint")}>{hint}</p>
      )}
    </div>
  );
}

/** A table wrapper: soft card, no outer border, rows separated hairline-light. */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-card bg-surface shadow-soft", className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
