import { MapPin, MountainSnow } from "lucide-react";
import { OFFLINE_MAP_NOTICE } from "./fixtures";

/**
 * What stands where a map would be, offline.
 *
 * Satellite imagery is streamed a tile at a time from Esri. There is no local
 * copy of it and there is no honest way to fake one: a drawn "map" of real
 * terrain is a picture of ground nobody surveyed, and the app's own rule is
 * that a photograph of somewhere else is worse than no photograph. So this
 * says what is missing and why, in the app's own language, and stops.
 *
 * The alternative — leaving the map element to render — is a slate-coloured
 * void with a MapLibre logo in the corner, which reads as a broken page rather
 * than an absent connection.
 *
 * Both variants are drawn entirely in SVG and inline styles: no request leaves
 * the page to render them.
 */

/** A faint contour wash. Abstract on purpose — it maps nowhere. */
function Contours({ opacity }: { opacity: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 240"
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, height: "100%", width: "100%", opacity }}
    >
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path
          key={i}
          d={`M -20 ${196 - i * 22} C 60 ${168 - i * 20}, 120 ${212 - i * 22}, 200 ${180 - i * 21} S 340 ${150 - i * 19}, 420 ${186 - i * 22}`}
          fill="none"
          stroke="var(--ice-azure, #4B9BFF)"
          strokeWidth={i % 2 === 0 ? 1.1 : 0.7}
        />
      ))}
    </svg>
  );
}

/** The full panel — where `RouteMap` would have drawn a map. */
export function MapPlaceholder({ className, caption }: { className?: string; caption?: string }) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        background:
          "radial-gradient(120% 90% at 50% 8%, var(--ice-slate, #161B24) 0%, var(--ice-obsidian, #05070B) 78%)",
      }}
    >
      <Contours opacity={0.16} />

      <div style={{ position: "relative", maxWidth: "26ch", padding: "24px", textAlign: "center" }}>
        <MountainSnow
          size={26}
          strokeWidth={1.3}
          style={{ color: "var(--ice-mist, #8B94A6)", margin: "0 auto" }}
        />
        <p
          style={{
            margin: "12px 0 0",
            fontSize: "13px",
            lineHeight: 1.5,
            color: "var(--ice-snow, #EAEEF5)",
            fontWeight: 300,
          }}
        >
          {OFFLINE_MAP_NOTICE}
        </p>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: "11.5px",
            lineHeight: 1.6,
            color: "var(--ice-mist-dim, #5A6375)",
          }}
        >
          {caption ?? "The list beside it is stored on this device and works as normal."}
        </p>
      </div>
    </div>
  );
}

/**
 * The card thumbnail — where a single satellite tile of a route's own
 * coordinates would have gone. Small enough that the notice is a pin and a
 * word rather than a paragraph.
 */
export function MapThumbPlaceholder({ label }: { label?: string }) {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        background:
          "linear-gradient(160deg, var(--ice-slate, #161B24) 0%, var(--ice-obsidian, #05070B) 100%)",
      }}
    >
      <Contours opacity={0.13} />
      <span
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "10px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ice-mist-dim, #5A6375)",
        }}
      >
        <MapPin size={11} strokeWidth={1.9} />
        {label ?? "Imagery offline"}
      </span>
    </span>
  );
}
