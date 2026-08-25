import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The ICEFALL mark — four ice blades.
 *
 * Same geometry as `icefall-app/src/components/ui/IcefallMark.tsx`, and it must
 * stay that way: the marketing site and the product cannot ship two logos.
 *
 * It is NOT three triangles on a shared baseline. It is four separate SHARDS,
 * each a narrow blade with a blunt apex, one short edge and one long edge
 * running out to a needle point. Nothing touches a ground line, and the spikes
 * end at different heights. The other thing that carries it is the NOTCH: the
 * slab is tucked beneath the main peak's left face with a thin dark wedge
 * between them. Close that gap and the mark becomes a generic mountain icon.
 *
 * Each blade is split lengthwise into a lit face and a shaded face, both
 * `currentColor` at different opacities, so one component inherits azure in the
 * header and snow in the footer. `metal` swaps in the brushed-silver gradients
 * for the places the logo is shown at size.
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

/** Horizontal lockup: mark beside the letterspaced wordmark. */
export function IcefallLockup({
  className,
  markClassName,
  typeClassName,
}: {
  className?: string;
  markClassName?: string;
  typeClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3 text-snow", className)}>
      <IcefallMark metal className={cn("h-6", markClassName)} />
      <span className={cn("pl-[0.3em] text-[15px] font-light tracking-[0.34em]", typeClassName)}>
        ICEFALL
      </span>
    </span>
  );
}
