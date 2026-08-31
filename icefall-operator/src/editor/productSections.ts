/**
 * The section model behind the TRIP editor — the product-page twin of
 * `sections.ts`.
 *
 * THIS FILE IS A TRANSCRIPTION, NOT A DESIGN. Every entry below corresponds to
 * a block that one of the two consumer apps actually draws, and `surfaces` was
 * read off those files rather than assumed. An operator editing a section that
 * no reader can see is worse than a missing control: they believe they have
 * published something, and nobody ever sees it.
 *
 * HOW `surfaces` WAS VERIFIED (2026-08-30):
 *
 *   web — `icefall-web/src/app/TripDetail.tsx`. Six tabs, declared on one line:
 *         `const TABS = ["Overview", "Itinerary", "What's included",
 *         "Equipment", "Reviews", "FAQ"]`, plus a `Hero`, a `BookingRail`
 *         (departure list + price per person), an `ElevationCard`, a `WhyCard`
 *         and a `Documents` panel inside Overview.
 *
 *   app — `icefall-app/src/screens/explore/TripDetail.tsx`. FIVE tabs:
 *         `const TABS = ["Overview", "Itinerary", "Inclusions", "Reviews",
 *         "FAQ"]` — one fewer than the web. A grep for `equipment` / `gear` /
 *         `Document` / `camps` across that file returns NOTHING, so the phone
 *         renders no equipment list, no documents panel and no ascent profile.
 *         It does render a hero (name, altitude, region, duration, difficulty),
 *         a price band (from-price + best season), a departure strip, an
 *         itinerary card and a "Run by" operator row.
 *
 *   NOT the app's `screens/treks/TrekDetail.tsx`. That page is ICEFALL's own
 *   route catalogue, and its own header comment says "no operator has listed a
 *   trek with us yet" and "no day-by-day" — it carries no operator content at
 *   all. A trek PRODUCT reaches the phone through `explore/TripDetail.tsx` like
 *   an expedition does, so there is no third surface and no trek-only section.
 *
 * WHAT IS DELIBERATELY ABSENT. The web Overview also draws "Expedition
 * highlights" and "Who this is for", and both apps draw an operator rating.
 * None of the three has a field on `Product`, so none becomes a section here:
 * inventing a row to fill would invite an operator to type content the
 * publication path cannot carry.
 *
 * REUSED FROM `sections.ts`, NOT REDEFINED:
 *   `Surface`, `SectionState`, `SECTION_STATE_LABEL`, `SECTION_STATE_COLOUR`
 *   and — importantly for whoever wires the editor — `pendingFields()`, which
 *   is already generic over string field names and works unchanged on a
 *   product's versions. Import it from `./sections`; there is no
 *   `productPendingFields` here because a second copy could drift from the one
 *   the company editor uses.
 * Only `sectionState` needed a twin, because its parameter is typed to a
 * `SectionDef` whose `fields` are `keyof Company`.
 */

import type { Product } from "@/domain/types";
import type { SectionState, Surface } from "./sections";

export interface ProductSectionDef {
  key: string;
  label: string;
  /** Product fields this section publishes. Drives status and the inspector. */
  fields: readonly (keyof Product)[];
  /** Surfaces that actually render it — see the verification note above. */
  surfaces: readonly Surface[];
  /** The section exists on the page but is not the operator's to write. */
  readOnly?: boolean;
  /** Shown in the inspector. Says what the section is FOR, or why it is locked. */
  hint?: string;
}

/**
 * The trip page, in the order a climber meets it.
 *
 * The two locked sections sit last, following the company editor's "Set by
 * Icefall" row: padlocked and present, never hidden. A row that says who owns a
 * block answers the question; an absent row produces the email.
 */
