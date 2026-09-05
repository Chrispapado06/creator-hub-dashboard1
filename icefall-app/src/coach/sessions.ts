import { exerciseById, exercisesFor, substitute } from "@/coach/exercises";
import type { Equipment, Exercise, MuscleGroup } from "@/coach/exercises";
import type { TrainingDay, TrainingFocus } from "@/types";

/**
 * From a planned day to a session the athlete can actually do.
 *
 * `TrainingDay` says "Strength — Lower Body, 60 minutes". That is a heading, not
 * a session: it does not say which movements, in what order, how the athlete
 * warms up for them, or what to do when the knee is sore and the gym is shut.
 * This module turns the heading into blocks of real movements drawn from the
 * exercise library, and then changes them when the day changes.
 *
 * Four rules shaped it, and any edit to this file has to hold them:
 *
 *  1. NOTHING IS INVENTED TO FILL A FIELD. Sets, repetitions and rest come from
 *     the library or they are left undefined and the reason is written into the
 *     item's note. Distance and ascent targets come from the plan or they are
 *     not shown. There are no heart-rate zones and no target paces anywhere in
 *     here, because ICEFALL has never measured this athlete's maximum, resting
 *     or threshold heart rate — see the same refusal in load.ts. (A paired
 *     strap gives a real reading during a recording; what is missing is the
 *     ceiling to express it as a percentage OF.) Effort is therefore described
 *     in words, which is honest, rather than in numbers, which would not be.
 *
 *  2. A REST DAY IS A REST DAY. `focus: "rest"` returns no exercises at all. A
 *     "light optional mobility circuit" on a rest day is how rest quietly stops
 *     being rest, and it is the plan's rest days that make the hard days
 *     repeatable.
 *
 *  3. NO MODIFICATION MAY MAKE THE SESSION HARDER. Cutting the time cuts the
 *     volume and never compresses the same work into a higher intensity.
 *     Reducing for fatigue reduces the effort and never proposes catching up
 *     later: missed volume is not a debt, and nothing here is allowed to imply
 *     it is.
 *
 *  4. NOTHING HERE IS MEDICAL. A reported discomfort is routed around and the
 *     load is reduced, and the athlete is told to get it assessed if it
 *     persists. This module never names what a discomfort is, never claims a
 *     substitution will help it, and never calls any movement safe — only the
 *     athlete can feel what a movement is doing, and only a clinician can say
 *     what is going on.
 *
 * Technical mountain skill — cramponing, axe work, rope systems, glacier travel
 * — is learned in person from an IFMGA/UIAGM guide. A "technical" session here
 * prepares the body for that ground. It is not the instruction.
 */

/* -------------------------------------------------------------------------- */
/* Shape                                                                       */
/* -------------------------------------------------------------------------- */

export interface SessionItem {
  exerciseId: string;
  name: string;
  sets?: number;
  reps?: number;
  durationMin?: number;
  restSec?: number;
  /** Described in words, never as a heart rate or a pace. See rule 1 above. */
  intensity?: string;
  note?: string;
}

export interface SessionBlock {
  id: string;
  label: string;
  kind: "warm-up" | "main" | "finisher" | "cool-down";
  items: SessionItem[];
  note?: string;
}

export interface CoachSession {
  id: string;
  title: string;
  focus: TrainingFocus;
  durationMin: number;
  purpose: string;
  targets: { label: string; value: string }[];
  blocks: SessionBlock[];
  cautions: string[];
  /** True for a rest day, so the UI shows rest rather than a token workout. */
  isRest: boolean;
}

export type Modification =
  | { kind: "time"; minutes: number }
  | { kind: "equipment"; equipment: Equipment[] }
  | { kind: "discomfort"; area: string }
  | { kind: "fatigue" };

/**
 * Stated experience, used only to cap movement difficulty and session breadth.
 *
 * Deliberately its own union rather than the app's `ExperienceLevel`: this is a
 * statement about training movements, not about mountain experience, and a
 * caller mapping from `User.experience` should decide that mapping explicitly
 * rather than have it happen silently here.
 */
type Experience = "beginner" | "intermediate" | "advanced" | "expert";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Session length when the plan did not set one. These are ICEFALL's default
 * prescriptions for a session of that type, not an estimate of anything the
 * athlete has done, and `targets` says so wherever one is used.
 */
const FOCUS_DEFAULT_MINUTES: Record<TrainingFocus, number> = {
  rest: 0,
  recovery: 30,
  endurance: 60,
  strength: 60,
  intervals: 60,
  technical: 60,
  "long-mountain": 180,
};

/** Hardest movement offered at each stated experience level. */
const MAX_DIFFICULTY: Record<Experience, number> = {
  beginner: 2,
  intermediate: 3,
  advanced: 4,
  expert: 5,
};

/**
 * Cap applied when experience has not been stated. Deliberately conservative:
 * an unknown athlete is offered moderate movements and told why, rather than
 * being assumed capable of a barbell squat or a Nordic curl.
 */
const UNSTATED_EXPERIENCE_CAP = 3;

/** How many movements the main block carries, by stated experience. */
const MAIN_ITEM_COUNT: Record<Experience, number> = {
  beginner: 3,
  intermediate: 4,
  advanced: 5,
  expert: 5,
};
const UNSTATED_MAIN_ITEM_COUNT = 3;

/** A block of work shorter than this is not worth prescribing as a session. */
const MIN_MAIN_MINUTES = 10;
/** Warm-up and cool-down items shrink but never below this. */
const MIN_PREP_MINUTES = 2;
/** Below two sets the movement is a rehearsal, not training. */
const MIN_SETS = 2;

/**
 * Scale a duration down, never up.
 *
 * The floor exists so a reduced session does not become a token one, but a
 * floor applied naively to a movement already shorter than it makes the
 * reduction lengthen the work — a three-minute mobilisation becoming ten
 * minutes because the athlete asked for a shorter session. Every reduction in
 * this file therefore goes through here, where the result is clamped to the
 * value it started at. Rule 3: no modification may make the session harder.
 */
function reduceMinutes(current: number, factor: number, floor: number): number {
  return Math.min(current, Math.max(floor, Math.round(current * factor)));
}

/** Focuses whose main work is one continuous effort rather than a set list. */
const CONTINUOUS: TrainingFocus[] = ["recovery", "endurance", "intervals", "long-mountain"];

/**
 * Effort in words.
 *
 * ICEFALL holds no measured maximum, resting or threshold heart rate for anyone
 * — load.ts is explicit that its own intensity multiplier is a relative ranking
 * and not a percentage of anything physiological. Printing "Zone 2" or a target
 * pace here would dress that gap up as a measurement, so the athlete gets a
 * description they can verify against themselves instead.
 */
const EFFORT: Record<TrainingFocus, string> = {
  rest: "None",
  recovery: "Easy — this should feel like less than enough",
  endurance: "Conversational — full sentences throughout",
  strength: "Controlled — technique sets the weight, not the other way round",
  intervals: "Hard but repeatable — the last effort should look like the first",
  "long-mountain": "Steady — the pace you could hold all day",
  technical: "Precise — quality of movement before quantity",
};

/**
 * The same effort, short enough for the header tile.
 *
 * The tile is a glance; the full sentence above rides on every item in the main
 * block, where the athlete reads it while deciding how hard to go. Both say the
 * same thing — the short form is never a different, vaguer claim.
 */
const EFFORT_TILE: Record<TrainingFocus, string> = {
  rest: "None",
  recovery: "Easy",
  endurance: "Conversational",
  strength: "Controlled",
  intervals: "Hard but repeatable",
  "long-mountain": "Steady",
  technical: "Precise",
};

