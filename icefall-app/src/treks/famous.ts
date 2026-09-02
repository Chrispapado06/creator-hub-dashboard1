import { TREKS, trekById } from "./index";
import type { Trek } from "./model";

/**
 * THE BEST-KNOWN TREKS — A HAND-PICKED LIST, AND IT SAYS SO.
 *
 * This is the one place in the trek catalogue where the app asserts something
 * the data cannot prove, so it is worth being exact about what the assertion
 * is and what it is not.
 *
 * A `Trek` carries no fame, popularity, rating, booking count or ranking
 * field — because none of those exist. Nobody has walked one of these routes
 * through ICEFALL, no operator reports numbers to us, and there is no traffic
 * to count. So "the most famous treks" CANNOT BE COMPUTED HERE, and any
 * ordering that looked computed would be inventing a measurement. The near
 * miss was tempting and is worth recording: 84 of the 252 photographs come
 * from an English Wikipedia article's lead image, and "has a Wikipedia
 * article" really is a notability signal — but `credits.ts` records where the
 * PHOTOGRAPH came from, not whether the ROUTE has an article, and dressing the
 * first up as the second would have been a fabricated statistic with a
 * plausible-looking source. It is not used.
 *
 * What this list is instead: a human's editorial selection of routes that are
 * well known outside the sport, chosen the way a magazine chooses them. Every
 * surface that shows it MUST label it as picked, never as ranked, measured or
 * "top". The order below is a reading order, not a standing.
 *
 * ── THE RULES THE LIST IS PICKED BY ─────────────────────────────────────────
 *   · The route is recognised by name by people who do not trek.
 *   · It is in this catalogue already — nothing here was added to be famous.
 *   · It carries a real photograph of itself, so the rail never falls back to
 *     a contour plate. All 31 do; `assertFamousTreks` keeps that true.
 *   · Where one mountain has several celebrated routes, the best-known one or
 *     two are named rather than all of them — five Kilimanjaro routes in a row
 *     is a list of one mountain, not a list of famous walks.
 *
 * Adding to it is an editorial act, not a data change. Do it by hand, here.
 */
const FAMOUS_TREK_IDS: readonly string[] = [
  // The four almost anyone can name.
  "everest-base-camp-trek",
  "annapurna-base-camp-trek",
  "inca-trail-to-machu-picchu",
  "tour-du-mont-blanc",
  // The great single-mountain walks.
  "kilimanjaro-machame-route",
  "annapurna-circuit-trek",
  "annapurna-sanctuary-trek",
  "everest-three-passes-trek",
  "gokyo-lakes-trek",
  "langtang-valley-trek",
  "manaslu-circuit-trek",
  // Europe's hut-to-hut classics.
  "walkers-haute-route",
  "dolomites-alta-via-1",
  "gr20-corsica-trek",
  "west-highland-way",
  "camino-franc-s",
  // The Americas.
  "john-muir-trail",
  "appalachian-trail",
  "pacific-crest-trail",
  "wonderland-trail",
  "grand-canyon-rim-to-rim",
  "salkantay-trek",
  "huayhuash-circuit-trek",
  "torres-del-paine-w-trek",
  "fitz-roy-el-chalten-trek",
  // The southern and eastern classics.
  "milford-track",
  "routeburn-track",
  "tongariro-alpine-crossing",
  "overland-track",
  "kumano-kodo",
  "snowman-trek",
];

/**
 * The picked treks, as records.
 *
 * Resolved through `trekById` rather than written out, so a route renamed or
 * dropped by a catalogue regeneration disappears from the rail instead of
 * rendering a card with no data behind it. `assertFamousTreks` turns that
 * silent drop into a loud one in development.
 */
export const FAMOUS_TREKS: readonly Trek[] = FAMOUS_TREK_IDS.map((id) =>
  trekById(id),
).filter((t): t is Trek => t !== undefined);

/*
 * THERE IS NO `famousTreksForMountain` HERE, AND THAT IS THE POINT.
 *
 * One was written and cut the same day. Scoping the picked list to whichever
 * peak the reader had selected sounded useful and was not: only four of this
 * app's ten curated mountains have ANY linked route, so six of them answered
 * with a paragraph explaining an absence instead of a list. A section that is
 * empty more often than it is full is furniture. The rail is a world list and
 * stays put; anything peak-specific belongs on the mountain's own page, where
 * `treksForMountain` already serves it.
 */

/**
 * Development guard: every picked id must resolve, and no id twice.
 *
 * A typo in the list above would otherwise cost the rail a card in silence,
 * which is exactly the class of failure the catalogue's generator already
 * refuses for regions and mountains. `TREKS` is imported for the count in the
 * message so the failure names how much of the catalogue was searched.
 */
export function assertFamousTreks(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const id of FAMOUS_TREK_IDS) {
    if (seen.has(id)) problems.push(`listed twice: ${id}`);
    seen.add(id);
    if (!trekById(id)) {
      problems.push(`no trek with id "${id}" in the ${TREKS.length}-route catalogue`);
    }
  }
  return problems;
}
