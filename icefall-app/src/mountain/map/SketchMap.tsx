/**
 * THE PLOT (plan §3.3, §4.6; mockup spec §6) — drawn from what is on this phone
 * and nothing else.
 *
 * No tiles are requested, here or anywhere in Mountain mode. There is no
 * basemap because no service the app uses permits saving one (plan §4.2), and
 * this is deliberately not Mapbox, which bills per map opening (plan §4.5).
 *
 * THE MOCKUP'S MISSING LAYER. The owner's map mockup shows dark terrain under
 * everything. We are not allowed to draw it yet, and a decorative picture of a
 * mountain would be a picture of the wrong mountain — so the terrain layer is
 * simply absent and the map says so in its own bottom-left caption. Every other
 * thing the mockup shows is here and real: labelled peaks and huts with their
 * altitudes, amber hazard triangles, the white position dot with its azure
 * glow, the saved-and-illustrative captions, and a scale bar with tick labels.
 * The day a map pack is licensed, one layer goes in behind this and nothing
 * else on the screen has to change.
 *
 * What it draws: your GPS dot with its accuracy as a circle, the recorded
 * summit and huts, pins somebody on this phone added, and the breadcrumb runs —
 * with the breaks left as breaks, because a line across a gap is a line across
 * ground nobody walked.
 *
 * North is up. It does not rotate with the phone. No animation anywhere.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { cn } from "@/lib/utils";

import { ROUTE_LINE_LABEL } from "../mapModel";
import { M_LABEL } from "../ui";
import type { MapPin } from "./pins";
import {
  accuracyRadiusPx,
  backArrows,
  fromXY,
  isOnCanvas,
  panView,
  runPath,
  scaleBarTicks,
  toXY,
  zoomView,
  type PlotPoint,
  type PlotView,
} from "./plot";

export interface PlotPlace extends PlotPoint {
  name: string;
  kind: "summit" | "camp";
  /** "4,806 m" — the record's own elevation, or null where it holds none. */
  elevationLabel?: string | null;
  /** Over a year old: drawn and labelled quieter, never hidden (plan §3.0). */
  greyed?: boolean;
}

export interface SketchMapProps {
  view: PlotView | null;
  onView: (v: PlotView) => void;
  /** Reports the drawing box, so the parent can fit a view to it. */
  onSize: (width: number, height: number) => void;
  places: readonly PlotPlace[];
  pins: readonly MapPin[];
  /** Unbroken breadcrumb runs. Each is drawn on its own; they are never joined. */
  runs: readonly (readonly PlotPoint[])[];
  fix: { lat: number; lon: number; accuracyM: number | null } | null;
  /** The fix is old: the dot is grey and hollow, so it is not read as "here, now". */
  fixGreyed?: boolean;
  /**
   * Retrace is running: the walked track turns white and carries arrows back
   * the way you came, instead of sitting quietly under everything.
   */
  retrace?: boolean;
  /** Geometry for the route. There is none in the app today; if there ever is, it is labelled. */
  routeLine?: readonly PlotPoint[] | null;
  /**
   * The bottom-left caption. `Map saved 2 days ago` over a real pack, and the
   * honest short line where none is saved — never the first over the second.
   */
  savedCaption: string;
  onFitAll?: () => void;
  emptyLine: string;
  className?: string;
}

/** Tall enough to be the screen's one hero, short enough to keep the buttons in thumb reach. */
const PLOT_HEIGHT = "clamp(280px, 46vh, 440px)";

/** A square overlay control. 64 px, like everything else somebody taps in gloves. */
const PAD_BUTTON =
  "grid h-16 w-16 place-items-center rounded-[12px] border border-hairline-strong bg-obsidian/85 text-[22px] leading-none text-snow backdrop-blur-sm";

