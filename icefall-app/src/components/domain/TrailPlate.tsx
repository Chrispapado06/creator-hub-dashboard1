import { useMemo } from "react";

/**
 * The topographic plate every trail card paints IMMEDIATELY.
 *
 * WHY THIS EXISTS — the whole history in one place, because it was arrived at
 * the expensive way:
 *
 * ICEFALL used to open a trail list and then go looking for a photograph of
 * each trail on Wikimedia Commons. Two API calls per card, ten cards a page.
 * That produced three failures that no amount of filtering fixed:
 *
 *   SLOW      Commons rate-limits. Measured 2026-08-24: a sweep of twelve
 *             locations was throttled after five ("You are making too many
 *             requests"). A ten-card page asks for more than that, so cards
 *             stayed empty for seconds and some never filled at all.
 *   WRONG     Geosearch returns whatever is geotagged nearby, and a filename
 *             cannot tell you what is IN a photograph. Cyprus got a stranger's
 *             thumbs-up selfie; Chamonix, with the strictest category filter I
 *             could write, still surfaced "Streets of Chamonix" and a memorial.
 *   MISMATCH  When nothing passed, the card fell back to one of seven bundled
 *             photographs — so a Cypriot pine trail was illustrated with an
 *             Icelandic rhyolite massif, and a hill walk with a golf course.
 *
 * A drawing has none of those failure modes. It is generated here, on the
 * device, from the trail's own OSM id: no network, no wait, nothing to rate
 * limit, and it is impossible for it to show you the wrong mountain because it
 * does not claim to show you a mountain at all. It is a chart, and it reads as
 * one.
 *
 * It is DETERMINISTIC — the same trail draws the same plate on every device and
 * every visit — and distinct, so a screen of twenty trails is twenty different
 * plates rather than the same stock photograph five times over.
 *
 * A real photograph still wins whenever one is verified to be of this trail;
 * this is what the card shows until then, and what it keeps when Commons has
 * nothing, which for most of the world's footpaths is the truth.
 */

/** mulberry32 — small, fast, and identical across engines. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 400;
const H = 200;

/**
 * One contour ring.
 *
 * Contours on a real map are closed loops around a high point, deformed by the
 * ground. These are the same idea: a circle whose radius is modulated by a few
 * summed sine waves, so the ring stays closed and plausible rather than
 * wandering off like noise.
 */
function ring(
  cx: number,
  cy: number,
  radius: number,
  wobble: { amp: number; freq: number; phase: number }[],
  squash: number,
): string {
  const steps = 64;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    let r = radius;
    for (const w of wobble) r += w.amp * radius * Math.sin(w.freq * a + w.phase);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * squash;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

/**
 * The palette, as LITERALS.
 *
 * `plateDataUri` renders into an `<img>`, and an image document cannot see the
 * host page's custom properties — `var(--ice-azure)` inside it resolves to
 * nothing and the plate comes out blank. These are the same values `index.css`
 * defines, in the hex the tokens document.
 */
const INK = {
  obsidian: "#080B0D",
  slate: "#1C1D20",
  azure: "#A78B5C",
  mist: "#8A8E93",
};

interface Plate {
  rings: { d: string; opacity: string; azure: boolean }[];
  ridge: string;
  gradId: string;
}

function buildPlate(seed: number | string): Plate {
  const n =
    typeof seed === "number"
      ? seed
      : [...String(seed)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
  const r = rng(Math.abs(n) + 1);

  // The high point sits off-centre, the way it does on a real map sheet.
  const cx = W * (0.3 + r() * 0.45);
  const cy = H * (0.32 + r() * 0.34);

  // Three harmonics is enough to look like ground and cheap enough to run
  // sixty-four times per ring on a mid-range phone.
  const wobble = [
    { amp: 0.10 + r() * 0.13, freq: 2 + Math.floor(r() * 2), phase: r() * 6.28 },
    { amp: 0.05 + r() * 0.09, freq: 3 + Math.floor(r() * 3), phase: r() * 6.28 },
    { amp: 0.02 + r() * 0.05, freq: 6 + Math.floor(r() * 4), phase: r() * 6.28 },
  ];
  // Wider than tall: the plate is a landscape crop, and perfectly round
  // contours read as a target rather than as terrain.
  const squash = 0.52 + r() * 0.16;

  const count = 9 + Math.floor(r() * 4);
  const step = (14 + r() * 7) / 100;
  const rings = Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / count;
    return {
      d: ring(cx, cy, H * step * (i + 1), wobble, squash),
      // Inner rings — the high ground — are brighter. That is the one piece of
      // information the drawing actually carries, and it is true of every
      // contour map ever printed.
      opacity: (0.5 - t * 0.34).toFixed(3),
      azure: i < 3,
    };
  });

  // A single ridgeline across the lower third, for depth. Drawn from the same
  // stream so it belongs to the same imaginary place.
  const yBase = H * (0.72 + r() * 0.1);
  const seg = 7;
  const pts: string[] = [];
  for (let i = 0; i <= seg; i++) {
    const x = (i / seg) * W;
    const y = yBase - Math.sin((i / seg) * Math.PI) * H * (0.1 + r() * 0.14);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const ridge = `M0,${H}L${pts.join("L")}L${W},${H}Z`;

  return { rings, ridge, gradId: `plate-${Math.abs(n)}` };
}

/**
 * The same plate as a self-contained `data:` URI, for the many screens that
 * render a mountain through a plain `<img src=…>`.
 *
 * This is what replaced the stand-in photographs. `mountainImage` used to
 * answer "no photograph of this peak" with one of seven bundled scenes chosen
 * by altitude band, which meant a Cypriot pine ridge was illustrated with an
 * Icelandic rhyolite massif, a Japanese hill walk with a golf course at sunset,
 * and a summit in Nagano with the Aiguille du Midi. Every one of those was a
 * photograph of somewhere the user was not going.
 *
 * No network, no decode of a 300 KB JPEG, and roughly 3 KB of markup.
 */
export function plateDataUri(seed: number | string): string {
  const { rings, ridge, gradId } = buildPlate(seed);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0.35" y2="1">` +
    `<stop offset="0%" stop-color="${INK.slate}"/><stop offset="100%" stop-color="${INK.obsidian}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#${gradId})"/>` +
    `<g fill="none" stroke-width="1">` +
    rings
      .map(
        (c) =>
          `<path d="${c.d}" stroke="${c.azure ? INK.azure : INK.mist}" opacity="${c.opacity}"/>`,
      )
      .join("") +
    `</g>` +
    `<path d="${ridge}" fill="${INK.obsidian}" opacity="0.55"/>` +
    `</svg>`;
  // encodeURIComponent, not btoa: the markup is ASCII and this stays readable
  // in devtools, which matters the next time one of these looks wrong.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function TrailPlate({
  seed,
  className,
}: {
  /** The trail's OSM id, or anything else stable and unique to it. */
  seed: number | string;
  className?: string;
}) {
  const { rings, ridge, gradId } = useMemo(() => buildPlate(seed), [seed]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="var(--ice-slate)" />
          <stop offset="100%" stopColor="var(--ice-obsidian)" />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill={`url(#${gradId})`} />

      <g fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {rings.map((c, i) => (
          <path
            key={i}
            d={c.d}
            stroke={c.azure ? "var(--ice-azure)" : "var(--ice-mist)"}
            opacity={c.opacity}
          />
        ))}
      </g>

      <path d={ridge} fill="var(--ice-obsidian)" opacity="0.55" />
    </svg>
  );
}
