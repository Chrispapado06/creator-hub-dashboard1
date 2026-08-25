import type { TrainingFocus } from "@/types";

/**
 * ICEFALL exercise library.
 *
 * A curated set of movements for mountain athletes, not a general gym database:
 * every entry earns its place by transferring to sustained ascent, controlled
 * descent, load carriage, or the ankle, hip and grip resilience that broken
 * ground demands. `relevanceReason` states that transfer explicitly, because an
 * athlete who knows why a movement is prescribed does it properly.
 *
 * Three rules shaped this file and should shape any addition to it:
 *
 *  1. NOTHING HERE IS MEDICAL. These are training movements. No entry treats,
 *     rehabilitates or diagnoses anything. Where an entry sits close to a common
 *     complaint — Achilles loading, adductor work — the instructions say to get
 *     assessed by a qualified clinician rather than offering a fix.
 *
 *  2. NOTHING HERE REWARDS PUSHING THROUGH. There is no one-rep-max testing, no
 *     "to failure" prescription, and every plyometric states its prerequisite.
 *     Movements that load a joint hard are flagged `highJointLoad` so the coach
 *     can route around them when something already hurts.
 *
 *  3. NOTHING IS INVENTED TO FILL A FIELD. Where a prescription genuinely
 *     depends on the individual — finger loading on a hangboard, for instance —
 *     the default sets and reps are left undefined rather than filled with a
 *     plausible-looking number. Missing is honest; a guess is not.
 *
 * The library also cannot teach technique that requires supervision. Rope work,
 * cramponing, ice-axe arrest and glacier travel are learned in person from a
 * certified guide or instructor (IFMGA/UIAGM). The "technical" focus returns the
 * physical qualities those days demand — grip, balance, ankle control, pulling
 * strength — never a substitute for the instruction itself.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                        */
/* -------------------------------------------------------------------------- */

export type MuscleGroup =
  | "quads"
  | "glutes"
  | "hamstrings"
  | "calves"
  | "core"
  | "back"
  | "shoulders"
  | "chest"
  | "arms"
  | "grip"
  | "full-body";

export type Equipment =
  | "none"
  | "dumbbells"
  | "barbell"
  | "kettlebell"
  | "step"
  | "pull-up-bar"
  | "bench"
  | "resistance-band"
  | "treadmill"
  | "stairs"
  | "pack"
  | "hangboard";

export interface Exercise {
  id: string;
  name: string;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  /**
   * Everything the movement requires — read as AND, not OR. Where two tools are
   * genuinely interchangeable the entry names the commoner one and the variant
   * is reachable through `alternatives`, so an equipment filter under-offers
   * rather than proposing something the athlete cannot actually do.
   */
  equipment: Equipment[];
  instructions: string[];
  /** How directly this transfers to mountain performance. */
  mountainRelevance: "high" | "moderate" | "supporting";
  /** WHY it transfers — shown in the UI. One sentence, specific. */
  relevanceReason: string;
  defaultSets?: number;
  defaultReps?: number;
  defaultDurationMin?: number;
  restSec?: number;
  /** Ids of substitutes, used when equipment is unavailable or a joint is uncomfortable. */
  alternatives: string[];
  /** True when this loads a joint hard enough to be a poor choice if something already hurts. */
  highJointLoad?: boolean;
}

/**
 * The stored shape. Two fields exist for the library's own bookkeeping and are
 * deliberately kept off the public `Exercise` contract that the rest of the
 * coach consumes.
 */
interface ExerciseEntry extends Exercise {
  /** Which session types this movement belongs in. */
  focuses: TrainingFocus[];
  /**
   * Kit the `Equipment` union cannot express — a bicycle, a rowing ergometer.
   * An equipment filter cannot verify it, so these entries are withheld whenever
   * a filter is applied rather than assumed to be available.
   */
  unlistedKit?: string;
}

/* -------------------------------------------------------------------------- */
/* The library                                                                  */
/* -------------------------------------------------------------------------- */