export function SketchMap({
  view,
  onView,
  onSize,
  places,
  pins,
  runs,
  fix,
  fixGreyed = false,
  retrace = false,
  routeLine = null,
  savedCaption,
  onFitAll,
  emptyLine,
  className,
}: SketchMapProps) {
  const box = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const report = () => onSize(el.clientWidth, el.clientHeight);
    report();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onSize]);

  const onPointerDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId || !view) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (dx === 0 && dy === 0) return;
      drag.current = { id: d.id, x: e.clientX, y: e.clientY };
      onView(panView(view, dx, dy));
    },
    [onView, view],
  );

  const endDrag = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
    setDragging(false);
  }, []);

  /* The box is drawn even with nothing to plot. It is what gets measured, and
     the parent cannot fit a view until it knows the size — leaving it out was a
     plot that never appeared, because nothing ever reported a width. */
  const bar = view ? scaleBarTicks(view) : null;
  const fixXY = view && fix ? toXY(view, fix) : null;
  const accuracyPx = view && fix ? accuracyRadiusPx(view, fix.accuracyM) : null;
  const lineDrawn = (routeLine?.length ?? 0) > 1;
  const offPlot = view !== null && fixXY !== null && !isOnCanvas(view, fixXY, 8);
  const trackInk = retrace ? "var(--ice-snow)" : "var(--ice-mist)";

  return (
    <div className={className}>
      <div
        ref={box}
        className="relative w-full overflow-hidden bg-obsidian"
        style={{ height: PLOT_HEIGHT }}
      >
        {!view && (
          <p className="max-w-[28rem] px-5 pt-8 text-[17px] leading-snug text-mist">{emptyLine}</p>
        )}
        {view && bar && (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${Math.max(1, view.width)} ${Math.max(1, view.height)}`}
            role="img"
            aria-label="Plot of your position, recorded places and where you have walked. No map behind it."
            className={cn("block touch-none select-none", dragging ? "cursor-grabbing" : "cursor-grab")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {/* Breadcrumbs. Quiet under everything, until retrace makes them the point. */}
            {runs.map((run, i) =>
              run.length > 1 ? (
                <path
                  key={`run-${i}`}
                  d={runPath(view, run)}
                  fill="none"
                  stroke={trackInk}
                  strokeWidth={retrace ? 4 : 3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : run.length === 1 ? (
                <circle
                  key={`run-${i}`}
                  cx={toXY(view, run[0]).x}
                  cy={toXY(view, run[0]).y}
                  r={2.5}
                  fill={trackInk}
                />
              ) : null,
            )}

            {/* The way back. Every arrow points from the newer crumb to the older one. */}
            {retrace &&
              runs.map((run, i) =>
                backArrows(view, run).map((a, j) => (
                  <path
                    key={`arrow-${i}-${j}`}
                    d="M0 -7 L5 5 L0 2 L-5 5 Z"
                    transform={`translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${a.angleDeg.toFixed(1)})`}
                    fill="var(--ice-snow)"
                    stroke="var(--ice-obsidian)"
                    strokeWidth={1}
                  />
                )),
              )}

            {lineDrawn && (
              <path
                d={runPath(view, routeLine ?? [])}
                fill="none"
                stroke="var(--ice-azure)"
                strokeWidth={3}
                strokeDasharray="10 6"
                strokeLinecap="round"
              />
            )}

            {places.map((p, i) => {
              const { x, y } = toXY(view, p);
              const ink = p.greyed ? "var(--ice-mist-dim)" : "var(--ice-snow)";
              const sub = p.greyed ? "var(--ice-mist-dim)" : "var(--ice-mist)";
              // A label near the right edge is written leftwards, or it is cut off.
              const flip = x > view.width * 0.5;
              return (
                <g key={`place-${i}`}>
                  {p.kind === "summit" ? (
                    <path
                      d={`M${x} ${y - 9} L${x + 8} ${y + 6} L${x - 8} ${y + 6} Z`}
                      fill="none"
                      stroke={ink}
                      strokeWidth={2}
                    />
                  ) : (
                    <rect x={x - 6} y={y - 6} width={12} height={12} fill="none" stroke={ink} strokeWidth={2} />
                  )}
                  <text
                    x={flip ? x - 13 : x + 13}
                    y={y + 5}
                    textAnchor={flip ? "end" : "start"}
                    fill={ink}
                    stroke="var(--ice-obsidian)"
                    strokeWidth={3.5}
                    paintOrder="stroke"
                    fontSize={14}
                  >
                    {p.name}
                    {/* The altitude beside the name, a step quieter (mockup §6). */}
                    {p.elevationLabel && <tspan fill={sub} dx="2">{` ${p.elevationLabel}`}</tspan>}
                  </text>
                </g>
              );
            })}

            {/* AMBER HAZARD TRIANGLES (mockup §6). Every one of them is a pin
                somebody on this phone dropped — ICEFALL holds no hazard
                geometry for any mountain, so nothing else may wear this mark. */}
            {pins.map((pin) => {
              const { x, y } = toXY(view, pin);
              const flip = x > view.width * 0.5;
              return (
                <g key={pin.id}>
                  <path
                    d={`M${x} ${y - 10} L${x + 10} ${y + 8} L${x - 10} ${y + 8} Z`}
                    fill="none"
                    stroke="var(--ice-alert)"
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M${x} ${y - 3} L${x} ${y + 2}`}
                    stroke="var(--ice-alert)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                  <circle cx={x} cy={y + 5} r={1.3} fill="var(--ice-alert)" />
                  <text
                    x={flip ? x - 15 : x + 15}
                    y={y + 6}
                    textAnchor={flip ? "end" : "start"}
                    fill="var(--ice-alert)"
                    stroke="var(--ice-obsidian)"
                    strokeWidth={3.5}
                    paintOrder="stroke"
                    fontSize={14}
                  >
                    {pin.label}
                  </text>
                </g>
              );
            })}

            {/* YOUR POSITION: a white dot inside an azure glow (mockup §6).
                When the fix is old it goes grey and hollow instead — an old dot
                drawn as "here" is the one lie this screen must never tell. */}
            {fixXY && !offPlot && (
              <g>
                {accuracyPx !== null && accuracyPx > 4 && (
                  <circle
                    cx={fixXY.x}
                    cy={fixXY.y}
                    r={accuracyPx}
                    fill="none"
                    stroke={fixGreyed ? "var(--ice-mist-dim)" : "var(--ice-azure)"}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                  />
                )}
                {!fixGreyed && (
                  <>
                    <circle cx={fixXY.x} cy={fixXY.y} r={20} fill="var(--ice-azure-glow)" />
                    <circle cx={fixXY.x} cy={fixXY.y} r={13} fill="var(--ice-azure)" opacity={0.55} />
                  </>
                )}
                <circle
                  cx={fixXY.x}
                  cy={fixXY.y}
                  r={fixGreyed ? 8 : 7}
                  fill={fixGreyed ? "none" : "var(--ice-snow)"}
                  stroke={fixGreyed ? "var(--ice-mist-dim)" : "var(--ice-azure-deep)"}
                  strokeWidth={fixGreyed ? 2 : 2}
                />
              </g>
            )}

            {/* North. A fact about the drawing, not decoration. */}
            <g aria-hidden>
              <path
                d={`M20 26 L20 6 M20 6 L15 14 M20 6 L25 14`}
                stroke="var(--ice-snow)"
                strokeWidth={2}
                fill="none"
              />
              <text
                x={20}
                y={42}
                textAnchor="middle"
                fill="var(--ice-snow)"
                stroke="var(--ice-obsidian)"
                strokeWidth={3}
                paintOrder="stroke"
                fontSize={13}
              >
                N
              </text>
            </g>
          </svg>
        )}

        {/* Bottom-left: what is behind this drawing, and what it is not for. */}
        <div className="pointer-events-none absolute bottom-3 left-5 max-w-[60%]">
          <p className={cn(M_LABEL, "text-mist")}>{savedCaption}</p>
          <p className="mt-1 text-[12px] leading-snug text-mist-dim">{ROUTE_LINE_LABEL}</p>
        </div>

        {/* Bottom-right: the scale, with its ticks numbered. */}
        {bar && (
          <div
            className="pointer-events-none absolute right-5 bottom-3"
            aria-label={`Scale bar, ${bar.label}`}
          >
            <div className="relative h-[13px]" style={{ width: bar.px }}>
              {bar.ticks.map((t, i) => {
                const last = i === bar.ticks.length - 1;
                const middle = i > 0 && !last;
                /* A short bar has no room for a number in the middle, and two
                   numbers on top of each other are worse than one. */
                if (middle && bar.px < 84) return null;
                return (
                  <span
                    key={`label-${i}`}
                    className={cn(
                      "absolute top-0 text-[11px] tabular-nums whitespace-nowrap text-mist",
                      middle && "-translate-x-1/2",
                      last && "-translate-x-full",
                    )}
                    style={{ left: t.px }}
                  >
                    {t.label}
                  </span>
                );
              })}
            </div>
            <div className="relative mt-[2px] h-[7px]" style={{ width: bar.px }}>
              <span className="absolute top-[3px] left-0 block h-[2px] w-full bg-mist" />
              {bar.ticks.map((t, i) => (
                <span
                  key={`tick-${i}`}
                  className="absolute top-0 block h-[7px] w-[2px] bg-mist"
                  style={{ left: Math.min(t.px, Math.max(0, bar.px - 2)) }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Zoom and fit. Not in the mockup, and not droppable either: with no
            basemap the scale is the only thing that makes the plot readable. */}
        {view && (
          <div className="absolute top-3 right-3 flex flex-col gap-2">
            <button type="button" className={PAD_BUTTON} onClick={() => onView(zoomView(view, 2))} aria-label="Zoom in">
              +
            </button>
            <button
              type="button"
              className={PAD_BUTTON}
              onClick={() => onView(zoomView(view, 0.5))}
              aria-label="Zoom out"
            >
              −
            </button>
            {onFitAll && (
              <button
                type="button"
                className={cn(PAD_BUTTON, "text-[11px] font-semibold uppercase tracking-[0.06em]")}
                onClick={onFitAll}
                aria-label="Fit everything on the plot"
              >
                Fit
              </button>
            )}
          </div>
        )}
      </div>

      {offPlot && (
        <p className="px-5 pt-2 text-[15px] leading-snug text-mist">
          Your position is off this plot. Centre on me brings it back.
        </p>
      )}
    </div>
  );
}

/** Where a tap landed on the plot, for anything that needs ground coordinates. */
export function pointAt(view: PlotView, clientX: number, clientY: number, rect: DOMRect): PlotPoint {
  return fromXY(view, { x: clientX - rect.left, y: clientY - rect.top });
}

export default SketchMap;
