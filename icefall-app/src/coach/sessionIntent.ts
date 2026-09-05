import type { ActivityType } from "@/tracking/types";
import type { TrainingFocus } from "@/types";

/**
 * "What do you want out of this session?" — and the plan that follows from it.
 *
 * The athlete picks an intent in their own words ("burn fat", "improve cardio")
 * and gets a structure for the activity they are about to record. The structure
 * differs by discipline, because a running hour and a climbing hour are not the
 * same hour: running is paced horizontally and mountaineering is paced
 * VERTICALLY, in metres per hour, which is the unit the rest of this app already
 * uses for alpine ground.
 *
 * ⚠️ THE RULE THIS MODULE INHERITS, from `sessions.ts` and `load.ts`:
 * there are NO heart-rate zones and NO target paces anywhere in here. ICEFALL
 * has never measured anyone's maximum, resting or threshold heart rate, so
 * "Zone 2" or "70% of max" would be a measurement presented where none was
 * taken. "Fat burning" in particular is normally sold as a heart-rate zone, and
 * that is exactly the number this app must not print.
 *
 * NOTE, because this paragraph used to say it and it was wrong: the app DOES
 * pair a Bluetooth heart-rate strap (`tracking/sources/heartRate.ts`), and a
 * recording made with one carries a real average. What it has never had is a
 * MAXIMUM or a THRESHOLD to express that reading as a percentage of — and that,
 * not the absence of a strap, is what makes a zone unprintable.
 *
 * What replaces it is effort described so the athlete can verify it against
 * themselves — the talk test, breathing, whether the last effort still looks
 * like the first — plus the things the phone genuinely measures: elapsed time,
 * distance, and ascent.
 */

export type IntentId =
  | "fat-burn"
  | "cardio"
  | "endurance"
  | "speed"
  | "vertical"
  | "recovery"
  | "free";

export interface SessionIntent {
  id: IntentId;
  label: string;
  /** One line, in the athlete's language, on the shelf. */
  blurb: string;
  focus: TrainingFocus;
  /**
   * What it actually does, physiologically, in plain words — and honestly.
   * Shown once the intent is chosen, so the athlete knows what they picked.
   */
  what: string;
}

export const SESSION_INTENTS: SessionIntent[] = [
  {
    id: "fat-burn",
    label: "Burn fat",
    blurb: "Long and easy",
    focus: "endurance",
    what:
      "Low, steady effort for a long time. The phrase 'fat-burning zone' usually names a heart-rate band — ICEFALL has never measured your heart rate, so this is set by how it feels and how long it lasts instead. Total time matters far more than intensity here.",
  },
  {
    id: "cardio",
    label: "Improve cardio",
    blurb: "Sustained, honest work",
    focus: "endurance",
    what:
      "A continuous effort hard enough to be work and easy enough to hold. This is the session that moves aerobic fitness most per hour spent.",
  },
  {
    id: "endurance",
    label: "Build endurance",
    blurb: "Time on your feet",
    focus: "long-mountain",
    what:
      "The long day. Nothing about it is fast — it teaches your legs, your feet and your head to keep going, which is what a summit day actually asks for.",
  },
  {
    id: "speed",
    label: "Get faster",
    blurb: "Intervals",
    focus: "intervals",
    what:
      "Repeated hard efforts with real rest between them. The point is that the last one looks like the first; if it doesn't, the session ends there.",
  },
  {
    id: "vertical",
    label: "Climb stronger",
    blurb: "Ascent, repeated",
    focus: "long-mountain",
    what:
      "Sustained climbing. Measured in metres gained rather than distance covered, because on steep ground the horizontal number stops meaning anything.",
  },
  {
    id: "recovery",
    label: "Recover",
    blurb: "Deliberately easy",
    focus: "recovery",
    what:
      "Movement that should feel like less than enough. Its whole job is to leave you fresher than it found you — going harder than this converts a recovery day into a mediocre training day.",
  },
  {
    id: "free",
    label: "Just record it",
    blurb: "No structure",
    focus: "endurance",
    what: "No plan and no targets. The session is recorded exactly as you do it.",
  },
];

export const intentById = (id: IntentId): SessionIntent =>
  SESSION_INTENTS.find((i) => i.id === id) ?? SESSION_INTENTS[SESSION_INTENTS.length - 1];

/* -------------------------------------------------------------------------- */
/* The plan                                                                    */
/* -------------------------------------------------------------------------- */

export interface PlanBlock {
  label: string;
  /** "20 min", "6 × 3 min", "400 m ascent" — the shape of the block. */
  amount: string;
  /** Effort in words. Never a zone, never a target pace. */
  effort: string;
}

