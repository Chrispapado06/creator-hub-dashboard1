import type { Mountain } from "@/types";

/**
 * Verified photo galleries.
 *
 * Every image here was checked by eye to be a photograph of that mountain.
 * Automated name-matching alone kept returning near-misses — a space-station
 * view of the Alps, a viewing platform, a neighbouring summit — so anything
 * that wasn't clearly the peak was thrown out. Some mountains therefore have
 * only their hero shot, which is the honest outcome.
 */
export const MOUNTAIN_GALLERY: Record<string, string[]> = {
  "mont-blanc": ["/img/mont-blanc.jpg", "/img/mont-blanc-2.jpg", "/img/mont-blanc-3.jpg"],
  matterhorn: ["/img/matterhorn.jpg"],
  everest: ["/img/everest.jpg", "/img/everest-1.jpg", "/img/everest-3.jpg"],
  "mount-olympus": [
    "/img/mount-olympus.jpg",
    "/img/mount-olympus-1.jpg",
    "/img/mount-olympus-2.jpg",
  ],
  "gran-paradiso": ["/img/gran-paradiso.jpg", "/img/gran-paradiso-2.jpg"],
  eiger: ["/img/eiger.jpg"],
  triglav: ["/img/triglav.jpg"],
  toubkal: ["/img/toubkal.jpg", "/img/toubkal-1.jpg", "/img/toubkal-2.jpg"],
  denali: ["/img/denali.jpg", "/img/denali-1.jpg"],
  aconcagua: ["/img/aconcagua.jpg"],
};

/** Falls back to the mountain's single hero image. */
export function galleryFor(m: Pick<Mountain, "id" | "photo">): string[] {
  return MOUNTAIN_GALLERY[m.id] ?? [m.photo];
}
