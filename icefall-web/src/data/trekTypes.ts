import type { Cents } from "@/money/model";

/**
 * TREKS — the platform's second commercial category, beside expeditions.
 *
 * A Trek is its OWN entity, not a variety of Expedition. They are different
 * products bought by different people: an expedition is a climb of a summit,
 * a trek is a route to, around or between mountains. Modelling a trek as an
 * expedition with a flag would have leaked the summit vocabulary — "Extreme",
 * "supplementary oxygen", "previous 7,000 m summit" — onto walks that need
 * none of it, which is the same class of mistake that once graded a Base Camp
 * trek off Everest's 8,849 m summit.
 *
 * ── WHAT IS AND IS NOT FILLED IN ────────────────────────────────────────────
 * Duration, difficulty, maximum altitude and season are PUBLISHED FACTS about
 * real routes, and are sourced. `priceFromEur` is deliberately NULL for every
 * trek: a starting price is a commercial claim that belongs to an operator, no
 * operator has quoted us one, and inventing 250 of them is exactly what a
 * marketplace must not do. The card renders "Price on enquiry", which is both
 * honest and what the industry actually says.
 *
 * A field that is not known is `null`, and the UI prints "Not specified". It
 * never guesses.
 */

/**
 * Trek grading, which is NOT the expedition scale.
 *
 * An expedition is graded Hard / Very hard / Extreme because the mildest thing
 * in that catalogue is a 4,000 m alpine ascent. The mildest thing here is a
 * valley walk, so it needs its own vocabulary — and reusing "Extreme" for the
 * Snowman Trek and for K2 would flatten a distinction that matters.
 */
export type TrekDifficulty = "Easy" | "Moderate" | "Strenuous" | "Very strenuous";

export const TREK_DIFFICULTY_ORDER: TrekDifficulty[] = [
  "Easy",
  "Moderate",
  "Strenuous",
  "Very strenuous",
];

/** What kind of route it is — shown as a chip, and useful for filtering. */
export type TrekStyle =
  | "Base camp"
  | "Circuit"
  | "Traverse"
  | "Valley"
  | "High pass"
  | "Pilgrimage"
  | "Coastal"
  | "Long distance";

export interface Trek {
  /** Slug, and the id in every relation. */
  id: string;
  name: string;
  regionId: string;
  country: string;
  /**
   * Peaks in the catalogue this route belongs to, by id.
   *
   * MAY BE EMPTY, and often is. The Camino Francés and the West Highland Way
   * are real routes on no summit in our catalogue; forcing them onto the
   * nearest peak would put the Way of St James under a mountain page and make
   * the association meaningless everywhere else. Those reach users through
   * their region, the trek index and search instead.
   */
  mountainIds: string[];
  /** Typical days on the route, as a range. Null where it varies too widely. */
  durationDays: [number, number] | null;
  difficulty: TrekDifficulty | null;
  /** Highest point ON THE ROUTE — never the summit of a mountain beside it. */
  maxAltitudeM: number | null;
  /** The usual window, e.g. "March – May, September – November". */
  season: string | null;
  /**
   * ALWAYS NULL at present. See the note at the top of this file: a starting
   * price is an operator's claim and no operator has given us one. The type
   * keeps the field so a real quote can land here without a migration.
   */
  priceFromEur: Cents | null;
  style: TrekStyle;
  summary: string;
  /** Companies in the directory that run it. */
  operatorIds: string[];
  /** Guides in the directory who work this route. */
  guideIds: string[];
}

/**
 * A trekking region.
 *
 * Regions exist because most of the world's great treks are not attached to a
 * single summit. They give those routes a home, and give the ones that ARE
 * attached a second, broader way in.
 */
export interface TrekRegion {
  id: string;
  name: string;
  country: string;
  /** The peak that best anchors this region, where one exists. */
  anchorPeakId: string | null;
  blurb: string;
}

