import { PEAKS } from "@/data/peaks";
import { peakPlate } from "./peakPlate";
import type { Trek } from "@/data/trekTypes";
import { TREK_PHOTO_IDS } from "@/data/trekPhotoCredits";

/**
 * The picture on a trek card.
 *
 * Resolution order, strictest first:
 *
 *   1. A photograph OF THIS ROUTE, bundled under /img/treks/<id>.jpg.
 *   2. The photograph of a mountain the route actually goes to — but only
 *      when `mountainIds` names one, because that association was made
 *      deliberately by a human and means "this walk goes there".
 *   3. A generated plate.
 *
 * WHAT IS NOT IN THE LIST is "a nice mountain from the same country". The
 * phone app deleted its stand-in photographs for illustrating a Cypriot pine
 * ridge with an Icelandic massif, and a Camino card showing Mont Blanc because
 * both are in Europe would be the same error wearing a rucksack.
 */

/** Treks with their own bundled photograph — generated, see trekPhotoCredits.ts. */
export const TREKS_WITH_PHOTOS = TREK_PHOTO_IDS;

export function trekImage(trek: Trek): string {
  if (TREKS_WITH_PHOTOS.has(trek.id)) return `/img/treks/${trek.id}.jpg`;
  const peak = trek.mountainIds.map((id) => PEAKS.find((p) => p.id === id)).find(Boolean);
  if (peak) return `/img/peaks/${peak.id}.jpg`;
  return peakPlate(trek.id);
}

/** The drawing to fall back to when an image will not load. */
export const trekPlate = (id: string): string => peakPlate(id);

/**
 * What the picture is actually of, for the caption.
 *
 * A card showing the mountain rather than the route has to say so — otherwise
 * a photograph of Everest sits above "Gokyo Lakes Trek" and quietly claims to
 * be it.
 */
export function trekImageSubject(trek: Trek): string | null {
  if (TREKS_WITH_PHOTOS.has(trek.id)) return null;
  const peak = trek.mountainIds.map((id) => PEAKS.find((p) => p.id === id)).find(Boolean);
  return peak ? peak.name : null;
}
