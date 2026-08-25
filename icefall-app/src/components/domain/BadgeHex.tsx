import { cn } from "@/lib/utils";
import type { BadgeId, BadgeSpec } from "@/badges/model";

/**
 * The badge mark: a bevelled hexagon with a solid glyph inside it.
 *
 * Drawn rather than shipped as art, so one definition serves the 22px row on a
 * profile and the 56px block in the catalogue, and so the shape can be rendered
 * unearned without a second set of files.
 *
 * The glyphs are hand-drawn paths, not icon-font strokes. A badge is a small,
 * solid, recognisable object — a check, a peak, an axe, a tower, a thumb — and
 * a 1.5px outline icon at 22px reads as a smudge. These are filled shapes with
 * enough weight to survive being shrunk into a byline.
 */

/* -------------------------------------------------------------------------- */
/* Glyphs                                                                     */
/* -------------------------------------------------------------------------- */

/** All glyphs are drawn inside the same 100×100 box as the hexagon. */
function Glyph({ id }: { id: BadgeId }) {
  switch (id) {
    case "verified":
      return (
        <path
          d="M32 51 L44.5 63.5 L69 39"
          fill="none"
          stroke="white"
          strokeWidth={10}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );

    case "sherpa":
      // A range with a star over it — experience, not a single summit.
      return (
        <>
          <path d="M20 68 L38 41 L50 57 L61 43 L80 68 Z" fill="white" fillOpacity={0.95} />
          <path d="M38 41 L44 49.5 L32 57 Z" fill="white" fillOpacity={0.6} />
          <path
            d="M69 27 L71.6 33.4 L78 36 L71.6 38.6 L69 45 L66.4 38.6 L60 36 L66.4 33.4 Z"
            fill="white"
          />
        </>
      );

    case "guide":
      // An ice axe: shaft, curved pick, spike.
      return (
        <>
          <path
            d="M53 34 L47 73"
            fill="none"
            stroke="white"
            strokeWidth={8}
            strokeLinecap="round"
          />
          <path
            d="M30 41 Q52 26 72 35"
            fill="none"
            stroke="white"
            strokeWidth={8}
            strokeLinecap="round"
          />
          <path d="M46 72 L44 80 L51 74 Z" fill="white" />
        </>
      );

    case "company":
      // A classical façade — the mark of an operator, not a person.
      return (
        <>
          <path d="M26 45 L50 29 L74 45 Z" fill="white" />
          <rect x="32" y="49" width="7" height="20" rx="2" fill="white" fillOpacity={0.95} />
          <rect x="46.5" y="49" width="7" height="20" rx="2" fill="white" fillOpacity={0.95} />
          <rect x="61" y="49" width="7" height="20" rx="2" fill="white" fillOpacity={0.95} />
          <rect x="26" y="72" width="48" height="6" rx="3" fill="white" />
        </>
      );

    case "community":
      // A thumb — the one badge other people award.
      return (
        <>
          <rect x="24" y="47" width="13" height="27" rx="4" fill="white" fillOpacity={0.85} />
          <path
            d="M41 47 L51 29 A5.5 5.5 0 0 1 61 33.5 L58 45 L71 45 A6 6 0 0 1 76.8 52.5 L72.5 68.5 A6.5 6.5 0 0 1 66 74 L41 74 Z"
            fill="white"
          />
        </>
      );
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Which palette the hexagon is drawn in.
 *
 * `house` is the badge's own colour — the default, and what the catalogue and
 * every byline still use. `azure` is the profile tile: a faint accent-tinted
 * facet behind a hairline azure edge, for a row where five different badge
 * colours would fight the identity above them. The GLYPH and the earned/unearned
 * distinction are identical in both; only the facet changes.
 */
export type BadgeHexTone = "house" | "azure";

export function BadgeHex({
  badge,
  size = 44,
  /** Draws the shape without its colour — for a badge nobody has earned. */
  muted = false,
  tone = "house",
  className,
}: {
  badge: BadgeSpec;
  size?: number;
  muted?: boolean;
  tone?: BadgeHexTone;
  className?: string;
}) {
  // A regular hexagon, point up. The thick round-joined stroke under the fill
  // is what gives the corners their radius without a hand-built arc path.
  const hex = "M50 8 L86.4 29 L86.4 71 L50 92 L13.6 71 L13.6 29 Z";
  // Toned into the id: two tones of one badge on the same page would otherwise
  // share a single `<defs>` entry and the second would inherit the first.
  const gradient = `badge-${badge.id}-${tone}`;
  const rim = `badge-rim-${badge.id}-${tone}`;
  const azure = tone === "azure";

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          {azure ? (
            <>
              <stop offset="0%" stopColor="var(--ice-azure)" stopOpacity={0.3} />
              <stop offset="55%" stopColor="var(--ice-azure)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--ice-azure-deep)" stopOpacity={0.1} />
            </>
          ) : (
            <>
              {/* Lit from above: the top facet catches light, the base falls away. */}
              <stop offset="0%" stopColor={badge.stroke} />
              <stop offset="55%" stopColor={badge.fill} />
              <stop offset="100%" stopColor={badge.fill} stopOpacity={0.82} />
            </>
          )}
        </linearGradient>
        <linearGradient id={rim} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity={0.55} />
          <stop offset="100%" stopColor="white" stopOpacity={0.08} />
        </linearGradient>
      </defs>

      {azure ? (
        // The facet, then its hairline edge drawn as a separate stroke so the
        // edge keeps one weight instead of thickening with the fill.
        <>
          <path d={hex} fill={`url(#${gradient})`} fillOpacity={muted ? 0.55 : 1} />
          <path
            d={hex}
            fill="none"
            stroke="var(--ice-azure)"
            strokeOpacity={muted ? 0.34 : 0.62}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          {/* Body — stroked in its own fill so the corners round off. */}
          <path
            d={hex}
            fill={muted ? "transparent" : `url(#${gradient})`}
            stroke={muted ? "var(--ice-hairline-strong)" : `url(#${gradient})`}
            strokeWidth={muted ? 4 : 12}
            strokeLinejoin="round"
          />
          {/* Rim light, so it reads as an object rather than a sticker. */}
          {!muted && (
            <path
              d={hex}
              fill="none"
              stroke={`url(#${rim})`}
              strokeWidth={4}
              strokeLinejoin="round"
            />
          )}
        </>
      )}

      <g opacity={muted ? 0.35 : 1}>
        <Glyph id={badge.id} />
      </g>
    </svg>
  );
}
