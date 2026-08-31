import { useCallback, useState } from "react";
import { OFFLINE } from "@/offline/offline";
import { cn } from "@/lib/utils";

/**
 * PHOTOGRAPHY — ONE CREDITED LIBRARY, NO SECOND COPY.
 *
 * Every image is a peak photograph from `icefall-web/public/img/peaks`, sourced
 * from Wikimedia Commons with licence and attribution tracked in that app's
 * `src/data/peakPhotoCredits.ts`. This app SERVES them from the web app's origin
 * rather than copying them, which is the cross-session ruling of 2026-08-29 and
 * the same thing `icefall-operator` does.
 *
 * Never scrape a third-party image into this tree (§7.5). If a peak has no
 * photograph in that library, it gets the drawing below — not a picture found
 * somewhere else.
 *
 * LOCAL-ONLY BY CONSTRUCTION: if the web app is not running, every image fails
 * and the drawing takes over, so this app cannot silently depend on an origin
 * that will not exist in a deployed build.
 */
export const WEB_ASSET_ORIGIN: string =
  (import.meta.env.VITE_ICEFALL_WEB_ORIGIN as string | undefined) ?? "http://localhost:5194";

/** The two libraries are separate directories, and a trek is not a peak. */
export const peakPhotoUrl = (peak: string): string =>
  `${WEB_ASSET_ORIGIN}/img/peaks/${peak}.jpg`;

export const trekPhotoUrl = (trek: string): string =>
  `${WEB_ASSET_ORIGIN}/img/treks/${trek}.jpg`;

/**
 * A drawn ridge line, seeded from the peak name so one mountain always draws the
 * same shape. Deliberately a DRAWING and not a stock photograph: it is obviously
 * not a photograph of anywhere, so it cannot be mistaken for the mountain.
 */
