/**
 * Banners for a shared profile card.
 *
 * Eighteen mountain photographs already ship with the app, so no download was
 * needed — every one below is a file in `public/img`, verified present.
 *
 * The banner is chosen from the athlete's handle rather than at random. A card
 * that shows a different mountain every time you refresh looks broken; one that
 * is always the same for a given person, and different from the next person's,
 * looks designed. `event-a.jpg` (a funicular interior) and the community shots
 * of identifiable people are excluded — a banner is scenery, not a scene.
 */

export const PROFILE_BANNERS = [
  "/img/mont-blanc.jpg",
  "/img/mont-blanc-2.jpg",
  "/img/mont-blanc-3.jpg",
  "/img/matterhorn.jpg",
  "/img/everest.jpg",
  "/img/everest-1.jpg",
  "/img/everest-3.jpg",
  "/img/eiger.jpg",
  "/img/denali.jpg",
  "/img/denali-1.jpg",
  "/img/aconcagua.jpg",
  "/img/triglav.jpg",
  "/img/gran-paradiso.jpg",
  "/img/toubkal.jpg",
  "/img/mount-olympus.jpg",
  "/img/home-hero.jpg",
  "/img/expedition-hero.jpg",
  "/img/onboarding-track.jpg",
] as const;

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable per person; `nudge` lets the athlete cycle through them by choice. */
export function bannerFor(seed: string, nudge = 0): string {
  return PROFILE_BANNERS[(hash(seed || "icefall") + nudge) % PROFILE_BANNERS.length];
}

export const bannerIndex = (seed: string, nudge = 0) =>
  (hash(seed || "icefall") + nudge) % PROFILE_BANNERS.length;