export interface SessionPlan {
  intent: SessionIntent;
  /** Roughly how long the whole thing takes, in minutes. */
  totalMin: number;
  blocks: PlanBlock[];
  /** The one measurable thing to watch, in a unit the phone records. */
  watch: string;
  /** Said under every plan. */
  caveat: string;
}

/** Vertical disciplines are paced in metres gained per hour, not min/km. */
const VERTICAL_FAMILIES = new Set(["mountaineering", "climbing", "hiking", "winter"]);

/*
 * This read "ICEFALL holds no heart-rate, threshold or fitness test for you",
 * which parses as a denial that the app reads heart rate at all — it does, from
 * a paired strap. The true and narrower claim is the one the rule actually
 * rests on: no maximum, no threshold, no fitness test, so no percentage.
 */
const CAVEAT =
  "A structure, not a prescription. ICEFALL has never measured your maximum or threshold heart rate and holds no fitness test for you, so every effort here is described in words you can check against yourself rather than a number that would look measured.";

/**
 * A session plan for an intent and the discipline it will be recorded as.
 *
 * The same intent produces a different session on different ground. "Get
 * faster" on a trail run is repeated three-minute efforts; on a mountaineering
 * day it is repeated climbs, because intervals on a glacier measured in minutes
 * per kilometre would be meaningless.
 */
export function planFor(intent: SessionIntent, activity: ActivityType): SessionPlan {
  const vertical = VERTICAL_FAMILIES.has(activity.family) || activity.verticalFocus;
  const indoor = activity.indoor;

  switch (intent.id) {
    case "fat-burn":
      return {
        intent,
        totalMin: 75,
        blocks: [
          { label: "Ease in", amount: "10 min", effort: "Very easy — barely working" },
          {
            label: "Main",
            amount: vertical ? "55 min continuous" : "55 min continuous",
            effort: "Conversational — full sentences, the whole way",
          },
          { label: "Ease out", amount: "10 min", effort: "Easy" },
        ],
        watch: vertical ? "Total ascent, and that you never get out of breath" : "Total time, not pace",
        caveat: CAVEAT,
      };

    case "cardio":
      return {
        intent,
        totalMin: 50,
        blocks: [
          { label: "Warm up", amount: "12 min", effort: "Easy, building" },
          {
            label: "Main",
            amount: vertical ? "25 min sustained climbing" : "25 min continuous",
            effort: "Comfortably hard — short sentences only",
          },
          { label: "Cool down", amount: "10 min", effort: "Easy" },
        ],
        watch: vertical ? "Metres gained in the main block" : "Distance covered in the main block",
        caveat: CAVEAT,
      };

    case "endurance":
      return {
        intent,
        totalMin: vertical ? 240 : 150,
        blocks: [
          { label: "Start deliberately slow", amount: "20 min", effort: "Easier than feels right" },
          {
            label: "Main",
            amount: vertical ? "3–4 h steady" : "2 h steady",
            effort: "Steady — the pace you could hold all day",
          },
          { label: "Finish easy", amount: "10 min", effort: "Easy" },
        ],
        watch: vertical ? "Total ascent and total time" : "Total time on your feet",
        caveat: CAVEAT,
      };

    case "speed":
      return {
        intent,
        totalMin: 55,
        blocks: [
          { label: "Warm up", amount: "15 min", effort: "Easy, with a few strides" },
          {
            label: "Main",
            amount: vertical ? "6 × 4 min climbing" : "6 × 3 min",
            effort: "Hard but repeatable — the last must look like the first",
          },
          { label: "Between efforts", amount: "3 min each", effort: "Walk or very easy" },
          { label: "Cool down", amount: "10 min", effort: "Easy" },
        ],
        watch: "Whether the last effort matches the first. If it doesn't, stop there.",
        caveat: CAVEAT,
      };

    case "vertical":
      return {
        intent,
        totalMin: 90,
        blocks: [
          { label: "Approach", amount: "15 min", effort: "Easy" },
          {
            label: "Main",
            amount: indoor ? "45 min continuous" : "600–800 m of ascent",
            effort: "Steady — a rhythm you can hold to the top",
          },
          { label: "Descent", amount: "As long as it takes", effort: "Controlled — this is where legs get wrecked" },
        ],
        watch: "Metres gained per hour — the app records it as you go",
        caveat: CAVEAT,
      };

    case "recovery":
      return {
        intent,
        totalMin: 35,
        blocks: [
          {
            label: "All of it",
            amount: "30–40 min",
            effort: "Easy — this should feel like less than enough",
          },
        ],
        watch: "That you finish fresher than you started",
        caveat: CAVEAT,
      };

    default:
      return {
        intent,
        totalMin: 0,
        blocks: [],
        watch: "Nothing — no targets were set",
        caveat:
          "No structure was chosen, so nothing here is prescribed. The session is recorded exactly as you do it.",
      };
  }
}
