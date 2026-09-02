import { MOUNTAINS } from "@/data/mock/mountains";
import { plateDataUri } from "@/components/domain/TrailPlate";
import { TREK_PHOTO_CREDITS, TREK_PHOTO_IDS, type TrekPhotoCredit } from "./credits";
import { TREK_PHOTO_OVERRIDES } from "./photoOverrides";
import type { Trek } from "./model";

/**
 * The picture on a trek card.
 *
 * Resolution order, strictest first:
 *
 *   1. A photograph OF THIS ROUTE, bundled at /img/treks/<id>.jpg.
 *   2. The photograph this app already holds for a mountain the route
 *      actually goes to — but only when `mountainIds` names one, because a
 *      human made that association and it means "this walk goes there".
 *   3. The generated contour plate.
 *
 * WHAT IS NOT IN THE LIST is "a nice mountain from the same country". This app
 * deleted its stand-in photographs once already, for illustrating a Cypriot
 * pine ridge with an Icelandic massif; a Camino card showing Mont Blanc because
 * both are in Europe would be the same error wearing a rucksack.
 *
 * There is no network call here at all. Every photograph is bundled, so a trek
 * list paints at once and cannot be rate-limited — the failure that took the
 * trail cards apart before the plate was written.
 */

export { TREK_PHOTO_CREDITS };

/**
 * THE ONE PLACE THAT ANSWERS "who took this trek's photograph".
 *
 * Hand-picked overrides win over the generated map. This exists as a single
 * accessor rather than two lookups because the credit is a LICENCE OBLIGATION:
 * every photograph in both maps is CC BY or CC BY-SA, which requires the
 * author named wherever the work appears. The trek card and the trek detail
 * page used to read `TREK_PHOTO_CREDITS` separately, so a photograph added in
 * one place would have shown up credited on one screen and anonymous on the
 * other — which is a breach, not a cosmetic slip. Read this instead.
 */
export const trekPhotoCredit = (id: string): TrekPhotoCredit | undefined =>
  TREK_PHOTO_OVERRIDES[id] ?? TREK_PHOTO_CREDITS[id];

export const trekHasPhoto = (id: string): boolean =>
  id in TREK_PHOTO_OVERRIDES || TREK_PHOTO_IDS.has(id);

export function trekImage(trek: Trek): string {
  const override = TREK_PHOTO_OVERRIDES[trek.id];
  if (override) return override.src;
  if (TREK_PHOTO_IDS.has(trek.id)) return `/img/treks/${trek.id}.jpg`;
  for (const id of trek.mountainIds) {
    // The curated mountain's own photograph, which this app already bundles.
    const m = MOUNTAINS.find((p) => p.id === id);
    if (m?.photo) return m.photo;
  }
  return plateDataUri(trek.id);
}

/** The drawing to fall back to when an image fails to load. */
export const trekPlate = (id: string): string => plateDataUri(id);

/**
 * What the picture is actually of.
 *
 * A card showing the mountain rather than the route HAS TO SAY SO, or a
 * photograph of Everest sits above "Gokyo Lakes Trek" and quietly claims to be
 * it. Null means the image is of the route itself and needs no qualifier.
 */
export function trekImageSubject(trek: Trek): string | null {
  // `trekHasPhoto`, not the generated set: an overridden route's picture is of
  // the route, so it needs no "this is the mountain, not the walk" qualifier.
  if (trekHasPhoto(trek.id)) return null;
  for (const id of trek.mountainIds) {
    const m = MOUNTAINS.find((p) => p.id === id);
    if (m) return m.name;
  }
  return null;
}

/** The caption under a trek image — attribution where it is owed. */
export function trekImageCaption(trek: Trek): string {
  const credit = trekPhotoCredit(trek.id);
  if (credit) {
    // CC BY and CC BY-SA require the author named wherever the work appears.
    return [credit.credit ? `Photograph: ${credit.credit}` : "Photograph", credit.license, "Wikimedia Commons"]
      .filter(Boolean)
      .join(" · ");
  }
  const subject = trekImageSubject(trek);
  if (subject) return `${subject} — the mountain this route visits, not the route itself`;
  return "Contours — no verified photograph of this route";
}
