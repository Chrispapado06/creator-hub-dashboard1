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
 *
 * ── AND IT NEEDED A GROUND, WHICH IS WHY `brightness` IS IN THE CHAIN ────────
 *
 * Measured 2026-09-08 at 375×812 on /explore/trail/2572951: the two pills in
 * the docked bar rendered as plain dark rectangles with a faint rim. Nothing
 * was broken — the CSS parsed, the filter was mounted, the id resolved. There
 * was simply nothing behind them to refract. Displacement moves pixels around
 * and a blur averages them, and both of those are the identity function on a
 * flat near-black plate, so the whole first layer produced no visible pixel.
 *
 * Two fixes, and both were needed:
 *
 *   1. `brightness()` and `saturate()` joined the chain. Unlike displacement
 *      and blur they change a flat ground too, so the pane lifts off whatever
 *      it is over and reads as a pane at the very bottom of a page as well as
 *      over a photograph.
 *   2. GIVE IT SOMETHING TO BEND. `TrailDetail`'s bar stopped being an opaque
 *      band at the end of the scroller and became an overlay the page runs
 *      under — see the note on its clearance. Refraction is only visible when
 *      there is something to refract, so where these are used matters as much
 *      as what they are made of.
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
 * What the pane does to whatever is behind it.
 *
 * The displacement and the blur are the reference's and do the refraction. The
 * two after them are this app's, and they are what makes the same component
 * legible over a near-black page as well as over a photograph — see the note
 * at the top of this file.
 *
 * BOTH ARE DELIBERATELY SMALL, and 1.32 was measured to be too big. It lifted
 * the pane nicely off the near-black bar and then blew out completely over the
 * snow in a satellite hero: three near-white discs with near-white icons in
 * them, which is a worse failure than the flat rectangle it was fixing, because
 * the control stops being findable rather than just stops being pretty. At 1.14
 * the pane still separates from black and no longer clips on white — and the
 * icon carries `type-scrim`, which is this app's existing answer for a glyph on
 * a bright photograph, so the legibility does not rest on this number alone.
 */
const GLASS_BACKDROP = "url(#icefall-liquid-glass) blur(6px) brightness(1.14) saturate(1.25)";

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
 * THE PANE ITSELF, AS THREE LAYERS — the whole of the glass, and the only copy.
 *
 * Exported because three controls are made of it now and one of them is not a
 * `LiquidGlassButton`: `SaveCircle` has its own spring and its own expanding
 * ring, so it composes the pane rather than wrapping the button. Rebuilding the
 * stack there would have been the second glass treatment this file exists to
 * prevent — and the one that would have been left behind the next time the
 * first was corrected.
 *
 * The host must be `relative isolate` and carry the radius; every layer sits at
 * `-z-10` beneath the label, which is what keeps text out of the displacement
 * map. `rounded-pill` at 999px is a circle on a square host, so nothing here
 * needs to know which shape it is being cut to.
 */
export function GlassLayers() {
  return (
    <>
      {/* The refraction. Its own layer so the label is never displaced with
          it — text put through a displacement map is unreadable. */}
      <span
        aria-hidden
        className="absolute inset-0 -z-10 overflow-hidden rounded-pill backdrop-blur-md"
        style={{ backdropFilter: GLASS_BACKDROP, WebkitBackdropFilter: GLASS_BACKDROP }}
      />
      {/* The pane's own edges. */}
      <span aria-hidden className={cn("absolute inset-0 -z-10 rounded-pill", EDGE_LIGHT)} />
      {/* A whisper of fill, so the label has a ground on a bright photograph. */}
      <span
        aria-hidden
        className="absolute inset-0 -z-10 rounded-pill bg-[color-mix(in_oklab,var(--ice-snow)_9%,transparent)]"
      />
    </>
  );
}

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
      <GlassLayers />
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

/**
 * THE SAME PANE, CUT ROUND — the discs that float on a hero photograph.
 *
 * Charlie's reference puts four of them over the picture: back at the top left,
 * share, save and overflow grouped at the top right. They read as glass over
 * the image, which is exactly what `LiquidGlassButton` already is, so this is a
 * shape and a label rather than a second glass treatment. `--radius-pill` is
 * 999px, so a square pane is already a circle; nothing about the layer stack
 * changes.
 *
 * IT IS ALSO THE ONE PLACE THE REFRACTION IS UNAMBIGUOUSLY WORTH IT. These sit
 * on a photograph or on a satellite mosaic — real texture, so the displacement
 * map has something to bend and the disc reads as a lens rather than as a tint.
 *
 * `label` is required and becomes the accessible name: every one of these is an
 * icon with no text, and an unlabelled icon button is a control a screen reader
 * announces as "button".
 */
export function LiquidGlassCircle({
  icon: Icon,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "children"> & {
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  label: string;
}) {
  return (
    <LiquidGlassButton
      aria-label={label}
      /* `type-scrim` puts the canvas colour behind the glyph as a drop-shadow —
         the app's existing fix for an icon on a bright photograph, and needed
         here because a pane of glass over snow is a pale ground for a pale
         icon. It is theme-aware, so on a light build the halo inverts with the
         canvas rather than staying a hard-coded black. */
      className={cn("type-scrim h-10 w-10 shrink-0 px-0 py-0", className)}
      {...props}
    >
      <Icon size={17} strokeWidth={1.8} />
    </LiquidGlassButton>
  );
}