const DURATION_LABEL = "Duration";
const DISTANCE_LABEL = "Distance";
const INTENSITY_LABEL = "Intensity";
const MAIN_WORK_LABEL = "Main work";
const REST_LABEL = "Rest between sets";

/**
 * The three tiles the session header always shows, in this order.
 *
 * `targets` always opens with exactly these three, on every session including a
 * rest day, so the header never has to invent a value for a tile the design
 * requires. Where a figure genuinely does not exist the tile carries the reason
 * — "Not set by your plan", not "—" and not 0. Anything after the third entry is
 * additional and appears only when it is real.
 */
export const PRIMARY_TARGET_LABELS = [DURATION_LABEL, DISTANCE_LABEL, INTENSITY_LABEL] as const;

/** Plain-language kit names, so an explanation reads as a sentence. */
const KIT_LABEL: Record<Equipment, string> = {
  none: "no equipment",
  dumbbells: "dumbbells",
  barbell: "a barbell",
  kettlebell: "a kettlebell",
  step: "a step or box",
  "pull-up-bar": "a pull-up bar",
  bench: "a bench",
  "resistance-band": "a resistance band",
  treadmill: "a treadmill",
  stairs: "stairs",
  pack: "a loaded pack",
  hangboard: "a hangboard",
};

const BASE_CAUTION =
  "These are training movements, not treatment. Stop anything that produces pain and have it assessed rather than working around it.";

const GUIDE_CAUTION =
  "This session prepares the body for technical ground. It does not teach the skills: cramponing, axe work, rope systems and glacier travel are learned in person from an IFMGA-certified guide or instructor.";

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Whether every piece of kit a movement needs is to hand.
 *
 * An undefined kit list means the caller has not said what is available, which
 * is different from knowing the athlete has nothing — the same distinction the
 * exercise library draws. Under that condition nothing is filtered and the
 * session carries a caution saying so.
 */
function kitAvailable(ex: Exercise, kit: Equipment[] | undefined): boolean {
  if (kit === undefined) return true;
  return ex.equipment.every((e) => e === "none" || kit.includes(e));
}

