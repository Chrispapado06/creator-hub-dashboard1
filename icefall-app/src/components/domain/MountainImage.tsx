import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { mountainImage, REPRESENTATIVE_CAPTION } from "@/services/peakImagery";
import { plateDataUri } from "@/components/domain/TrailPlate";
import {
  cachedPeakFacts,
  resolvePeakFacts,
  resolvePeakGallery,
  resolvePeakPhoto,
  photoCredit,
  type PeakPhoto,
} from "@/services/peakPhotos";
import { assessPeak } from "@/services/peakAssessment";

/**
 * The one place that decides what picture a mountain gets.
 *
 * Three tiers, in order of how much we can vouch for the image:
 *
 *   real      a photograph of this exact peak — a curated ICEFALL mountain, or
 *             the lead image of the Wikipedia article OSM links the peak to
 *   derived   terrain of the right altitude band, always captioned as such
 *
 * The distinction is surfaced through `caption`, so no screen can accidentally
 * present band artwork as a photograph of the summit.
 */

export interface MountainImageSource {
  src: string;
  real: boolean;
  caption?: string;
  credit?: string;
}

export function useMountainImage(peak: {
  name: string;
  elevationM?: number;
  lat?: number;
  lon?: number;
  curatedId?: string;
  wikipedia?: string;
  /** An explicit photo already stored on a goal or objective wins outright. */
  photo?: string;
  /** Rotates the stand-in terrain pool; ignored once a real photo is found. */
  variant?: number;
}): MountainImageSource {
  const art = mountainImage({
    name: peak.name,
    elevationM: peak.elevationM,
    lat: peak.lat,
    curatedId: peak.curatedId,
    variant: peak.variant,
  });

  // Curated mountains already have a verified photograph in the bundle; don't
  // spend a network round trip replacing it.
  const skip = art.real || Boolean(peak.photo);

  const [photo, setPhoto] = useState<PeakPhoto | null>(() =>
    skip
      ? null
      : (cachedPeakFacts({
          name: peak.name,
          wikipedia: peak.wikipedia,
          lat: peak.lat,
          lon: peak.lon,
        })?.photo ?? null),
  );

  useEffect(() => {
    if (skip) return;
    let live = true;
    resolvePeakPhoto({
      name: peak.name,
      wikipedia: peak.wikipedia,
      lat: peak.lat,
      lon: peak.lon,
    }).then((p) => {
      if (live) setPhoto(p);
    });
    return () => {
      live = false;
    };
  }, [skip, peak.name, peak.wikipedia, peak.lat, peak.lon]);

  if (peak.photo) return { src: peak.photo, real: true };
  if (art.real) return { src: art.src, real: true };
  if (photo) {
    return {
      src: photo.src,
      real: true,
      credit: photoCredit(peak.name, photo),
    };
  }
  return { src: art.src, real: false, caption: REPRESENTATIVE_CAPTION };
}

/**
 * Background artwork for a card. Derived imagery is held back so it reads as
 * texture; a genuine photograph of the peak is shown at full strength.
 */
export function MountainBackdrop({
  peak,
  className,
  scrim = "horizontal",
}: {
  peak: Parameters<typeof useMountainImage>[0];
  className?: string;
  scrim?: "horizontal" | "vertical" | "none";
}) {
  const image = useMountainImage(peak);
  return (
    <>
      <img
        src={image.src}
        alt=""
        aria-hidden
        loading="lazy"
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
          image.real ? "opacity-100" : "opacity-45",
          className,
        )}
      />
      {scrim === "horizontal" && (
        <div className="absolute inset-0 bg-gradient-to-r from-obsidian via-obsidian/85 to-obsidian/25" />
      )}
      {scrim === "vertical" && <div className="absolute inset-0 scrim-bottom" />}
    </>
  );
}

/** Small square used in lists and search results. */
export function MountainThumb({
  peak,
  size = 44,
  className,
}: {
  peak: Parameters<typeof useMountainImage>[0];
  size?: number;
  className?: string;
}) {
  const image = useMountainImage(peak);
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-[10px] border border-hairline bg-slate",
        className,
      )}
    >
      <img
        src={image.src}
        alt=""
        aria-hidden
        loading="lazy"
        className={cn("h-full w-full object-cover", image.real ? "opacity-100" : "opacity-45")}
      />
      {!image.real && (
        // A dot, not a badge — at 44px a word is unreadable, but the user still
        // needs to be able to tell a real summit photo from stand-in terrain.
        <span
          title={REPRESENTATIVE_CAPTION}
          className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-mist/70 ring-1 ring-obsidian/80"
        />
      )}
    </span>
  );
}

