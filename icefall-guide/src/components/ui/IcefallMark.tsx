import { cn } from "@/lib/utils";

/**
 * The ICEFALL mark — a faceted alpine range in linework.
 * Vector so it stays crisp at every size and inherits currentColor.
 */
export function IcefallMark({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 38"
      fill="none"
      aria-hidden="true"
      className={cn("h-6 w-auto", className)}
      {...props}
    >
      {/* Range silhouette */}
      <path
        d="M1.5 35.5 L14 18 L20.5 25.5 L32 4 L43.5 20.5 L49.5 13.5 L62.5 35.5 Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Interior facets — the light side of the main peak */}
      <path d="M32 4 L27.5 35.5" stroke="currentColor" strokeWidth="0.9" strokeOpacity="0.55" />
      <path d="M32 4 L38 19" stroke="currentColor" strokeWidth="0.9" strokeOpacity="0.35" />
      <path d="M14 18 L16.5 35.5" stroke="currentColor" strokeWidth="0.9" strokeOpacity="0.3" />
      {/* Snow cap */}
      <path
        d="M32 4 L27.2 12.6 L30 11.4 L32.6 13.4 L35.1 11.2 L37 13 Z"
        fill="currentColor"
        fillOpacity="0.9"
      />
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
      <IcefallMark className={cfg.mark} />
      <div className={cn("pl-[0.36em] font-light leading-none", cfg.type)}>ICEFALL</div>
    </div>
  );
}
