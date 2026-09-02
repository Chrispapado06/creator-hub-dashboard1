import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { fmtElevation } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * HIGHEST ELEVATION BY YEAR — the achievements plot from the owner's 2 Sep
 * profile mockup.
 *
 * ── IT IS DRAWN THE WAY THIS APP'S CHARTS ARE DRAWN ──────────────────────────
 *
 * `components/ui/charts.tsx` states the house rule in its own header: the
 * reference design's charts are "hairline-thin and unlabelled — closer to
 * instrumentation than to business graphics", which is why every one of them is
 * hand-built SVG rather than a library. This follows it — one 2px azure line, a
 * single end-dot, solid hairline gridlines, and no label on any point except the
 * last. `MonthlyVolume`, the closest sibling, makes the same call and says why:
 * "the tallest month is worth naming outright; every other value is one tap
 * away. A number above every bar is noise nobody reads."
 *
 * It sits in `components/domain` rather than beside them because it is not a
 * general primitive: it is one specific claim about a climber, with the honesty
 * rules below baked into it, and those rules are not something a generic chart
 * should carry.
 *
 * ── THE THREE RULES THAT ARE ABOUT TRUTH, NOT STYLE ──────────────────────────
 *
 *  1. FEWER THAN TWO YEARS DRAWS NO LINE. A line between one point and nothing
 *     is a direction, and a direction is a claim about a trend that has not been
 *     measured. One year renders as the figure alone, saying so. No years
 *     renders NOTHING — `null`, so the caller's section closes up rather than
 *     holding an empty frame that reads as data still loading.
 *
 *  2. A GAP BREAKS THE LINE. `PublicSummitYear` is explicit that a year with no
 *     summit is ABSENT from the series rather than plotted as zero — so a
 *     straight segment from 2022 to 2025 would draw two intermediate heights
 *     nobody recorded. Runs of consecutive years are therefore drawn as separate
 *     paths, and a year standing on its own gets a small dot so that it is
 *     visible rather than silently dropped.
 *
 *  3. THE BASELINE IS SEA LEVEL. The y-axis starts at 0 and the gridlines are
 *     whole thousands, exactly as the mockup draws them. A zoomed baseline makes
 *     100 m of difference look like a season's transformation, which on a chart
 *     about altitude is the most flattering lie available.
 *
 * Nothing here is smoothed. `Sparkline` uses Catmull-Rom because a weekly trend
 * is a shape rather than a set of readings; these ARE readings — one figure per
 * year — and a curve between them would bulge through altitudes the climber
 * never reached.
 */

/**
 * One year's highest elevation.
 *
 * Structurally identical to `PublicSummitYear` in `social/publicProfile.ts` and
 * deliberately NOT imported from it: this component knows nothing about how a
 * year was arrived at, and typing it against the social module would make a
 * chart depend on a data layer it never reads. A caller passes that array
 * straight in.
 */
