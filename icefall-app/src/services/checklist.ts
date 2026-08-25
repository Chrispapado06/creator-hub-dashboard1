import { assessPeak } from "@/services/peakAssessment";
import { sync } from "@/services/repository";

/**
 * Equipment checklist generation.
 *
 * The list is DERIVED, never authored per mountain: it comes out of
 * `assessPeak`, whose band, technical kit and skills already vary with
 * elevation, so Mont Blanc, Kilimanjaro and Everest genuinely produce different
 * lists rather than one generic hiking list with the peak's name on top.
 *
 * HONESTY RULES THIS MODULE ENFORCES:
 *
 *  - It describes a CLASS of mountain, not a route. An easy line and a serious
 *    one share a summit, and the derivation cannot tell them apart. That is why
 *    every item is strikeable as "n/a" and why `CHECKLIST_DISCLAIMER` says the
 *    operator's or guide's list governs.
 *  - It never says you are equipped, and it never tells anyone to climb. A
 *    complete list is a complete list; the decision belongs to the climber and
 *    their guide.
 *  - It is not medical. Altitude appears here as "agree a plan with a doctor",
 *    never as a drug, a dose or a diagnosis.
 *  - ICEFALL makes apparel and packs and nothing else. Every item ICEFALL does
 *    not make is flagged `thirdParty` so no screen can imply we sell it, and
 *    nothing here links to a shop — there are no retail partners.
 *
 * ITEM IDS ARE PERSISTED. `AppState.checklistStatuses` keys off them, so an id
 * must stay stable for the same concept across builds; changing a slug silently
 * discards what the athlete recorded against that row.
 */

export type ItemStatus = "have" | "need" | "replace" | "borrow" | "rent" | "n/a";

export type ChecklistCategory =
  | "technical"
  | "clothing"
  | "navigation"
  | "nutrition"
  | "safety"
  | "documents";

export interface ChecklistItem {
  id: string;
  label: string;
  category: ChecklistCategory;
  detail?: string;
  essential: boolean;
  /** True when ICEFALL does not make it. */
  thirdParty: boolean;
}

export interface GeneratedChecklist {
  items: ChecklistItem[];
  categories: { id: ChecklistCategory; label: string; items: ChecklistItem[] }[];
}

/** Display order, coldest-hardware-first, paperwork last. */
export const CATEGORY_ORDER: ChecklistCategory[] = [
  "technical",
  "clothing",
  "navigation",
  "safety",
  "nutrition",
  "documents",
];

export const CATEGORY_LABEL: Record<ChecklistCategory, string> = {
  technical: "Technical kit",
  clothing: "Clothing and carry",
  navigation: "Navigation and light",
  safety: "Safety and emergency",
  nutrition: "Food and water",
  documents: "Documents and permits",
};

export const STATUS_LABEL: Record<ItemStatus, string> = {
  have: "Have",
  need: "Need",
  replace: "Replace",
  borrow: "Borrow",
  rent: "Rent",
  "n/a": "N/A",
};

/**
 * Statuses that mean the item will be on the mountain with you.
 *
 * Borrowing and renting count, because an item you have arranged is not an item
 * you are missing — and scoring them as outstanding would push people to buy
 * equipment they had already sorted. They are counted openly rather than
 * quietly: the screen states which statuses count towards the figure.
 *
 * "n/a" is not here and is not a gap either — see `completion`, which removes it
 * from the sum entirely.
 */
export function isResolved(status: ItemStatus | undefined): boolean {
  return status === "have" || status === "borrow" || status === "rent";
}

export const CHECKLIST_DISCLAIMER =
  "A generated list is a starting point, not a guarantee that you are equipped. ICEFALL derives this one from the peak's elevation and latitude, so it describes the class of mountain rather than your route, your season or your party — it can list things your line does not need and omit things it does. Where you are climbing with a guide or an operator, their kit list governs. Where you are not, the local guides office and a current guidebook do.";

/* -------------------------------------------------------------------------- */
/* Geography                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Coarse regional boxes, used ONLY to make paperwork specific where it can be.
 *
 * Deliberately conservative: each box is paired with an elevation floor at the
 * call site, so a low hill inside the same rectangle never picks up a permit
 * row. Where coordinates are unknown, no regional claim is made at all.
 */
