import type { TrainingDay, TrainingFocus } from "@/types";

/**
 * Fuelling.
 *
 * Two separate jobs live here and they are deliberately kept apart:
 *
 *   1. `fuellingFor` — guidance for a training day. General, scaled to how long
 *      the day is and how high it goes, and never individualised beyond what the
 *      caller actually knows.
 *   2. `estimateFromEntry` — reading a typed meal description against a food
 *      reference. It returns numbers only for foods it genuinely recognised, and
 *      returns nothing at all when it recognised nothing.
 *
 * The rules that shaped this file, in the order they matter:
 *
 *   NOTHING IS INVENTED TO FILL A CARD. A meal card with four blank macros looks
 *   worse than one with four plausible numbers in it, and that is exactly the
 *   trap. An estimate the athlete cannot distinguish from a measurement is a
 *   liability the moment they plan a long day around it. Unmatched description →
 *   every macro null, confidence "unavailable", and copy that says why.
 *
 *   NO DEFICITS, NO TARGETS, NO BODY COMPOSITION. There is no calorie goal in
 *   this module, no weight-loss guidance, and no line anywhere that makes eating
 *   less look like the disciplined choice. Every corrective steer in here is
 *   additive — eat this as well — never subtractive. Endurance athletes in the
 *   mountains under-fuel far more often than they over-fuel, and an app that
 *   nudges them further in that direction does real harm. This is a hard
 *   boundary, not a house style.
 *
 *   NOT CLINICAL. Nothing here treats, diagnoses or manages a condition. Where a
 *   need is genuinely clinical — a diagnosed illness, a restrictive diet, a
 *   difficult relationship with food — the answer is a registered dietitian or a
 *   doctor, and the module says so rather than improvising.
 *
 *   NO VISION. There is no image model on the device. A photograph is stored
 *   with an entry; it is never read into macros. See IMAGE_ANALYSIS_NOTE.
 */

/* -------------------------------------------------------------------------- */
/* Framing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Shown on every surface that presents fuelling guidance. It has to do two
 * things at once: refuse the clinical role, and refuse the weight-management
 * role that nutrition features in fitness apps drift into by default.
 */
export const NUTRITION_DISCLAIMER =
  "General fuelling guidance for training and recovery. It is not a prescription and not clinical advice, and it takes no account of medical conditions, medication, allergies or pregnancy. For anything clinical — a diagnosed condition, a restrictive diet, or a difficult relationship with food or eating — speak to a registered dietitian or your doctor. ICEFALL sets no weight or body-composition targets and will never advise you to eat less in order to reach one.";

/**
 * Shown wherever a meal photograph can be attached.
 *
 * Stated plainly because the expectation set by other apps is that a photograph
 * becomes macros. Here it does not, and a card that quietly produced numbers
 * beside a photograph would be read as having analysed it.
 */
export const IMAGE_ANALYSIS_NOTE =
  "A photograph is stored with the entry as a record — it is not read. There is no image model running in the app, so a picture cannot produce macronutrients on its own; automatic analysis would need a model running on a server, and even then what came back would be an estimate from an image rather than a measurement of what you ate. Type what was on the plate and the entry is matched against the food reference instead.";

/* -------------------------------------------------------------------------- */
/* Fuelling guidance                                                           */
/* -------------------------------------------------------------------------- */

export interface FuellingPlan {
  /** What this guidance was built from, including when that was very little. */
  context: string;
  before: string[];
  during: string[];
  after: string[];
  hydration: string[];
  /**
   * The one thing worth singling out today, or null when there is genuinely
   * nothing to single out. An emphasis manufactured for an empty day trains the
   * athlete to ignore the ones that matter.
   */
  emphasis: string | null;
}

/**
 * Where altitude starts changing fuelling advice in a way worth stating.
 * Below this the guidance is the same as at home; the number is a rough
 * convention, not a physiological threshold that applies to any individual.
 */
const ALTITUDE_NOTABLE_M = 2_500;
/** Higher again, where suppressed appetite is the commoner practical problem. */
const ALTITUDE_HIGH_M = 3_500;

/** Under this, a session does not need fuelling during it. Water covers it. */
const NO_FUEL_NEEDED_MIN = 75;
/** Past this, carbohydrate during the session stops being optional. */
const SUSTAINED_MIN = 150;
/** A genuine mountain day, where fuelling is planned rather than improvised. */
const LONG_DAY_MIN = 240;

/** Body masses outside this are treated as unknown rather than used. */
const MIN_PLAUSIBLE_MASS_KG = 30;
const MAX_PLAUSIBLE_MASS_KG = 250;

/**
 * A body mass we are willing to do arithmetic with, or null.
 *
 * A typo in a profile field must not turn into a gram figure on a fuelling card:
 * when the mass is missing or implausible the guidance drops to descriptive
 * portions instead of quietly computing from a bad number.
 */
function usableMass(kg?: number): number | null {
  if (typeof kg !== "number" || !Number.isFinite(kg)) return null;
  if (kg < MIN_PLAUSIBLE_MASS_KG || kg > MAX_PLAUSIBLE_MASS_KG) return null;
  return kg;
}

const FOCUS_LABEL: Record<TrainingFocus, string> = {
  recovery: "Recovery session",
  endurance: "Endurance session",
  strength: "Strength session",
  intervals: "Interval session",
  "long-mountain": "Long mountain day",
  rest: "Rest day",
  technical: "Technical session",
};

