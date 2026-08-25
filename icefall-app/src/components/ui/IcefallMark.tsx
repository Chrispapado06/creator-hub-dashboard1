import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The ICEFALL mark — four ice blades.
 *
 * Traced from the supplied logo, 2026-08. The geometry is the identity and it
 * is worth stating precisely, because the obvious reading of this logo is the
 * wrong one:
 *
 * It is NOT three triangles sitting on a shared baseline. It is four separate
 * SHARDS, each one a narrow blade with a blunt apex, one short edge, and one
 * long edge running out to a needle point. Nothing touches a ground line;
 * every blade ends in a spike, and the spikes end at different heights. The
 * first attempt at this drew wide triangles on a common base and read as a
 * generic mountain icon rather than as this brand.
 *
 * The second thing that carries it is the NOTCH: the slab is tucked beneath
 * the main peak's left face with a thin dark wedge between them, widening
 * toward the upper left. Close that gap and the two shards merge into one lump
 * and the mark loses its structure.
 *
 * Each blade is split lengthwise into a lit face and a shaded face. By default
 * both are `currentColor` at different opacities, so the mark inherits azure in
 * the tab bar, snow on the START control, and ink on paper inside the passport
 * from one component. `metal` swaps in the brushed-silver gradients for the
 * places the logo is shown at size — splash, lockup, auth.
 */
export function IcefallMark({
  metal = false,
  className,
  ...props
}: React.SVGProps<SVGSVGElement> & { metal?: boolean }) {
  // Gradient ids must be unique per instance or a second copy on the same page
  // re-uses the first one's definition.
  const uid = useId().replace(/:/g, "");
  const lit = metal ? `url(#lit-${uid})` : "currentColor";
  const shade = metal ? `url(#shade-${uid})` : "currentColor";

  return (
    <svg
      viewBox="0 0 540 372"
      fill="none"
      aria-hidden="true"
      className={cn("h-6 w-auto", className)}
      {...props}
    >
      {metal && (
        <defs>
          <linearGradient id={`lit-${uid}`} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="60%" stopColor="#E3E8EE" />
            <stop offset="100%" stopColor="#BCC4CF" />
          </linearGradient>
          <linearGradient id={`shade-${uid}`} x1="0.1" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#AEB7C3" />
            <stop offset="100%" stopColor="#6C7683" />
          </linearGradient>
        </defs>
      )}

      {/* Left peak */}
      <path d="M140 168 L165 222 L100 282 Z" fill={shade} fillOpacity={metal ? 1 : 0.55} />
      <path d="M140 168 L100 282 L2 364 Z" fill={lit} />

      {/* Slab — sits under the main peak's left face, notch gap above it */}
      <path d="M236 140 L290 178 L208 246 Z" fill={lit} />
      <path d="M236 140 L208 246 L106 350 Z" fill={shade} fillOpacity={metal ? 1 : 0.55} />

      {/* Main peak — the tallest blade */}
      <path d="M287 2 L247 112 L285 180 Z" fill={lit} />
      <path d="M287 2 L285 180 L392 292 Z" fill={shade} fillOpacity={metal ? 1 : 0.55} />

      {/* Right peak */}
      <path d="M416 150 L378 254 L412 276 Z" fill={shade} fillOpacity={metal ? 1 : 0.55} />
      <path d="M416 150 L412 276 L538 348 Z" fill={lit} />
    </svg>
  );
}

/** Full lockup: mark above the letterspaced wordmark. */
export function IcefallLockup({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const cfg = {
    sm: { mark: "h-5", type: "text-[13px] tracking-[0.34em]" },
    md: { mark: "h-8", type: "text-[19px] tracking-[0.36em]" },
    lg: { mark: "h-12", type: "text-[28px] tracking-[0.38em]" },
  }[size];

  return (
    <div className={cn("flex flex-col items-center gap-3 text-snow", className)}>
      <IcefallMark metal className={cfg.mark} />
      <div className={cn("pl-[0.36em] font-light leading-none", cfg.type)}>ICEFALL</div>
    </div>
  );
}