function region(lat: number | undefined, lon: number | undefined) {
  if (lat === undefined || lon === undefined)
    return { himalaya: false, karakoram: false, alps: false };
  return {
    // Nepal, Sikkim, Garhwal, Bhutan — permits are issued through registered agencies.
    himalaya: lat >= 25 && lat <= 32 && lon >= 79 && lon <= 97,
    karakoram: lat >= 33 && lat <= 38 && lon >= 70 && lon <= 80,
    alps: lat >= 43.5 && lat <= 48.5 && lon >= 5 && lon <= 17,
  };
}

/* -------------------------------------------------------------------------- */
/* Kit derived from the assessment                                             */
/* -------------------------------------------------------------------------- */

/** `Crevasse rescue kit` → `crevasse-rescue-kit`, so ids stay stable and legible. */
function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Where a piece of technical kit belongs in the list.
 *
 * `assessPeak` returns kit as prose, so the mapping is by keyword. Anything
 * unrecognised falls to `technical`, which is the honest default for hardware.
 */
function categoriseKit(label: string): ChecklistCategory {
  const l = label.toLowerCase();
  if (l.includes("map") || l.includes("compass") || l.includes("torch")) return "navigation";
  if (l.includes("first aid")) return "safety";
  if (l.includes("glasses") || l.includes("goggles")) return "safety";
  if (l.includes("boots")) return "clothing";
  return "technical";
}

/**
 * Why the item matters on this class of mountain.
 *
 * One line, specific, never instructional about whether to go. Absent for kit
 * we have nothing useful to say about — an invented rationale would be padding
 * on a safety list.
 */