/** "a barbell and a bench" — for explaining why something had to be swapped. */
function describeKit(ex: Exercise): string {
  const named = ex.equipment.filter((e) => e !== "none").map((e) => KIT_LABEL[e]);
  if (named.length === 0) return "no equipment";
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

const metres = (m: number) => `${Math.round(m).toLocaleString("en-GB")} m`;

/** "6 km" / "18.5 km" — one decimal only where it carries information. */
function kilometres(km: number): string {
  const rounded = Math.round(km * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} km`;
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Turn a library entry into a session item, carrying the library's own defaults.
 *
 * Where the library declines to prescribe — hangboard loading, plank holds — the
 * field stays undefined and the note says why. Filling it with a plausible
 * number here would launder a deliberate gap into a prescription.
 */
function itemFrom(
  ex: Exercise,
  opts: { intensity?: string; durationMin?: number; extraNote?: string } = {},
): SessionItem {
  const durationMin = opts.durationMin ?? ex.defaultDurationMin;
  const notes: string[] = [ex.relevanceReason];

  if (ex.defaultSets === undefined && ex.defaultReps === undefined && durationMin === undefined) {
    notes.push(
      "The library sets no repetitions for this one because the right loading depends entirely on the individual. Have a coach set it rather than guessing.",
    );
  } else if (ex.defaultReps === undefined && durationMin === undefined) {
    notes.push(
      "Held rather than counted. End the set while the position is still solid rather than working to failure.",
    );
  }

  if (opts.extraNote) notes.push(opts.extraNote);

  return {
    exerciseId: ex.id,
    name: ex.name,
    sets: ex.defaultSets,
    reps: ex.defaultReps,
    durationMin,
    restSec: ex.restSec,
    intensity: opts.intensity,
    note: notes.join(" "),
  };
}

/* -------------------------------------------------------------------------- */
/* Warm-ups and cool-downs                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One prescribed preparation movement.
 *
 * `budgetMin` is the planner's time allowance for the item and is never emitted
 * — it exists so the main block gets the minutes actually left over rather than
 * the minutes the plan wished it had. `durationMin` is emitted only where the
 * item is genuinely timed.
 */
interface PrepSpec {
  id: string;
  note: string;
  sets?: number;
  reps?: number;
  durationMin?: number;
  budgetMin: number;
}

/**
 * A warm-up is built from the movements the session is actually about, not from
 * "five minutes of easy cardio". Every note below states the link to the main
 * work, because an athlete who knows what the preparation is for does it.
 */
const PREP: Record<string, PrepSpec> = {
  ankleLower: {
    id: "ankle-mobilisation",
    note: "Ankle range decides how upright you can stay under load. Do this before the legs are asked for depth.",
    durationMin: 3,
    budgetMin: 3,
  },
  ankleTerrain: {
    id: "ankle-mobilisation",
    note: "The ground today is uneven. Take the ankles through their range before they have to find it under a pack.",
    durationMin: 3,
    budgetMin: 3,
  },
  hipsPre: {
    id: "hip-flexor-mobilisation",
    note: "Opens the front of the hip so the stride can lengthen behind you rather than being cut short.",
    durationMin: 3,
    budgetMin: 3,
  },
  hipsPost: {
    id: "hip-flexor-mobilisation",
    note: "After sustained ascent the hip flexors hold short. Take them back through range while they are still warm.",
    durationMin: 3,
    budgetMin: 3,
  },
  thoracicPre: {
    id: "thoracic-rotation",
    note: "Frees the upper back before the pulling work, so the shoulders are not asked to find that range on their own.",
    durationMin: 2,
    budgetMin: 2,
  },
  thoracicPost: {
    id: "thoracic-rotation",
    note: "Unwinds the upper back after time under a pack.",
    durationMin: 2,
    budgetMin: 2,
  },
  squatPattern: {
    id: "bodyweight-squat",
    note: "Rehearses today's loaded pattern with nothing on the bar. Two easy sets, well short of anything demanding.",
    sets: 2,
    reps: 10,
    budgetMin: 3,
  },
  glutesPre: {
    id: "glute-bridge",
    note: "Brings the glutes in before they are loaded, so they lead the hinge work rather than joining it late.",
    sets: 2,
    reps: 12,
    budgetMin: 3,
  },
  shinPre: {
    id: "tibialis-raise",
    note: "Works the front of the shin before the calf work, so the ankle is prepared in both directions.",
    sets: 2,
    reps: 15,
    budgetMin: 2,
  },
  trunkPre: {
    id: "dead-bug",
    note: "Sets the trunk position the carries and lifts need before they demand it.",
    sets: 2,
    reps: 10,
    budgetMin: 3,
  },
  hangPre: {
    id: "dead-hang",
    note: "Takes the shoulders through a loaded hang before the pulling work begins.",
    sets: 2,
    budgetMin: 3,
  },
  wristPre: {
    id: "wrist-extensor-work",
    note: "Balances the forearm before gripping work, which loads only one side of it.",
    sets: 2,
    reps: 20,
    budgetMin: 3,
  },
  balancePre: {
    id: "single-leg-balance",
    note: "Wakes up the foot and ankle before they are asked for control on uneven ground.",
    sets: 2,
    budgetMin: 3,
  },
  runBuild: {
    id: "easy-run",
    note: "Start easy and build gradually into the effort you intend to hold. Do not begin at the target pace.",
    durationMin: 12,
    budgetMin: 12,
  },
  walkBuild: {
    id: "recovery-walk",
    note: "Walk first and build into the session's pace over these minutes. Beginning at pace is where the session starts to cost more than it gives.",
    durationMin: 8,
    budgetMin: 8,
  },
  walkDown: {
    id: "recovery-walk",
    note: "Keep walking until the breathing has settled fully before you stop.",
    durationMin: 10,
    budgetMin: 10,
  },
};

/**
 * Fixed preparation for the continuous focuses, in the order it is done.
 *
 * Recovery is deliberately empty, so a recovery day carries no warm-up block at
 * all. An easy walk warms itself up, and adding a preparation routine in front
 * of it would be work bolted onto the one session whose whole value is that it
 * asks for nothing — the same reasoning that keeps a rest day empty, applied
 * more gently. The UI renders the blocks that exist rather than a fixed three.
 */
const CONTINUOUS_PREP: Record<string, PrepSpec[]> = {
  recovery: [],
  endurance: [PREP.ankleLower, PREP.glutesPre, PREP.walkBuild],
  intervals: [PREP.ankleLower, PREP.squatPattern, PREP.runBuild],
  "long-mountain": [PREP.ankleTerrain, PREP.hipsPre],
};

const COOL_DOWN: Record<string, PrepSpec[]> = {
  recovery: [PREP.ankleLower, PREP.hipsPost, PREP.thoracicPost],
  endurance: [PREP.hipsPost, PREP.thoracicPost],
  intervals: [PREP.walkDown, PREP.hipsPost],
  "long-mountain": [PREP.hipsPost, PREP.thoracicPost],
  strength: [PREP.hipsPost, PREP.thoracicPost],
  technical: [PREP.hipsPost, PREP.thoracicPost],
};

/** Warm-up movements are capped so the preparation stays a preparation. */
const MAX_WARM_UP_ITEMS = 4;

/**
 * The warm-up for a set-based session, derived from the muscles the main work
 * actually loads. A hinge session gets the glutes switched on; a pulling session
 * gets the upper back and a hang; a calf session gets the front of the shin.
 */
function warmUpForMain(main: Exercise[], focus: TrainingFocus): PrepSpec[] {
  const loaded = new Set<MuscleGroup>();
  for (const ex of main) {
    for (const g of ex.primary) loaded.add(g);
    for (const g of ex.secondary) loaded.add(g);
  }

  const lowerBody =
    loaded.has("quads") || loaded.has("glutes") || loaded.has("hamstrings") || loaded.has("calves");

  const specs: PrepSpec[] = [];
  if (lowerBody) specs.push(PREP.ankleLower);
  if (focus === "technical") specs.push(PREP.balancePre);
  if (loaded.has("quads")) specs.push(PREP.squatPattern);
  if (loaded.has("hamstrings") || loaded.has("glutes")) specs.push(PREP.glutesPre);
  if (loaded.has("calves")) specs.push(PREP.shinPre);
  if (loaded.has("back") || loaded.has("shoulders")) specs.push(PREP.thoracicPre);
  if (loaded.has("back") || loaded.has("arms")) specs.push(PREP.hangPre);
  if (loaded.has("grip")) specs.push(PREP.wristPre);
  if (loaded.has("core")) specs.push(PREP.trunkPre);
  if (specs.length === 0) specs.push(PREP.hipsPre);

  return specs.slice(0, MAX_WARM_UP_ITEMS);
}

interface PrepResult {
  items: SessionItem[];
  budgetMin: number;
  /** True when the allowance forced a spec to be dropped or shortened. */
  trimmed: boolean;
}

/**
 * Realise preparation specs as items, inside a time allowance.
 *
 * A spec whose kit is not to hand is dropped rather than substituted: a warm-up
 * that quietly becomes a different movement teaches the athlete nothing, and the
 * main work is where a substitution is worth explaining.
 *
 * `allowanceMin` is what stops a short day prescribing more preparation than the
 * day has minutes for. Fourteen minutes of warm-up in front of a fifteen-minute
 * session is not a warm-up problem, it is the header lying about the session's
 * length. Timed specs shrink to what is left; untimed ones are dropped whole,
 * because a set count cannot be scaled against a clock without inventing how
 * long a set takes.
 */
function realisePrep(
  specs: PrepSpec[],
  kit: Equipment[] | undefined,
  used: Set<string>,
  allowanceMin: number,
): PrepResult {
  const items: SessionItem[] = [];
  let budgetMin = 0;
  let trimmed = false;

  for (const spec of specs) {
    if (used.has(spec.id)) continue;
    const ex = exerciseById(spec.id);
    // Defensive: an id that is not in the library is skipped rather than
    // rendered as a movement with a made-up name.
    if (!ex) continue;
    if (!kitAvailable(ex, kit)) continue;

    const left = allowanceMin - budgetMin;
    let durationMin = spec.durationMin;
    let cost = spec.budgetMin;

    if (cost > left) {
      // Only a timed spec can be made to fit, and only down to the floor —
      // below that it is not preparation, it is a line on a screen.
      if (durationMin === undefined || left < MIN_PREP_MINUTES) {
        trimmed = true;
        continue;
      }
      durationMin = Math.min(durationMin, left);
      cost = left;
      trimmed = true;
    }

    used.add(spec.id);
    budgetMin += cost;
    items.push({
      exerciseId: ex.id,
      name: ex.name,
      sets: spec.sets,
      reps: spec.reps,
      durationMin,
      intensity: "Easy",
      note: spec.note,
    });
  }

  return { items, budgetMin, trimmed };
}

/* -------------------------------------------------------------------------- */
/* Selecting the main work                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Preferred anchor for a continuous session, most specific first.
 *
 * The library's own ranking sorts by transfer then by difficulty, which for a
 * long mountain day puts a farmer's carry ahead of a loaded hike. That ordering
 * is right for a list of movements and wrong for choosing the one effort a day
 * is built around, so the anchor is named here instead.
 *
 * Cycling and rowing are absent on purpose: both need kit the `Equipment` union
 * cannot express, so prescribing either would assume a bicycle the athlete may
 * not own.
 */
const CONTINUOUS_ANCHORS: Record<string, string[]> = {
  recovery: ["recovery-walk"],
  endurance: ["easy-run", "incline-treadmill-walk", "ruck", "weighted-incline-walk"],
  intervals: ["uphill-intervals", "stair-repeats"],
  "long-mountain": ["ruck", "weighted-incline-walk", "stair-repeats", "descent-practice"],
};

interface Selection {
  exercises: Exercise[];
  /** True when nothing available sat inside the athlete's stated experience. */
  overCap: boolean;
}

/**
 * The single effort a continuous session is built around.
 *
 * If the anchors are all outside the difficulty cap we fall back to the least
 * difficult one the athlete can actually do and flag it, rather than either
 * silently ignoring the cap or returning a session with no work in it. The flag
 * becomes a caution the athlete reads.
 */
function selectContinuous(
  focus: TrainingFocus,
  kit: Equipment[] | undefined,
  cap: number,
): Selection {
  const anchors = (CONTINUOUS_ANCHORS[focus] ?? [])
    .map((id) => exerciseById(id))
    .filter((ex): ex is Exercise => ex !== undefined)
    .filter((ex) => kitAvailable(ex, kit));

  const withinCap = anchors.filter((ex) => ex.difficulty <= cap);
  if (withinCap.length > 0) return { exercises: [withinCap[0]], overCap: false };
  if (anchors.length > 0) {
    const easiest = [...anchors].sort((a, b) => a.difficulty - b.difficulty)[0];
    return { exercises: [easiest], overCap: true };
  }

  // Nothing in the anchor list is available — fall back to the library's own
  // ranking for this focus and kit.
  const ranked = exercisesFor({ focus, equipment: kit, maxDifficulty: cap });
  if (ranked.length > 0) return { exercises: [ranked[0]], overCap: false };

  const uncapped = exercisesFor({ focus, equipment: kit });
  if (uncapped.length > 0) return { exercises: [uncapped[0]], overCap: true };

  return { exercises: [], overCap: false };
}

/**
 * Movements for a set-based session, chosen for coverage rather than for the
 * top of the ranking: five quad exercises is not a session. The library's order
 * is preserved within that, so the highest-transfer option in each area wins.
 */
function selectSetBased(
  focus: TrainingFocus,
  kit: Equipment[] | undefined,
  cap: number,
  count: number,
): Selection {
  const capped = exercisesFor({ focus, equipment: kit, maxDifficulty: cap });
  const pool = capped.length > 0 ? capped : exercisesFor({ focus, equipment: kit });
  const overCap = capped.length === 0 && pool.length > 0;

  const chosen: Exercise[] = [];
  const covered = new Set<MuscleGroup>();

  for (const ex of pool) {
    if (chosen.length >= count) break;
    if (ex.primary.some((g) => covered.has(g))) continue;
    chosen.push(ex);
    for (const g of ex.primary) covered.add(g);
  }

  // Second pass: fill remaining slots once every area has been offered once.
  for (const ex of pool) {
    if (chosen.length >= count) break;
    if (chosen.includes(ex)) continue;
    chosen.push(ex);
  }

  return { exercises: chosen, overCap };
}

/* -------------------------------------------------------------------------- */
/* Purpose                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Why this session exists, tied to the objective.
 *
 * "General fitness" is not a purpose. An athlete who knows a session is the
 * aerobic base their objective rests on will hold the effort down where it
 * belongs; one who thinks it is a workout will not.
 */
function purposeFor(focus: TrainingFocus, goalName?: string): string {
  const goal = goalName?.trim();
  const base: Record<TrainingFocus, string> = {
    rest: "Full rest. The work you have already done becomes fitness today, not during a session added on top of it.",
    recovery:
      "Circulation and movement quality between the harder days. This is the session that lets the last one count.",
    endurance:
      "Build the aerobic base: the ability to keep moving for hours at an effort that never becomes a struggle.",
    strength:
      "Build leg and trunk strength. Every step of ascent lifts your whole weight on one leg, and every step of descent absorbs it again.",
    intervals:
      "Raise the ceiling on sustained uphill effort, so a steep section sits well inside what you can hold rather than at the edge of it.",
    "long-mountain":
      "Rehearse the day itself — the hours, the load, the terrain and the boots — while there is still time to change any of them.",
    technical:
      "Build the physical qualities technical ground demands: grip, ankle control, balance and pulling strength.",
  };

  const clause: Record<TrainingFocus, string> = {
    rest: goal
      ? ` ${goal} is built on the sessions you can repeat, and repeatability comes from days like this one.`
      : " A build is made of the sessions you can repeat, and repeatability comes from days like this one.",
    recovery: goal
      ? ` The hard work for ${goal} only becomes fitness on the days you let it.`
      : " Hard work only becomes fitness on the days you let it.",
    endurance: goal
      ? ` This is the quality ${goal} rests on more than any other.`
      : " This is the quality a long mountain day rests on more than any other.",
    strength: goal
      ? ` ${goal} will ask for thousands of both.`
      : " A long mountain day will ask for thousands of both.",
    intervals: goal
      ? ` On ${goal} the ground decides the gradient, not you.`
      : " On the mountain the ground decides the gradient, not you.",
    "long-mountain": goal
      ? ` It is the most specific preparation for ${goal} you can do at home.`
      : " It is the most specific preparation you can do at home.",
    technical: goal
      ? ` The skills ${goal} needs are learned in person from a certified guide; this session prepares the body that has to perform them.`
      : " The skills themselves are learned in person from a certified guide; this session prepares the body that has to perform them.",
  };

  return base[focus] + clause[focus];
}

/* -------------------------------------------------------------------------- */
/* buildSession                                                                */
/* -------------------------------------------------------------------------- */

export function buildSession(args: {
  day: TrainingDay;
  goalName?: string;
  equipment?: Equipment[];
  experience?: Experience;
}): CoachSession {
  const { day, goalName, equipment, experience } = args;
  const id = `session-${day.date}-${day.focus}`;

  /* ---- Rest ------------------------------------------------------------- */

  if (day.focus === "rest") {
    return {
      id,
      title: day.title,
      focus: "rest",
      // Zero here is the prescription, not a missing measurement: the session is
      // no minutes of training. Nothing else in this file may use 0 that way.
      durationMin: 0,
      purpose: purposeFor("rest", goalName),
      // The three fixed tiles still render on a rest day. "None" here is the
      // prescription — a deliberate absence of training — not a missing
      // measurement, which is the only reading of zero this file permits.
      targets: [
        { label: DURATION_LABEL, value: "No session" },
        { label: DISTANCE_LABEL, value: "None" },
        { label: INTENSITY_LABEL, value: "None" },
      ],
      blocks: [],
      cautions: [
        "If you are considering training today because you missed a session earlier in the week, leave it. Missed work is not a debt, and paying it back on a rest day costs you the days that follow.",
      ],
      isRest: true,
    };
  }

  const cap = experience ? MAX_DIFFICULTY[experience] : UNSTATED_EXPERIENCE_CAP;
  const itemCount = experience ? MAIN_ITEM_COUNT[experience] : UNSTATED_MAIN_ITEM_COUNT;
  const plannedMinutes = day.durationMin ?? FOCUS_DEFAULT_MINUTES[day.focus];
  const durationDefaulted = day.durationMin === undefined;
  const continuous = CONTINUOUS.includes(day.focus);

  const selection = continuous
    ? selectContinuous(day.focus, equipment, cap)
    : selectSetBased(day.focus, equipment, cap, itemCount);

  const used = new Set<string>(selection.exercises.map((ex) => ex.id));
  const blocks: SessionBlock[] = [];

  /* ---- Warm-up ---------------------------------------------------------- */

  const warmUpSpecs = continuous
    ? (CONTINUOUS_PREP[day.focus] ?? [])
    : warmUpForMain(selection.exercises, day.focus);

  /**
   * What the day can spend on preparation. The main work keeps at least
   * MIN_MAIN_MINUTES, and the warm-up claims what is left before the cool-down
   * — it is the half that protects the work. A small slice is held back for the
   * cool-down so a short day still finishes properly rather than stopping dead.
   */
  const prepAllowance = Math.max(0, plannedMinutes - MIN_MAIN_MINUTES);
  const coolDownReserve = prepAllowance >= MIN_PREP_MINUTES * 2 ? MIN_PREP_MINUTES : 0;

  const warmUp = realisePrep(warmUpSpecs, equipment, used, prepAllowance - coolDownReserve);

  if (warmUp.items.length > 0) {
    blocks.push({
      id: `${id}-warm-up`,
      label: "Warm-up",
      kind: "warm-up",
      items: warmUp.items,
      note: "Prepared for today's work specifically. None of it should leave a mark on the session that follows.",
    });
  }

  /* ---- Cool-down (built first, because it claims minutes) ---------------- */

  const coolDown = realisePrep(
    COOL_DOWN[day.focus] ?? [],
    equipment,
    used,
    prepAllowance - warmUp.budgetMin,
  );

  /* ---- Main ------------------------------------------------------------- */

  const mainItems: SessionItem[] = [];
  if (continuous && selection.exercises.length > 0) {
    const ex = selection.exercises[0];
    const mainMinutes = Math.max(
      MIN_MAIN_MINUTES,
      plannedMinutes - warmUp.budgetMin - coolDown.budgetMin,
    );
    mainItems.push(itemFrom(ex, { intensity: EFFORT[day.focus], durationMin: mainMinutes }));
  } else {
    // A set-based session can still contain timed movements — descent practice
    // runs to 45 minutes in the library. Those minutes are budgeted against the
    // time the plan actually set, so the Duration tile can never be contradicted
    // by a movement listed underneath it: a 30-minute technical day must not
    // prescribe a 45-minute descent. Sets and repetitions are left unbudgeted
    // because how long they take genuinely varies with the athlete, and putting
    // a number on that would be the fabrication rule 1 forbids.
    let timedLeft = Math.max(0, plannedMinutes - warmUp.budgetMin - coolDown.budgetMin);

    for (const ex of selection.exercises) {
      const wanted = ex.defaultDurationMin;
      if (wanted === undefined) {
        mainItems.push(itemFrom(ex, { intensity: EFFORT[day.focus] }));
        continue;
      }

      const granted = Math.min(wanted, timedLeft);
      // Nothing useful is left of it, so it is dropped rather than prescribed as
      // a token few minutes that trains nothing and fills the screen.
      if (granted < Math.min(MIN_MAIN_MINUTES, wanted)) continue;
      timedLeft -= granted;

      mainItems.push(
        itemFrom(ex, {
          intensity: EFFORT[day.focus],
          durationMin: granted,
          extraNote:
            granted < wanted
              ? `Shortened from the library's ${wanted} minutes to fit the time your plan sets for today. It is the duration that has come down, not the standard of the movement.`
              : undefined,
        }),
      );
    }
  }

  const mainNote = continuous
    ? day.detail
      ? `From your plan: ${day.detail}`
      : undefined
    : "Work through in order. End a set when the technique changes rather than chasing the last repetition.";

  blocks.push({
    id: `${id}-main`,
    label: continuous ? "Main effort" : "Main work",
    kind: "main",
    items: mainItems,
    note: mainNote,
  });

  /* ---- Finisher --------------------------------------------------------- */

  // Only on a strength day, and only when the session is long enough to carry
  // one. A finisher bolted onto a short session eats the main work.
  if (day.focus === "strength" && plannedMinutes >= 45) {
    const finisher = realisePrep(
      [
        {
          id: "front-plank",
          note: "Holds the trunk in the position a loaded pack demands for hours.",
          sets: 3,
          budgetMin: 5,
        },
        {
          id: "farmers-carry",
          note: "Loaded walking: grip, trunk and posture at the end of the session, which is when they matter on the hill.",
          sets: 3,
          budgetMin: 6,
        },
      ],
      equipment,
      used,
      // The finisher is optional work at the end of a session long enough to
      // carry it, so it is not competing with the main block for minutes.
      Number.POSITIVE_INFINITY,
    );
    if (finisher.items.length > 0) {
      blocks.push({
        id: `${id}-finisher`,
        label: "Finisher",
        kind: "finisher",
        items: finisher.items,
        note: "Optional. Drop it without a second thought if the main work took what you had.",
      });
    }
  }

  /* ---- Cool-down -------------------------------------------------------- */

  if (coolDown.items.length > 0) {
    blocks.push({
      id: `${id}-cool-down`,
      label: "Cool-down",
      kind: "cool-down",
      items: coolDown.items,
      note:
        day.focus === "long-mountain"
          ? "Do these once you are off the hill, not on it."
          : undefined,
    });
  }

  /* ---- Targets ---------------------------------------------------------- */

  // The three fixed tiles come first and always exist — see PRIMARY_TARGET_LABELS.
  const targets: { label: string; value: string }[] = [
    {
      label: DURATION_LABEL,
      // The plan's figure where it set one. Where it did not, ICEFALL's default
      // for this type of session, marked as a default so the tile is never read
      // as a measurement of anything this athlete has actually done.
      value: durationDefaulted
        ? `${plannedMinutes} min (ICEFALL default)`
        : `${plannedMinutes} min`,
    },
    {
      label: DISTANCE_LABEL,
      // Distance comes from the plan or it does not exist: nothing in this module
      // could derive it honestly. So the tile carries the reason it is absent,
      // which is the whole point of rule 1 — never a dash, never a zero.
      value:
        day.distanceKm !== undefined
          ? kilometres(day.distanceKm)
          : continuous
            ? "Not set by your plan — this session is measured in time"
            : "Not applicable — this session is measured in sets",
    },
    { label: INTENSITY_LABEL, value: EFFORT_TILE[day.focus] },
  ];

  // Ascent is not one of the fixed tiles, so its absence is expressed by absence
  // rather than by explaining a figure nobody asked for. It comes from the plan
  // or it is not shown; there is no model here that could derive it.
  if (day.elevationM !== undefined)
    targets.push({ label: "Ascent", value: metres(day.elevationM) });

  if (!continuous && mainItems.length > 0) {
    targets.push({
      label: MAIN_WORK_LABEL,
      value: `${mainItems.length} ${mainItems.length === 1 ? "movement" : "movements"}`,
    });
    const rests = mainItems.map((i) => i.restSec).filter((r): r is number => typeof r === "number");
    // Omitted entirely when the library prescribes no rest for any of today's
    // movements, rather than printed as a comfortable-looking default.
    if (rests.length > 0) {
      const lo = Math.min(...rests);
      const hi = Math.max(...rests);
      targets.push({ label: REST_LABEL, value: lo === hi ? `${lo} s` : `${lo}–${hi} s` });
    }
  }

  /* ---- Cautions --------------------------------------------------------- */

  const cautions: string[] = [];

  // Said plainly, because the athlete is about to start work on less
  // preparation than the session is designed around. The instruction is to
  // build in gradually — never to press on regardless, and never to shorten the
  // work by doing it harder.
  if (warmUp.trimmed || coolDown.trimmed) {
    cautions.push(
      `The ${plannedMinutes} minutes set for today do not cover the full preparation, so it has been shortened to fit. Build into the work gradually rather than starting at the session's effort, and hold the effort down if it does not come.`,
    );
  }

  if (day.focus === "technical") cautions.push(GUIDE_CAUTION);

  if (day.focus === "long-mountain") {
    cautions.push(
      "Set a turnaround time before you leave and keep to it regardless of how the day is going. Tell someone your route and when you expect to be back.",
    );
    cautions.push(
      "Weather and daylight decide this session, not the plan. Shortening it because conditions changed is the session working as intended.",
    );
  }

  if (day.focus === "intervals") {
    cautions.push(
      "Hard efforts belong on ground and in conditions you know well. If the efforts stop being repeatable, end the session there — the ones you did still count.",
    );
  }

  if (mainItems.length === 0) {
    cautions.push(
      "No movement in the library matches this session with the equipment listed, so no main work is prescribed. Add what you have, or change the day, rather than improvising something the plan has not accounted for.",
    );
  }

  if (selection.overCap && experience) {
    cautions.push(
      `Everything available for this session is graded above ${experience} level. It is listed because the plan calls for the work, but treat the library's numbers as a ceiling to build towards rather than today's target, and have your technique checked before adding load.`,
    );
  }

  if (!experience) {
    cautions.push(
      "Your experience level is not set, so movement difficulty is capped at moderate and the session is kept short on movements. Set it and the full range opens up.",
    );
  }

  if (equipment === undefined) {
    cautions.push(
      "ICEFALL has not been told what equipment you have, so this session assumes the movements listed are available to you. Tell it what you have and it will substitute anything that is not.",
    );
  }

  cautions.push(BASE_CAUTION);

  return {
    id,
    title: day.title,
    focus: day.focus,
    durationMin: plannedMinutes,
    purpose: purposeFor(day.focus, goalName),
    targets,
    blocks,
    cautions,
    isRest: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Modification                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Kit the session already assumes.
 *
 * Modifications do not carry an equipment list, and guessing at one would either
 * strip a session back to bodyweight or propose a barbell out of nowhere. What
 * the session already prescribes is evidence: a barbell squat in today's plan
 * means a barbell. Nothing beyond that is assumed.
 */
function inferKit(session: CoachSession): Equipment[] {
  const kit = new Set<Equipment>(["none"]);
  for (const block of session.blocks) {
    for (const item of block.items) {
      const ex = exerciseById(item.exerciseId);
      if (!ex) continue;
      for (const e of ex.equipment) kit.add(e);
    }
  }
  return [...kit];
}

/**
 * Every movement the session already prescribes.
 *
 * A substitution has to avoid these. Swapping a dumbbell Romanian deadlift for
 * the glute bridge already in the warm-up gives the athlete the same movement
 * twice under two headings, which reads as a mistake and trains one quality
 * where the session intended two.
 */
function prescribedIds(session: CoachSession): Set<string> {
  const ids = new Set<string>();
  for (const block of session.blocks) for (const item of block.items) ids.add(item.exerciseId);
  return ids;
}

/** Replace every block's items, dropping any block left empty. */
function mapBlocks(
  session: CoachSession,
  fn: (block: SessionBlock) => SessionBlock | null,
): SessionBlock[] {
  const out: SessionBlock[] = [];
  for (const block of session.blocks) {
    const next = fn(block);
    if (next && next.items.length > 0) out.push(next);
  }
  return out;
}

type Target = { label: string; value: string };

/** Replace a target in place, or append it if the session never carried one. */
function setTarget(targets: Target[], label: string, value: string): Target[] {
  const index = targets.findIndex((t) => t.label === label);
  if (index === -1) return [...targets, { label, value }];
  const next = [...targets];
  next[index] = { label, value };
  return next;
}

function dropTarget(targets: Target[], label: string): Target[] {
  return targets.filter((t) => t.label !== label);
}

/**
 * Rebuild the targets that describe the session's own contents.
 *
 * Every modification changes the blocks, and a header still claiming "5
 * movements" above a session of three is exactly the kind of small untruth rule
 * 1 exists to prevent. The movement count and the rest range are therefore
 * recomputed from the blocks that survived, and dropped outright when the work
 * they described is gone.
 *
 * Only maintained, never introduced: a continuous session never had a movement
 * count, and a modification is not the moment to start inventing one.
 */
function refreshDerivedTargets(targets: Target[], blocks: SessionBlock[]): Target[] {
  const items = blocks.find((b) => b.kind === "main")?.items ?? [];
  let next = targets;

  if (items.length === 0) return dropTarget(dropTarget(next, MAIN_WORK_LABEL), REST_LABEL);

  if (next.some((t) => t.label === MAIN_WORK_LABEL)) {
    next = setTarget(
      next,
      MAIN_WORK_LABEL,
      `${items.length} ${items.length === 1 ? "movement" : "movements"}`,
    );
  }

  if (!next.some((t) => t.label === REST_LABEL)) return next;

  const rests = items.map((i) => i.restSec).filter((r): r is number => typeof r === "number");
  if (rests.length === 0) return dropTarget(next, REST_LABEL);

  const lo = Math.min(...rests);
  const hi = Math.max(...rests);
  return setTarget(next, REST_LABEL, lo === hi ? `${lo} s` : `${lo}–${hi} s`);
}

/* ---- Time ---------------------------------------------------------------- */

/**
 * Fit the session into fewer minutes by removing work, never by concentrating
 * it.
 *
 * The main movements are protected in the order they were prescribed, because
 * that order is the session's priority. Sets come down, accessory movements go,
 * the finisher goes first of all — and the effort descriptions are untouched,
 * so nothing in the shortened session is harder than it was in the long one.
 */
function modifyTime(
  session: CoachSession,
  minutes: number,
): { session: CoachSession; explanation: string } {
  if (session.isRest) {
    return {
      session,
      explanation: "Today is a rest day. There is nothing to shorten.",
    };
  }

  if (minutes >= session.durationMin) {
    return {
      session,
      explanation: `This session already fits inside ${minutes} minutes. Nothing has been added to fill the rest of the window — a session is as long as the work needs, not as long as the time available.`,
    };
  }

  // Below the floor there is no honest cut left to make. The only way to fit an
  // hour's work into this window is to do it harder, and that is the one change
  // this module will not make — so it declines and says why, rather than
  // returning a session that is shorter on paper and heavier in the legs.
  if (minutes < MIN_MAIN_MINUTES) {
    return {
      session,
      explanation: `${minutes} minutes is less than the smallest useful piece of this session, so nothing has been cut down to fit it. Compressing the work into the window would only mean doing it harder, which is not a shorter session. Walk for what you have and take this one on a day it fits — the training you miss today is not owed back tomorrow.`,
    };
  }

  const ratio = minutes / session.durationMin;
  const keepMain = ratio < 0.6 ? 2 : ratio < 0.85 ? 3 : Number.POSITIVE_INFINITY;
  const removed: string[] = [];
  const kept: string[] = [];
  // Set when a minimum stopped a value being scaled all the way down, so the
  // explanation can admit the session may run a little over the window instead
  // of quietly claiming a total it does not add up to.
  let hitFloor = false;
  /** Whether movements were taken out of the main block, not just shortened. */
  let mainTrimmed = false;

  const blocks = mapBlocks(session, (block) => {
    if (block.kind === "finisher") {
      removed.push(...block.items.map((i) => i.name));
      return null;
    }

    if (block.kind === "main") {
      let items = block.items;
      if (items.length > keepMain) {
        removed.push(...items.slice(keepMain).map((i) => i.name));
        items = items.slice(0, keepMain);
        mainTrimmed = true;
      }
      items = items.map((item) => {
        const sets =
          item.sets === undefined
            ? undefined
            : Math.min(item.sets, Math.max(MIN_SETS, Math.round(item.sets * ratio)));
        const durationMin =
          item.durationMin === undefined
            ? undefined
            : reduceMinutes(item.durationMin, ratio, MIN_MAIN_MINUTES);
        // Anything the reduction could not take all the way down — held at the
        // floor, or already beneath it and so left alone — means the session
        // runs over the window it was cut to. The explanation says so rather
        // than claiming a total the work does not add up to.
        if (
          (item.sets !== undefined && sets! > Math.round(item.sets * ratio)) ||
          (item.durationMin !== undefined && durationMin! > Math.round(item.durationMin * ratio))
        ) {
          hitFloor = true;
        }
        return { ...item, sets, durationMin };
      });
      kept.push(...items.map((i) => i.name));
      return { ...block, items };
    }

    // Warm-up and cool-down are trimmed but never deleted. Removing the
    // preparation is the one saving that makes the remaining work worse.
    const keepPrep = ratio < 0.6 ? (block.kind === "warm-up" ? 2 : 1) : block.items.length;
    let items = block.items;
    if (items.length > keepPrep) {
      removed.push(...items.slice(keepPrep).map((i) => i.name));
      items = items.slice(0, keepPrep);
    }
    items = items.map((item) => {
      if (item.durationMin === undefined) return item;
      const durationMin = reduceMinutes(item.durationMin, ratio, MIN_PREP_MINUTES);
      if (durationMin > Math.round(item.durationMin * ratio)) hitFloor = true;
      return { ...item, durationMin };
    });
    return { ...block, items };
  });

  const parts = [`Cut from ${session.durationMin} to ${minutes} minutes.`];
  if (kept.length > 0) {
    // Only claim the main work survived when it did. Saying "intact" over a
    // main block three movements lighter is a small untruth, and the athlete
    // would be entitled to read the cut as costing nothing.
    parts.push(
      mainTrimmed
        ? `Kept, in the order the session put them: ${joinNames(kept)}.`
        : `The main work is intact: ${joinNames(kept)}.`,
    );
  }
  if (removed.length > 0) parts.push(`Removed: ${joinNames(removed)}.`);
  if (hitFloor) {
    parts.push(
      "Some of it would stop being training if it were cut further, so it has been held at a minimum — expect this to run a few minutes over rather than to land exactly in the window.",
    );
  }
  parts.push(
    "The effort stays exactly where it was — a shorter session is not a harder one, and the volume you have not done today is not owed back later.",
  );

  return {
    session: {
      ...session,
      durationMin: minutes,
      blocks,
      // The header is part of the session. Leaving the old figure on the
      // Duration tile would make the tile disagree with the work below it.
      targets: refreshDerivedTargets(
        setTarget(session.targets, DURATION_LABEL, `${minutes} min`),
        blocks,
      ),
    },
    explanation: parts.join(" "),
  };
}

/* ---- Equipment ----------------------------------------------------------- */

/**
 * A replacement the athlete can actually perform and does not already have.
 *
 * The library's `substitute` picks the closest match on kit alone; `taken`
 * carries what the session already prescribes so a swap cannot hand back a
 * movement the athlete is doing two blocks higher up. Curated alternatives are
 * tried in their own order first, because that order is a judgement about which
 * substitute is closest.
 */
function swapFor(ex: Exercise, kit: Equipment[], taken: Set<string>): Exercise | undefined {
  for (const altId of ex.alternatives) {
    const alt = exerciseById(altId);
    if (alt && alt.id !== ex.id && !taken.has(alt.id) && kitAvailable(alt, kit)) return alt;
  }

  const fallback = substitute(ex.id, kit);
  if (fallback && !taken.has(fallback.id)) return fallback;

  return undefined;
}

function modifyEquipment(
  session: CoachSession,
  kit: Equipment[],
): { session: CoachSession; explanation: string } {
  if (session.isRest) {
    return {
      session,
      explanation: "Today is a rest day, so there is nothing here that needs equipment.",
    };
  }

  const swaps: string[] = [];
  const dropped: string[] = [];
  const taken = prescribedIds(session);

  const blocks = mapBlocks(session, (block) => {
    const items: SessionItem[] = [];
    for (const item of block.items) {
      const ex = exerciseById(item.exerciseId);
      // Defensive: an item the library does not recognise cannot be checked, so
      // it is left exactly as the athlete already has it.
      if (!ex) {
        items.push(item);
        continue;
      }
      if (kitAvailable(ex, kit)) {
        items.push(item);
        continue;
      }

      const alt = swapFor(ex, kit, taken);
      if (!alt) {
        // No honest replacement exists. The movement goes rather than being
        // approximated by something that trains a different quality.
        dropped.push(ex.name);
        continue;
      }

      swaps.push(`${ex.name} → ${alt.name}`);
      taken.add(alt.id);
      items.push(
        itemFrom(alt, {
          intensity: item.intensity,
          // The time budget belongs to the session, not to the movement that
          // happened to fill it, so a swapped continuous item keeps the minutes.
          durationMin: item.durationMin,
          extraNote: `Swapped in for ${ex.name}, which needs ${describeKit(ex)}.`,
        }),
      );
    }
    return { ...block, items };
  });

  const parts: string[] = [];
  if (swaps.length === 0 && dropped.length === 0) {
    parts.push(
      "Everything in this session works with the equipment you have. Nothing has changed.",
    );
  } else {
    if (swaps.length > 0) parts.push(`Substituted: ${joinNames(swaps)}.`);
    if (dropped.length > 0) {
      parts.push(
        `No movement in the library replaces ${joinNames(dropped)} with what you have, so ${dropped.length === 1 ? "it has" : "they have"} been removed rather than approximated. The session is lighter than planned, which is the honest result.`,
      );
    }
    parts.push("Substitutes are starting points — set the load by how the movement feels today.");
  }

  return {
    session: {
      ...session,
      blocks,
      // Duration and intensity are untouched by a kit change; the movement count
      // and rest range are not, because movements may have been dropped.
      targets: refreshDerivedTargets(session.targets, blocks),
    },
    explanation: parts.join(" "),
  };
}

/* ---- Discomfort ---------------------------------------------------------- */

/**
 * Free text to the muscle groups a movement loads.
 *
 * Order matters: the first entry whose keyword appears in the reported area
 * wins. An area that matches nothing is NOT quietly mapped to something
 * plausible — the modification says it could not tell which movements load it,
 * which is a far better outcome than routing around the wrong thing.
 */
const DISCOMFORT_AREAS: { keys: string[]; label: string; groups: MuscleGroup[] }[] = [
  { keys: ["knee", "patella"], label: "knee", groups: ["quads", "hamstrings"] },
  { keys: ["achilles", "heel", "calf", "calves", "shin"], label: "lower leg", groups: ["calves"] },
  { keys: ["ankle", "foot", "feet"], label: "ankle", groups: ["calves"] },
  { keys: ["hamstring"], label: "hamstring", groups: ["hamstrings"] },
  { keys: ["quad", "thigh"], label: "thigh", groups: ["quads"] },
  { keys: ["hip", "groin", "adductor", "glute"], label: "hip", groups: ["glutes", "hamstrings"] },
  { keys: ["back", "spine", "lumbar"], label: "back", groups: ["back", "core"] },
  { keys: ["shoulder", "rotator"], label: "shoulder", groups: ["shoulders", "chest", "arms"] },
  { keys: ["elbow", "forearm"], label: "elbow", groups: ["arms", "grip"] },
  { keys: ["wrist", "hand", "finger", "thumb"], label: "wrist and hand", groups: ["grip", "arms"] },
  { keys: ["neck"], label: "neck", groups: ["shoulders", "back"] },
  { keys: ["core", "abdominal", "abs"], label: "trunk", groups: ["core"] },
];

function matchArea(area: string): { label: string; groups: MuscleGroup[] } | null {
  const text = area.trim().toLowerCase();
  if (text.length === 0) return null;
  for (const entry of DISCOMFORT_AREAS) {
    if (entry.keys.some((k) => text.includes(k)))
      return { label: entry.label, groups: entry.groups };
  }
  return null;
}

function loadsArea(ex: Exercise, groups: MuscleGroup[]): boolean {
  return [...ex.primary, ...ex.secondary].some((g) => groups.includes(g));
}

/**
 * A replacement that loads the joint less.
 *
 * "Less" is the whole claim: not comfortable, not appropriate, not safe. The
 * candidate must need no kit the athlete lacks, must not be flagged
 * `highJointLoad`, and must be no harder than what it replaces. Curated
 * alternatives are tried first because their order is a judgement about
 * closeness. When nothing clears the bar the movement is dropped and the
 * explanation says so.
 *
 * The criterion is joint load, not muscle avoidance: removing every movement
 * that touches the reported area would leave a knee complaint with no leg work
 * at all, which is a worse answer than lighter work the athlete can stop at any
 * point.
 */
function gentlerThan(ex: Exercise, kit: Equipment[]): Exercise | undefined {
  const acceptable = (candidate: Exercise | undefined): candidate is Exercise =>
    candidate !== undefined &&
    candidate.id !== ex.id &&
    candidate.highJointLoad !== true &&
    candidate.difficulty <= ex.difficulty &&
    kitAvailable(candidate, kit);

  for (const altId of ex.alternatives) {
    const alt = exerciseById(altId);
    if (acceptable(alt)) return alt;
  }

  const fallback = substitute(ex.id, kit);
  if (acceptable(fallback)) return fallback;

  return undefined;
}

/** Lighter than planned, applied to the working blocks only. */
function easeItem(item: SessionItem, intensity: string): SessionItem {
  return {
    ...item,
    sets:
      item.sets === undefined ? undefined : Math.min(item.sets, Math.max(MIN_SETS, item.sets - 1)),
    durationMin:
      item.durationMin === undefined
        ? undefined
        : reduceMinutes(item.durationMin, 0.8, MIN_MAIN_MINUTES),
    intensity,
  };
}

const ASSESSMENT_LINE =
  "None of this is an assessment of what is going on. If it is still there in a few days, if it worsens, or if it changes how you move, stop training it and see a doctor or physiotherapist.";

function modifyDiscomfort(
  session: CoachSession,
  area: string,
): { session: CoachSession; explanation: string } {
  const reported = area.trim();

  if (session.isRest) {
    return {
      session,
      explanation: `Today is a rest day, so there is nothing here loading ${reported.length > 0 ? reported : "it"}. ${ASSESSMENT_LINE}`,
    };
  }

  const match = matchArea(reported);
  const kit = inferKit(session);

  // Unrecognised area. We do not know which movements load it, so we do not
  // pretend to have routed around it — we reduce the load and hand the decision
  // back to the athlete with the reason stated plainly.
  if (!match) {
    const blocks = mapBlocks(session, (block) => {
      if (block.kind === "finisher") return null;
      if (block.kind !== "main") return block;
      return {
        ...block,
        items: block.items.map((i) =>
          easeItem(i, "Lighter than planned — stop anything that provokes it"),
        ),
      };
    });

    return {
      session: {
        ...session,
        blocks,
        targets: refreshDerivedTargets(
          setTarget(session.targets, INTENSITY_LABEL, "Lighter than planned"),
          blocks,
        ),
      },
      explanation: `ICEFALL could not match ${reported.length > 0 ? `"${reported}"` : "that"} to the movements in this session, so nothing has been swapped out — you know which of these load it and ICEFALL does not. The load is reduced and the finisher is gone. Skip anything that provokes it rather than working around it. ${ASSESSMENT_LINE}`,
    };
  }

  const swaps: string[] = [];
  const dropped: string[] = [];
  const intensity = `Lighter than planned — stop the set if it provokes the ${match.label}`;

  const blocks = mapBlocks(session, (block) => {
    if (block.kind === "finisher") return null;

    const items: SessionItem[] = [];
    for (const item of block.items) {
      const ex = exerciseById(item.exerciseId);
      if (!ex) {
        items.push(item);
        continue;
      }

      const heavyOnArea = ex.highJointLoad === true && loadsArea(ex, match.groups);
      if (!heavyOnArea) {
        items.push(block.kind === "main" ? easeItem(item, intensity) : item);
        continue;
      }

      const alt = gentlerThan(ex, kit);
      if (!alt) {
        dropped.push(ex.name);
        continue;
      }

      swaps.push(`${ex.name} → ${alt.name}`);
      items.push(
        easeItem(
          itemFrom(alt, {
            intensity,
            durationMin: item.durationMin,
            extraNote: `In place of ${ex.name}, which loads the joint harder.`,
          }),
          intensity,
        ),
      );
    }
    return { ...block, items };
  });

  const parts: string[] = [];
  if (swaps.length > 0)
    parts.push(`Swapped out of the heavier joint loading: ${joinNames(swaps)}.`);
  if (dropped.length > 0) {
    parts.push(
      `${joinNames(dropped)} had no lighter replacement available, so ${dropped.length === 1 ? "it is" : "they are"} out of today's session entirely.`,
    );
  }
  if (swaps.length === 0 && dropped.length === 0) {
    parts.push(
      `Nothing in this session is flagged as loading the ${match.label} hard, so the movements stand as they were.`,
    );
  }
  parts.push(
    `Sets and duration are reduced and the finisher is gone. Nothing here is being called comfortable for you — you are the only one who can feel what a movement is doing, so end any set that provokes the ${match.label} rather than finishing it.`,
  );
  parts.push(ASSESSMENT_LINE);

  return {
    session: {
      ...session,
      blocks,
      targets: refreshDerivedTargets(
        setTarget(session.targets, INTENSITY_LABEL, "Lighter than planned"),
        blocks,
      ),
    },
    explanation: parts.join(" "),
  };
}

/* ---- Fatigue ------------------------------------------------------------- */

/** Interval work becomes continuous steady work rather than disappearing. */
const INTERVAL_IDS = new Set(["uphill-intervals", "stair-repeats"]);

function modifyFatigue(session: CoachSession): { session: CoachSession; explanation: string } {
  if (session.isRest) {
    return {
      session,
      explanation:
        "Today is already a rest day, so there is nothing to reduce. Rest is what a flat day asks for.",
    };
  }

  const intensity = "Easier than planned — this should feel like it is not quite enough";
  const removed: string[] = [];
  let steadied = false;

  const blocks = mapBlocks(session, (block) => {
    if (block.kind === "finisher") {
      removed.push(...block.items.map((i) => i.name));
      return null;
    }
    if (block.kind !== "main") return block;

    const items: SessionItem[] = [];
    for (const item of block.items) {
      const ex = exerciseById(item.exerciseId);

      // Jumping and other hard joint loading comes out. Movement quality is the
      // first thing to go when the legs are slow, and these are the movements
      // that depend on it most.
      if (ex?.highJointLoad === true) {
        removed.push(item.name);
        continue;
      }

      const eased = easeItem(item, intensity);
      if (ex && INTERVAL_IDS.has(ex.id)) {
        steadied = true;
        items.push({
          ...eased,
          // Duration is kept: it is the intensity being reduced, not the day.
          durationMin: item.durationMin,
          restSec: undefined,
          intensity: "Steady — one continuous effort you could hold a conversation through",
          note: `${item.note ?? ""} Run this as continuous steady uphill work today rather than as intervals.`.trim(),
        });
        continue;
      }

      items.push(eased);
    }
    return { ...block, items };
  });

  const parts = ["Intensity comes down and the volume with it."];
  if (steadied) {
    parts.push(
      "The hard efforts become one continuous steady effort — the same time on your feet, well below the effort the intervals asked for.",
    );
  }
  if (removed.length > 0) parts.push(`Out of today's session: ${joinNames(removed)}.`);
  parts.push(
    "None of this is to be made up later. A lighter session done is worth more than the planned one skipped, and there is no debt to repay on the next day.",
  );
  parts.push(
    "If the flatness lasts beyond a few days, or arrives with anything else, speak to a doctor rather than training around it.",
  );

  return {
    session: {
      ...session,
      blocks,
      // Duration is deliberately unchanged: it is the intensity coming down, not
      // the day being shortened.
      targets: refreshDerivedTargets(
        setTarget(session.targets, INTENSITY_LABEL, "Easier than planned"),
        blocks,
      ),
    },
    explanation: parts.join(" "),
  };
}

/* ---- Entry point --------------------------------------------------------- */

export function modifySession(
  session: CoachSession,
  mod: Modification,
): { session: CoachSession; explanation: string } {
  switch (mod.kind) {
    case "time":
      return modifyTime(session, Math.max(0, Math.round(mod.minutes)));
    case "equipment":
      return modifyEquipment(session, mod.equipment);
    case "discomfort":
      return modifyDiscomfort(session, mod.area);
    case "fatigue":
      return modifyFatigue(session);
  }
}