export const TREK_REGIONS: TrekRegion[] = [
  { id: "khumbu", name: "Everest & the Khumbu", country: "Nepal", anchorPeakId: "everest", blurb: "The valleys under Everest, Lhotse and Ama Dablam." },
  { id: "annapurna", name: "Annapurna", country: "Nepal", anchorPeakId: "annapurna", blurb: "The circuit, the sanctuary and the passes above them." },
  { id: "langtang", name: "Langtang", country: "Nepal", anchorPeakId: null, blurb: "The valley closest to Kathmandu, and the lakes above it." },
  { id: "nepal-remote", name: "Remote Nepal", country: "Nepal", anchorPeakId: "manaslu", blurb: "Restricted areas, long approaches and few other walkers." },
  { id: "cusco", name: "Cusco & Machu Picchu", country: "Peru", anchorPeakId: null, blurb: "The Inca routes over the passes into Machu Picchu." },
  { id: "cordillera", name: "Cordillera Blanca & Huayhuash", country: "Peru", anchorPeakId: "huascaran", blurb: "The highest tropical range on earth." },
  { id: "patagonia", name: "Patagonia", country: "Chile / Argentina", anchorPeakId: null, blurb: "Granite towers, ice cap and wind." },
  { id: "alps", name: "The Alps", country: "France / Switzerland / Italy / Austria", anchorPeakId: "mont-blanc", blurb: "Hut-to-hut routes across the range." },
  { id: "dolomites", name: "The Dolomites", country: "Italy", anchorPeakId: null, blurb: "The Alte Vie, rifugio to rifugio." },
  { id: "iberia", name: "Iberia & the Pyrenees", country: "Spain / Portugal / France", anchorPeakId: null, blurb: "The Caminos, the GR routes and the high Pyrenees." },
  { id: "iceland", name: "Iceland", country: "Iceland", anchorPeakId: null, blurb: "Rhyolite, ash and glacier crossings." },
  { id: "uk-ireland", name: "Britain & Ireland", country: "United Kingdom / Ireland", anchorPeakId: null, blurb: "National trails and long coastal ways." },
  { id: "east-africa", name: "East Africa", country: "Tanzania / Kenya / Uganda / Ethiopia", anchorPeakId: "kilimanjaro", blurb: "Kilimanjaro, Mount Kenya and the Rwenzori." },
  { id: "atlas", name: "The Atlas", country: "Morocco", anchorPeakId: "toubkal", blurb: "Toubkal, the M'Goun and the Saghro." },
  { id: "drakensberg", name: "The Drakensberg", country: "South Africa / Lesotho", anchorPeakId: null, blurb: "The escarpment and the Amphitheatre." },
  { id: "new-zealand", name: "New Zealand", country: "New Zealand", anchorPeakId: "aoraki", blurb: "The Great Walks and the Southern Alps." },
  { id: "australia", name: "Australia", country: "Australia", anchorPeakId: "kosciuszko", blurb: "Long trails across desert, alps and coast." },
  { id: "japan", name: "Japan", country: "Japan", anchorPeakId: "fuji", blurb: "Pilgrim routes and the Northern Alps." },
  { id: "north-america", name: "North America", country: "United States / Canada", anchorPeakId: "rainier", blurb: "The long trails and the Rockies." },
  { id: "bhutan", name: "Bhutan", country: "Bhutan", anchorPeakId: null, blurb: "High routes through a closed kingdom." },
  { id: "central-asia", name: "Central Asia", country: "Kyrgyzstan / Tajikistan", anchorPeakId: "khan-tengri", blurb: "The Tien Shan, the Pamir and the Fann." },
  { id: "andes-north", name: "Ecuador & Bolivia", country: "Ecuador / Bolivia", anchorPeakId: "cotopaxi", blurb: "Volcano loops and the Cordillera Real." },
];

export const trekRegion = (id: string): TrekRegion | undefined =>
  TREK_REGIONS.find((r) => r.id === id);

/** "Everest Base Camp Trek" -> "everest-base-camp-trek" */
export const trekSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Days as a readable range, or the honest absence of one. */
export function trekDuration(t: Trek): string {
  if (!t.durationDays) return "Not specified";
  const [a, b] = t.durationDays;
  return a === b ? `${a} days` : `${a}–${b} days`;
}

export const trekAltitude = (t: Trek): string =>
  t.maxAltitudeM === null ? "Not specified" : `${t.maxAltitudeM.toLocaleString("en-GB")} m`;