const ENTRIES: ExerciseEntry[] = [
  /* ---------------------------------------------------------------- */
  /* Bilateral lower body                                              */
  /* ---------------------------------------------------------------- */
  {
    id: "back-squat",
    name: "Back Squat",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings", "core", "back"],
    difficulty: 4,
    equipment: ["barbell"],
    instructions: [
      "Set the bar in a rack at mid-chest height and take it across the upper back, never the neck.",
      "Stand with the feet a little wider than the hips, toes turned slightly out.",
      "Brace the trunk, then bend the hips and knees together until the thighs reach roughly parallel.",
      "Drive back up through the whole foot, chest and hips rising at the same rate.",
      "Work in a weight you can complete with clean technique on every repetition. ICEFALL never tests a one-rep maximum.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Builds the bilateral leg strength every other mountain quality sits on top of — step-ups, load carriage and descent control all draw on it.",
    defaultSets: 4,
    defaultReps: 6,
    restSec: 150,
    alternatives: ["goblet-squat", "rear-foot-elevated-split-squat", "weighted-step-up"],
    highJointLoad: true,
    focuses: ["strength"],
  },
  {
    id: "goblet-squat",
    name: "Goblet Squat",
    primary: ["quads", "glutes"],
    secondary: ["core"],
    difficulty: 2,
    equipment: ["kettlebell"],
    instructions: [
      "Hold the kettlebell against the chest with both hands, elbows tucked in.",
      "Stand with the feet hip- to shoulder-width apart.",
      "Sit down between the hips, keeping the trunk tall and the heels planted.",
      "Descend as far as you can without the lower back rounding, then stand up.",
      "Stop the set while the last repetition still looks like the first.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Loads the legs while forcing an upright trunk, which is exactly the posture steep, stepped ascent demands under a pack.",
    defaultSets: 3,
    defaultReps: 10,
    restSec: 90,
    alternatives: ["bodyweight-squat", "split-squat", "back-squat"],
    focuses: ["strength"],
  },
  {
    id: "bodyweight-squat",
    name: "Bodyweight Squat",
    primary: ["quads", "glutes"],
    secondary: ["core"],
    difficulty: 1,
    equipment: ["none"],
    instructions: [
      "Stand with the feet hip-width apart, arms forward for balance.",
      "Sit the hips back and down, keeping the heels in contact with the floor.",
      "Descend to a depth you control, then stand tall.",
      "Move at a steady tempo rather than bouncing out of the bottom.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Grooves the squat pattern with no load, which is what makes it the sensible starting point before any weight is added for ascent work.",
    defaultSets: 3,
    defaultReps: 15,
    restSec: 60,
    alternatives: ["split-squat", "goblet-squat", "glute-bridge"],
    focuses: ["strength"],
  },

  /* ---------------------------------------------------------------- */
  /* Unilateral and step work                                          */
  /* ---------------------------------------------------------------- */
  {
    id: "rear-foot-elevated-split-squat",
    name: "Rear-Foot-Elevated Split Squat",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings", "core"],
    difficulty: 3,
    equipment: ["dumbbells", "bench"],
    instructions: [
      "Place the top of the rear foot on a bench, front foot roughly two thirds of a metre ahead.",
      "Hold a dumbbell in each hand, trunk upright.",
      "Lower until the front thigh is close to parallel, keeping the front shin near vertical.",
      "Drive up through the front foot without pushing off the rear toe.",
      "Complete all repetitions on one leg before changing sides, and match the weaker side's number on both.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Develops unilateral strength through a deep range, which is what sustained elevation gain asks of one leg at a time.",
    defaultSets: 3,
    defaultReps: 8,
    restSec: 90,
    alternatives: ["split-squat", "reverse-lunge", "weighted-step-up"],
    highJointLoad: true,
    focuses: ["strength"],
  },
  {
    id: "split-squat",
    name: "Split Squat",
    primary: ["quads", "glutes"],
    secondary: ["core"],
    difficulty: 2,
    equipment: ["none"],
    instructions: [
      "Take a long stride forward and hold the stance — this movement does not travel.",
      "Lower the back knee towards the floor, keeping the trunk tall.",
      "Stop short of the floor and drive back up through the front foot.",
      "Keep the front knee tracking over the second toe rather than falling inwards.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Trains single-leg strength with no equipment and no deep knee loading, making it the accessible base for all step and ascent work.",
    defaultSets: 3,
    defaultReps: 12,
    restSec: 60,
    alternatives: ["reverse-lunge", "rear-foot-elevated-split-squat", "bodyweight-squat"],
    focuses: ["strength"],
  },
  {
    id: "reverse-lunge",
    name: "Reverse Lunge",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings", "core"],
    difficulty: 2,
    equipment: ["dumbbells"],
    instructions: [
      "Stand tall with a dumbbell in each hand.",
      "Step backwards and lower the rear knee towards the floor under control.",
      "Keep the weight over the front foot throughout.",
      "Push through the front heel to return to standing, then change legs.",
      "Stepping backwards loads the knee less than stepping forwards — use this version if the front of the knee is sensitive.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Rehearses the step-back-and-catch used constantly on broken ground and on the descent of a long day.",
    defaultSets: 3,
    defaultReps: 10,
    restSec: 75,
    alternatives: ["split-squat", "weighted-step-up", "bodyweight-squat"],
    focuses: ["strength"],
  },
  {
    id: "weighted-step-up",
    name: "Weighted Step-Up",
    primary: ["quads", "glutes"],
    secondary: ["calves", "core"],
    difficulty: 3,
    equipment: ["step", "dumbbells"],
    instructions: [
      "Use a step at roughly knee height, or lower while the pattern is new.",
      "Hold a dumbbell in each hand and place one whole foot on the step.",
      "Drive through that foot to stand up, without pushing off the trailing leg.",
      "Lower back down under control rather than dropping.",
      "Complete the set on one leg, then the other.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "This is the movement of ascent itself: one leg lifting the whole body on to the next step, repeated for hours.",
    defaultSets: 4,
    defaultReps: 10,
    restSec: 90,
    alternatives: ["pack-step-up", "split-squat", "lateral-step-up"],
    focuses: ["strength"],
  },
  {
    id: "pack-step-up",
    name: "Loaded Pack Step-Up",
    primary: ["quads", "glutes"],
    secondary: ["calves", "core", "back"],
    difficulty: 3,
    equipment: ["step", "pack"],
    instructions: [
      "Load the pack as you would for a real day and fit the hip belt properly.",
      "Step up on to a knee-height box, driving through the leading foot.",
      "Lower under control, letting the trailing foot touch down quietly.",
      "Keep the trunk upright — the load should sit over the hips, not out in front.",
      "Build the pack weight over weeks. Adding several kilos at once is how sessions stop being repeatable.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Puts the load where a pack actually sits, so the trunk and hips learn to hold posture while the legs do the ascending.",
    defaultSets: 4,
    defaultReps: 12,
    restSec: 90,
    alternatives: ["weighted-step-up", "stair-repeats", "weighted-incline-walk"],
    focuses: ["strength", "long-mountain"],
  },
  {
    id: "lateral-step-up",
    name: "Lateral Step-Up",
    primary: ["glutes", "quads"],
    secondary: ["core"],
    difficulty: 2,
    equipment: ["step"],
    instructions: [
      "Stand side-on to a low step with the near foot placed flat on it.",
      "Press through that foot to stand up, keeping the hips level.",
      "Lower slowly to the floor, resisting the drop.",
      "Watch the knee: it should track over the foot, not fall inwards.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Loads the hip abductors that stop the knee collapsing inwards when you step sideways on to a sloping hold or across a channel.",
    defaultSets: 3,
    defaultReps: 12,
    restSec: 60,
    alternatives: ["weighted-step-up", "banded-lateral-walk", "side-lying-hip-abduction"],
    focuses: ["strength", "technical"],
  },
  {
    id: "eccentric-step-down",
    name: "Eccentric Step-Down",
    primary: ["quads"],
    secondary: ["glutes", "core"],
    difficulty: 3,
    equipment: ["step"],
    instructions: [
      "Stand on a step on one leg, the other foot hanging free in front.",
      "Lower yourself over three to four seconds until the free heel touches the floor lightly.",
      "Take no weight on the free foot — return by pressing through the working leg.",
      "Start on a low step and raise the height only once the descent is smooth and silent.",
      "Front-of-knee discomfort here means reduce the step height, not push on.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Trains controlled lowering, which is the whole demand of descent — the half of the day where leg control fails first.",
    defaultSets: 3,
    defaultReps: 8,
    restSec: 90,
    alternatives: ["reverse-lunge", "split-squat", "descent-practice"],
    highJointLoad: true,
    focuses: ["strength", "technical"],
  },
  {
    id: "low-box-jump",
    name: "Low Box Jump",
    primary: ["quads", "glutes"],
    secondary: ["calves"],
    difficulty: 4,
    equipment: ["step"],
    instructions: [
      "Prerequisite: at least eight weeks of consistent lower-body strength work and no current knee, hip or ankle pain. Skip this movement otherwise.",
      "Use a box no higher than mid-shin to begin with.",
      "Dip the hips, swing the arms and jump on to the box, landing softly with the knees bent.",
      "Step down one foot at a time — never jump down, which is where the landing load multiplies.",
      "Stop the set as soon as the landings stop being quiet. This is a quality exercise, not a conditioning one.",
    ],
    mountainRelevance: "supporting",
    relevanceReason:
      "Develops the fast leg stiffness used to catch and correct a slip, which strength work alone trains slowly.",
    defaultSets: 3,
    defaultReps: 5,
    restSec: 120,
    alternatives: ["weighted-step-up", "split-squat", "single-leg-balance"],
    highJointLoad: true,
    focuses: ["strength"],
  },

  /* ---------------------------------------------------------------- */
  /* Posterior chain                                                   */
  /* ---------------------------------------------------------------- */
  {
    id: "romanian-deadlift",
    name: "Romanian Deadlift",
    primary: ["hamstrings", "glutes"],
    secondary: ["back", "core"],
    difficulty: 3,
    equipment: ["barbell"],
    instructions: [
      "Stand holding the bar at the hips, feet hip-width apart, knees softly bent.",
      "Push the hips backwards, letting the bar travel down the thighs while the back stays flat.",
      "Stop when you feel a firm stretch in the hamstrings, usually around mid-shin.",
      "Drive the hips forwards to stand tall, without leaning back at the top.",
      "The knees stay at roughly the same angle throughout — this is a hip movement, not a squat.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Strengthens the hamstrings and glutes through the hip hinge that carrying a loaded pack up steep ground depends on.",
    defaultSets: 4,
    defaultReps: 8,
    restSec: 120,
    alternatives: ["dumbbell-rdl", "hip-thrust", "back-extension"],
    highJointLoad: true,
    focuses: ["strength"],
  },
  {
    id: "dumbbell-rdl",
    name: "Dumbbell Romanian Deadlift",
    primary: ["hamstrings", "glutes"],
    secondary: ["back", "core", "grip"],
    difficulty: 2,
    equipment: ["dumbbells"],
    instructions: [
      "Hold a dumbbell in each hand in front of the thighs.",
      "Hinge at the hips, sliding the weights down the front of the legs.",
      "Keep the back flat and the weights close to the body throughout.",
      "Return by driving the hips forwards.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Teaches the hip hinge with a load light enough to correct technique, which is the prerequisite for every heavier posterior-chain lift.",
    defaultSets: 3,
    defaultReps: 10,
    restSec: 90,
    alternatives: ["romanian-deadlift", "single-leg-rdl", "glute-bridge"],
    focuses: ["strength"],
  },
  {
    id: "single-leg-rdl",
    name: "Single-Leg Romanian Deadlift",
    primary: ["hamstrings", "glutes"],
    secondary: ["core", "back"],
    difficulty: 3,
    equipment: ["dumbbells"],
    instructions: [
      "Hold one dumbbell in the hand opposite the standing leg.",
      "Hinge forward over the standing leg, letting the free leg extend behind as a counterweight.",
      "Keep the hips level and square to the floor rather than opening to the side.",
      "Return to standing under control, and use a wall or pole for balance while the pattern is new.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Combines hamstring strength with single-leg balance — the two things demanded simultaneously when a foot slides on a loose descent.",
    defaultSets: 3,
    defaultReps: 8,
    restSec: 75,
    alternatives: ["dumbbell-rdl", "single-leg-balance", "romanian-deadlift"],
    focuses: ["strength"],
  },
  {
    id: "hip-thrust",
    name: "Barbell Hip Thrust",
    primary: ["glutes"],
    secondary: ["hamstrings", "core"],
    difficulty: 3,
    equipment: ["barbell", "bench"],
    instructions: [
      "Sit on the floor with the upper back against a bench and the bar across the hips, padded.",
      "Plant the feet flat, shins vertical at the top of the movement.",
      "Drive the hips upwards until the body forms a straight line from knee to shoulder.",
      "Lower under control and keep the ribs down rather than arching the lower back.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Isolates hip extension, the engine of steep ascent, while loading the knee very little — useful when knees are already working hard elsewhere.",
    defaultSets: 3,
    defaultReps: 10,
    restSec: 120,
    alternatives: ["glute-bridge", "romanian-deadlift", "back-extension"],
    focuses: ["strength"],
  },
  {
    id: "glute-bridge",
    name: "Glute Bridge",
    primary: ["glutes"],
    secondary: ["hamstrings", "core"],
    difficulty: 1,
    equipment: ["none"],
    instructions: [
      "Lie on your back with the knees bent and feet flat, roughly hip-width apart.",
      "Press through the heels and lift the hips until the body is straight from knee to shoulder.",
      "Hold briefly at the top, squeezing the glutes.",
      "Lower slowly.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Wakes up hip extension with no load at all, which is why it belongs both in a warm-up and on days when the legs are already tired.",
    defaultSets: 3,
    defaultReps: 15,
    restSec: 45,
    alternatives: ["hip-thrust", "dumbbell-rdl", "side-lying-hip-abduction"],
    focuses: ["strength", "recovery"],
  },
  {
    id: "kettlebell-swing",
    name: "Kettlebell Swing",
    primary: ["glutes", "hamstrings"],
    secondary: ["back", "core", "grip"],
    difficulty: 3,
    equipment: ["kettlebell"],
    instructions: [
      "Prerequisite: a clean, comfortable hip hinge — train the Romanian deadlift first if the pattern is not established.",
      "Stand with the bell a short distance in front, hinge and hike it back between the legs.",
      "Snap the hips forward so the bell floats to chest height. The arms only guide it.",
      "Let it fall, absorb it with another hinge, and repeat in a rhythm.",
      "The bell should never be lifted with the arms or the lower back.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Builds repeatable hip power and posterior-chain endurance in one movement, which suits the long, rhythmic effort of an ascent.",
    defaultSets: 5,
    defaultReps: 15,
    restSec: 60,
    alternatives: ["romanian-deadlift", "hip-thrust", "dumbbell-rdl"],
    highJointLoad: true,
    focuses: ["strength"],
  },
  {
    id: "nordic-curl",
    name: "Nordic Hamstring Curl",
    primary: ["hamstrings"],
    secondary: ["glutes", "core"],
    difficulty: 5,
    equipment: ["none"],
    instructions: [
      "Prerequisite: several months of hamstring work and the ability to control the first third of the descent. Without that, use the band-assisted version below.",
      "Kneel on a pad with the ankles anchored firmly by a partner or a fixed bar.",
      "Keeping the body straight from knee to shoulder, lower forwards as slowly as you can.",
      "Catch yourself with the hands and push back to the start — the lowering is the whole exercise.",
      "Loop a resistance band around the chest and anchor it ahead of you to reduce the load while you build control.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Loads the hamstrings in the lengthened position they work in on steep descent, which most gym movements never reach.",
    defaultSets: 3,
    defaultReps: 5,
    restSec: 120,
    alternatives: ["single-leg-rdl", "dumbbell-rdl", "back-extension"],
    highJointLoad: true,
    focuses: ["strength"],
  },
  {
    id: "back-extension",
    name: "Back Extension",
    primary: ["back", "glutes"],
    secondary: ["hamstrings", "core"],
    difficulty: 2,
    equipment: ["bench"],
    instructions: [
      "Set up face down with the hips supported and the feet secured.",
      "Lower the trunk under control until you feel the hamstrings and lower back load.",
      "Raise until the body is in a straight line — do not arch beyond it.",
      "Move slowly. Speed here achieves nothing and loads the spine unnecessarily.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Builds endurance in the spinal erectors that hold posture under a pack in the last hours of a long day, when form quietly degrades.",
    defaultSets: 3,
    defaultReps: 12,
    restSec: 60,
    alternatives: ["romanian-deadlift", "glute-bridge", "front-plank"],
    focuses: ["strength"],
  },

  /* ---------------------------------------------------------------- */
  /* Calf, ankle and foot                                              */
  /* ---------------------------------------------------------------- */
  {
    id: "single-leg-calf-raise",
    name: "Single-Leg Calf Raise",
    primary: ["calves"],
    secondary: ["core"],
    difficulty: 2,
    equipment: ["step"],
    instructions: [
      "Stand on one foot on the edge of a step, holding a wall or rail for balance only.",
      "Let the heel drop below the step to a comfortable stretch.",
      "Press up on to the ball of the foot as high as the joint allows.",
      "Lower over three seconds. The controlled return matters more than the height.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "The calf is the first thing to fail on sustained steep ascent, and it fails one leg at a time — so it is trained one leg at a time.",
    defaultSets: 3,
    defaultReps: 15,
    restSec: 60,
    alternatives: ["seated-calf-raise", "eccentric-heel-drop", "stair-repeats"],
    focuses: ["strength", "technical"],
  },
  {
    id: "seated-calf-raise",
    name: "Seated Calf Raise",
    primary: ["calves"],
    secondary: [],
    difficulty: 1,
    equipment: ["bench", "dumbbells"],
    instructions: [
      "Sit on a bench with the knees bent at about ninety degrees and the balls of the feet on a block.",
      "Rest a dumbbell on each thigh, close to the knee.",
      "Press up on to the toes, pause, and lower slowly until the heels drop below the block.",
      "Keep the movement smooth; the range is short and easy to rush.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Bending the knee shifts the work to the soleus, the muscle that does most of the load-bearing at the slow, steady pace of a long uphill.",
    defaultSets: 3,
    defaultReps: 20,
    restSec: 60,
    alternatives: ["single-leg-calf-raise", "eccentric-heel-drop", "incline-treadmill-walk"],
    focuses: ["strength"],
  },
  {
    id: "eccentric-heel-drop",
    name: "Eccentric Heel Drop",
    primary: ["calves"],
    secondary: [],
    difficulty: 2,
    equipment: ["step"],
    instructions: [
      "Stand on the edge of a step and rise on to the toes with both feet.",
      "Shift your weight on to one foot and lower that heel over five seconds.",
      "Use both feet to return to the top — only the lowering is done single-legged.",
      "Build up gradually over weeks rather than adding load quickly.",
      "If the tendon is painful at rest or during the movement, stop and have it assessed by a physiotherapist before continuing.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Builds the calf and Achilles' tolerance for repeated loading on steep, stepped descent, where the tissue is worked hardest.",
    defaultSets: 3,
    defaultReps: 12,
    restSec: 60,
    alternatives: ["single-leg-calf-raise", "seated-calf-raise", "ankle-mobilisation"],
    focuses: ["strength", "technical"],
  },
  {
    id: "tibialis-raise",
    name: "Tibialis Raise",
    primary: ["calves"],
    secondary: [],
    difficulty: 1,
    equipment: ["none"],
    instructions: [
      "Stand with the back against a wall and the feet roughly half a metre forward.",
      "Keeping the heels planted, pull the toes and forefoot up towards the shins.",
      "Lower slowly rather than letting the feet drop.",
      "Expect the front of the shin to burn quickly — that is the point.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Strengthens the muscles along the shin that decelerate the foot on every descending step and hold it steady on off-camber ground.",
    defaultSets: 3,
    defaultReps: 20,
    restSec: 45,
    alternatives: ["ankle-band-work", "ankle-mobilisation", "single-leg-balance"],
    focuses: ["strength", "recovery"],
  },
  {
    id: "ankle-band-work",
    name: "Four-Way Ankle Band Work",
    primary: ["calves"],
    secondary: [],
    difficulty: 1,
    equipment: ["resistance-band"],
    instructions: [
      "Sit with the leg extended and loop a band around the forefoot.",
      "Anchor the band and work the ankle in four directions: point, pull up, turn in, turn out.",
      "Move slowly and return under control each time.",
      "Complete the four directions on one ankle, then the other.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Builds strength around the ankle in every direction, which is what talus, scree and off-camber trail load unpredictably.",
    defaultSets: 2,
    defaultReps: 15,
    restSec: 30,
    alternatives: ["tibialis-raise", "single-leg-balance", "ankle-mobilisation"],
    focuses: ["recovery", "technical"],
  },
  {
    id: "single-leg-balance",
    name: "Single-Leg Balance",
    primary: ["calves", "glutes"],
    secondary: ["core"],
    difficulty: 1,
    equipment: ["none"],
    instructions: [
      "Stand on one foot with the knee softly bent, eyes forward.",
      "Hold for thirty to forty-five seconds, letting the foot and ankle work to keep you steady.",
      "Progress by standing on a folded mat, or by closing the eyes near a wall.",
      "Change legs and compare — the weaker side usually needs the extra set.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Trains the ankle and hip reflexes that keep you upright in the half-second after a foot slips on loose ground.",
    defaultSets: 3,
    restSec: 30,
    alternatives: ["ankle-band-work", "single-leg-rdl", "lateral-step-up"],
    focuses: ["technical", "recovery"],
  },

  /* ---------------------------------------------------------------- */
  /* Hip stability                                                     */
  /* ---------------------------------------------------------------- */
  {
    id: "banded-lateral-walk",
    name: "Banded Lateral Walk",
    primary: ["glutes"],
    secondary: ["quads", "core"],
    difficulty: 2,
    equipment: ["resistance-band"],
    instructions: [
      "Place a band around both legs, just above the knees or around the ankles for more load.",
      "Adopt a quarter-squat with the feet hip-width apart.",
      "Step sideways, keeping tension on the band and the feet pointing forward.",
      "Take ten steps one way, then ten back, staying low throughout.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Loads the hip abductors that hold the pelvis level on every single-leg step, and which fatigue first on long, uneven ground.",
    defaultSets: 3,
    defaultReps: 20,
    restSec: 45,
    alternatives: ["side-lying-hip-abduction", "lateral-step-up", "single-leg-balance"],
    focuses: ["strength", "recovery"],
  },
  {
    id: "side-lying-hip-abduction",
    name: "Side-Lying Hip Abduction",
    primary: ["glutes"],
    secondary: [],
    difficulty: 1,
    equipment: ["none"],
    instructions: [
      "Lie on your side with the hips stacked and the lower leg bent for support.",
      "Lift the top leg towards the ceiling, keeping the toes pointing forward.",
      "Raise only as far as the hips stay stacked — rolling backwards recruits the wrong muscles.",
      "Lower slowly and repeat.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Isolates the glute medius without asking the ankle or knee to balance, so it can be trained even on days the legs are tired.",
    defaultSets: 3,
    defaultReps: 15,
    restSec: 30,
    alternatives: ["banded-lateral-walk", "glute-bridge", "lateral-step-up"],
    focuses: ["strength", "recovery"],
  },
  {
    id: "copenhagen-plank",
    name: "Copenhagen Plank",
    primary: ["core", "glutes"],
    secondary: ["hamstrings"],
    difficulty: 4,
    equipment: ["bench"],
    instructions: [
      "Prerequisite: a controlled forty-five-second side plank. Build that first.",
      "Lie on your side with the upper leg resting on a bench at about knee height.",
      "Support yourself on the forearm and press the upper leg into the bench to lift the hips.",
      "Begin with the lower leg bent and supported; straighten it only once the short version is easy.",
      "Hold for fifteen to thirty seconds. Groin work responds to gradual progression and nothing else.",
    ],
    mountainRelevance: "supporting",
    relevanceReason:
      "Strengthens the adductors that stabilise the hip on wide, awkward steps and on side-hilling traverses.",
    defaultSets: 3,
    restSec: 60,
    alternatives: ["side-plank", "banded-lateral-walk", "side-lying-hip-abduction"],
    highJointLoad: true,
    focuses: ["strength"],
  },

  /* ---------------------------------------------------------------- */
  /* Trunk                                                             */
  /* ---------------------------------------------------------------- */
  {
    id: "front-plank",
    name: "Front Plank",
    primary: ["core"],
    secondary: ["shoulders", "glutes"],
    difficulty: 1,
    equipment: ["none"],
    instructions: [
      "Set up on the forearms and toes with the elbows under the shoulders.",
      "Draw the ribs down and squeeze the glutes so the body forms one line.",
      "Breathe normally and hold for thirty to sixty seconds.",
      "End the set when the hips start to sag rather than pushing to a time target.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Builds the trunk stiffness that stops a heavy pack pulling the lower back into extension hour after hour.",
    defaultSets: 3,
    restSec: 45,
    alternatives: ["dead-bug", "side-plank", "back-extension"],
    focuses: ["strength"],
  },
  {
    id: "side-plank",
    name: "Side Plank",
    primary: ["core"],
    secondary: ["glutes", "shoulders"],
    difficulty: 2,
    equipment: ["none"],
    instructions: [
      "Lie on your side and prop yourself on the forearm, elbow under the shoulder.",
      "Lift the hips so the body forms a straight line from ankle to head.",
      "Hold for twenty to forty-five seconds, then change sides.",
      "Drop the knees to the floor for a shorter lever if the full position collapses.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Trains resistance to sideways collapse, which is the load a pack applies every time you traverse a slope or carry weight unevenly.",
    defaultSets: 3,
    restSec: 45,
    alternatives: ["front-plank", "suitcase-carry", "copenhagen-plank"],
    focuses: ["strength"],
  },
  {
    id: "dead-bug",
    name: "Dead Bug",
    primary: ["core"],
    secondary: [],
    difficulty: 1,
    equipment: ["none"],
    instructions: [
      "Lie on your back with the arms towards the ceiling and the hips and knees at ninety degrees.",
      "Press the lower back gently into the floor and keep it there.",
      "Extend one arm overhead and the opposite leg away, moving slowly.",
      "Return and change sides. If the back lifts off the floor, shorten the range.",
    ],
    mountainRelevance: "supporting",
    relevanceReason:
      "Teaches the trunk to stay braced while the arms and legs move independently, which is what walking under load actually requires.",
    defaultSets: 3,
    defaultReps: 10,
    restSec: 45,
    alternatives: ["front-plank", "bird-dog-alternative-placeholder", "pallof-press"],
    focuses: ["strength", "recovery"],
  },
  {
    id: "pallof-press",
    name: "Pallof Press",
    primary: ["core"],
    secondary: ["shoulders"],
    difficulty: 2,
    equipment: ["resistance-band"],
    instructions: [
      "Anchor a band at chest height and stand side-on, holding it with both hands at the sternum.",
      "Step away until the band is under tension.",
      "Press the hands straight out in front and resist the pull towards the anchor.",
      "Hold for two seconds, return, and complete the set before changing sides.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Trains anti-rotation, the quality that keeps a loaded pack from twisting you off balance on a narrow or uneven line.",
    defaultSets: 3,
    defaultReps: 10,
    restSec: 45,
    alternatives: ["side-plank", "suitcase-carry", "front-plank"],
    focuses: ["strength"],
  },

  /* ---------------------------------------------------------------- */
  /* Loaded carries                                                    */
  /* ---------------------------------------------------------------- */
  {
    id: "farmers-carry",
    name: "Farmer's Carry",
    primary: ["grip", "core"],
    secondary: ["back", "shoulders", "quads"],
    difficulty: 2,
    equipment: ["dumbbells"],
    instructions: [
      "Pick up a heavy dumbbell in each hand with a flat back.",
      "Stand tall, shoulders back, and walk at a steady pace for thirty to forty metres.",
      "Keep the ribs down and avoid leaning back against the load.",
      "Set the weights down under control rather than dropping them, then rest and repeat.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Builds grip and trunk endurance under load at the same time, which is what carrying kit over ground actually asks for.",
    defaultSets: 4,
    restSec: 90,
    alternatives: ["suitcase-carry", "ruck", "dead-hang"],
    focuses: ["strength", "long-mountain"],
  },
  {
    id: "suitcase-carry",
    name: "Suitcase Carry",
    primary: ["core", "grip"],
    secondary: ["back", "glutes"],
    difficulty: 2,
    equipment: ["dumbbells"],
    instructions: [
      "Hold a single dumbbell in one hand at your side.",
      "Walk thirty metres without letting the trunk lean towards or away from the weight.",
      "Keep the shoulders level and the stride even.",
      "Change hands and repeat.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Loads one side only, training the trunk to hold you square when the pack sits unevenly or an axe is in one hand.",
    defaultSets: 4,
    restSec: 75,
    alternatives: ["farmers-carry", "side-plank", "pallof-press"],
    focuses: ["strength"],
  },

  /* ---------------------------------------------------------------- */
  /* Pulling and pushing                                               */
  /* ---------------------------------------------------------------- */
  {
    id: "pull-up",
    name: "Pull-Up",
    primary: ["back", "arms"],
    secondary: ["grip", "core", "shoulders"],
    difficulty: 4,
    equipment: ["pull-up-bar"],
    instructions: [
      "Hang from the bar with the hands a little wider than the shoulders.",
      "Set the shoulders down and back before pulling — do not start from a slack hang.",
      "Pull until the chin clears the bar, keeping the ribs down.",
      "Lower fully under control, and stop the set when the lowering stops being controlled.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Provides the pulling strength used on steep scrambling, fixed lines and any move where the arms must take real body weight.",
    defaultSets: 4,
    defaultReps: 6,
    restSec: 120,
    alternatives: ["band-assisted-pull-up", "inverted-row", "single-arm-row"],
    focuses: ["strength", "technical"],
  },
  {
    id: "band-assisted-pull-up",
    name: "Band-Assisted Pull-Up",
    primary: ["back", "arms"],
    secondary: ["grip", "core"],
    difficulty: 2,
    equipment: ["pull-up-bar", "resistance-band"],
    instructions: [
      "Loop a resistance band over the bar and place one knee or foot in it.",
      "Hang with the shoulders set, then pull until the chin clears the bar.",
      "Lower slowly — the band helps least at the bottom, which is where control matters.",
      "Move to a thinner band once you can complete all sets cleanly.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Builds the same pulling strength as a full pull-up at a load you can actually accumulate volume with.",
    defaultSets: 4,
    defaultReps: 8,
    restSec: 90,
    alternatives: ["inverted-row", "pull-up", "single-arm-row"],
    focuses: ["strength", "technical"],
  },
  {
    id: "inverted-row",
    name: "Inverted Row",
    primary: ["back", "arms"],
    secondary: ["core", "grip"],
    difficulty: 2,
    equipment: ["pull-up-bar"],
    instructions: [
      "Set a bar at roughly hip height and lie underneath it.",
      "Grip a little wider than the shoulders and hold the body straight from heel to head.",
      "Pull the chest to the bar, leading with the elbows.",
      "Lower under control. Raise the bar to make it easier, lower it to make it harder.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Strengthens the mid-back that holds posture against pack straps, in a horizontal pull most athletes can already perform.",
    defaultSets: 3,
    defaultReps: 12,
    restSec: 75,
    alternatives: ["single-arm-row", "band-assisted-pull-up", "pull-up"],
    focuses: ["strength"],
  },
  {
    id: "single-arm-row",
    name: "Single-Arm Dumbbell Row",
    primary: ["back", "arms"],
    secondary: ["core", "grip"],
    difficulty: 2,
    equipment: ["dumbbells", "bench"],
    instructions: [
      "Place one hand and the matching knee on a bench, back flat and parallel to the floor.",
      "Hold a dumbbell in the free hand, arm hanging straight down.",
      "Row the weight to the ribs, keeping the shoulder square rather than rotating.",
      "Lower fully, then complete the set before changing sides.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Trains each side of the back independently, correcting the asymmetry that carrying a pack or an axe on one side reinforces.",
    defaultSets: 3,
    defaultReps: 10,
    restSec: 75,
    alternatives: ["inverted-row", "band-assisted-pull-up", "pull-up"],
    focuses: ["strength"],
  },
  {
    id: "push-up",
    name: "Push-Up",
    primary: ["chest", "shoulders"],
    secondary: ["arms", "core"],
    difficulty: 2,
    equipment: ["none"],
    instructions: [
      "Set the hands under the shoulders and hold the body in one line from heel to head.",
      "Lower until the chest is just off the floor, elbows at roughly forty-five degrees.",
      "Press back up without letting the hips sag or pike.",
      "Raise the hands on to a step to reduce the load while building strength.",
    ],
    mountainRelevance: "supporting",
    relevanceReason:
      "Supplies the pressing strength used to push up off a ledge, over a lip, or back on to your feet after a fall.",
    defaultSets: 3,
    defaultReps: 12,
    restSec: 60,
    alternatives: ["inverted-row", "front-plank", "single-arm-row"],
    focuses: ["strength"],
  },

  /* ---------------------------------------------------------------- */
  /* Grip and forearm                                                  */
  /* ---------------------------------------------------------------- */
  {
    id: "dead-hang",
    name: "Dead Hang",
    primary: ["grip"],
    secondary: ["back", "shoulders"],
    difficulty: 2,
    equipment: ["pull-up-bar"],
    instructions: [
      "Hang from a bar with both hands, shoulders active rather than fully slack.",
      "Hold for twenty to forty seconds, breathing steadily.",
      "Step off the moment the grip starts to slide rather than fighting to hold on.",
      "Stop for the day if the fingers or elbows feel sore.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Develops the grip endurance needed on rock, fixed lines and ladders, with no finger-specific loading.",
    defaultSets: 4,
    restSec: 90,
    alternatives: ["farmers-carry", "inverted-row", "wrist-extensor-work"],
    focuses: ["technical", "recovery"],
  },
  {
    id: "hangboard-repeaters",
    name: "Hangboard Repeaters",
    primary: ["grip"],
    secondary: ["arms", "back"],
    difficulty: 5,
    equipment: ["hangboard"],
    instructions: [
      "Prerequisite: at least a year of consistent climbing, no current finger, elbow or shoulder pain, and a full warm-up on easy holds.",
      "Use a large, comfortable edge and an open or half-crimp grip you can hold without strain.",
      "Work in short hangs with roughly equal rest between them, and long rests between sets.",
      "Take weight off with a foot on a chair or a band rather than hanging at a load you cannot control.",
      "Stop immediately at any sharp sensation in a finger. Finger injuries are slow to heal and this session is never worth one.",
      "Sets and repetitions are deliberately not prescribed here: finger loading depends on your climbing history and should be set with a coach.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Trains finger strength directly for technical rock, which no other movement in this library loads.",
    // Defaults intentionally omitted — see the final instruction. A generic
    // number here would be a fabricated prescription on the one tissue in the
    // library that responds worst to being guessed at.
    alternatives: ["dead-hang", "pull-up", "wrist-extensor-work"],
    highJointLoad: true,
    focuses: ["technical"],
  },
  {
    id: "wrist-extensor-work",
    name: "Wrist Extensor Band Work",
    primary: ["arms", "grip"],
    secondary: [],
    difficulty: 1,
    equipment: ["resistance-band"],
    instructions: [
      "Rest the forearm on a thigh with the palm facing down and a light band under the hand.",
      "Lift the back of the hand against the band, then lower slowly.",
      "Also open the fingers against a band looped around them.",
      "Keep the load light — this balances heavy gripping, it does not compete with it.",
    ],
    mountainRelevance: "supporting",
    relevanceReason:
      "Balances the closing work that climbing and carrying dominate, keeping the forearm loaded in both directions.",
    defaultSets: 2,
    defaultReps: 20,
    restSec: 30,
    alternatives: ["ankle-band-work", "dead-hang"],
    focuses: ["technical", "recovery"],
  },

  /* ---------------------------------------------------------------- */
  /* Mobility                                                          */
  /* ---------------------------------------------------------------- */
  {
    id: "ankle-mobilisation",
    name: "Ankle Dorsiflexion Mobilisation",
    primary: ["calves"],
    secondary: [],
    difficulty: 1,
    equipment: ["none"],
    instructions: [
      "Kneel with one foot flat and a hand's width from a wall.",
      "Drive the knee forward over the toes, keeping the heel down.",
      "Hold two seconds, return, and repeat for a minute per side.",
      "Move the foot further from the wall as the range improves.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Restores the ankle range steep uphill walking needs; without it the heel lifts early and the calf carries the entire load.",
    defaultDurationMin: 2,
    alternatives: ["hip-flexor-mobilisation", "eccentric-heel-drop", "single-leg-balance"],
    focuses: ["recovery", "technical"],
  },
  {
    id: "hip-flexor-mobilisation",
    name: "Hip Flexor Mobilisation",
    primary: ["quads"],
    secondary: ["core"],
    difficulty: 1,
    equipment: ["none"],
    instructions: [
      "Half-kneel with the rear knee on a pad and the front foot flat.",
      "Tuck the pelvis under and squeeze the rear glute before moving forward at all.",
      "Shift gently forward until you feel a stretch at the front of the rear hip.",
      "Hold for thirty to sixty seconds each side, breathing out slowly.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Opens the hip extension that a full stride uphill requires and that long hours of sitting or hiking under a pack shorten.",
    defaultDurationMin: 3,
    alternatives: ["ankle-mobilisation", "thoracic-rotation", "glute-bridge"],
    focuses: ["recovery"],
  },
  {
    id: "thoracic-rotation",
    name: "Thoracic Rotation",
    primary: ["back"],
    secondary: ["shoulders", "core"],
    difficulty: 1,
    equipment: ["none"],
    instructions: [
      "Lie on your side with the knees drawn up and stacked, arms together in front.",
      "Keeping the knees down, open the top arm and rotate the chest towards the ceiling.",
      "Follow the hand with your eyes and breathe out at the end of the range.",
      "Return slowly and repeat for a minute per side.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Restores the upper-back rotation that hours under pack straps gradually remove, and which overhead and axe work depend on.",
    defaultDurationMin: 2,
    alternatives: ["hip-flexor-mobilisation", "ankle-mobilisation"],
    focuses: ["recovery"],
  },

  /* ---------------------------------------------------------------- */
  /* Aerobic modes                                                     */
  /* ---------------------------------------------------------------- */
  {
    id: "recovery-walk",
    name: "Recovery Walk",
    primary: ["full-body"],
    secondary: ["calves", "quads"],
    difficulty: 1,
    equipment: ["none"],
    instructions: [
      "Walk on flat ground at a conversational pace.",
      "Carry nothing and stay off steep or technical terrain.",
      "Thirty to sixty minutes is plenty; this session is not meant to be a workout.",
      "If you feel worse at the end than the start, walk less next time.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Keeps blood moving through the legs between hard sessions without adding meaningful training load.",
    defaultDurationMin: 45,
    alternatives: ["cycling", "hip-flexor-mobilisation", "easy-run"],
    focuses: ["recovery"],
  },
  {
    id: "easy-run",
    name: "Easy Run",
    primary: ["full-body"],
    secondary: ["quads", "calves", "hamstrings"],
    difficulty: 2,
    equipment: ["none"],
    instructions: [
      "Run at a pace where you could hold a conversation in full sentences.",
      "Choose rolling ground rather than sustained steep climbs.",
      "Walk the steepest sections if that is what it takes to keep the effort easy.",
      "The great majority of aerobic volume should feel this comfortable.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Builds the aerobic base that determines how long you can keep moving on a mountain day, at an intensity you can repeat all week.",
    defaultDurationMin: 60,
    alternatives: ["incline-treadmill-walk", "cycling", "recovery-walk"],
    focuses: ["endurance"],
  },
  {
    id: "uphill-intervals",
    name: "Uphill Intervals",
    primary: ["full-body"],
    secondary: ["quads", "glutes", "calves"],
    difficulty: 4,
    equipment: ["none"],
    instructions: [
      "Find a steady climb of four to six minutes on non-technical ground.",
      "Warm up for at least fifteen minutes of easy running or hiking first.",
      "Climb at a hard but even effort, then descend at an easy jog or walk as recovery.",
      "Repeat four to six times, and stop the session if the efforts start getting slower rather than adding more.",
      "Never run the descent hard to save time. The downhill is recovery and nothing else.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Raises the ceiling of sustainable uphill effort, which is the specific quality that decides pace on a summit push.",
    defaultDurationMin: 60,
    restSec: 180,
    alternatives: ["stair-repeats", "incline-treadmill-walk", "easy-run"],
    focuses: ["intervals"],
  },
  {
    id: "incline-treadmill-walk",
    name: "Incline Treadmill Walk",
    primary: ["full-body"],
    secondary: ["calves", "quads", "glutes"],
    difficulty: 2,
    equipment: ["treadmill"],
    instructions: [
      "Set a gradient of ten to fifteen per cent and a pace you can hold comfortably.",
      "Walk without holding the handrails — leaning on them removes most of the training effect.",
      "Keep the effort conversational and the stride full.",
      "Increase the duration before you increase the gradient.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Reproduces sustained ascent indoors with no descent load, which makes it the most repeatable vertical session available.",
    defaultDurationMin: 45,
    alternatives: ["stair-repeats", "weighted-incline-walk", "easy-run"],
    focuses: ["endurance"],
  },
  {
    id: "weighted-incline-walk",
    name: "Weighted Incline Walk",
    primary: ["full-body"],
    secondary: ["calves", "quads", "glutes", "back"],
    difficulty: 3,
    equipment: ["treadmill", "pack"],
    instructions: [
      "Fit the pack properly with the weight carried on the hips, not the shoulders.",
      "Set a gradient of ten to fifteen per cent and a pace that stays conversational.",
      "Start light — around ten per cent of body weight — and add load over weeks, not sessions.",
      "Walk unassisted by the handrails and keep the trunk tall.",
      "Take the pack off before any descent portion; carrying it downhill multiplies the load on the knees for no aerobic gain.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Trains the exact combination a mountain day imposes — sustained gradient, a loaded pack and a steady heart rate.",
    defaultDurationMin: 60,
    alternatives: ["ruck", "stair-repeats", "incline-treadmill-walk"],
    focuses: ["endurance", "long-mountain"],
  },
  {
    id: "stair-repeats",
    name: "Stair Repeats",
    primary: ["full-body"],
    secondary: ["quads", "glutes", "calves"],
    difficulty: 3,
    equipment: ["stairs"],
    instructions: [
      "Use a long flight or a stairwell you can climb for two to five minutes continuously.",
      "Climb one step at a time at a strong, even effort with the whole foot on each tread.",
      "Walk down. The descent is recovery and, on stairs, the part where a slip is most likely.",
      "Repeat six to ten times depending on the length of the flight.",
      "Add a pack only once the unloaded version is comfortable.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Delivers a high rate of vertical gain in a short time, which is the closest indoor match to sustained mountain ascent.",
    defaultDurationMin: 45,
    restSec: 120,
    alternatives: ["incline-treadmill-walk", "uphill-intervals", "pack-step-up"],
    focuses: ["intervals", "long-mountain"],
  },
  {
    id: "ruck",
    name: "Loaded Pack Hike",
    primary: ["full-body"],
    secondary: ["quads", "glutes", "calves", "back"],
    difficulty: 3,
    equipment: ["pack"],
    instructions: [
      "Load the pack for the objective and fit the hip belt before you set off.",
      "Walk hilly ground at a steady, conversational pace.",
      "Wear the boots and socks you intend to use on the mountain — this is a kit rehearsal as much as a training session.",
      "Build duration first, then terrain, then weight. Changing all three at once tells you nothing.",
      "Turn around at the time you planned to, not the time you feel like. That habit is the one being trained.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "The single most specific session in the library: it trains the legs, the aerobic system, the feet and the kit at once.",
    defaultDurationMin: 180,
    alternatives: ["weighted-incline-walk", "stair-repeats", "easy-run"],
    focuses: ["endurance", "long-mountain"],
  },
  {
    id: "descent-practice",
    name: "Descent Practice",
    primary: ["quads"],
    secondary: ["calves", "core", "glutes"],
    difficulty: 3,
    equipment: ["none"],
    instructions: [
      "Choose a descent you know well, on stable ground and in good visibility.",
      "Walk down with a short stride, soft knees and the weight over the feet rather than back on the heels.",
      "Use poles if you have them; they take a genuine share of the load off the knees.",
      "Work in blocks of ten to fifteen minutes with a walk back up between them.",
      "Stop while your technique is still tidy. Descending on legs that have stopped absorbing is how ankles get turned.",
    ],
    mountainRelevance: "high",
    relevanceReason:
      "Prepares the legs for the eccentric loading of a long descent, which is where most of a mountain day's leg damage is done.",
    defaultDurationMin: 45,
    alternatives: ["eccentric-step-down", "stair-repeats", "ruck"],
    focuses: ["long-mountain", "technical"],
  },
  {
    id: "cycling",
    name: "Cycling",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings", "calves"],
    difficulty: 2,
    equipment: ["none"],
    instructions: [
      "Requires a bicycle or an indoor trainer.",
      "Ride at a steady, conversational effort with a cadence you can hold.",
      "Choose rolling terrain over long, hard climbs when the session is meant to be easy.",
      "Useful when the legs need aerobic work without the impact of running.",
    ],
    mountainRelevance: "moderate",
    relevanceReason:
      "Adds aerobic volume with almost no impact loading, which makes it the sensible choice when the legs are sore from vertical work.",
    defaultDurationMin: 75,
    alternatives: ["easy-run", "rowing", "recovery-walk"],
    unlistedKit: "Bicycle or indoor trainer",
    focuses: ["endurance", "recovery"],
  },
  {
    id: "rowing",
    name: "Rowing",
    primary: ["full-body"],
    secondary: ["back", "quads", "arms", "core"],
    difficulty: 2,
    equipment: ["none"],
    instructions: [
      "Requires a rowing ergometer.",
      "Drive with the legs first, then swing the trunk, then pull with the arms.",
      "Reverse that order on the way back to the catch.",
      "Row at a steady rate you can sustain, keeping the back flat throughout.",
    ],
    mountainRelevance: "supporting",
    relevanceReason:
      "Trains the aerobic system while loading the back and arms, offering volume on days the legs need a break from vertical.",
    defaultDurationMin: 40,
    alternatives: ["cycling", "easy-run", "inverted-row"],
    unlistedKit: "Rowing ergometer",
    focuses: ["endurance"],
  },
];

/** The public library. */
export const EXERCISES: Exercise[] = ENTRIES;

const BY_ID: Map<string, ExerciseEntry> = new Map(ENTRIES.map((e) => [e.id, e]));

/** Undefined for an unknown id — never a placeholder exercise. */
export function exerciseById(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                    */
/* -------------------------------------------------------------------------- */

/** Highest transfer first, so the most useful movement heads the list. */
const RELEVANCE_RANK: Record<Exercise["mountainRelevance"], number> = {
  high: 0,
  moderate: 1,
  supporting: 2,
};

/**
 * Whether every piece of kit the movement needs is to hand.
 *
 * Entries whose kit the `Equipment` union cannot express are excluded whenever a
 * filter is applied: we cannot verify the athlete owns a bicycle, and offering a
 * session they cannot do is the same failure as inventing a measurement.
 */
function equipmentSatisfied(entry: ExerciseEntry, available: readonly Equipment[]): boolean {
  if (entry.unlistedKit) return false;
  return entry.equipment.every((e) => e === "none" || available.includes(e));
}

export function exercisesFor(args: {
  focus: TrainingFocus;
  equipment?: Equipment[];
  maxDifficulty?: number;
}): Exercise[] {
  const { focus, equipment, maxDifficulty } = args;

  // Rest days return nothing, deliberately. A rest day exists so adaptation can
  // happen; offering "a few gentle options" is how rest quietly stops being rest.
  if (focus === "rest") return [];

  return (
    ENTRIES.filter((e) => e.focuses.includes(focus))
      .filter((e) => maxDifficulty === undefined || e.difficulty <= maxDifficulty)
      // No equipment argument means no filtering — the caller has not told us what
      // is available, which is different from knowing they have nothing.
      .filter((e) => equipment === undefined || equipmentSatisfied(e, equipment))
      .sort(
        (a, b) =>
          RELEVANCE_RANK[a.mountainRelevance] - RELEVANCE_RANK[b.mountainRelevance] ||
          a.difficulty - b.difficulty ||
          a.name.localeCompare(b.name, "en-GB"),
      )
  );
}

/**
 * The best replacement for an exercise, given the kit to hand.
 *
 * Curated alternatives are tried in the order they were authored — that order is
 * a judgement about closeness, not an accident. Failing those, we look only at
 * movements training exactly the same primary muscles at no greater difficulty,
 * preferring the gentler option on the joints, since discomfort is the other
 * common reason to substitute.
 *
 * Returns undefined rather than a loosely related movement. A wrong substitute
 * is worse than an honest gap: the athlete can be told the session needs
 * changing, which is a decision they should be making anyway.
 */
export function substitute(id: string, available: Equipment[]): Exercise | undefined {
  const original = BY_ID.get(id);
  if (!original) return undefined;

  for (const altId of original.alternatives) {
    const alt = BY_ID.get(altId);
    if (alt && alt.id !== id && equipmentSatisfied(alt, available)) return alt;
  }

  const key = [...original.primary].sort().join("|");
  const near = ENTRIES.filter(
    (e) =>
      e.id !== id &&
      [...e.primary].sort().join("|") === key &&
      e.difficulty <= original.difficulty &&
      equipmentSatisfied(e, available),
  ).sort(
    (a, b) =>
      Number(a.highJointLoad ?? false) - Number(b.highJointLoad ?? false) ||
      b.difficulty - a.difficulty,
  );

  return near[0];
}

/**
 * Shown wherever the library is presented as a programme rather than a reference.
 * The library describes movements; it cannot see the athlete performing them.
 */
export const EXERCISE_LIBRARY_DISCLAIMER =
  "These are training movements, not treatment. Sets and repetitions are starting points to be adjusted to the individual, and technique is best checked by a qualified coach. Stop any movement that produces pain and seek professional assessment rather than working around it. Technical mountain skills — cramponing, ice-axe use, rope work and glacier travel — are learned in person from a certified guide or instructor, and no amount of physical preparation substitutes for that instruction.";