/** "45 min", "2 h 30", "5 h". Used in prose, so no leading zeros. */
function formatDuration(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

/** Rounded to something a person would actually say. */
function gramRange(low: number, high: number): string {
  return `${Math.round(low / 5) * 5}–${Math.round(high / 5) * 5} g`;
}

/**
 * Fuelling guidance for a training day.
 *
 * Everything is optional because the caller frequently knows very little — an
 * athlete who has not built a plan still opens this screen. The plan degrades to
 * general guidance and says so in `context` rather than inventing a session.
 */
export function fuellingFor(args: {
  day?: TrainingDay;
  durationMin?: number;
  focus?: TrainingFocus;
  bodyMassKg?: number;
  altitudeM?: number;
}): FuellingPlan {
  // The planned day wins over loose arguments — it is the more specific source.
  const focus: TrainingFocus | null = args.day?.focus ?? args.focus ?? null;
  const rawDuration = args.day?.durationMin ?? args.durationMin;
  const durationMin =
    typeof rawDuration === "number" && Number.isFinite(rawDuration) && rawDuration > 0
      ? rawDuration
      : null;
  const mass = usableMass(args.bodyMassKg);
  const altitudeM =
    typeof args.altitudeM === "number" && Number.isFinite(args.altitudeM) && args.altitudeM > 0
      ? args.altitudeM
      : null;

  const resting = focus === "rest";
  // A long-mountain day is long by definition even when nobody entered minutes.
  const long = focus === "long-mountain" || (durationMin !== null && durationMin >= LONG_DAY_MIN);
  const sustained = long || (durationMin !== null && durationMin >= SUSTAINED_MIN);
  const brief = durationMin !== null && durationMin < NO_FUEL_NEEDED_MIN;
  const highAltitude = altitudeM !== null && altitudeM >= ALTITUDE_NOTABLE_M;
  const veryHighAltitude = altitudeM !== null && altitudeM >= ALTITUDE_HIGH_M;

  /* ---- Context ---------------------------------------------------------- */

  const parts: string[] = [];
  if (focus) parts.push(FOCUS_LABEL[focus]);
  if (durationMin !== null) parts.push(`about ${formatDuration(durationMin)}`);
  if (altitudeM !== null) parts.push(`around ${altitudeM.toLocaleString("en-GB")} m`);

  const context =
    parts.length === 0
      ? "No session and no duration given for today, so this is general guidance only. Set today's session, or the hours you expect to be out, and the fuelling below sharpens to it."
      : `${parts.join(", ")}. ${
          durationMin === null && !resting
            ? "No duration set, so the guidance during the session is stated by the hour rather than for today specifically."
            : "Guidance below is general and scaled to that."
        }`;

  /* ---- Before ----------------------------------------------------------- */

  const before: string[] = [];
  if (resting) {
    before.push("Nothing to time today. Eat across the day as you normally would.");
  } else {
    before.push(
      "A carbohydrate-based meal two to three hours before, light on fat and fibre so it clears in time.",
    );
    before.push(
      "Inside the hour before, keep it small and simple — a banana, toast with honey, a handful of dried fruit.",
    );
    if (long) {
      before.push(
        mass !== null
          ? `Before a long day, 1–2 g of carbohydrate per kilogram in that earlier meal is a sensible starting point — roughly ${gramRange(mass, mass * 2)} for you. Adjust it to what you can actually eat at that hour.`
          : "Before a long day the meal beforehand is larger than a normal breakfast. No gram figure is given here because there is no usable body mass on your profile — add one and this becomes specific.",
      );
      before.push(
        "Carry more food than the plan requires. A day that runs long with nothing left to eat is how good decision-making goes.",
      );
    }
    if (focus === "strength" || focus === "intervals") {
      before.push(
        "Do not start quality work under-fuelled. It costs you the last sets, which are the ones the session was for.",
      );
    }
  }

  /* ---- During ----------------------------------------------------------- */

  const during: string[] = [];
  if (resting) {
    during.push("Nothing needed.");
  } else if (durationMin === null) {
    during.push(
      "Under about an hour and a quarter, water is enough. Past that, take carbohydrate with you — roughly 30–60 g an hour.",
    );
  } else if (brief) {
    during.push("Nothing needed beyond water for a session this length.");
  } else if (!sustained) {
    during.push(
      "30–60 g of carbohydrate an hour once you are past the first hour — a gel, a bar, or a sports drink does the same job.",
    );
  } else if (!long) {
    // Two and a half to four hours. The top of the range belongs to the day that
    // runs longer than this, so it is not quoted here as though it applied.
    during.push(
      "Around 60 g of carbohydrate an hour is a reasonable working figure for a session this length.",
    );
    during.push(
      "Start in the first hour. Fuelling that begins when you notice you need it has already begun too late.",
    );
  } else {
    during.push(
      "60–90 g of carbohydrate an hour, from more than one source rather than one product repeated.",
    );
    during.push(
      "Start in the first hour. Fuelling that begins when you notice you need it has already begun too late.",
    );
    during.push(
      "Practise this in training. A long objective is not the place to try a product you have never eaten while moving.",
    );
  }
  if (highAltitude && !resting) {
    during.push(
      "Feeling unwell at altitude is a medical matter, not a fuelling problem. Descend and get proper help rather than trying to eat through it.",
    );
  }

  /* ---- After ------------------------------------------------------------ */

  const after: string[] = [];
  if (resting) {
    after.push(
      "Protein spread across your meals does more for adaptation than any single serving after a session.",
    );
  } else {
    after.push(
      mass !== null
        ? `Protein within a couple of hours — around ${gramRange(mass * 0.25, mass * 0.4)} is a reasonable serving for you.`
        : "Protein within a couple of hours — a palm-sized portion is the usual shorthand. No gram figure is given because there is no usable body mass on your profile.",
    );
    after.push("Carbohydrate alongside it, and again at the next meal.");
    if (long && mass !== null) {
      after.push(
        `After a very long day, carbohydrate in the first few hours matters more than usual — in the region of ${gramRange(mass, mass * 1.2)} an hour early on, then back to normal meals.`,
      );
    }
  }
  // The single most useful line in the file. Stated for every kind of day.
  after.push(
    "If appetite is flat after a hard day, eat anyway. Under-eating after long days is the commonest fuelling error in mountain athletes, and it shows up in the following week's sessions rather than the same evening.",
  );

  /* ---- Hydration -------------------------------------------------------- */

  const hydration: string[] = [];
  hydration.push(
    "Drink to thirst through the day, and take a full drink with the meal afterwards.",
  );
  if (sustained && !resting) {
    hydration.push(
      "Past two hours, take sodium with your fluid rather than water alone. Sweat rates vary several-fold between people, so any figure you read is a starting point to be tested in training, not a target.",
    );
    hydration.push(
      "Drinking far beyond thirst on a long day carries its own risk. More is not automatically safer.",
    );
  }
  if (highAltitude) {
    hydration.push(
      "Fluid losses rise at altitude through dry air and faster breathing, while thirst tends to lag. Drink on a rhythm rather than waiting to want it.",
    );
  }
  if (veryHighAltitude) {
    hydration.push(
      "Appetite usually falls at this height too. Carbohydrate is generally the easiest thing to keep down — carry food you actually like, not food that is theoretically optimal.",
    );
  }

  /* ---- Emphasis --------------------------------------------------------- */

  // One line, chosen by what is most consequential today. Null when the caller
  // told us nothing — there is no honest single point to make about a blank day.
  let emphasis: string | null = null;
  if (veryHighAltitude) {
    emphasis =
      "At this height, eating and drinking are deliberate acts. Appetite and thirst both fall away before your requirement does.";
  } else if (long) {
    emphasis =
      "Carbohydrate, early and repeatedly. Long days come apart because fuelling started late far more often than because it was too small.";
  } else if (sustained) {
    emphasis = "Begin fuelling in the first hour rather than at the point you feel it.";
  } else if (highAltitude) {
    emphasis = "Drink on a schedule today. Thirst is an unreliable guide at this height.";
  } else if (focus === "strength" || focus === "intervals") {
    emphasis =
      "Carbohydrate before quality work. It is what the session actually spends, and the last efforts are where the adaptation is.";
  } else if (focus === "rest" || focus === "recovery") {
    emphasis =
      "Easy days are when last week's training is absorbed. Eating lightly because you trained lightly undoes the work you already did.";
  } else if (focus === "endurance" || focus === "technical" || durationMin !== null) {
    emphasis = "Eat properly around the session and drink to thirst. Nothing else needs managing.";
  }

  return { context, before, during, after, hydration, emphasis };
}

/* -------------------------------------------------------------------------- */
/* Food reference                                                              */
/* -------------------------------------------------------------------------- */

/**
 * One food, described at a stated portion.
 *
 * These are rounded reference figures for ordinary portions of ordinary foods.
 * They are not brand-specific, they are not weighed, and two servings of the
 * same dish differ more than any of these numbers imply. `portionLabel` is
 * carried through to the UI precisely so the portion is never implicit — the
 * athlete can see that "chicken breast" meant 120 g and disagree with it.
 *
 * Composite dishes are largely absent on purpose. A "curry" or a "salad" varies
 * so widely that a single figure would be a guess dressed as a lookup, and the
 * honest response to one is `unavailable`.
 */
interface FoodEntry {
  id: string;
  label: string;
  /** Matched case-insensitively on word boundaries; a trailing "s" is tolerated. */
  aliases: string[];
  portionLabel: string;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Mass of one portion, so a stated weight can rescale it honestly. */
  gramsPerPortion?: number;
  /** Volume of one portion, for liquids. */
  mlPerPortion?: number;
  /** True when a bare leading number means "this many of them" — 2 eggs. */
  countable?: boolean;
  /** Set when one portion is a spoonful, so "2 tbsp" scales correctly. */
  spoon?: "tbsp" | "tsp";
}

const FOODS: FoodEntry[] = [
  /* ---- Eggs, dairy ---------------------------------------------------- */
  {
    id: "egg",
    label: "Egg",
    aliases: ["egg", "boiled egg", "fried egg", "poached egg", "scrambled egg"],
    portionLabel: "1 large",
    proteinG: 6,
    carbsG: 0,
    fatG: 5,
    gramsPerPortion: 50,
    countable: true,
  },
  {
    id: "greek-yoghurt",
    label: "Greek yoghurt",
    aliases: ["greek yoghurt", "greek yogurt"],
    portionLabel: "170 g pot",
    proteinG: 15,
    carbsG: 6,
    fatG: 5,
    gramsPerPortion: 170,
    countable: true,
  },
  {
    id: "yoghurt",
    label: "Plain yoghurt",
    aliases: ["yoghurt", "yogurt"],
    portionLabel: "150 g pot",
    proteinG: 8,
    carbsG: 10,
    fatG: 5,
    gramsPerPortion: 150,
    countable: true,
  },
  {
    id: "milk",
    label: "Whole milk",
    aliases: ["milk", "whole milk"],
    portionLabel: "250 ml glass",
    proteinG: 8,
    carbsG: 12,
    fatG: 8,
    mlPerPortion: 250,
    countable: true,
  },
  {
    id: "semi-milk",
    label: "Semi-skimmed milk",
    aliases: ["semi skimmed milk", "skimmed milk"],
    portionLabel: "250 ml glass",
    proteinG: 9,
    carbsG: 12,
    fatG: 4,
    mlPerPortion: 250,
    countable: true,
  },
  {
    id: "oat-milk",
    label: "Oat milk",
    aliases: ["oat milk", "oatmilk"],
    portionLabel: "250 ml glass",
    proteinG: 2,
    carbsG: 15,
    fatG: 4,
    mlPerPortion: 250,
    countable: true,
  },
  {
    id: "cheddar",
    label: "Cheddar",
    aliases: ["cheddar", "cheese"],
    portionLabel: "30 g",
    proteinG: 8,
    carbsG: 0,
    fatG: 10,
    gramsPerPortion: 30,
  },
  {
    id: "mozzarella",
    label: "Mozzarella",
    aliases: ["mozzarella"],
    portionLabel: "60 g",
    proteinG: 12,
    carbsG: 1,
    fatG: 10,
    gramsPerPortion: 60,
  },
  {
    id: "halloumi",
    label: "Halloumi",
    aliases: ["halloumi"],
    portionLabel: "60 g",
    proteinG: 12,
    carbsG: 1,
    fatG: 15,
    gramsPerPortion: 60,
  },
  {
    id: "cottage-cheese",
    label: "Cottage cheese",
    aliases: ["cottage cheese"],
    portionLabel: "100 g",
    proteinG: 12,
    carbsG: 4,
    fatG: 4,
    gramsPerPortion: 100,
  },
  {
    id: "butter",
    label: "Butter",
    aliases: ["butter"],
    portionLabel: "10 g",
    proteinG: 0,
    carbsG: 0,
    fatG: 8,
    gramsPerPortion: 10,
    spoon: "tsp",
  },

  /* ---- Meat, fish ------------------------------------------------------ */
  {
    id: "chicken-breast",
    label: "Chicken breast",
    aliases: ["chicken breast", "chicken"],
    portionLabel: "120 g cooked",
    proteinG: 35,
    carbsG: 0,
    fatG: 4,
    gramsPerPortion: 120,
  },
  {
    id: "turkey",
    label: "Turkey breast",
    aliases: ["turkey breast", "turkey"],
    portionLabel: "120 g cooked",
    proteinG: 35,
    carbsG: 0,
    fatG: 2,
    gramsPerPortion: 120,
  },
  {
    id: "beef-mince",
    label: "Beef mince",
    aliases: ["beef mince", "minced beef", "mince"],
    portionLabel: "100 g cooked",
    proteinG: 25,
    carbsG: 0,
    fatG: 8,
    gramsPerPortion: 100,
  },
  {
    id: "steak",
    label: "Steak",
    aliases: ["steak", "beef steak"],
    portionLabel: "150 g cooked",
    proteinG: 40,
    carbsG: 0,
    fatG: 12,
    gramsPerPortion: 150,
    countable: true,
  },
  {
    id: "pork-chop",
    label: "Pork chop",
    aliases: ["pork chop", "pork"],
    portionLabel: "130 g cooked",
    proteinG: 35,
    carbsG: 0,
    fatG: 12,
    gramsPerPortion: 130,
    countable: true,
  },
  {
    id: "salmon",
    label: "Salmon",
    aliases: ["salmon"],
    portionLabel: "120 g fillet",
    proteinG: 25,
    carbsG: 0,
    fatG: 15,
    gramsPerPortion: 120,
    countable: true,
  },
  {
    id: "tuna",
    label: "Tuna",
    aliases: ["tuna"],
    portionLabel: "100 g tin, drained",
    proteinG: 25,
    carbsG: 0,
    fatG: 1,
    gramsPerPortion: 100,
    countable: true,
  },
  {
    id: "sardines",
    label: "Sardines",
    aliases: ["sardine"],
    portionLabel: "100 g tin",
    proteinG: 25,
    carbsG: 0,
    fatG: 10,
    gramsPerPortion: 100,
    countable: true,
  },
  {
    id: "prawns",
    label: "Prawns",
    aliases: ["prawn", "shrimp"],
    portionLabel: "100 g",
    proteinG: 20,
    carbsG: 0,
    fatG: 1,
    gramsPerPortion: 100,
  },

  /* ---- Starches -------------------------------------------------------- */
  {
    id: "oats",
    label: "Porridge oats",
    aliases: ["porridge", "oats", "oatmeal"],
    portionLabel: "50 g dry",
    proteinG: 6,
    carbsG: 30,
    fatG: 4,
    gramsPerPortion: 50,
  },
  {
    id: "muesli",
    label: "Muesli",
    aliases: ["muesli"],
    portionLabel: "50 g",
    proteinG: 6,
    carbsG: 30,
    fatG: 5,
    gramsPerPortion: 50,
  },
  {
    id: "granola",
    label: "Granola",
    aliases: ["granola"],
    portionLabel: "50 g",
    proteinG: 5,
    carbsG: 30,
    fatG: 10,
    gramsPerPortion: 50,
  },
  {
    id: "white-rice",
    label: "White rice",
    aliases: ["white rice", "rice"],
    portionLabel: "180 g cooked",
    proteinG: 4,
    carbsG: 55,
    fatG: 0,
    gramsPerPortion: 180,
  },
  {
    id: "brown-rice",
    label: "Brown rice",
    aliases: ["brown rice"],
    portionLabel: "180 g cooked",
    proteinG: 5,
    carbsG: 50,
    fatG: 2,
    gramsPerPortion: 180,
  },
  {
    id: "pasta",
    label: "Pasta",
    aliases: ["pasta", "spaghetti", "penne", "noodles"],
    portionLabel: "200 g cooked",
    proteinG: 10,
    carbsG: 60,
    fatG: 1,
    gramsPerPortion: 200,
  },
  {
    id: "couscous",
    label: "Couscous",
    aliases: ["couscous"],
    portionLabel: "150 g cooked",
    proteinG: 5,
    carbsG: 35,
    fatG: 0,
    gramsPerPortion: 150,
  },
  {
    id: "quinoa",
    label: "Quinoa",
    aliases: ["quinoa"],
    portionLabel: "150 g cooked",
    proteinG: 6,
    carbsG: 30,
    fatG: 3,
    gramsPerPortion: 150,
  },
  {
    id: "bread",
    label: "White bread",
    aliases: ["bread", "toast", "slice of bread"],
    portionLabel: "1 slice, 40 g",
    proteinG: 4,
    carbsG: 18,
    fatG: 1,
    gramsPerPortion: 40,
    countable: true,
  },
  {
    id: "wholemeal-bread",
    label: "Wholemeal bread",
    aliases: ["wholemeal bread", "brown bread", "wholemeal toast"],
    portionLabel: "1 slice, 40 g",
    proteinG: 4,
    carbsG: 16,
    fatG: 1,
    gramsPerPortion: 40,
    countable: true,
  },
  {
    id: "bagel",
    label: "Bagel",
    aliases: ["bagel"],
    portionLabel: "1, 85 g",
    proteinG: 10,
    carbsG: 50,
    fatG: 1,
    gramsPerPortion: 85,
    countable: true,
  },
  {
    id: "wrap",
    label: "Tortilla wrap",
    aliases: ["wrap", "tortilla"],
    portionLabel: "1, 60 g",
    proteinG: 6,
    carbsG: 30,
    fatG: 4,
    gramsPerPortion: 60,
    countable: true,
  },
  {
    id: "potato",
    label: "Potato",
    aliases: ["potato", "boiled potato", "jacket potato"],
    portionLabel: "1 medium, 180 g",
    proteinG: 4,
    carbsG: 30,
    fatG: 0,
    gramsPerPortion: 180,
    countable: true,
  },
  {
    id: "sweet-potato",
    label: "Sweet potato",
    aliases: ["sweet potato"],
    portionLabel: "1 medium, 150 g",
    proteinG: 3,
    carbsG: 30,
    fatG: 0,
    gramsPerPortion: 150,
    countable: true,
  },
  {
    id: "chips",
    label: "Chips",
    aliases: ["chips", "fries"],
    portionLabel: "150 g",
    proteinG: 5,
    carbsG: 45,
    fatG: 15,
    gramsPerPortion: 150,
  },
  {
    id: "rice-cakes",
    label: "Rice cakes",
    aliases: ["rice cake"],
    portionLabel: "1, 9 g",
    proteinG: 1,
    carbsG: 7,
    fatG: 0,
    gramsPerPortion: 9,
    countable: true,
  },

  /* ---- Pulses, plant protein ------------------------------------------ */
  {
    id: "lentils",
    label: "Lentils",
    aliases: ["lentil"],
    portionLabel: "200 g cooked",
    proteinG: 15,
    carbsG: 35,
    fatG: 1,
    gramsPerPortion: 200,
  },
  {
    id: "chickpeas",
    label: "Chickpeas",
    aliases: ["chickpea"],
    portionLabel: "200 g cooked",
    proteinG: 15,
    carbsG: 40,
    fatG: 5,
    gramsPerPortion: 200,
  },
  {
    id: "black-beans",
    label: "Black beans",
    aliases: ["black bean", "kidney bean"],
    portionLabel: "200 g cooked",
    proteinG: 15,
    carbsG: 35,
    fatG: 1,
    gramsPerPortion: 200,
  },
  {
    id: "baked-beans",
    label: "Baked beans",
    aliases: ["baked bean"],
    portionLabel: "200 g",
    proteinG: 10,
    carbsG: 35,
    fatG: 1,
    gramsPerPortion: 200,
  },
  {
    id: "tofu",
    label: "Tofu",
    aliases: ["tofu"],
    portionLabel: "150 g",
    proteinG: 18,
    carbsG: 3,
    fatG: 10,
    gramsPerPortion: 150,
  },
  {
    id: "hummus",
    label: "Hummus",
    aliases: ["hummus", "houmous"],
    portionLabel: "50 g",
    proteinG: 4,
    carbsG: 6,
    fatG: 8,
    gramsPerPortion: 50,
  },

  /* ---- Fruit, vegetables ---------------------------------------------- */
  {
    id: "banana",
    label: "Banana",
    aliases: ["banana"],
    portionLabel: "1 medium, 120 g",
    proteinG: 1,
    carbsG: 25,
    fatG: 0,
    gramsPerPortion: 120,
    countable: true,
  },
  {
    id: "apple",
    label: "Apple",
    aliases: ["apple"],
    portionLabel: "1 medium, 150 g",
    proteinG: 0,
    carbsG: 20,
    fatG: 0,
    gramsPerPortion: 150,
    countable: true,
  },
  {
    id: "orange",
    label: "Orange",
    aliases: ["orange"],
    portionLabel: "1 medium, 130 g",
    proteinG: 1,
    carbsG: 15,
    fatG: 0,
    gramsPerPortion: 130,
    countable: true,
  },
  {
    id: "berries",
    label: "Berries",
    aliases: ["berries", "blueberries", "strawberries", "raspberries"],
    portionLabel: "100 g",
    proteinG: 1,
    carbsG: 10,
    fatG: 0,
    gramsPerPortion: 100,
  },
  {
    id: "avocado",
    label: "Avocado",
    aliases: ["avocado"],
    portionLabel: "half, 75 g",
    proteinG: 2,
    carbsG: 2,
    fatG: 15,
    gramsPerPortion: 75,
    countable: true,
  },
  {
    id: "broccoli",
    label: "Broccoli",
    aliases: ["broccoli"],
    portionLabel: "100 g",
    proteinG: 3,
    carbsG: 5,
    fatG: 0,
    gramsPerPortion: 100,
  },
  {
    id: "spinach",
    label: "Spinach",
    aliases: ["spinach"],
    portionLabel: "80 g",
    proteinG: 2,
    carbsG: 1,
    fatG: 0,
    gramsPerPortion: 80,
  },
  {
    id: "salad",
    label: "Mixed salad leaves",
    aliases: ["salad leaves", "mixed salad", "green salad"],
    portionLabel: "100 g",
    proteinG: 1,
    carbsG: 3,
    fatG: 0,
    gramsPerPortion: 100,
  },
  {
    id: "tomato",
    label: "Tomato",
    aliases: ["tomato", "tomatoes"],
    portionLabel: "1 medium, 120 g",
    proteinG: 1,
    carbsG: 3,
    fatG: 0,
    gramsPerPortion: 120,
    countable: true,
  },
  {
    id: "carrot",
    label: "Carrot",
    aliases: ["carrot"],
    portionLabel: "1 medium, 80 g",
    proteinG: 1,
    carbsG: 7,
    fatG: 0,
    gramsPerPortion: 80,
    countable: true,
  },
  {
    id: "dried-apricots",
    label: "Dried apricots",
    aliases: ["dried apricot", "apricot"],
    portionLabel: "40 g",
    proteinG: 1,
    carbsG: 25,
    fatG: 0,
    gramsPerPortion: 40,
  },
  {
    id: "raisins",
    label: "Raisins",
    aliases: ["raisin", "sultanas"],
    portionLabel: "40 g",
    proteinG: 1,
    carbsG: 30,
    fatG: 0,
    gramsPerPortion: 40,
  },

  /* ---- Fats, spreads --------------------------------------------------- */
  {
    id: "olive-oil",
    label: "Olive oil",
    aliases: ["olive oil", "oil"],
    portionLabel: "1 tbsp, 14 ml",
    proteinG: 0,
    carbsG: 0,
    fatG: 14,
    mlPerPortion: 14,
    spoon: "tbsp",
  },
  {
    id: "peanut-butter",
    label: "Peanut butter",
    aliases: ["peanut butter"],
    portionLabel: "30 g",
    proteinG: 7,
    carbsG: 6,
    fatG: 15,
    gramsPerPortion: 30,
    spoon: "tbsp",
  },
  {
    id: "almonds",
    label: "Almonds",
    aliases: ["almond"],
    portionLabel: "30 g",
    proteinG: 6,
    carbsG: 4,
    fatG: 15,
    gramsPerPortion: 30,
  },
  {
    id: "walnuts",
    label: "Walnuts",
    aliases: ["walnut"],
    portionLabel: "30 g",
    proteinG: 4,
    carbsG: 2,
    fatG: 20,
    gramsPerPortion: 30,
  },
  {
    id: "cashews",
    label: "Cashews",
    aliases: ["cashew"],
    portionLabel: "30 g",
    proteinG: 5,
    carbsG: 9,
    fatG: 13,
    gramsPerPortion: 30,
  },
  {
    id: "mixed-nuts",
    label: "Mixed nuts",
    aliases: ["mixed nuts", "nuts"],
    portionLabel: "30 g",
    proteinG: 5,
    carbsG: 5,
    fatG: 15,
    gramsPerPortion: 30,
  },
  {
    id: "honey",
    label: "Honey",
    aliases: ["honey"],
    portionLabel: "1 tbsp, 20 g",
    proteinG: 0,
    carbsG: 15,
    fatG: 0,
    gramsPerPortion: 20,
    spoon: "tbsp",
  },
  {
    id: "jam",
    label: "Jam",
    aliases: ["jam"],
    portionLabel: "20 g",
    proteinG: 0,
    carbsG: 12,
    fatG: 0,
    gramsPerPortion: 20,
    spoon: "tbsp",
  },

  /* ---- Sports food, convenience --------------------------------------- */
  {
    id: "whey",
    label: "Whey protein",
    aliases: ["protein shake", "whey", "protein powder"],
    portionLabel: "1 scoop, 30 g",
    proteinG: 24,
    carbsG: 2,
    fatG: 2,
    gramsPerPortion: 30,
    countable: true,
  },
  {
    id: "gel",
    label: "Energy gel",
    aliases: ["energy gel", "gel"],
    portionLabel: "1 sachet, 40 g",
    proteinG: 0,
    carbsG: 22,
    fatG: 0,
    gramsPerPortion: 40,
    countable: true,
  },
  {
    id: "energy-bar",
    label: "Energy bar",
    aliases: ["energy bar", "protein bar"],
    portionLabel: "1, 50 g",
    proteinG: 5,
    carbsG: 30,
    fatG: 6,
    gramsPerPortion: 50,
    countable: true,
  },
  {
    id: "cereal-bar",
    label: "Cereal bar",
    aliases: ["cereal bar"],
    portionLabel: "1, 30 g",
    proteinG: 2,
    carbsG: 20,
    fatG: 4,
    gramsPerPortion: 30,
    countable: true,
  },
  {
    id: "flapjack",
    label: "Flapjack",
    aliases: ["flapjack"],
    portionLabel: "1, 60 g",
    proteinG: 4,
    carbsG: 35,
    fatG: 12,
    gramsPerPortion: 60,
    countable: true,
  },
  {
    id: "sports-drink",
    label: "Sports drink",
    aliases: ["sports drink", "isotonic drink"],
    portionLabel: "500 ml",
    proteinG: 0,
    carbsG: 30,
    fatG: 0,
    mlPerPortion: 500,
    countable: true,
  },
  {
    id: "chocolate",
    label: "Milk chocolate",
    aliases: ["chocolate"],
    portionLabel: "40 g",
    proteinG: 3,
    carbsG: 22,
    fatG: 12,
    gramsPerPortion: 40,
  },
  {
    id: "pizza",
    label: "Pizza",
    aliases: ["pizza slice", "pizza"],
    portionLabel: "1 slice, 110 g",
    proteinG: 10,
    carbsG: 35,
    fatG: 10,
    gramsPerPortion: 110,
    countable: true,
  },
  {
    id: "burger",
    label: "Beef burger in a bun",
    aliases: ["burger", "hamburger", "cheeseburger"],
    portionLabel: "1",
    proteinG: 25,
    carbsG: 35,
    fatG: 20,
    gramsPerPortion: 220,
    countable: true,
  },
  {
    id: "vegetable-soup",
    label: "Vegetable soup",
    aliases: ["vegetable soup", "soup"],
    portionLabel: "300 ml",
    proteinG: 3,
    carbsG: 20,
    fatG: 3,
    mlPerPortion: 300,
    countable: true,
  },

  /* ---- Drinks with no meaningful macros -------------------------------- */
  // Present so they are recognised rather than reported as unmatched. Their
  // zeros are real zeros, not stand-ins for missing data.
  {
    id: "coffee",
    label: "Black coffee",
    aliases: ["coffee", "espresso", "americano"],
    portionLabel: "1 cup",
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    mlPerPortion: 250,
    countable: true,
  },
  {
    id: "tea",
    label: "Tea",
    aliases: ["tea"],
    portionLabel: "1 cup",
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    mlPerPortion: 250,
    countable: true,
  },
  {
    id: "water",
    label: "Water",
    aliases: ["water"],
    portionLabel: "250 ml",
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    mlPerPortion: 250,
    countable: true,
  },
];

/**
 * Alcoholic drinks are deliberately absent from the lookup.
 *
 * Their energy is mostly in the alcohol itself, which the 4/4/9 arithmetic used
 * here cannot represent — including them would systematically understate an
 * entry while looking complete. Recognising the words lets the note say so
 * instead of silently dropping them.
 */
const ALCOHOL_TERMS = [
  "beer",
  "lager",
  "ale",
  "cider",
  "wine",
  "prosecco",
  "champagne",
  "whisky",
  "whiskey",
  "vodka",
  "gin",
  "rum",
  "spirits",
  "cocktail",
];

/** Energy per gram. Standard Atwater factors, used only to derive kcal. */
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;
const KCAL_PER_G_FAT = 9;

/* -------------------------------------------------------------------------- */
/* Meal estimation                                                             */
/* -------------------------------------------------------------------------- */

export interface MealEstimate {
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  kcal: number | null;
  /**
   *  - `logged`      the athlete typed the figures; we used theirs
   *  - `estimated`   matched against the food reference at typical portions
   *  - `unavailable` nothing recognised, so nothing is shown
   */
  confidence: "logged" | "estimated" | "unavailable";
  /** Always populated. Says where the numbers came from, or why there are none. */
  note: string;
  /** The foods recognised, at the portions used — the card shows its working. */
  matched: string[];
}

/** A resolved alias, precompiled once. Longest first so "peanut butter" beats "butter". */
interface AliasPattern {
  entry: FoodEntry;
  alias: string;
  re: RegExp;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ALIAS_PATTERNS: AliasPattern[] = FOODS.flatMap((entry) =>
  entry.aliases.map((alias) => ({
    entry,
    alias,
    // Word-boundary anchored: without it "tea" matches inside "steak" and
    // "oil" inside "boiled", and the card fills with foods nobody ate.
    re: new RegExp(`\\b${escapeRegExp(alias)}(?:e?s)?\\b`, "i"),
  })),
).sort((a, b) => b.alias.length - a.alias.length);

const ALCOHOL_RE = new RegExp(`\\b(?:${ALCOHOL_TERMS.map(escapeRegExp).join("|")})s?\\b`, "i");

/** A single portion multiplier can only get so large before it is a typo. */
const MAX_FACTOR = 20;
/** And the whole-entry multiplier likewise. */
const MAX_PORTIONS = 10;

interface Hit {
  entry: FoodEntry;
  factor: number;
  /** Human-readable, e.g. "2 × egg (1 large)". */
  display: string;
}

/**
 * Words that mean "one helping of" rather than a measured amount.
 *
 * They must be tolerated between the number and the food, because "2 slices of
 * toast" read as one slice is an undercount the athlete has no way of noticing —
 * they typed the two. When one of these is present the number multiplies
 * portions even for foods that are not otherwise countable: two bowls of rice is
 * two servings of rice by any reading.
 */
const SERVING_WORDS =
  "slices?|pieces?|scoops?|tins?|cans?|glass(?:es)?|cups?|bowls?|plates?|pots?|sachets?|bars?|handfuls?|servings?|portions?|pints?";

/**
 * Read a quantity sitting immediately before a matched food name.
 *
 * Only the text directly abutting the match is considered — "200 g of chicken"
 * yes, "200 g of rice with chicken" no — because a number that has drifted away
 * from the food it qualifies is more likely to belong to something else.
 */
function quantityBefore(
  pre: string,
  entry: FoodEntry,
): { factor: number; unitApplied: boolean; mismatch: boolean } {
  const m = new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*(kg|g|ml|l|litre|litres|tbsp|tsp)?\\s*(?:(${SERVING_WORDS})\\s*)?(?:of\\s+)?$`,
    "i",
  ).exec(pre);
  if (!m) return { factor: 1, unitApplied: false, mismatch: false };

  const value = Number.parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0)
    return { factor: 1, unitApplied: false, mismatch: false };
  const unit = m[2]?.toLowerCase();
  const servingWord = m[3] !== undefined;

  if (unit === "g" || unit === "kg") {
    const grams = unit === "kg" ? value * 1000 : value;
    if (entry.gramsPerPortion)
      return { factor: grams / entry.gramsPerPortion, unitApplied: true, mismatch: false };
    // A weight given for something we only hold by volume cannot be converted
    // without assuming a density. Fall back to one portion and say so.
    return { factor: 1, unitApplied: false, mismatch: true };
  }

  if (unit === "ml" || unit === "l" || unit === "litre" || unit === "litres") {
    const ml = unit === "ml" ? value : value * 1000;
    if (entry.mlPerPortion)
      return { factor: ml / entry.mlPerPortion, unitApplied: true, mismatch: false };
    return { factor: 1, unitApplied: false, mismatch: true };
  }

  if (unit === "tbsp" || unit === "tsp") {
    if (!entry.spoon) return { factor: 1, unitApplied: false, mismatch: true };
    // Three teaspoons to a tablespoon, in both directions.
    const ratio = unit === entry.spoon ? 1 : unit === "tsp" ? 1 / 3 : 3;
    return { factor: value * ratio, unitApplied: true, mismatch: false };
  }

  // A bare number. Meaningful for things that come in units, and for anything
  // at all once a serving word has made the unit explicit.
  if (entry.countable || servingWord) return { factor: value, unitApplied: true, mismatch: false };
  return { factor: 1, unitApplied: false, mismatch: false };
}

/** Trims a factor to something a human could plausibly have eaten. */
function clampFactor(factor: number): { factor: number; clamped: boolean } {
  if (!Number.isFinite(factor) || factor <= 0) return { factor: 1, clamped: true };
  if (factor > MAX_FACTOR) return { factor: MAX_FACTOR, clamped: true };
  return { factor, clamped: false };
}

/** "2 ×", "1.5 ×", or nothing at all when it is a single portion. */
function factorPrefix(factor: number): string {
  if (Math.abs(factor - 1) < 0.05) return "";
  const rounded = Math.round(factor * 10) / 10;
  return `${rounded} × `;
}

/**
 * A fragment that removes something rather than adding it.
 *
 * The reference can only add foods up. "Burger without cheese" contains the word
 * cheese, and a lookup that simply counts every food name it sees would add the
 * cheese the athlete explicitly said was not there. Rather than attempt
 * subtraction, such a fragment is left uncounted and reported as unrecognised —
 * a stated gap the athlete can correct, instead of a silent overcount.
 *
 * `\bno\b` is deliberately whole-word: it must not fire inside "noodles".
 */
const NEGATION_RE = /\b(?:without|no|not|hold the|free from|minus|except|instead of)\b/i;

interface MatchResult {
  hits: Hit[];
  unmatched: string[];
  clamped: boolean;
  unitMismatch: boolean;
  alcohol: boolean;
  negation: boolean;
}

function matchFoods(description: string): MatchResult {
  const hits: Hit[] = [];
  const unmatched: string[] = [];
  let clamped = false;
  let unitMismatch = false;
  let negation = false;

  // Split first, normalise second: the separators are the punctuation.
  const fragments = description.split(/[,;\n/]|\+|&|\band\b|\bwith\b|\bplus\b/i);

  for (const fragment of fragments) {
    const original = fragment.trim();
    if (!original || !/[a-z]/i.test(original)) continue;

    if (NEGATION_RE.test(original)) {
      negation = true;
      unmatched.push(original);
      continue;
    }

    // Matched spans are blanked as we go so a shorter alias cannot re-match
    // inside the text a longer one already claimed.
    let working = original;
    let found = false;

    for (const pattern of ALIAS_PATTERNS) {
      const m = pattern.re.exec(working);
      if (!m) continue;

      const q = quantityBefore(working.slice(0, m.index), pattern.entry);
      if (q.mismatch) unitMismatch = true;
      const c = clampFactor(q.factor);
      if (c.clamped) clamped = true;

      hits.push({
        entry: pattern.entry,
        factor: c.factor,
        display: `${factorPrefix(c.factor)}${pattern.entry.label} (${pattern.entry.portionLabel})`,
      });
      found = true;

      working = `${working.slice(0, m.index)} ${working.slice(m.index + m[0].length)}`;
    }

    if (!found) unmatched.push(original);
  }

  return {
    hits,
    unmatched,
    clamped,
    unitMismatch,
    negation,
    alcohol: ALCOHOL_RE.test(description),
  };
}

/* ---- Explicitly typed figures --------------------------------------------- */

/**
 * Figures the athlete typed off a packet are data, not an estimate, and must not
 * be downgraded to one. When any are present they are used on their own — mixing
 * a declared 40 g of protein with a looked-up 60 g of carbohydrate in the same
 * card would present two very different kinds of number identically.
 */
interface DeclaredMacros {
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  kcal: number | null;
  any: boolean;
}

/**
 * Words that turn a macronutrient name back into a food name.
 *
 * "40 g protein shake" is a 40 g scoop of powder, not 40 grams of protein, and
 * reading it as the latter would put a wrong number on the card under the
 * strongest confidence label in the module. Anything followed by one of these is
 * left to the food reference, where it belongs.
 */
const MACRO_WORD_IS_A_FOOD = /^\s*(?:shakes?|bars?|powders?|drinks?|smoothies?|balls?|pots?)\b/i;

function declaredNumber(text: string, keyword: string): number | null {
  // Both orders people actually type: "40g protein" and "protein 40g".
  const before = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*g?\\s*(?:of\\s+)?${keyword}`, "i").exec(text);
  const after = new RegExp(`${keyword}\\s*[:=]?\\s*(\\d+(?:[.,]\\d+)?)\\s*g?`, "i").exec(text);

  const hit = before ?? after;
  if (!hit) return null;
  // Reject the food reading before accepting the macro reading.
  if (MACRO_WORD_IS_A_FOOD.test(text.slice(hit.index + hit[0].length))) return null;

  const n = Number.parseFloat(hit[1].replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function readDeclared(text: string): DeclaredMacros {
  const proteinG = declaredNumber(text, "protein");
  const carbsG = declaredNumber(text, "(?:carbs|carbohydrates|carbohydrate|carb)");
  const fatG = declaredNumber(text, "fat");
  const kcalMatch = /(\d+(?:[.,]\d+)?)\s*(?:kcal|calories|cals|cal)\b/i.exec(text);
  const kcal = kcalMatch ? Number.parseFloat(kcalMatch[1].replace(",", ".")) : null;
  return {
    proteinG,
    carbsG,
    fatG,
    kcal: kcal !== null && Number.isFinite(kcal) && kcal >= 0 ? kcal : null,
    any: proteinG !== null || carbsG !== null || fatG !== null || kcal !== null,
  };
}

/** Derived, not measured — and only when all three parts are actually present. */
function deriveKcal(p: number | null, c: number | null, f: number | null): number | null {
  if (p === null || c === null || f === null) return null;
  const kcal = p * KCAL_PER_G_PROTEIN + c * KCAL_PER_G_CARB + f * KCAL_PER_G_FAT;
  // Rounded to ten: the inputs do not support finer precision and showing 1,247
  // kcal from a lookup implies a measurement that never happened.
  return Math.round(kcal / 10) * 10;
}

const NAMES_OF = (missing: string[]): string =>
  missing.length === 1
    ? missing[0]
    : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;

/**
 * Estimate a meal from what the athlete typed.
 *
 * Three outcomes, and only three:
 *   - they typed the figures        → `logged`, their numbers, nothing invented
 *   - foods were recognised         → `estimated`, reference portions, working shown
 *   - nothing was recognised        → `unavailable`, every macro null
 *
 * There is no fourth branch that produces a number for an unrecognised meal.
 */
export function estimateFromEntry(entry: { description: string; portions?: number }): MealEstimate {
  const description = (entry.description ?? "").trim();
  const rawPortions = entry.portions;
  const portions =
    typeof rawPortions === "number" && Number.isFinite(rawPortions) && rawPortions > 0
      ? Math.min(rawPortions, MAX_PORTIONS)
      : 1;

  if (!description) {
    return {
      proteinG: null,
      carbsG: null,
      fatG: null,
      kcal: null,
      confidence: "unavailable",
      note: 'Nothing was entered, so there is nothing to estimate from. Name the foods plainly — "chicken breast, rice, olive oil" — or type the figures from the packet.',
      matched: [],
    };
  }

  /* ---- The athlete typed the numbers ---------------------------------- */

  const declared = readDeclared(description);
  if (declared.any) {
    const proteinG = declared.proteinG === null ? null : Math.round(declared.proteinG * portions);
    const carbsG = declared.carbsG === null ? null : Math.round(declared.carbsG * portions);
    const fatG = declared.fatG === null ? null : Math.round(declared.fatG * portions);
    const kcal =
      declared.kcal !== null
        ? Math.round((declared.kcal * portions) / 10) * 10
        : deriveKcal(proteinG, carbsG, fatG);

    const missing: string[] = [];
    if (proteinG === null) missing.push("protein");
    if (carbsG === null) missing.push("carbohydrate");
    if (fatG === null) missing.push("fat");

    const sentences = ["Taken from the figures you typed rather than from the food reference."];
    if (portions !== 1) sentences.push(`Multiplied by ${portions} portions.`);
    if (missing.length > 0) {
      sentences.push(
        `You did not state ${NAMES_OF(missing)}, so ${missing.length === 1 ? "it is" : "they are"} left blank rather than filled in from a lookup.`,
      );
    }
    if (declared.kcal === null && kcal !== null) {
      sentences.push("Energy is calculated from those macronutrients, not separately stated.");
    }
    if (declared.kcal === null && kcal === null) {
      sentences.push("Energy needs all three macronutrients to calculate, so it is left blank.");
    }

    return {
      proteinG,
      carbsG,
      fatG,
      kcal,
      confidence: "logged",
      note: sentences.join(" "),
      matched: [],
    };
  }

  /* ---- Match against the reference ------------------------------------ */

  const result = matchFoods(description);

  if (result.hits.length === 0) {
    const sentences = [
      "Nothing in that description matched the food reference, so no figures are shown.",
      "Nothing is estimated from an unrecognised entry — a plausible-looking number here would be worse than a blank one, because you cannot tell the two apart once they are on the screen.",
      'Name the foods plainly — "chicken breast, rice, broccoli" — or type the figures from the packet and they will be used as entered.',
    ];
    if (result.negation) {
      sentences.push(
        "Part of that says what was left out. The reference can only add foods together, not take one away, so anything phrased that way is skipped rather than guessed at — list what was actually on the plate instead.",
      );
    }
    if (result.alcohol) {
      sentences.push(
        "Alcoholic drinks are not held in the reference at all: most of their energy is in the alcohol itself, which the macronutrient arithmetic here cannot represent.",
      );
    }
    return {
      proteinG: null,
      carbsG: null,
      fatG: null,
      kcal: null,
      confidence: "unavailable",
      note: sentences.join(" "),
      matched: [],
    };
  }

  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  for (const hit of result.hits) {
    proteinG += hit.entry.proteinG * hit.factor;
    carbsG += hit.entry.carbsG * hit.factor;
    fatG += hit.entry.fatG * hit.factor;
  }
  proteinG = Math.round(proteinG * portions);
  carbsG = Math.round(carbsG * portions);
  fatG = Math.round(fatG * portions);

  const sentences = [
    "Estimated from typical portions of the foods recognised in what you typed. These are rounded reference figures, not a measurement of your plate — portions of the same dish vary widely, and so will this.",
  ];
  if (portions !== 1) sentences.push(`Multiplied by ${portions} portions.`);
  if (result.unmatched.length > 0) {
    sentences.push(
      `Not recognised, and therefore not counted: ${result.unmatched.join(", ")}. The totals are low by whatever those contained.`,
    );
  }
  if (result.negation) {
    sentences.push(
      "Part of that says what was left out, and the reference can only add foods together rather than take one away — that part is skipped instead of guessed at.",
    );
  }
  if (result.alcohol) {
    sentences.push(
      "Any alcoholic drink in there is not counted: most of its energy is in the alcohol itself, which this arithmetic cannot represent.",
    );
  }
  if (result.unitMismatch) {
    sentences.push(
      "One stated amount could not be applied to the reference portion it belongs to, so a single portion was used for it instead.",
    );
  }
  if (result.clamped) {
    sentences.push("One quantity looked like a typing error and was capped.");
  }

  return {
    proteinG,
    carbsG,
    fatG,
    kcal: deriveKcal(proteinG, carbsG, fatG),
    confidence: "estimated",
    note: sentences.join(" "),
    matched: result.hits.map((h) => h.display),
  };
}

/* -------------------------------------------------------------------------- */
/* Coach's reading of a meal                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Loose qualitative markers, not targets.
 *
 * They exist only to decide which sentence to say. Nothing derived from them is
 * ever framed as a shortfall against a number the athlete is meant to hit, and
 * no branch below tells anyone to eat less of anything.
 */
const PROTEIN_PRESENT_G = 20;
const CARBS_SUBSTANTIAL_G = 50;

/**
 * One line from the coach about a single meal.
 *
 * The framing matters more than the arithmetic: a plate is not a day, and the
 * commonest mistake an app makes here is to grade one meal as though it were the
 * whole picture. Every steer is additive — what to add across the rest of the
 * day — because a nutrition feature that suggests removing food to an endurance
 * athlete is a genuine hazard.
 */
export function coachViewOfMeal(
  est: MealEstimate,
  ctx: { trainedToday: boolean; trainingTomorrow: boolean },
): string {
  const { trainedToday, trainingTomorrow } = ctx;

  if (est.confidence === "unavailable") {
    // No numbers means no comment on the numbers. The context line still stands
    // on its own and is the honest half of what would have been said anyway.
    if (trainedToday && trainingTomorrow) {
      return "There is nothing to read here — the entry could not be matched. Regardless of the figures: you trained today and you train again tomorrow, so protein and carbohydrate across this evening are what carry you into it.";
    }
    if (trainedToday) {
      return "There is nothing to read here — the entry could not be matched. Regardless of the figures: you trained today, so protein and carbohydrate across the rest of the day are what the session gets paid back with.";
    }
    if (trainingTomorrow) {
      return "There is nothing to read here — the entry could not be matched. Regardless of the figures: you train tomorrow, so eat well this evening rather than starting the session short.";
    }
    return "There is nothing to read here — the entry could not be matched, and no figures are estimated from an unrecognised description.";
  }

  const source =
    est.confidence === "logged"
      ? "Working from the figures you typed"
      : "Working from an estimate of typical portions";

  const observations: string[] = [];
  if (est.proteinG !== null) {
    observations.push(
      est.proteinG >= PROTEIN_PRESENT_G
        ? "there is a solid amount of protein in this one"
        : "protein is light in this one",
    );
  }
  if (est.carbsG !== null) {
    observations.push(
      est.carbsG >= CARBS_SUBSTANTIAL_G
        ? "and it is carbohydrate-forward"
        : "and carbohydrate is modest",
    );
  }
  const reading =
    observations.length > 0
      ? `${source}, ${observations.join(" ")}.`
      : `${source}, though not enough of it to say much.`;

  // The steer. Additive in every branch, and explicit that one plate is not a day.
  let steer: string;
  if (trainedToday && trainingTomorrow) {
    steer =
      est.carbsG !== null && est.carbsG < CARBS_SUBSTANTIAL_G
        ? "You trained today and train again tomorrow — add carbohydrate across the rest of the evening so tomorrow's session starts from a full tank."
        : "You trained today and train again tomorrow, so keep protein coming across the evening as well as this.";
  } else if (trainedToday) {
    steer =
      est.proteinG !== null && est.proteinG < PROTEIN_PRESENT_G
        ? "You trained today, so add protein somewhere across the rest of the day — that is the part the session is asking for."
        : "You trained today, and this sits sensibly against that.";
  } else if (trainingTomorrow) {
    steer =
      est.carbsG !== null && est.carbsG < CARBS_SUBSTANTIAL_G
        ? "You train tomorrow — carbohydrate at the next meal will serve you better than starting the session short."
        : "You train tomorrow, and this is a reasonable way into it.";
  } else {
    steer = "No session either side of this one, so nothing to time it around.";
  }

  return `${reading} ${steer} Judge the day rather than the plate — one meal is not a pattern.`;
}
