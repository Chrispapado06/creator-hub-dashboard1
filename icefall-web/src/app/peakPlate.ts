/**
 * The drawing a peak card shows when there is no photograph of that peak.
 *
 * WHY THIS EXISTS. The web app bundles six mountain photographs. The peak
 * catalogue names forty-nine. Something has to fill the other forty-three
 * cards, and there are only three options:
 *
 *   a photo of a DIFFERENT mountain   — the failure the phone app removed its
 *                                       stand-in photographs to end: a Cypriot
 *                                       pine ridge illustrated with an Icelandic
 *                                       massif, a hill walk with a golf course
 *   an empty grey box                 — honest, and unusable in a rail
 *   a drawing                         — this
 *
 * A drawing cannot show you the wrong mountain, because it does not claim to
 * show you a mountain at all. It is a chart and reads as one: contour rings
 * generated from the peak's own id, so the same peak draws the same plate on
 * every device and two peaks never share one.
 *
 * Ported from the phone app's `TrailPlate`, which arrived at this the expensive
 * way. A real photograph still wins whenever one exists.
 */

/** mulberry32 — small, fast, identical across engines. */
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
const H = 300;

/**
 * The palette, as LITERALS.
 *
 * These render inside an `<img src="data:…">`, and an image document cannot see
 * the host page's custom properties — `var(--ice-azure)` resolves to nothing in
 * there and the plate comes out blank. Keep in step with `index.css` by hand;
 * the phone app's copy of this drifted a whole rebrand out of date (it was
 * still champagne gold long after the accent became azure) and nothing warned.
 */
const INK = {
  obsidian: "#05070B",
  slate: "#161B24",
  azure: "#4B9BFF",
  mist: "#8B94A6",
};

/** One contour ring: a closed loop deformed by a few summed sine waves. */
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
    pts.push(
      `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r * squash).toFixed(1)}`,
    );
  }
  return `M${pts.join("L")}Z`;
}

/**
 * A deterministic plate for `seed`, as a self-contained `data:` URI.
 *
 * `encodeURIComponent` rather than base64: the markup is ASCII and stays
 * readable in devtools, which matters the next time one of these looks wrong.
 */
export function peakPlate(seed: string): string {
  const n = [...seed].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
  const r = rng(Math.abs(n) + 1);

  // The high point sits off-centre, the way it does on a real map sheet.
  const cx = W * (0.32 + r() * 0.4);
  const cy = H * (0.34 + r() * 0.3);

  const wobble = [
    { amp: 0.1 + r() * 0.13, freq: 2 + Math.floor(r() * 2), phase: r() * 6.28 },
    { amp: 0.05 + r() * 0.09, freq: 3 + Math.floor(r() * 3), phase: r() * 6.28 },
    { amp: 0.02 + r() * 0.05, freq: 6 + Math.floor(r() * 4), phase: r() * 6.28 },
  ];
  const squash = 0.58 + r() * 0.16;

  const count = 9 + Math.floor(r() * 4);
  const step = (12 + r() * 6) / 100;
  const rings = Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / count;
    return {
      d: ring(cx, cy, H * step * (i + 1), wobble, squash),
      // Inner rings — the high ground — are brighter. That is the one piece of
      // information the drawing carries, and it is true of every contour map.
      opacity: (0.52 - t * 0.36).toFixed(3),
      azure: i < 3,
    };
  });

  // A ridgeline across the lower third, for depth, from the same stream so it
  // belongs to the same imaginary place.
  const yBase = H * (0.74 + r() * 0.1);
  const seg = 7;
  const ridgePts: string[] = [];
  for (let i = 0; i <= seg; i++) {
    const x = (i / seg) * W;
    const y = yBase - Math.sin((i / seg) * Math.PI) * H * (0.09 + r() * 0.12);
    ridgePts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const gid = `p${Math.abs(n)}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0.35" y2="1">` +
    `<stop offset="0%" stop-color="${INK.slate}"/><stop offset="100%" stop-color="${INK.obsidian}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#${gid})"/>` +
    `<g fill="none" stroke-width="1">` +
    rings
      .map((c) => `<path d="${c.d}" stroke="${c.azure ? INK.azure : INK.mist}" opacity="${c.opacity}"/>`)
      .join("") +
    `</g>` +
    `<path d="M0,${H}L${ridgePts.join("L")}L${W},${H}Z" fill="${INK.obsidian}" opacity="0.55"/>` +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Every peak in the catalogue now has a photograph of ITSELF.
 *
 * This module was written when six did and forty-five did not. All fifty-one
 * were since resolved from their own Wikipedia lead image and bundled under
 * `public/img/peaks`, with the photographer and licence recorded per file in
 * `data/peakPhotoCredits.ts` — which the CC BY and CC BY-SA licences require.
 *
 * The plate above is kept, and is still the right answer, for two cases: a
 * peak added to the catalogue before its photograph has been fetched, and an
 * image that fails to load. Neither should show a picture of another mountain.
 */
export const peakImage = (id: string): string => `/img/peaks/${id}.jpg`;

/** The drawing to fall back to when a photograph will not load. */
export const peakFallback = (id: string): string => peakPlate(id);
