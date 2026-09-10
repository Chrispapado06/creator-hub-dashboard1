import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { mountainImage, REPRESENTATIVE_CAPTION } from "@/services/peakImagery";
import { plateDataUri } from "@/components/domain/TrailPlate";
import {
  cachedPeakFacts,
  resolvePeakGallery,
  resolvePeakPhoto,
  photoCredit,
  loadHarvestedPhotos,
  harvestedPhoto,
  harvestedCredit,
  rejectedByReview,
  type PeakPhoto,
} from "@/services/peakPhotos";

/**
 * The Commons file name behind a description URL, so the reviewed reject list
 * can be applied to a runtime candidate. `.../wiki/File:Mont_Blanc.jpg` →
 * `Mont Blanc.jpg`, which is the form the harvest keys on.
 */
function commonsFileName(pageUrl?: string): string | undefined {
  const m = /\/wiki\/File:(.+)$/.exec(pageUrl ?? "");
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, " ").trim();
  } catch {
    return m[1].replace(/_/g, " ").trim();
  }
}
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

  /*
   * A HARVESTED PHOTOGRAPH BEATS A LIVE LOOKUP ON A CARD TOO — and here it
   * also saves the round trip entirely. It is a local file, already
   * licence-checked and already looked at, so a list of twenty peaks paints
   * from disk instead of opening twenty Commons requests. That request storm
   * is what got a sweep rate-limited after five calls on 2026-08-24.
   */
  const [harvest, setHarvest] = useState<ReturnType<typeof harvestedPhoto>>(undefined);
  useEffect(() => {
    if (skip) return;
    let live = true;
    loadHarvestedPhotos().then(() => {
      if (live) setHarvest(harvestedPhoto(peak.lat, peak.lon));
    });
    return () => {
      live = false;
    };
  }, [skip, peak.lat, peak.lon]);

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
    if (skip || harvest) return;
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
  }, [skip, harvest, peak.name, peak.wikipedia, peak.lat, peak.lon]);

  if (peak.photo) return { src: peak.photo, real: true };
  if (art.real) return { src: art.src, real: true };
  if (harvest) {
    return {
      src: harvest.src,
      real: true,
      credit: harvestedCredit(harvest, peak.name),
    };
  }
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

  /*
   * THE HARVESTED PHOTOGRAPH LEADS, when there is one.
   *
   * It was resolved by Wikidata entity or article — never by proximity — its
   * licence was checked for commercial use, its filename was required to name
   * the peak, and a person looked at it. That is a stronger claim than
   * anything the runtime resolver can make mid-render, so it goes first and
   * carries the photographer and licence the harvest recorded.
   */
  const [harvest, setHarvest] = useState<ReturnType<typeof harvestedPhoto>>(undefined);
  useEffect(() => {
    let live = true;
    loadHarvestedPhotos().then(() => {
      if (live) setHarvest(harvestedPhoto(peak.lat, peak.lon));
    });
    return () => {
      live = false;
    };
  }, [peak.lat, peak.lon]);

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

  /*
   * ORDER: ICEFALL's own frame, then the harvest, then the live resolver, then
   * plates. `own` is either the photograph shipped with a curated mountain —
   * chosen by a person for that mountain's hero — or one explicitly handed in
   * by the caller. Either outranks a build-time harvest that only knows the
   * coordinate matched.
   */
  if (own) {
    images.push(own);
    // `photo` can be a Wikidata/Commons image passed in by the caller. Labelling
    // that "ICEFALL photography" would credit us for someone else's work and
    // strip the licence the photographer released it under.
    captions.push(peak.photoCredit ?? `${peak.name} — ICEFALL photography`);
  }

  if (harvest && !images.includes(harvest.src)) {
    images.push(harvest.src);
    captions.push(harvestedCredit(harvest, peak.name));
  }
  for (const p of photos) {
    if (images.includes(p.src)) continue;
    const file = commonsFileName(p.pageUrl);
    /*
     * THE SAME FILE UNDER TWO URLS IS ONE PHOTOGRAPH. The harvest stores the
     * canonical `upload.wikimedia.org` path; the live resolver gets whatever
     * host and analytics query string the API felt like answering with
     * (`thumb.wikimedia.org/...?utm_source=...`, verified on Kangchenjunga,
     * 2026-09-10). Comparing URLs put the same frame in the gallery twice.
     * The Commons file title is the identity, so that is what is compared.
     */
    if (harvest && file && file === harvest.file) continue;
    // A file a person already looked at and refused does not come back through
    // the live path, which draws from the same candidate pool.
    if (rejectedByReview(file)) continue;
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

/*
 * `usePeakSummary` WAS HERE, AND IT IS DELETED ON PURPOSE.
 *
 * It fetched Wikipedia's REST summary and handed back the first paragraph for
 * the peak page to render. Measured across 175 peaks with an article on
 * 2026-09-10, TEN of them — 5.7%, about one page in eighteen — open with route
 * guidance or a difficulty verdict:
 *
 *   Täschhorn                "There are no easy mountaineering routes to its
 *                             summit"
 *   Rocher de la Tournette   "can be most easily reached on an ascent of Mont
 *                             Blanc via the Goûter Route"
 *   Sgùrr Mòr                "mostly gentle sloped and fairly accessible"
 *
 * Unattributed, undated, written by an anonymous editor, and on the page it
 * reads as ICEFALL's assessment of the mountain. A regex is not a defence: it
 * would have to catch every phrasing in every language, and it will not.
 *
 * The rule that does hold is structural — only a value that arrives as a TYPED
 * BINDING may reach the screen, never a sentence. So the peak page now shows
 * Wikidata's one-line description (CC0, ~12 words, measured clean of judgement
 * on 170 of 170) and LINKS OUT to the article instead of quoting it.
 *
 * This stub exists because deleting the call sites is not enough. An exported
 * hook that returns `{ summary }` is what the next person reaching for "a
 * description" would find and use, and the whole point is that nobody fetches
 * it. See `scripts/harvest-peak-facts.mjs` for the full measurements.
 */
