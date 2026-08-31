import { monogram } from "@/data/demo";
import { cn } from "@/lib/utils";

/**
 * A company's mark — its logo, or its monogram.
 *
 * ── THE MONOGRAM IS THE DEFAULT PATH, NOT AN ERROR STATE ────────────────────
 *
 * `Company.logo` is only ever set for an INVENTED company. A real business's
 * logo is its trademark: ICEFALL does not host it, does not bundle it, and has
 * no licence to reproduce it. So a real operator's listing shows initials, and
 * that is the correct, finished rendering — not a placeholder waiting for an
 * asset, and never a reason to reach for a generic icon that would make every
 * company look identical.
 *
 * **Never fabricate a mark.** Not a generated wordmark, not an initial rendered
 * in a brand-ish colour, not a mountain glyph standing in for a company. The
 * monogram is honest because it is plainly derived from the name and claims
 * nothing about the business.
 *
 * ── WHY THIS IS A COMPONENT AND NOT A THIRD COPY ────────────────────────────
 *
 * `Company.tsx` and `Explore.tsx` each carried this logo-or-monogram branch
 * inline, and `TripDetail.tsx` had drifted a different way entirely: a generic
 * `MountainIcon`, identical for every operator, where the other two showed the
 * company. Three sites, three answers to one question.
 *
 * That is the shape this codebase has paid for twice already — `peaks.ts` exists
 * because one summit altitude lived in two places and disagreed about Ama
 * Dablam, and `RealBusiness.tsx` exists because a disclosure guard lived in one
 * component while the claim was rendered by three. The rule the trademark
 * argument depends on has to live in one place, or the next surface added will
 * be a fourth answer.
 *
 * The two existing treatments are preserved exactly, as `variant`s — this
 * extraction changes no pixel on either page.
 */
export function CompanyMark({
  name,
  logo,
  size,
  variant = "tile",
  decorative = false,
  className,
}: {
  name: string;
  /** Absent for every real business, by design. See above. */
  logo?: string;
  /** Rendered square, in pixels. */
  size: number;
  /**
   * `card` — the company page's own header: heavier border, obsidian ground,
   * blurred so it sits on a photograph. `tile` — a listing card in a rail.
   */
  variant?: "card" | "tile";
  /** True where an adjacent element already names the company. */
  decorative?: boolean;
  className?: string;
}) {
  const box = { width: size, height: size };

  if (logo) {
    return (
      <img
        src={logo}
        {...(decorative ? { alt: "", "aria-hidden": true } : { alt: `${name} logo` })}
        style={box}
        className={cn(
          "block shrink-0 object-contain",
          variant === "card"
            ? "rounded-card border border-hairline-strong"
            : "rounded-tile border border-hairline",
          className,
        )}
      />
    );
  }

  return (
    <span
      {...(decorative ? { "aria-hidden": true } : {})}
      style={box}
      className={cn(
        "grid shrink-0 place-items-center px-1.5 text-center leading-tight",
        monogramType(size),
        variant === "card"
          ? "rounded-card border border-hairline-strong bg-obsidian/80 tracking-[0.08em] text-mist backdrop-blur"
          : "rounded-tile border border-hairline bg-slate/60 tracking-[0.06em] text-mist",
        className,
      )}
    >
      {monogram(name)}
    </span>
  );
}

/**
 * Monogram type size, by breakpoint rather than by ratio.
 *
 * These are not proportional and should not be made so: the two call sites this
 * was extracted from used 15px at both 132px and 60px, and 13px at 52px. They
 * were hand-set against real layouts, so the breakpoints reproduce them rather
 * than replacing them with a formula that would change both.
 */
function monogramType(size: number): string {
  if (size >= 56) return "text-[15px]";
  if (size >= 40) return "text-[13px]";
  if (size >= 28) return "text-[11px]";
  return "text-[9.5px]";
}
