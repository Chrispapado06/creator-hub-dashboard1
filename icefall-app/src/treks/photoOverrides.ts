import type { TrekPhotoCredit } from "./credits";

/**
 * HAND-PICKED PHOTOGRAPHS THAT BEAT THE GENERATED ONES.
 *
 * `credits.ts` and `records.ts` are generated on the web side and copied here,
 * and their header says — correctly — do not hand-edit them. This file is how
 * a chosen photograph gets in without breaking that rule: it is read FIRST,
 * everywhere a trek picture or its credit is resolved, and the generated map
 * is the fallback. A regeneration upstream cannot silently revert these.
 *
 * ── WHY THESE SIX ───────────────────────────────────────────────────────────
 * The generated pass picks a Commons image per route, and for the base camp
 * treks it was picking distant massif shots — technically of the right massif,
 * but they could be any Himalayan photograph. The owner asked for the thing a
 * walker actually arrives at: the sign and the camp itself, mountains behind.
 * These were chosen by eye from a contact sheet rather than by filename, which
 * is the same rule `credits.ts` learned the hard way — A NAME IS NOT A SUBJECT.
 *
 * ── EVERY ROUTE HERE REALLY REACHES THE PLACE IN ITS PICTURE ────────────────
 * This is the constraint that decided the assignment, and it is not decorative.
 * A photograph of Everest Base Camp on a route that stops short of it would be
 * a picture of somewhere the buyer is not going. So:
 *
 *   everest-base-camp-trek              the sign on the way in
 *   jiri-to-everest-base-camp-trek      the camp itself — the long walk in
 *   everest-base-camp-via-gokyo-lakes   Gorak Shep to base camp, on this route
 *   everest-three-passes-trek           the prayer flags at base camp, which
 *                                       the circuit takes in
 *   annapurna-base-camp-trek            the camp
 *   annapurna-sanctuary-trek            Machapuchare at dawn from the camp —
 *                                       the Sanctuary's signature view, and the
 *                                       nearest thing the catalogue has to a
 *                                       Machapuchare Base Camp route, since it
 *                                       holds no separate MBC record
 *
 * Routes that only pass through the region — Everest View, Cho La Pass — are
 * deliberately NOT given a base camp photograph.
 *
 * ── LICENSING IS LOAD-BEARING ───────────────────────────────────────────────
 * All six are CC BY-SA, which requires the photographer named wherever the
 * work appears. That is why the credit lives here beside the file instead of
 * in a bare filename map: `trekPhotoCredit` in `images.ts` is the single
 * accessor both the card caption and the trek detail page read, so adding a
 * photograph here cannot leave it uncredited on one screen and credited on
 * another. If you add a row, add its credit in the same commit.
 */
export interface TrekPhotoOverride extends TrekPhotoCredit {
  /** Bundled path. Explicit, so it never collides with `/img/treks/<id>.jpg`. */
  src: string;
}

export const TREK_PHOTO_OVERRIDES: Record<string, TrekPhotoOverride> = {
  "everest-base-camp-trek": {
    src: "/img/treks/everest-base-camp-trek-basecamp.jpg",
    credit: "Daniel Oberhaus",
    license: "CC BY-SA 4.0",
    pageUrl: "https://commons.wikimedia.org/wiki/File:%27Way_to_Everest_Base_Camp%27_sign.jpg",
  },
  "jiri-to-everest-base-camp-trek": {
    src: "/img/treks/jiri-to-everest-base-camp-trek-basecamp.jpg",
    credit: "Daniel Oberhaus",
    license: "CC BY-SA 4.0",
    pageUrl: "https://commons.wikimedia.org/wiki/File:Everest_Base_Camp_on_a_Stormy_Day.jpg",
  },
  "everest-base-camp-via-gokyo-lakes": {
    src: "/img/treks/everest-base-camp-via-gokyo-lakes-basecamp.jpg",
    credit: "Dario Severi",
    license: "CC BY-SA 4.0",
    pageUrl: "https://commons.wikimedia.org/wiki/File:Gorak_Shep_to_Everest_Base_Camp_2019.jpg",
  },
  "everest-three-passes-trek": {
    src: "/img/treks/everest-three-passes-trek-basecamp.jpg",
    credit: "Daniel Oberhaus",
    license: "CC BY-SA 4.0",
    pageUrl: "https://commons.wikimedia.org/wiki/File:Prayer_Flags_at_Everest_Base_Camp.jpg",
  },
  "annapurna-base-camp-trek": {
    src: "/img/treks/annapurna-base-camp-trek-basecamp.jpg",
    credit: "Bishow11",
    license: "CC BY-SA 3.0",
    pageUrl: "https://commons.wikimedia.org/wiki/File:Annapurna_Base_Camp_(2).jpg",
  },
  "annapurna-sanctuary-trek": {
    src: "/img/treks/annapurna-sanctuary-trek-basecamp.jpg",
    credit: "Redpandamoon",
    license: "CC BY-SA 4.0",
    pageUrl:
      "https://commons.wikimedia.org/wiki/File:Machapuchare_at_dawn_from_Annapurna_Base_Camp.jpg",
  },
};