export const PRODUCT_SECTIONS: readonly ProductSectionDef[] = [
  {
    key: "hero",
    label: "Hero",
    fields: ["name", "mountainIds", "maxAltitudeM", "durationDays", "difficulty"],
    surfaces: ["web", "app"],
    /*
     * ── THE HERO IS MOSTLY NOT THE SELLER'S ANY MORE ─────────────────────────
     *
     * Owner decision, OP-03/OP-04 (2026-08-30). Of the five fields this section
     * publishes, the operator writes exactly ONE — the duration. The name and
     * the mountain were already Icefall's. The other two were taken away, and
     * for two DIFFERENT reasons that must not be merged:
     *
     *   DIFFICULTY is a property of the route. It is the same grade whoever
     *   sells the trip, so there is nothing for a company to decide and it is
     *   read off the record and padlocked.
     *
     *   HIGHEST POINT was the dangerous one. It is the number a climber uses to
     *   decide whether they can survive a trip, and it is the number a seller
     *   has most reason to round up towards the famous peak in the name. The
     *   editor now shows what the record holds and offers no input; where the
     *   record holds nothing, the page shows nothing. IT IS NEVER FILLED IN
     *   FROM THE MOUNTAIN'S SUMMIT — an Everest Base Camp trek tops out at
     *   5,364 m against Everest's 8,849 m, an overstatement of 3,485 m, roughly
     *   65% higher than the trip goes. A per-route altitude on the mountain and
     *   trek records is schema, and is with Icefall as request 07.
     *
     * The fields stay listed above because this section still PUBLISHES them —
     * `fields` describes what a reader sees here, not what an operator may
     * type — so a change of Icefall's own to either still lights this row.
     */
    hint:
      "Both heroes print the name, the mountain, the duration, the highest point and " +
      "the difficulty. Only the duration is yours: difficulty belongs to the route, " +
      "and the highest point is the number a climber judges survivability by, so " +
      "neither is a seller's to state. Where Icefall holds no highest point the page " +
      "shows none — it is never taken from the mountain's summit.",
  },
  {
    key: "about",
    label: "About this trip",
    fields: ["description"],
    surfaces: ["web", "app"],
    hint:
      "The opening paragraph of the Overview tab on both surfaces. Left empty, the " +
      "page says nothing has been published rather than filling the space.",
  },
  {
    key: "price",
    label: "Price & season",
    fields: ["priceFromCents", "priceToCents", "currency", "seasonality"],
    surfaces: ["web", "app"],
    hint:
      "The web booking rail's \"Price per person\" and the phone's price band. " +
      "Seasonality is the \"Best season\" line beside it.",
  },
  {
    /**
     * The departure list — web `BookingRail`, phone "Next available departures".
     *
     * NO PRODUCT FIELDS: departures are their own rows (`ProductDeparture`), so
     * this section's state never comes from the product's own versions. It is
     * here because the page has it and an operator looking for their dates will
     * look in the rail.
     */
    key: "departures",
    label: "Departures",
    fields: [],
    surfaces: ["web", "app"],
    hint:
      "Dates live on their own records, and the write path is SPLIT down the middle " +
      "of each card. How many places you run, how many are left and whether the " +
      "departure is open save IMMEDIATELY, with no review — stale availability hurts " +
      "the climber who enquires on a full trip, and it is your own logistics, not a " +
      "claim about the mountain. The DATE and the PRICE are advertised claims and go " +
      "to Icefall for review like any other change.",
  },
  {
    key: "itinerary",
    label: "Itinerary",
    fields: ["itinerary"],
    surfaces: ["web", "app"],
    hint:
      "Its own tab on both surfaces, and the phone also shows the first stages on " +
      "the Overview. Publish nothing and the tab says so — never an example day.",
  },
  {
    key: "included",
    label: "What's included",
    fields: ["inclusions", "exclusions"],
    surfaces: ["web", "app"],
    hint:
      "The web's \"What's included\" tab AND its booking rail, which repeats both " +
      "lists beside the price. The phone shows them on the Overview and again under " +
      "its \"Inclusions\" tab. What a quote covers is where operators differ most.",
  },
  {
    /**
     * WEB ONLY, and this is the one asymmetry that matters.
     *
     * `icefall-web` has an "Equipment" tab; the phone's six tabs are five and
     * equipment is the one missing. Nothing in the phone screen reads the field.
     */
    key: "equipment",
    label: "Equipment",
    fields: ["equipment"],
    surfaces: ["web"],
    hint:
      "The web-only Equipment tab. The phone app has no equipment list — a gear " +
      "list published here is read on the website and nowhere else.",
  },
  {
    key: "faq",
    label: "FAQ",
    fields: ["faq"],
    surfaces: ["web", "app"],
    hint: "A tab of its own on both surfaces. Empty until you answer something.",
  },
  {
    /**
     * NOT YOURS TO WRITE. The web Reviews tab renders the COMPANY's reviews with
     * a line saying they span all its expeditions, and the phone's Reviews tab
     * says plainly that reviews live on the company profile. Either way the
     * words are climbers', not the operator's.
     */
    key: "reviews",
    label: "Reviews",
    fields: [],
    surfaces: ["web", "app"],
    readOnly: true,
    hint:
      "Written by climbers, about your company rather than this one trip, and " +
      "shown on both surfaces. Nobody at your company or at Icefall can edit them.",
  },
  {
    /**
     * ICEFALL'S CHECK, not a file upload. Web Overview only — the phone has no
     * documents panel.
     */
    key: "documents",
    label: "Documents & resources",
    fields: [],
    surfaces: ["web"],
    readOnly: true,
    hint:
      "Set by Icefall. The website lists the documents an operator is expected to " +
      "supply and states that none is published yet; the panel does not appear in " +
      "the phone app at all.",
  },
] as const;

/** The sections a given surface actually draws. */
export const productSectionsFor = (surface: Surface): ProductSectionDef[] =>
  PRODUCT_SECTIONS.filter((s) => s.surfaces.includes(surface));

/**
 * The dot beside a trip section in the rail.
 *
 * Identical precedence to `sectionState` in `sections.ts` — PENDING WINS OVER
 * EDITED, because a field sitting with Icefall is the one the operator cannot
 * act on and would otherwise chase. A separate function only because that one
 * takes a `SectionDef`, whose `fields` are `keyof Company`.
 *
 * Feed `pending` from `pendingFields()` in `./sections`, unchanged: it is
 * already generic over field names and reads `changedFields`, which the schema
 * derives by trigger for products exactly as it does for companies.
 *
 * A section with no fields — Reviews, Documents, Departures — can never report
 * anything but `live` from here, which is correct: none of them is carried by
 * the product's own content versions.
 */
export function productSectionState(
  section: ProductSectionDef,
  pending: ReadonlySet<string>,
  locallyEdited: ReadonlySet<string>,
): SectionState {
  if (section.fields.some((f) => pending.has(f as string))) return "pending";
  if (section.fields.some((f) => locallyEdited.has(f as string))) return "edited";
  return "live";
}