/**
 * A strip of imagery for a mountain's own page.
 *
 * Leads with every verified photograph Wikimedia holds of this exact peak, then
 * falls back to terrain for its altitude band. Captions are per frame, so a
 * photographer is never credited for artwork and a stand-in is never presented
 * as a summit shot.
 */
export function useMountainGallery(
  peak: Parameters<typeof useMountainImage>[0] & {
    /** Attribution for `photo` when it did not come from ICEFALL. */
    photoCredit?: string;
  },
): {
  images: string[];
  captions: string[];
  /** True once at least one frame is a photograph of this peak. */
  verified: boolean;
} {
  /*
   * The gallery's padding frames are PLATES, not photographs.
   *
   * They used to be `representativeImages(band, …)` — three of the seven
   * bundled scenes, picked by altitude band alone. That is the mismatch the
   * plate migration removed everywhere else (an Icelandic massif standing in
   * for a Cypriot pine ridge), and leaving it here also produced a plain
   * falsehood: these frames were captioned with `REPRESENTATIVE_CAPTION`, which
   * now reads "Contour plate — …", over a photograph.
   *
   * They cannot simply be dropped: callers index `gallery.images[n]` directly,
   * so an empty list blanks the hero on a peak with no photographs.
   */
  const terrain = [0, 1, 2].map((i) => plateDataUri(`${peak.name}#${i}`));
  const curated = mountainImage({
    name: peak.name,
    elevationM: peak.elevationM,
    lat: peak.lat,
    curatedId: peak.curatedId,
  });

  const own = peak.photo ?? (curated.real ? curated.src : undefined);
  const [photos, setPhotos] = useState<PeakPhoto[]>([]);

  useEffect(() => {
    if (!peak.name) return;
    let live = true;
    resolvePeakGallery({
      name: peak.name,
      wikipedia: peak.wikipedia,
      lat: peak.lat,
      lon: peak.lon,
    }).then((p) => {
      if (live) setPhotos(p);
    });
    return () => {
      live = false;
    };
  }, [peak.name, peak.wikipedia, peak.lat, peak.lon]);

  const images: string[] = [];
  const captions: string[] = [];

  if (own) {
    images.push(own);
    // `photo` can be a Wikidata/Commons image passed in by the caller. Labelling
    // that "ICEFALL photography" would credit us for someone else's work and
    // strip the licence the photographer released it under.
    captions.push(peak.photoCredit ?? `${peak.name} — ICEFALL photography`);
  }
  for (const p of photos) {
    if (images.includes(p.src)) continue;
    images.push(p.src);
    captions.push(photoCredit(peak.name, p));
  }
  for (const t of terrain) {
    if (images.includes(t)) continue;
    images.push(t);
    captions.push(REPRESENTATIVE_CAPTION);
  }

  return { images, captions, verified: images.length > terrain.length };
}

/**
 * The article Wikipedia holds on this peak — real prose about the real mountain,
 * rather than ICEFALL writing copy about a summit nobody here has stood on.
 */
export function usePeakSummary(peak: {
  name: string;
  wikipedia?: string;
  /** Optional, and only used to keep same-named peaks out of each other's cache. */
  lat?: number;
  lon?: number;
}): {
  summary: string | null;
  articleUrl: string | null;
} {
  const [facts, setFacts] = useState(() =>
    peak.name
      ? (cachedPeakFacts({
          name: peak.name,
          wikipedia: peak.wikipedia,
          lat: peak.lat,
          lon: peak.lon,
        }) ?? null)
      : null,
  );

  useEffect(() => {
    if (!peak.name) return;
    let live = true;
    resolvePeakFacts({
      name: peak.name,
      wikipedia: peak.wikipedia,
      lat: peak.lat,
      lon: peak.lon,
    }).then((f) => {
      if (live) setFacts(f);
    });
    return () => {
      live = false;
    };
  }, [peak.name, peak.wikipedia, peak.lat, peak.lon]);

  return { summary: facts?.summary ?? null, articleUrl: facts?.articleUrl ?? null };
}