function kitDetail(label: string): string | undefined {
  const l = label.toLowerCase();
  if (l.includes("crampon")) {
    return "Fitted to the exact boots you will climb in and checked at home, not at the hut.";
  }
  if (l.includes("axe")) {
    return "Length matched to the ground, with self-arrest practised before the day rather than on it.";
  }
  if (l.includes("harness") || l.includes("rope") || l.includes("jumar")) {
    return "Only as useful as the rope work behind it — the kit does not substitute for the skill.";
  }
  if (l.includes("crevasse")) {
    return "Prusiks, screws and pulley, plus a party that has rehearsed a hauling system together.";
  }
  if (l.includes("glasses")) {
    return "Category 4 lenses with side protection. Snow at altitude burns eyes quickly.";
  }
  if (l.includes("helmet")) {
    return "Rockfall and icefall are the hazard, and both are worst when other parties are above you.";
  }
  if (l.includes("boots")) {
    return "Rated for the temperature and stiff enough for the binding your crampons use.";
  }
  if (l.includes("oxygen")) {
    return "Arranged through the operator. The mask and regulator must be a system you have used before.";
  }
  if (l.includes("sleeping")) {
    return "Rated for the coldest camp on the itinerary, not the average one.";
  }
  if (l.includes("torch"))
    return "With spare batteries kept warm — capacity falls sharply in the cold.";
  if (l.includes("map") || l.includes("compass")) {
    return "The primary navigation, not the backup. Phones fail in cold and wet.";
  }
  if (l.includes("poles")) return "Saves the legs on descent, which is where most days go wrong.";
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                  */
/* -------------------------------------------------------------------------- */

export function generateChecklist(peak: {
  name: string;
  elevationM: number;
  lat?: number;
  lon?: number;
}): GeneratedChecklist {
  // `assessPeak` needs a latitude for its SEASON window, and that is the one
  // field this module never reads. Band, technical kit, skills, guide advice and
  // acclimatisation all come from elevation alone, so a peak with no known
  // coordinates still gets a correct kit list — and gets no season claim, which
  // is the part a fallback latitude would have fabricated.
  const assessment = assessPeak(peak.elevationM, peak.lat ?? 0, peak.lon);
  const { band, technicalKit, skills, equipmentIds, requiresGuide } = assessment;
  const m = peak.elevationM;
  const where = region(peak.lat, peak.lon);

  // Glacier travel is read from what the assessment actually says rather than
  // assumed from height: a 4,000 m peak with no roped travel in its skills is
  // not a glacier objective, whatever its altitude.
  const glaciated =
    technicalKit.some((k) => /crampon|crevasse|harness/i.test(k)) ||
    skills.some((s) => /glacier|crevasse|snow/i.test(s));

  const items: ChecklistItem[] = [];
  const add = (item: ChecklistItem) => items.push(item);
  const kitHas = (needle: string) =>
    technicalKit.some((k) => k.toLowerCase().includes(needle.toLowerCase()));

  /* -- Technical kit, straight from the assessment ------------------------- */

  for (const label of technicalKit) {
    add({
      id: `kit-${slug(label)}`,
      label,
      category: categoriseKit(label),
      detail: kitDetail(label),
      essential: true,
      // Nothing in `technicalKit` is an ICEFALL product — the range is apparel
      // and packs. `peakAssessment` names this kit precisely so the list is
      // complete, and this flag stops any screen implying we sell it.
      thirdParty: true,
    });
  }

  /* -- Clothing and carry, from the ICEFALL catalogue ---------------------- */

  for (const id of equipmentIds) {
    const product = sync.productById(id);
    if (!product) continue;
    add({
      id: `gear-${product.id}`,
      label: product.name,
      category: "clothing",
      detail: `${product.categoryLabel}. An equivalent you already own counts — the list is about the layer, not the brand.`,
      // The shell and the insulation are not optional on a cold mountain; the
      // rest of the system is a preference between equivalents.
      essential: product.category === "shell" || product.category === "insulation",
      thirdParty: false,
    });
  }

  /* -- Footwear ------------------------------------------------------------ */

  if (!kitHas("boots")) {
    add({
      id: "wear-boots",
      label:
        band >= 4
          ? "Crampon-compatible mountaineering boots"
          : band >= 3
            ? "Stiff-soled mountain boots"
            : "Broken-in walking boots",
      category: "clothing",
      detail:
        band >= 4
          ? "B2 or B3 rated, matched to the binding your crampons use, and worn in before the trip."
          : "Worn in over several long days. New boots on a big day is how a trip ends early.",
      essential: true,
      thirdParty: true,
    });
  }

  if (band >= 2) {
    add({
      id: "wear-gloves",
      label: "Gloves — a working pair and a warm spare",
      category: "clothing",
      detail: "The spare stays dry in the pack. Wet gloves at altitude are worse than none.",
      essential: band >= 3,
      thirdParty: true,
    });
    add({
      id: "wear-head",
      label: "Warm hat and a buff or neck gaiter",
      category: "clothing",
      essential: false,
      thirdParty: true,
    });
  }

  /* -- Head and eyes -------------------------------------------------------

     `assessPeak` names a helmet and glacier glasses at some bands and not at
     others — its kit lists were written per band and the highest ones assume
     the operator supplies the rest. Neither hazard goes away with altitude, so
     both are added here when the assessment has not already named them.        */

  if (band >= 3 && !kitHas("helmet")) {
    add({
      id: "safe-helmet",
      label: "Helmet",
      category: "technical",
      detail: "Rockfall and icefall are the hazard, and both are worst when parties are above you.",
      essential: true,
      thirdParty: true,
    });
  }

  if (glaciated && !kitHas("glasses")) {
    add({
      id: "safe-glacier-glasses",
      label: "Glacier glasses and a spare pair",
      category: "safety",
      detail:
        "Category 4 lenses with side protection. Snow blindness takes hours to arrive and days to clear.",
      essential: true,
      thirdParty: true,
    });
  }

  /* -- Navigation and light ------------------------------------------------ */

  add({
    id: "nav-phone",
    label: "Phone with offline maps and a power bank",
    category: "navigation",
    detail: "Kept warm and charged, and treated as the backup rather than the primary.",
    essential: true,
    thirdParty: true,
  });

  if (band >= 3) {
    add({
      id: "nav-spare-light",
      label: "Spare batteries and a second light source",
      category: "navigation",
      detail: "Alpine starts run on head torches, and a dead one stops the party, not just you.",
      essential: true,
      thirdParty: true,
    });
  }

  /* -- Safety -------------------------------------------------------------- */

  if (!kitHas("first aid")) {
    add({
      id: "safe-first-aid",
      label: "First aid kit",
      category: "safety",
      detail: "Packed for the length of the day and how far you are from help, not for a day pack.",
      essential: true,
      thirdParty: true,
    });
  }

  add({
    id: "safe-contacts",
    label: "Whistle and written emergency contacts",
    category: "safety",
    detail: "Names, numbers and the rescue service for the area, on paper as well as on the phone.",
    essential: true,
    thirdParty: true,
  });

  add({
    id: "safe-sun",
    label: m >= 3000 ? "Sun protection rated for snow and altitude" : "Sun protection",
    category: "safety",
    detail:
      m >= 3000
        ? "High-factor cream reapplied through the day, lip balm, and cover for the underside of the chin — snow reflects."
        : "High-factor cream and lip balm. Exposure is longer than a day in the valley.",
    essential: m >= 2500,
    thirdParty: true,
  });

  if (band >= 3) {
    add({
      id: "safe-shelter",
      label: "Group shelter or bivouac bag",
      category: "safety",
      detail: "A stopped party on exposed ground loses heat far faster than a moving one.",
      essential: true,
      thirdParty: true,
    });
    add({
      id: "safe-intentions",
      label: "Route intentions left with someone at home",
      category: "safety",
      detail: "Where you are going, your turnaround time, and when to raise the alarm.",
      essential: true,
      thirdParty: true,
    });
  }

  if (glaciated) {
    add({
      id: "safe-avalanche",
      label: "Avalanche transceiver, probe and shovel",
      category: "safety",
      detail:
        "Carried where the route crosses avalanche terrain — check the local bulletin. The kit is only useful with the training to use it.",
      // Not universal on a summer glacier route, so it is offered rather than
      // demanded. Marking it essential everywhere would train people to ignore
      // the essential flag.
      essential: false,
      thirdParty: true,
    });
  }

  if (m >= 4000) {
    add({
      id: "safe-beacon",
      label: "Satellite messenger or personal locator beacon",
      category: "safety",
      detail: "Mobile coverage disappears long before the summit does.",
      essential: m >= 5500,
      thirdParty: true,
    });
  }

  /* -- Altitude ------------------------------------------------------------ */

  if (m >= 3000) {
    add({
      id: "safe-altitude-plan",
      label: "Altitude plan agreed with a doctor",
      category: "safety",
      // NOT MEDICAL ADVICE, and deliberately names no drug and no dose. ICEFALL
      // does not diagnose or prescribe; the only honest item here is the
      // conversation itself.
      detail:
        "Anything you would take for altitude is a conversation with a doctor experienced in altitude medicine. ICEFALL does not advise on it.",
      essential: true,
      thirdParty: true,
    });
    add({
      id: "food-insulated-bottle",
      label: "Insulated bottle or flask",
      category: "nutrition",
      detail:
        "Above the freezing level a bladder hose freezes; an insulated bottle carried upside down does not.",
      essential: true,
      thirdParty: true,
    });
  }

  /* -- Food and water ------------------------------------------------------ */

  add({
    id: "food-water",
    label: "Water for the day",
    category: "nutrition",
    detail:
      "Plan the carry and where it can honestly be refilled or melted, not where it might be.",
    essential: true,
    thirdParty: true,
  });

  add({
    id: "food-day",
    label: "Food for the day plus a reserve",
    category: "nutrition",
    detail:
      m >= 3000
        ? "Appetite falls with altitude — take food you will still eat when you do not feel like eating."
        : "Enough for the day it becomes, not the day you planned.",
    essential: true,
    thirdParty: true,
  });

  if (m >= 5000) {
    add({
      id: "food-stove",
      label: "Stove, fuel and a melting plan",
      category: "nutrition",
      detail: "Above the snowline water is melted, and fuel is calculated per person per night.",
      essential: true,
      thirdParty: true,
    });
  }

  /* -- Expedition ---------------------------------------------------------- */

  if (m >= 6000) {
    add({
      id: "exp-duffel",
      label: "Expedition duffels and a hold-luggage plan",
      category: "technical",
      detail: "Operators set weight limits per bag and specify what flies in on the internal legs.",
      essential: false,
      thirdParty: true,
    });
    add({
      id: "exp-repair",
      label: "Personal repair kit",
      category: "technical",
      detail: "Tape, cord, spare buckles and crampon spares. Weeks out, nothing gets replaced.",
      essential: false,
      thirdParty: true,
    });
    add({
      id: "exp-med",
      label: "Expedition medical kit agreed with the operator",
      category: "safety",
      detail:
        "Specified by the expedition doctor or leader. Carry your own regular medication separately and in duplicate.",
      essential: true,
      thirdParty: true,
    });
  }

  if (m >= 7000) {
    add({
      id: "exp-suit",
      label: "Down suit or full expedition layering system",
      category: "clothing",
      detail:
        "Specified by the operator for the altitude, and usually hired or bought to their list.",
      essential: true,
      thirdParty: true,
    });
  }

  /* -- Documents ------------------------------------------------------------

     Only where a peak plausibly needs them. A local hill gets no permit row:
     a paperwork item that does not apply teaches people to skim the section
     where the items that do apply are.                                       */

  // A known permit belt, or a peak high enough that one is likely. The Alps are
  // excluded from the height rule: a 4,000 m alpine summit is climbed without a
  // climbing permit, and putting a permit row on Mont Blanc would send someone
  // looking for paperwork that does not exist. Hut bookings, which do, are
  // below.
  const permitBelt = where.himalaya || where.karakoram;
  const permitRegime = (permitBelt && m >= 3000) || (m >= 4500 && !where.alps);

  if (m >= 3000 || glaciated) {
    add({
      id: "doc-insurance",
      label: "Insurance covering mountaineering and helicopter rescue",
      category: "documents",
      detail:
        "Standard travel policies commonly exclude glacier travel, roped climbing and altitude. Read the exclusions rather than the headline, and carry the policy number.",
      essential: true,
      thirdParty: true,
    });
  }

  if (permitRegime) {
    add({
      id: "doc-permit",
      label: "Climbing permit and park or conservation fees",
      category: "documents",
      detail: where.himalaya
        ? "Himalayan permits are issued to a registered agency rather than to individuals, and park and municipality fees are charged separately."
        : where.karakoram
          ? "Expedition permits and briefings are arranged months ahead through a licensed local agency, and some ranges sit in restricted zones."
          : "Check whether the authority that governs this peak issues one — where a permit exists it is often arranged months ahead through a licensed agency.",
      // Certain in a known permit belt or on an expedition peak; a prompt to
      // check, rather than a claim, where it is inferred from height alone.
      essential: permitBelt || m >= 6000,
      thirdParty: true,
    });
  }

  if (m >= 5500 || where.himalaya || where.karakoram) {
    add({
      id: "doc-passport",
      label: "Passport and any visa the country requires",
      category: "documents",
      detail:
        "Check validity and entry rules for the country the peak sits in well before you travel.",
      essential: true,
      thirdParty: true,
    });
  }

  if (requiresGuide) {
    add({
      id: "doc-booking",
      label: "Guide or operator booking and their emergency numbers",
      category: "documents",
      detail:
        "If you are going with a guide or an operator, carry the confirmation and their kit list — theirs governs, not this one.",
      essential: false,
      thirdParty: true,
    });
  }

  if (where.alps && band >= 4) {
    add({
      id: "doc-hut",
      label: "Hut or refuge booking",
      category: "documents",
      detail:
        "Alpine huts are booked ahead, confirmations are checked on arrival, and cancellation deadlines are real.",
      essential: false,
      thirdParty: true,
    });
  }

  /* -- Group into categories ----------------------------------------------- */

  const categories = CATEGORY_ORDER.map((id) => ({
    id,
    label: CATEGORY_LABEL[id],
    items: items.filter((i) => i.category === id),
    // An empty category is dropped rather than rendered as a heading with
    // nothing beneath it, which reads as data we failed to load.
  })).filter((c) => c.items.length > 0);

  return { items, categories };
}

/* -------------------------------------------------------------------------- */
/* Completion                                                                  */
/* -------------------------------------------------------------------------- */

export interface CompletionResult {
  /**
   * Percent of APPLICABLE items resolved, 0–100.
   *
   * Zero when `applicable` is zero — which means "nothing to count", not
   * "nothing done". Callers MUST check `applicable` before rendering this as
   * progress; the checklist screen renders an unavailable state instead.
   */
  overall: number;
  byCategory: Record<ChecklistCategory, number>;
  /** Items counted — everything not struck out as "n/a". */
  applicable: number;
  resolved: number;
  /** Per category, so a caller can tell 0% from "nothing applicable here". */
  applicableByCategory: Record<ChecklistCategory, number>;
  /** Counts rather than percentages, so a caption never has to reverse the maths. */
  resolvedByCategory: Record<ChecklistCategory, number>;
}

const zeroByCategory = (): Record<ChecklistCategory, number> => ({
  technical: 0,
  clothing: 0,
  navigation: 0,
  nutrition: 0,
  safety: 0,
  documents: 0,
});

/**
 * How much of the list is sorted.
 *
 * "n/a" is removed from BOTH the numerator and the denominator. Counting an
 * item the athlete has struck out as outstanding would make the figure
 * meaningless — every list carries rows a given route does not need, and a
 * percentage that can never reach 100 is one people stop reading.
 *
 * An item with no status recorded counts as outstanding. Silence is not a claim
 * that something is packed.
 */
export function completion(
  items: ChecklistItem[],
  statuses: Record<string, ItemStatus>,
): CompletionResult {
  const applicableByCategory = zeroByCategory();
  const resolvedByCategory = zeroByCategory();
  let applicable = 0;
  let resolved = 0;

  for (const item of items) {
    const status = statuses[item.id];
    if (status === "n/a") continue;
    applicable += 1;
    applicableByCategory[item.category] += 1;
    if (isResolved(status)) {
      resolved += 1;
      resolvedByCategory[item.category] += 1;
    }
  }

  const byCategory = zeroByCategory();
  for (const category of CATEGORY_ORDER) {
    const total = applicableByCategory[category];
    byCategory[category] =
      total === 0 ? 0 : Math.round((resolvedByCategory[category] / total) * 100);
  }

  return {
    overall: applicable === 0 ? 0 : Math.round((resolved / applicable) * 100),
    byCategory,
    applicable,
    resolved,
    applicableByCategory,
    resolvedByCategory,
  };
}

/* -------------------------------------------------------------------------- */
/* Pack weights                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `base` is what you carry all day, `consumable` is eaten or burned, `water` is
 * the part that changes most between the valley and the summit. Separating them
 * is the whole point of weighing a pack: only one of the three is fixed.
 */
export type PackKind = "base" | "consumable" | "water";

export const PACK_KIND_LABEL: Record<PackKind, string> = {
  base: "Base",
  consumable: "Consumable",
  water: "Water",
};

export interface PackItem {
  id: string;
  label: string;
  /**
   * Grams, or NULL when the athlete has not weighed it.
   *
   * Null rather than zero, and this is not a style choice: a zero here would
   * enter every total as an item that weighs nothing, which is a measurement
   * ICEFALL never took. Unweighed items are excluded from the totals and are
   * named on screen so the total is never read as complete when it is not.
   */
  grams: number | null;
  kind: PackKind;
}

export interface PackTotals {
  base: number;
  consumable: number;
  water: number;
  total: number;
  /** How many items contributed a weight, and how many could not. */
  weighed: number;
  unweighed: number;
}

/** Sums only what was actually weighed. Never estimates the rest. */
export function packTotals(items: PackItem[]): PackTotals {
  const totals: PackTotals = {
    base: 0,
    consumable: 0,
    water: 0,
    total: 0,
    weighed: 0,
    unweighed: 0,
  };

  for (const item of items) {
    if (item.grams === null || !Number.isFinite(item.grams) || item.grams < 0) {
      totals.unweighed += 1;
      continue;
    }
    totals[item.kind] += item.grams;
    totals.total += item.grams;
    totals.weighed += 1;
  }

  return totals;
}

/** 12_450 → "12.45 kg". Grams below a kilogram stay in grams. */
export function fmtGrams(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${Math.round(grams)} g`;
}
