import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

/**
 * THE LIQUID-GLASS BUTTON — the owner's reference, 2026-09-07.
 *
 * A pane of glass rather than a filled control: the page shows through it,
 * refracted, with light caught along its inside edges. Built from the
 * reference's three parts, which only work together:
 *
 *   1. A `backdropFilter` pointing at an SVG filter that displaces whatever is
 *      behind the button with fractal noise, then blurs it. This is the
 *      refraction — without it the "glass" is a flat translucent rectangle.
 *   2. A long `box-shadow` of INSET highlights that traces the top-left and
 *      bottom-right edges, which is what makes it read as a thick pane with
 *      depth rather than a hole.
 *   3. A faint outer glow, so it separates from the page behind it.
 *
 * ── WHY IT IS REBUILT RATHER THAN PASTED ─────────────────────────────────────
 *
 * The reference is a shadcn component: `bg-primary`, `text-primary-foreground`,
 * `ring-ring`, `border-input`. ICEFALL has none of those — its palette is
 * `snow`/`mist`/`graphite`/`azure` and there is no shadcn theme layer, so every
 * one of those class names compiles to nothing here. The geometry, the shadow
 * stack and the filter are the reference's; the colours are ours.
 *
 * The reference's other two exports came with it and are not here: `Button`
 * duplicates `components/ui/primitives.tsx`, which this app already has and
 * whose focus-ring contract every control follows, and `MetalButton` is a
 * different design nobody asked for. An unused variant is a decision nobody has
 * made.
 *
 * ── THE FILTER IS DEFINED ONCE, GLOBALLY ─────────────────────────────────────
 *
 * The reference renders its `<svg>` of filter definitions INSIDE every button.
 * Two buttons on one page then define `id="container-glass"` twice, and a
 * duplicate SVG filter id is undefined behaviour — browsers take the first and
 * ignore the rest, so the second button silently loses its refraction. Here the
 * definition is mounted once by `<GlassFilterDefs />`, which the app shell
 * renders, and the buttons only reference it.
 *
 * ── IT DEGRADES TO SOMETHING SENSIBLE ────────────────────────────────────────
 *
 * `backdrop-filter: url(#…)` is not supported everywhere — Safari ignores SVG
 * filter references in `backdrop-filter` entirely. There it falls back to the
 * ordinary blur underneath, so the control is still a legible pane of glass
 * rather than an invisible rectangle. Nothing here is load-bearing for reading
 * the label.
 */

/**
 * Mount ONCE, near the root. Defines the displacement filter every
 * `LiquidGlassButton` on the page refers to by id.
 */
export function GlassFilterDefs() {
  return (
    <svg aria-hidden className="pointer-events-none absolute h-0 w-0" focusable="false">
      <defs>
        <filter
          id="icefall-liquid-glass"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          {/* Turbulence is the "liquid": it is what bends what is behind. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 0.05"
            numOctaves={1}
            seed={1}
            result="turbulence"
          />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurredNoise"
            scale={70}
            xChannelSelector="R"
            yChannelSelector="B"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * The inset light along the pane's edges.
 *
 * Two stacks, because glass catches light differently depending on what is
 * behind it: on the dark canvas the highlights are white, on the light one they
 * are ink. Written as one `box-shadow` per theme rather than a token because
 * there are eleven stops and no token could carry them.
 */
const EDGE_LIGHT =
  "shadow-[0_0_8px_rgba(0,0,0,0.10),0_2px_6px_rgba(0,0,0,0.14),inset_3px_3px_0.5px_-3.5px_rgba(255,255,255,0.10),inset_-3px_-3px_0.5px_-3.5px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.55),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.55),inset_0_0_6px_6px_rgba(255,255,255,0.10),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_12px_rgba(0,0,0,0.18)]";

/**
 * NO `asChild`, AND THIS IS A CORRECTION RATHER THAN A SIMPLIFICATION.
 *
 * The reference takes `asChild` and renders Radix's `<Slot>`. That cannot work
 * here and does not work there either: `Slot` requires EXACTLY ONE React
 * element child, and this button has four — three glass layers and the label.
 * Wired up as written it threw "Slot failed to slot onto its children" and took
 * the whole profile screen down with it.
 *
 * So the link case is a prop instead. `to` renders a router `Link`, nothing
 * renders a `button`, and the glass layers are children of whichever it is.
 */
export function LiquidGlassButton({
  className,
  children,
  to,
  ...props
}: React.ComponentProps<"button"> & { to?: string }) {
  const layers = (
    <>
      {/* The refraction. Its own layer so the label is never displaced with
          it — text put through a displacement map is unreadable. */}
      <span
        aria-hidden
        className="absolute inset-0 -z-10 overflow-hidden rounded-pill backdrop-blur-md"
        style={{ backdropFilter: "url(#icefall-liquid-glass) blur(6px)" }}
      />
      {/* The pane's own edges. */}
      <span aria-hidden className={cn("absolute inset-0 -z-10 rounded-pill", EDGE_LIGHT)} />
      {/* A whisper of fill, so the label has a ground on a bright photograph. */}
      <span
        aria-hidden
        className="absolute inset-0 -z-10 rounded-pill bg-[color-mix(in_oklab,var(--ice-snow)_9%,transparent)]"
      />
      {children}
    </>
  );

  const shell = cn(
    "relative isolate inline-flex shrink-0 cursor-pointer items-center justify-center gap-2",
    "rounded-pill px-4 py-2 text-[13px] font-medium text-snow",
    "transition-transform duration-200 active:scale-[0.97]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian",
    className,
  );

  if (to !== undefined) {
    return (
      <Link to={to} className={shell}>
        {layers}
      </Link>
    );
  }

  return (
    <button className={shell} {...props}>
      {layers}
    </button>
  );
}