export interface ElevationYear {
  year: number;
  /** Metres above sea level. */
  highestM: number;
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The viewBox is sized close to the width this actually renders at — a card's
 * inner width on a 375px handset — so the uniform scale is near 1:1 and a 2px
 * stroke arrives on screen as roughly 2px. `preserveAspectRatio` is left at its
 * default rather than set to `none`: `ElevationProfile` can stretch because it
 * is a silhouette, but stretching this one would squash the round end-dot into
 * an ellipse and give the line two different weights depending on its angle.
 */
const W = 300;
const H = 162;
/** Room for the y-axis labels on the left, and the year labels underneath. */
const PAD_L = 28;
const PAD_R = 10;
const PAD_T = 16;
const PAD_B = 24;

const PLOT_L = PAD_L;
const PLOT_R = W - PAD_R;
const PLOT_T = PAD_T;
const PLOT_B = H - PAD_B;
const PLOT_W = PLOT_R - PLOT_L;
const PLOT_H = PLOT_B - PLOT_T;

/** The end-dot: 9px across, with a 2px ring in the card's own colour. */
const DOT_R = 4.5;

/** At most this many year labels along the bottom before they are thinned. */
const MAX_YEAR_LABELS = 7;

/**
 * The top of the scale and the spacing of its gridlines, in whole thousands.
 *
 * Always ONE STEP ABOVE the highest reading, never level with it: the top
 * gridline doubles as the ceiling of the drawing, and a point sitting exactly on
 * it has nowhere to put its label and reads as clipped. 3,182 m therefore gives
 * a 4,000 m ceiling — which is what the mockup draws.
 */
function scaleFor(maxM: number): { top: number; step: number } {
  // Above 5,000 m the thousands become six or more lines, which is a ruled page
  // rather than a chart. The 8,000-metre peaks are the reason this branch
  // exists at all.
  const step = maxM >= 5_000 ? 2_000 : 1_000;
  return { top: Math.max(step, (Math.floor(maxM / step) + 1) * step), step };
}

/** "0", "1k", "4k" — the mockup's own axis, and the shortest honest form. */
const axisLabel = (m: number): string => (m === 0 ? "0" : `${m / 1_000}k`);

/**
 * The series, cleaned: one entry per year, ascending, nothing unreadable.
 *
 * A year arriving twice keeps the HIGHER figure rather than the later one — the
 * series is "highest elevation in that year", so two readings for one year are
 * two ascents, not a correction. Anything that is not a finite year and a finite
 * non-negative altitude is dropped rather than coerced: a coerced value is an
 * invented one, and this chart's whole job is to not invent altitudes.
 */
function normalise(years: readonly ElevationYear[]): ElevationYear[] {
  const best = new Map<number, number>();
  for (const entry of years) {
    const year = entry?.year;
    const metres = entry?.highestM;
    if (!Number.isInteger(year) || !Number.isFinite(metres) || metres < 0) continue;
    const held = best.get(year);
    if (held === undefined || metres > held) best.set(year, metres);
  }
  return [...best.entries()]
    .map(([year, highestM]) => ({ year, highestM }))
    .sort((a, b) => a.year - b.year);
}

/**
 * Consecutive years, grouped. See rule 2 in the header — each group becomes its
 * own path, so the line never crosses a year nobody reported.
 */
function runsOf(points: ElevationYear[]): ElevationYear[][] {
  const runs: ElevationYear[][] = [];
  for (const point of points) {
    const open = runs[runs.length - 1];
    if (open && point.year === open[open.length - 1].year + 1) open.push(point);
    else runs.push([point]);
  }
  return runs;
}

/* -------------------------------------------------------------------------- */
/* The chart                                                                   */
/* -------------------------------------------------------------------------- */

export function ElevationProgress({
  years,
  className,
}: {
  years: readonly ElevationYear[];
  className?: string;
}) {
  const reduce = useReducedMotion();
  const points = useMemo(() => normalise(years), [years]);

  /* Hooks first, always: both of the above run before either early return
     below, so the branch a profile takes cannot change the hook order. */

  // Nothing measured. The caller draws its own sentence about why — an empty
  // axis here would say the data exists and is merely late.
  if (points.length === 0) return null;
  if (points.length === 1) return <OneYearOnly point={points[0]} className={className} />;

  const first = points[0].year;
  const last = points[points.length - 1].year;
  const span = last - first;
  const maxM = points.reduce((m, p) => Math.max(m, p.highestM), 0);
  const { top, step } = scaleFor(maxM);

  const x = (year: number) => PLOT_L + ((year - first) / span) * PLOT_W;
  const y = (metres: number) => PLOT_B - (metres / top) * PLOT_H;

  const gridlines: number[] = [];
  for (let v = 0; v <= top; v += step) gridlines.push(v);

  /* Every year in the range gets a label while they fit — including the ones
     with no point, because the axis is a run of years and a missing one is part
     of the reading. Past that they are thinned evenly, with the last year always
     kept: it is the year the labelled figure belongs to. */
  const yearCount = span + 1;
  const stride = Math.ceil(yearCount / MAX_YEAR_LABELS);
  const yearLabels: number[] = [];
  for (let year = first; year <= last; year += 1) {
    if ((year - first) % stride === 0 || year === last) yearLabels.push(year);
  }

  const runs = runsOf(points);
  const end = points[points.length - 1];
  const before = points[points.length - 2];
  const endY = y(end.highestM);
  /* The label goes on the side the line did NOT arrive from, so the two never
     cross — then it is clamped, because a final point at the very top of the
     scale has no room above it and one at sea level has none below. */
  const roomAbove = endY - 13 >= PLOT_T;
  const roomBelow = endY + 16 <= PLOT_B;
  const above = before.highestM <= end.highestM ? roomAbove : !roomBelow;
  const endLabelY = above ? endY - 13 : endY + 16;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("w-full", className)}
      role="img"
      /* The whole series in words. A line chart is unreadable to a screen
         reader otherwise, and this is a person's climbing record rather than
         decoration — `aria-hidden` would be the wrong call. */
      aria-label={`Highest elevation by year. ${points
        .map((p) => `${p.year}, ${fmtElevation(p.highestM)} metres`)
        .join(". ")}.`}
    >
      {/* ---- Gridlines --------------------------------------------------
          SOLID hairlines, never dashed: a dashed rule reads as a target or a
          projection in every other chart in this app, and neither is what a
          thousand metres is. */}
      {gridlines.map((v) => (
        <g key={v}>
          <line
            x1={PLOT_L}
            x2={PLOT_R}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--ice-hairline)"
            strokeWidth={1}
          />
          <text
            x={PLOT_L - 6}
            y={y(v)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={9}
            fill="var(--ice-mist-dim)"
          >
            {axisLabel(v)}
          </text>
        </g>
      ))}

