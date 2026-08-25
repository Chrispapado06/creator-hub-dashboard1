import type { PeakAssessment } from "./peakAssessment";
import { MOUNTAINS } from "@/data/mock/mountains";
import { plateDataUri } from "@/components/domain/TrailPlate";

/**
 * Imagery for discovered peaks.
 *
 * ICEFALL has no photograph of an arbitrary OSM peak, and putting one there
 * anyway would be a lie the user can't detect. So discovered peaks get an
 * atmospheric image of the *class of terrain* instead, always with a caption
 * saying exactly that.
 *
 * Only unnamed, non-iconic scenes are used. A shot of the Matterhorn would read
 * as "this is the mountain" no matter what the caption said. Night scenes are
 * excluded too — at card opacity they just look like an empty box.
 */
const BY_BAND: Record<PeakAssessment["band"], string[]> = {
  // 1 Hill walk · 2 Mountain hike · 3 Demanding mountain day
  1: ["/img/onboarding-train.jpg", "/img/expedition-hero.jpg", "/img/onboarding-track.jpg"],
  2: ["/img/expedition-hero.jpg", "/img/onboarding-train.jpg", "/img/onboarding-track.jpg"],
  3: ["/img/onboarding-track.jpg", "/img/expedition-hero.jpg", "/img/home-hero.jpg"],
  // 4 Alpine · 5 Serious alpine · 6 High altitude · 7 Extreme altitude
  4: ["/img/home-hero.jpg", "/img/onboarding-track.jpg", "/img/onboarding-plan.jpg"],
  5: ["/img/home-hero.jpg", "/img/onboarding-plan.jpg", "/img/community-b.jpg"],
  6: ["/img/onboarding-plan.jpg", "/img/community-b.jpg", "/img/splash.jpg"],
  7: ["/img/community-b.jpg", "/img/splash.jpg", "/img/home-hero.jpg"],
};

/*
 * Two photographs have been removed from these pools, both for the reason
 * stated above rather than because they are bad pictures:
 *
 *   event-a.jpg      the INTERIOR OF A FUNICULAR CARRIAGE — blue panelling and
 *                    varnished bench seats. It sat in bands 1 and 2, so every
 *                    Cypriot and Apennine summit under 2,000 m was illustrated
 *                    with a photograph of a train. Nothing here may have a roof
 *                    in it.
 *   community-a.jpg  the Aiguille du Midi ridge, which any alpinist recognises
 *                    on sight. It was standing in for peaks in Nagano. An
 *                    identifiable summit cannot be generic terrain, whatever
 *                    the caption says.
 *
 * expedition-hero.jpg moved down from bands 6–7 to 1–3: it is a forested ridge
 * in mist, which is what 800 m looks like, not 7,000 m.
 */

export const REPRESENTATIVE_CAPTION =
  "Contour plate — ICEFALL has no verified photograph of this peak.";

/** Stable per peak, so a mountain keeps the same image every time you open it. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function representativeImages(band: PeakAssessment["band"], seed: string): string[] {
  const pool = BY_BAND[band] ?? BY_BAND[3];
  const start = hash(seed) % pool.length;
  // Rotate the pool so different peaks in the same band don't all lead with
  // the same photograph.
  return [...pool.slice(start), ...pool.slice(0, start)];
}

/**
 * `variant` rotates further through the pool. Used by lists: three summits in a
 * row that all fall back to terrain would otherwise show the same photograph
 * three times, which reads as a rendering bug rather than as an absence.
 */
export function representativeImage(
  band: PeakAssessment["band"],
  seed: string,
  variant = 0,
): string {
  const pool = representativeImages(band, seed);
  return pool[Math.abs(variant) % pool.length];
}

/**
 * The image that represents a mountain anywhere in the app.
 *
 * A curated mountain returns its own photograph. Anything else returns terrain
 * imagery for its altitude band, and `real: false` so callers can hold it back
 * visually rather than passing it off as a picture of the peak.
 */
export function mountainImage(args: {
  name: string;
  elevationM?: number;
  curatedId?: string;
  lat?: number;
  /** Kept for call-site compatibility; the plate varies by name already. */
  variant?: number;
}): { src: string; real: boolean } {
  const curated = args.curatedId
    ? MOUNTAINS.find((m) => m.id === args.curatedId)
    : MOUNTAINS.find((m) => m.name.toLowerCase() === args.name.toLowerCase());
  if (curated) return { src: curated.photo, real: true };

  /*
   * No photograph of this peak — so no photograph at all.
   *
   * This used to pick one of seven bundled scenes by altitude band. The band
   * was the only thing it matched on, which is why a 900 m ridge above Limassol
   * and a 900 m hill in Honshu were both illustrated with a golf course at
   * sunset in Oregon, and why Cypriot pine forest came back as Icelandic
   * rhyolite. Every one of them was, unavoidably, a photograph of somewhere the
   * user was not going — and at card size the caption disclaiming it is four
   * words long and grey.
   *
   * The plate is drawn from the peak's own name, on the device, and claims
   * nothing. `real: false` still tells callers not to treat it as evidence.
   */
  return { src: plateDataUri(args.name), real: false };
}


/* -------------------------------------------------------------------------- */
/* Terrain for a list                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Every non-identifiable outdoor photograph the app ships, in one flat list.
 *
 * `representativeImage` rotates a three-item band pool by a hash of the name,
 * which is right for one card and wrong for ten: with three images and a hash
 * deciding the offset, a list of trails falling back together still showed the
 * same photograph four times.
 *
 * This is indexed by POSITION instead, so a list walks the whole set before it
 * repeats anything. Nothing here is identifiable — no Aiguille du Midi, no
 * Matterhorn — because a stand-in has to stay a stand-in.
 */
const TERRAIN_SEQUENCE = [
  "/img/expedition-hero.jpg",
  "/img/onboarding-track.jpg",
  "/img/home-hero.jpg",
  "/img/onboarding-train.jpg",
  "/img/onboarding-plan.jpg",
  "/img/community-b.jpg",
  "/img/splash.jpg",
];

/** Terrain for the nth card in a list. */
export const terrainByIndex = (index: number): string =>
  TERRAIN_SEQUENCE[Math.abs(index) % TERRAIN_SEQUENCE.length];

/** Said of a trail rather than a summit. */
export const TRAIL_REPRESENTATIVE_CAPTION =
  "Contour plate — ICEFALL has no verified photograph of this trail.";