function RidgeFallback({ seed, className }: { seed: string; className?: string }) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
  const rand = () => ((h = (h * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pts: string[] = ["0,100"];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * 100;
    const peak = 1 - Math.abs(i / n - 0.45) * 1.7;
    const y = 100 - Math.max(12, peak * 78 + rand() * 14);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  pts.push("100,100");
  return (
    <div className={cn("relative overflow-hidden bg-elevated", className)} aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <polygon points={pts.join(" ")} className="fill-slate" />
        <polyline
          points={pts.slice(1, -1).join(" ")}
          className="stroke-azure/45"
          fill="none"
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/**
 * THE OFFLINE PHOTOGRAPH — the drawing, and one line saying why.
 *
 * Every photograph in this app is fetched from the web app's origin, so an
 * offline build must not render the `<img>` at all: a request that fails is
 * still a request, and the contract is that nothing leaves the app. The drawn
 * ridge already exists for peaks with no photograph, so offline it simply
 * always wins — no blank grey box, and never a stock picture standing in for a
 * mountain nobody photographed.
 *
 * THE LINE IS ONLY DRAWN WHERE IT FITS. Measured rather than guessed, because
 * `Photo` is used at 62 px in a rail and full-bleed as a 176 px hero, and a
 * caption on a thumbnail is noise rather than information.
 */
function OfflinePhoto({
  seed,
  className,
  rounded,
}: {
  seed: string;
  className?: string;
  rounded: string;
}) {
  const [roomy, setRoomy] = useState(false);
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (el) setRoomy(el.clientWidth >= 150 && el.clientHeight >= 72);
  }, []);

  return (
    <div ref={measure} className={cn("relative overflow-hidden", className, rounded)}>
      <RidgeFallback seed={seed} className="absolute inset-0 h-full w-full" />
      {roomy && (
        <p className="absolute inset-x-0 bottom-0 bg-obsidian/70 px-2 py-1 text-center text-[10px] tracking-[0.04em] text-mist">
          Photography needs a connection
        </p>
      )}
    </div>
  );
}

export function Photo({
  peak,
  kind = "mountain",
  alt,
  className,
  rounded = "rounded-tile",
}: {
  /** A peak id or a trek id, per `kind`. */
  peak: string;
  kind?: "mountain" | "trek";
  alt: string;
  className?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (OFFLINE) return <OfflinePhoto seed={peak || alt} className={className} rounded={rounded} />;
  if (failed || !peak) return <RidgeFallback seed={peak || alt} className={cn(className, rounded)} />;
  return (
    <img
      src={kind === "trek" ? trekPhotoUrl(peak) : peakPhotoUrl(peak)}
      alt={alt}
      onError={() => setFailed(true)}
      className={cn("object-cover", className, rounded)}
    />
  );
}

/**
 * A PERSON — A DRAWN PORTRAIT, NEVER A PHOTOGRAPH.
 *
 * The mockup shows photographic head-and-shoulders avatars, and the owner asked
 * for them. This draws one instead of loading one, for two reasons that are not
 * negotiable rather than fussy:
 *
 *   1. **A photograph of a person is a photograph of A PERSON.** Attaching a
 *      real face to "Nima Dorjee", an invented client with an invented phone
 *      number and invented notes about their acclimatisation, misrepresents
 *      whoever is actually in that picture. It is the same class of claim as the
 *      invented guide credentials this project has already had to remove, and it
 *      lands on someone who never agreed to be here.
 *   2. **There is no licensed portrait set in this repo**, and §7.5 forbids
 *      scraping third-party images. Photography in this family comes from
 *      Wikimedia Commons with licence and attribution tracked in
 *      `peakPhotoCredits.ts`; there is no equivalent for faces, and portraits of
 *      identifiable people carry personality rights on top of copyright.
 *
 * So: a flat vector portrait, generated from the name, deterministic — one
 * person always draws the same face, and no two of the seeded clients collide.
 * It gives the mockup what it was actually after (warm, distinguishable, human
 * at 30 px) while being unmistakably an illustration. Same principle as the
 * ridge drawing above: obviously not a photograph, so it cannot be mistaken for
 * one.
 *
 * If real portraits are wanted later they must be uploaded BY the person, with
 * consent, through the profile — which is a backend feature, not an asset drop.
 */

const SKIN = ["#e8b98f", "#d99f72", "#b87a4e", "#8d5a37", "#f0c9a5", "#a06c46"];
const BEANIE = ["#4b9bff", "#c4553f", "#5fa86f", "#d9a244", "#8b94a6", "#2c6bd4"];
/* Light enough to read as SHOULDERS against a dark circle. The first set was
   near-black, so the body vanished and the head appeared to float. */
const JACKET = ["#3f4d61", "#4a5568", "#5c4a3f", "#39525c", "#4d4557"];
const HAIR = ["#2b2118", "#1a1512", "#4a3626", "#6b5340"];

/** A small deterministic PRNG so one name always draws the same face. */
function faceOf(name: string) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const pick = <T,>(arr: T[], salt: number): T =>
    arr[Math.abs(Math.imul(h ^ salt, 2654435761)) % arr.length];
  const bit = (salt: number) => Math.abs(Math.imul(h ^ salt, 40503)) % 100;
  return {
    skin: pick(SKIN, 1),
    beanie: pick(BEANIE, 2),
    jacket: pick(JACKET, 3),
    hair: pick(HAIR, 4),
    hasBeanie: bit(5) < 55,
    hasShades: bit(6) < 45,
    hasBeard: bit(7) < 40,
    hue: bit(8) * 3.6,
  };
}

export function PersonAvatar({
  name,
  size = 40,
  online,
  className,
}: {
  name: string;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  const f = faceOf(name);
  const id = `av-${name.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full overflow-hidden rounded-full border border-hairline-strong"
        role="img"
        aria-label={name}
      >
        <defs>
          <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`oklch(0.34 0.035 ${f.hue})`} />
            <stop offset="100%" stopColor={`oklch(0.22 0.025 ${(f.hue + 40) % 360})`} />
          </linearGradient>
          <clipPath id={`${id}-clip`}>
            <circle cx="50" cy="50" r="50" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${id}-clip)`}>
          <rect width="100" height="100" fill={`url(#${id}-bg)`} />

          {/* Neck, behind the shoulders so the collar overlaps it cleanly. */}
          <rect x="43" y="54" width="14" height="18" rx="6" fill={f.skin} />

          {/* Shoulders — a jacket, wide enough to fill the bottom of the circle. */}
          <path d="M50 66c-22 0-39 14-42 36h84c-3-22-20-36-42-36z" fill={f.jacket} />
          {/* Collar V, so it reads as clothing rather than a block. */}
          <path d="M43 67l7 11 7-11-7-3z" fill="#000" opacity="0.22" />

          {/* Head */}
          <ellipse cx="50" cy="40" rx="18.5" ry="21" fill={f.skin} />

          {/* Ears */}
          <ellipse cx="31.5" cy="42" rx="3.2" ry="4.6" fill={f.skin} />
          <ellipse cx="68.5" cy="42" rx="3.2" ry="4.6" fill={f.skin} />

          {f.hasBeard && (
            <path
              d="M32 42c0 13 8 21 18 21s18-8 18-21c0 9-8 13-18 13s-18-4-18-13z"
              fill={f.hair}
              opacity="0.9"
            />
          )}

          {f.hasBeanie ? (
            <>
              <path d="M30 34c0-12 9-20 20-20s20 8 20 20z" fill={f.beanie} />
              <rect x="28" y="31" width="44" height="7.5" rx="3.75" fill={f.beanie} />
              <rect x="28" y="31" width="44" height="7.5" rx="3.75" fill="#000" opacity="0.16" />
            </>
          ) : (
            <path d="M31 36c0-13 8-22 19-22s19 9 19 22c-3-7-8-11-19-11s-16 4-19 11z" fill={f.hair} />
          )}

          {f.hasShades ? (
            <>
              <rect x="33" y="39" width="34" height="3.5" rx="1.75" fill="#0b0e13" opacity="0.9" />
              <rect x="32.5" y="37" width="15.5" height="9" rx="3.6" fill="#0b0e13" />
              <rect x="52" y="37" width="15.5" height="9" rx="3.6" fill="#0b0e13" />
              <rect x="34.5" y="39" width="5" height="2.6" rx="1.3" fill="#fff" opacity="0.22" />
              <rect x="54" y="39" width="5" height="2.6" rx="1.3" fill="#fff" opacity="0.22" />
            </>
          ) : (
            <>
              <ellipse cx="43" cy="41" rx="2.2" ry="2.6" fill="#1a1512" />
              <ellipse cx="57" cy="41" rx="2.2" ry="2.6" fill="#1a1512" />
            </>
          )}

          {/* Mouth — a small neutral line. Nobody is grinning at 30 px. */}
          <path
            d="M45.5 50c2 2 7 2 9 0"
            stroke="#1a1512"
            strokeOpacity="0.55"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </svg>

      {online && (
        <span
          className="absolute bottom-0 right-0 block rounded-full border-2 border-obsidian bg-summit"
          style={{ width: Math.max(8, size * 0.24), height: Math.max(8, size * 0.24) }}
          aria-label="Online"
        />
      )}
    </span>
  );
}

/** Stacked monograms for a group thread, as the mockup draws them. */
export function AvatarStack({ names, size = 40 }: { names: string[]; size?: number }) {
  const shown = names.slice(0, 2);
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {shown.map((n, i) => (
        <span
          key={n}
          className="absolute"
          style={{ left: i * size * 0.26, top: i * size * 0.14, zIndex: shown.length - i }}
        >
          <PersonAvatar name={n} size={size * 0.74} />
        </span>
      ))}
    </span>
  );
}