      {/* ---- The line, one path per unbroken run ------------------------- */}
      {runs.map((run, i) =>
        run.length === 1 ? (
          /* A year with no neighbour. Drawn as a point rather than dropped —
             it is a real reading, and a run of one is what a climber with a
             single season either side of a gap actually has. */
          <circle
            key={run[0].year}
            cx={x(run[0].year)}
            cy={y(run[0].highestM)}
            r={2.75}
            fill="var(--ice-azure)"
            fillOpacity={0.85}
          />
        ) : (
          <motion.path
            key={run[0].year}
            d={run.map((p, j) => `${j === 0 ? "M" : "L"}${x(p.year)} ${y(p.highestM)}`).join(" ")}
            fill="none"
            stroke="var(--ice-azure)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{
              duration: reduce ? 0 : 1.1,
              ease: [0.22, 1, 0.36, 1],
              delay: reduce ? 0 : i * 0.12,
            }}
          />
        ),
      )}

      {/* ---- Where they are now ------------------------------------------
          The ring is drawn in the card's own colour rather than as a hole, so
          the dot sits ON the line instead of cutting it. */}
      <circle
        cx={x(end.year)}
        cy={endY}
        r={DOT_R}
        fill="var(--ice-azure)"
        stroke="var(--ice-graphite)"
        strokeWidth={2}
      />
      <text
        x={x(end.year) + 2}
        y={endLabelY}
        textAnchor="end"
        fontSize={11}
        className="tnum"
        fill="var(--ice-snow)"
      >
        {fmtElevation(end.highestM)} m
      </text>

      {/* ---- Years -------------------------------------------------------- */}
      {yearLabels.map((year) => (
        <text
          key={year}
          x={x(year)}
          y={PLOT_B + 15}
          textAnchor="middle"
          fontSize={9}
          className="tnum"
          fill={year === last ? "var(--ice-mist)" : "var(--ice-mist-dim)"}
        >
          {year}
        </text>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* One year                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A single reading, printed rather than plotted.
 *
 * The second sentence is the one that matters: without it a reader who has seen
 * this chart with a line on somebody else's profile reads the missing line as a
 * loading failure. It is not — there is genuinely only one year to draw.
 */
function OneYearOnly({ point, className }: { point: ElevationYear; className?: string }) {
  return (
    <div className={className}>
      <p className="flex items-baseline gap-1">
        <span className="tnum text-[19px] font-light leading-none text-snow">
          {fmtElevation(point.highestM)}
        </span>
        <span className="text-[11px] text-mist">m</span>
        <span className="tnum ml-1.5 text-[11px] text-mist-dim">in {point.year}</span>
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
        One year on record, so there is no line. Two points are the least a direction can be drawn
        from, and a direction drawn from one would be a trend nobody measured.
      </p>
    </div>
  );
}
