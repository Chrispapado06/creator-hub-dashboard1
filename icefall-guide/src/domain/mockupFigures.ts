/**
 * FIGURES THE MOCKUP SHOWS THAT ICEFALL CANNOT MEASURE — DOCTRINE TIER 4.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DELETE THIS FILE, AND EVERY TILE THAT READS IT, BEFORE A REAL GUIDE SIGNS IN.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Four numbers in the owner's design have NO possible source. Verified against
 * the live schema on 2026-08-30, not assumed:
 *
 *   · **Rating 4.9 / 128 reviews** — there is no reviews table, no ratings
 *     column, and nothing anywhere in the family that asks a climber what they
 *     thought. Nothing could ever produce this today.
 *   · **Success rate 98%** — a summit success rate. Constitution §12 records
 *     "a summit success rate" as an honesty violation already FIXED in
 *     `icefall-web`, and no outcome is recorded against any booking here.
 *   · **250+ summits** — a career total. §12 also records career totals seeded
 *     from a fixture ("128 activities, 1,245 km, 6 summits") as fixed in the
 *     athlete app.
 *   · **Rating delta ▲0.3** — a change in a figure that does not exist.
 *
 * THE PRODUCT OWNER DECIDED ON 2026-08-30, having been told plainly that no
 * reviews system exists, that the rating should "show in the sample view only,
 * removed before real guides" — the same handling they chose for the operator
 * portal's invented "Profile views" tile. The other three are the same claim in
 * the same place on the same screen, so they are held to the same terms rather
 * than being invented independently. **That extension was reported to the owner,
 * not assumed silently.**
 *
 * SUCCESS RATE IS THE ONE TO ARGUE ABOUT, and it is flagged separately below
 * because it is not merely unmeasured — it is the closest thing on the screen to
 * a safety claim. A guide reading "98% success rate" beside their own name may
 * repeat it to a client, and a client choosing a guide on a summit statistic is
 * choosing on the number this platform exists to refuse to invent.
 *
 * WHY ITS OWN FLAG, NOT `SHOW_DEMO_DATA`: the demo flag governs invented
 * CONTENT — names, trips, messages, all covered by the banner. This governs an
 * invented MEASUREMENT, which is a different and worse claim, because it says
 * ICEFALL knows something about this person's record. Two switches, so turning
 * demo data on for a design review does not silently also assert a summit rate,
 * and so one grep finds every site.
 */

import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { measured, unavailable, type Reading } from "./honesty";

/**
 * The one named flag. ANDed with `SHOW_DEMO_DATA`, so it cannot be true in a
 * production bundle even if this constant is edited to `true` by mistake.
 */
export const SHOW_MOCKUP_FIGURES: boolean = SHOW_DEMO_DATA && true;

/**
 * Separately switchable, and set to FALSE by default even in the sample view.
 *
 * The owner's ruling covered the rating. A summit success rate is the claim
 * `icefall-web` already had removed for being unearned, and it is the one a
 * guide is most likely to repeat to a client as fact. Flip it only if the owner
 * asks for it specifically; the tile shows the honest sentence meanwhile, and
 * the layout is unchanged either way.
 */
export const SHOW_MOCKUP_SUCCESS_RATE = false;

/** The mockup's figures. Deterministic, never computed, never varied. */
const RATING = 4.9;
const REVIEW_COUNT = 128;
const RATING_DELTA = 0.3;
const SUMMITS = 250;
const SUCCESS_RATE = 0.98;

/* The sentences that occupy the space when a figure is not shown. Each says
   what is true about ICEFALL, never something about the guide — "no rating yet"
   would read as "nobody has rated you", which is a claim about climbers. */
export const NOT_COLLECTED = {
  RATING: "Ratings are not collected yet.",
  SUCCESS_RATE: "Summit outcomes are not recorded.",
  SUMMITS: "Your climbing record is not held here.",
} as const;

export const ratingReading = (): Reading<number> =>
  SHOW_MOCKUP_FIGURES ? measured(RATING) : unavailable(NOT_COLLECTED.RATING);

export const reviewCount = (): number | null => (SHOW_MOCKUP_FIGURES ? REVIEW_COUNT : null);

export const ratingDelta = (): number | null => (SHOW_MOCKUP_FIGURES ? RATING_DELTA : null);

export const summitsReading = (): Reading<number> =>
  SHOW_MOCKUP_FIGURES ? measured(SUMMITS) : unavailable(NOT_COLLECTED.SUMMITS);

export const successRateReading = (): Reading<number> =>
  SHOW_MOCKUP_FIGURES && SHOW_MOCKUP_SUCCESS_RATE
    ? measured(SUCCESS_RATE)
    : unavailable(NOT_COLLECTED.SUCCESS_RATE);

/**
 * Printed on screen wherever these appear — rendered, not a code comment — so
 * nobody reviewing the design mistakes them for measurements.
 */
export const MOCKUP_FIGURES_NOTICE = "Rating and summits are placeholders.";
