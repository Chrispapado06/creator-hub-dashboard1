import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

const button = cva(
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-all duration-200 " +
    "ease-[cubic-bezier(.22,1,.36,1)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.985] " +
    "[&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The single azure call to action. One per screen, at most.
        primary: "bg-azure text-obsidian hover:bg-azure-bright",
        secondary:
          "border border-hairline-strong text-snow hover:border-azure/50 hover:bg-white/[0.03]",
        ghost: "text-mist hover:text-snow hover:bg-white/[0.04]",
        danger: "border border-danger/40 text-danger hover:bg-danger/10",
      },
      size: {
        sm: "h-9 rounded-[8px] px-3.5 text-[13px]",
        md: "h-11 rounded-[10px] px-5 text-[14px]",
        lg: "h-[52px] rounded-[12px] px-6 text-[15px]",
        icon: "h-10 w-10 rounded-full",
        pill: "h-11 rounded-full px-6 text-[14px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(button({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";

/* -------------------------------------------------------------------------- */
/* Card — hairline border, graphite fill. The only container treatment.        */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  inset = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return (
    <div
      className={cn("rounded-card border border-hairline bg-graphite", inset && "p-4", className)}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* SectionLabel — the uppercase tracked micro-label                            */
/* -------------------------------------------------------------------------- */

export function SectionLabel({
  className,
  action,
  children,
}: {
  className?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="section-label">{children}</span>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Metric — a number and its unit, always tabular                              */
/* -------------------------------------------------------------------------- */

export function Metric({
  value,
  unit,
  label,
  size = "md",
  className,
  align = "left",
}: {
  value: string | number;
  unit?: string;
  label?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  align?: "left" | "center";
}) {
  const cfg = {
    sm: { v: "text-[15px]", u: "text-[11px]", l: "text-[10px]" },
    md: { v: "text-[22px]", u: "text-[12px]", l: "text-[10px]" },
    lg: { v: "text-[34px]", u: "text-[14px]", l: "text-[10px]" },
    xl: { v: "text-[56px]", u: "text-[16px]", l: "text-[11px]" },
  }[size];

  return (
    <div className={cn(align === "center" && "text-center", className)}>
      <div
        className={cn(
          "tnum font-light leading-none tracking-[-0.02em] text-snow",
          cfg.v,
          size === "xl" && "font-extralight",
        )}
      >
        {value}
        {unit && <span className={cn("ml-1 font-normal text-mist", cfg.u)}>{unit}</span>}
      </div>
      {label && <div className={cn("section-label mt-2", cfg.l)}>{label}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Variants are spelled out, never interpolated — see the argument in
 * `components/guide.tsx`. `bg-${tone}/10` compiles to nothing and is invisible
 * to the dead-class audit at the same time.
 */
const badge = cva(
  "inline-flex items-center gap-1.5 rounded-full text-[10px] font-medium uppercase tracking-[0.12em]",
  {
    variants: {
      tone: {
        neutral: "border border-hairline-strong bg-white/[0.03] text-mist",
        azure: "border border-azure/35 bg-azure/10 text-azure",
        summit: "border border-summit/35 bg-summit/10 text-summit",
        alert: "border border-alert/35 bg-alert/10 text-alert",
        danger: "border border-danger/40 bg-danger/10 text-danger",
        solid: "bg-azure text-obsidian",
      },
      size: { sm: "px-2 py-[3px]", md: "px-2.5 py-1" },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export function Badge({
  className,
  tone,
  size,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone, size }), className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Avatar — initials only.                                                     */
/* Deliberately not photographic: attaching real people's faces to fictional    */
/* community members would misrepresent them.                                   */
/* -------------------------------------------------------------------------- */

export function Avatar({
  name,
  size = 36,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  // Stable hue per name so an athlete keeps the same tint everywhere.
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-hairline-strong font-medium text-snow/90",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(145deg, oklch(0.30 0.02 ${h}), oklch(0.22 0.012 ${(h + 40) % 360}))`,
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Disclaimer — used wherever ICEFALL must defer to a professional             */
/* -------------------------------------------------------------------------- */

export function Disclaimer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "border-l border-azure/30 pl-3 text-[11px] leading-relaxed text-mist-dim",
        className,
      )}
    >
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Divider                                                                     */
/* -------------------------------------------------------------------------- */

export const Divider = ({ className }: { className?: string }) => (
  <div className={cn("h-px w-full bg-hairline", className)} />
);
