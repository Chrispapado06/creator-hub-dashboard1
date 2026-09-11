import type { CoachMessage } from "@/types";
import { systemPromptFor, type CoachContext } from "@/coach/context";
import { checkSafety } from "@/coach/safety";
import {
  ROUTES_NOT_FOUND,
  gatherRouteCandidates,
  isRouteQuestion,
  resolveRouteCards,
  routeCardsSummary,
  routeContextBlock,
  scriptedRouteReply,
  type NearBasis,
  type RouteCandidates,
  type RouteCard,
} from "@/coach/routeSuggestions";
import { parseRouteSuggestion } from "@/coach/routeTools";
import {
  isProfessionalQuestion,
  professionalContextBlock,
  professionalsFor,
  scriptedProfessionalReply,
  type ProfessionalShortlist,
} from "@/coach/professionals";
import { resolveReplyLanguage, scriptedEnglishOnlyNote } from "@/coach/language";
import {
  DEFAULT_COACH_MODEL,
  HISTORY_TURNS,
  MAX_REPLY_TOKENS,
  approxTokens,
  costOf,
  estimateExchangeMicros,
  isCoachModel,
  type TokenUsage,
} from "@/coach/budget";
import { parseCoachAction, type CoachAction } from "@/coach/tools";
import { fmtCountdown, fmtDistance, fmtElevation } from "@/lib/format";
import { DEMO } from "@/offline/offline";
import { supabase } from "@/backend/client";

/**
 * ICEFALL Coach.
 *
 * Scripted and context-aware by default — no key ships to the client. If
 * `VITE_COACH_ENDPOINT` is set, questions are posted to that server-side proxy
 * instead and the same shape comes back, so screens never change.
 *
 * Hard rule: the coach never substitutes for a doctor, a certified mountain
 * guide, or a professional expedition operator. Anything touching medical
 * judgement or high-consequence terrain carries an explicit deferral.
 */

const ENDPOINT = import.meta.env.VITE_COACH_ENDPOINT as string | undefined;

export type { CoachContext };

/** The coach's unprompted read on today, keyed to the prescribed session. */
export const FOCUS_GUIDANCE: Record<string, string> = {
  recovery:
    "Recovery is a session, not a day off. Move easily, keep the heart rate low, and let yesterday's work consolidate.",
  endurance:
    "You are building a durable aerobic base. Today is about time on feet, not intensity — keep it conversational and leave the effort for the long mountain day.",
  strength:
    "Strength work is what protects your knees on descent. Load the movements you actually use on the hill: step-ups, split squats, calf raises.",
  intervals:
    "Today is the hard one. Warm up properly, hold the efforts honest, and stop the session if the quality drops rather than grinding out the last rep.",
  "long-mountain":
    "The key session of the week. Go long and steady with a loaded pack, eat and drink from the first hour, and treat it as a dress rehearsal for the objective.",
  rest: "Full rest. Adaptation happens now — training again today would cost you more than it gains.",
  technical:
    "Technical practice, not fitness. Slow down, get the systems clean, and repeat them until they work when you are cold and tired.",
};

export const SUGGESTED_PROMPTS = [
  "What should I train today?",
  "Am I ready for Mont Blanc?",
  "What should I eat before tomorrow's hike?",
  "Why am I feeling fatigued?",
  "What gear do I need?",
  "How should I prepare for altitude?",
  "Can I increase my training this week?",
];

const MEDICAL_DISCLAIMER =
  "ICEFALL Coach is not a medical service. Persistent fatigue, pain or breathlessness should be assessed by a doctor.";
const GUIDE_DISCLAIMER =
  "Route and conditions judgement on technical terrain belongs with a certified mountain guide who can see the mountain on the day.";

interface Rule {
  /**
   * ANYTHING THAT CAN ANSWER `test`, which a RegExp already can.
   *
   * It was `RegExp` until the route rule arrived, and a route question is not
   * expressible as one pattern: it is "a trek question, OR a route noun beside
   * a word that asks FOR one" — a conjunction, deliberately, so that "should I
   * hike tomorrow" stays a training question. Widening the field to the shape
   * the table actually uses beats flattening that logic into an unreadable
   * pattern, or copying it into a second place where it could disagree with
   * `isRouteQuestion`.
   */
  match: { test(q: string): boolean };
  /**
   * `routes` is the shortlist `askCoach` retrieved for THIS question, or null
   * when the question did not ask for one. Only the route rule reads it; every
   * other rule ignores the argument, which is why it is a second parameter
   * rather than something threaded into `CoachContext`. The context is what the
   * app knows about the athlete; this is the answer to one question.
   */
  reply: (c: CoachContext, routes: RouteCandidates | null) => string;
  disclaimer?: string;
}

const RULES: Rule[] = [
  /*
   * PH-14b, widened to trails in Phase 2 step 3.
   *
   * FIRST ON PURPOSE, and it is the same reason the trek rule was first before
   * this replaced it: a question asking WHERE has to reach the retrieval rather
   * than be swallowed by a broader match below — "where can I hike to prepare"
   * would otherwise be caught by the gear rule's `wear`, of all things.
   *
   * IT REPLACED THE TREK RULE RATHER THAN SITTING ABOVE IT, because
   * `isRouteQuestion` is a superset of `isTrekQuestion` — leaving the old rule
   * beneath this one would have left a branch nothing could ever reach, and an
   * unreachable rule is a rule that quietly stops being true. The trek half of
   * the answer is still `scriptedTrekReply`, called by `scriptedRouteReply`,
   * unchanged and uncopied, so a pure trek question offline reads exactly as it
   * did before.
   *
   * The reply reads the same records the model path is handed, so the offline
   * coach and the model can never suggest different worlds.
   */
  /*
   * WHO TO HIRE — Phase 2, step 3. Second, directly under the route rule.
   *
   * ABOVE the broad rules for the same reason the route rule is above them:
   * "which guide should I book for Mont Blanc" would otherwise be swallowed by
   * the ready-for rule and answered with a preparation percentage.
   *
   * BELOW the route rule because the two are disjoint and the order is then
   * one less thing to reason about — checked rather than assumed: none of the
   * nine phrasings in `professionals.test.ts` matches `isRouteQuestion`, and
   * none of the route phrasings matches this one.
   *
   * THE MODEL DOES NOT PICK THE GUIDES, and this is the deliberate difference
   * from the route rule sitting above it. Routes are chosen by the model
   * through `suggest_routes` because which trail suits a training week is a
   * judgement. WHICH PROFESSIONAL FITS AN OBJECTIVE IS NOT A JUDGEMENT WE LET
   * IT MAKE: it is `rankGuides`, the marketplace's own matcher, run by the app
   * over the real catalogue, and a model re-ordering three qualified people is
   * an unauditable opinion about somebody's livelihood and somebody else's
   * safety. So the app retrieves, the app ranks, the app draws the cards, and
   * the model writes the paragraph beside them.
   */
  {
    match: { test: isProfessionalQuestion },
    reply: (c) => scriptedProfessionalReply(c.objective?.name, c.objective?.elevationM),
  },
  {
    match: { test: isRouteQuestion },
    reply: (c, routes) => scriptedRouteReply(c, routes),
  },
  {
    match: /what should i train|train today|session today|workout today/i,
    reply: (c) => {
      // The briefing may already have downgraded today. Saying "hold the efforts
      // honest" to someone the dashboard just told to rest is the contradiction
      // this whole context object exists to prevent.
      if (c.today.easeOff && c.today.briefingTraining) {
        return `Not the prescribed session today. ${c.today.briefingStatus}\n\nICEFALL has eased today to: ${c.today.briefingTraining}\n\n${c.today.briefingNote}`;
      }
      const t = c.today.session;
      if (!t) {
        return `Nothing is prescribed today, so treat it as recovery. You have logged ${c.weekly.activities} sessions and ${fmtElevation(c.weekly.elevationM)} m of ascent this week — that is enough stimulus to be worth absorbing.`;
      }
      const spec = [
        t.distanceKm ? `${fmtDistance(t.distanceKm)} km` : null,
        t.elevationM ? `${fmtElevation(t.elevationM)} m of ascent` : null,
        t.durationMin ? `about ${t.durationMin} minutes` : null,
      ]
        .filter(Boolean)
        .join(", ");

      /*
       * THE DECLARED LIMITATION, ON THE PATH THAT WORKS OFFLINE.
       *
       * `limitationAdjustment` is `modifySession` output — the same engine and
       * the same words the session screen prints, not a second description
       * written here. The scripted coach can therefore say what actually
       * happened to today's session without a model, without a network, and
       * without either coach contradicting the screen.
       *
       * Appended only in this branch. The ease-off branch above is describing
       * a session the briefing substituted, and the engine's adjustment is to
       * the PRESCRIBED one — pasting it there would attach a real change to
       * the wrong session.
       */
      const around = c.today.limitationAdjustment ? `\n\n${c.today.limitationAdjustment}` : "";

      return `Today is ${t.title.toLowerCase()}${spec ? ` — ${spec}` : ""}.${around}\n\n${FOCUS_GUIDANCE[t.focus] ?? ""}\n\nYou have logged ${c.weekly.activities} sessions and ${fmtElevation(c.weekly.elevationM)} m of ascent this week, so judge the effort against that rather than against how you feel in the first ten minutes.`;
    },
  },
  {
    match: /ready for|am i prepared|prepared for/i,
    reply: (c) => {
      const g = c.objective;
      if (!g) return "Set an objective first and I will assess your readiness against it.";

      const days = g.daysAway === null ? "date not set" : `${g.daysAway} days away`;
      const score = c.intel.readiness.score.value;

      // Readiness is withheld rather than guessed when components are missing —
      // so the coach says that, instead of asserting a strength it never measured.
      const readinessLine =
        score === null
          ? `ICEFALL is not putting a readiness number on today: ${
              c.intel.readiness.missing.join("; ") || "there is not enough recorded history yet"
            }.`
          : `Today's readiness is ${Math.round(score)} out of 100. ${c.intel.readiness.guidance}`;

      // Strengths and weaknesses come from the six-week memory, which derives
      // them from recorded activity. Nothing is claimed that was not measured.
      const strengths = c.intel.memory.strengths;
      const weaknesses = c.intel.memory.weaknesses;
      const working = strengths.length
        ? `What is working: ${strengths.join("; ")}.`
        : "There is not yet enough recorded history for me to say what is working.";
      const missing = weaknesses.length ? `What is not: ${weaknesses.join("; ")}.` : "";

      return `You are at ${g.preparationPct}% preparation for ${g.name}, ${days}.\n\n${readinessLine}\n\n${working}${
        missing ? `\n\n${missing}` : ""
      }\n\nPreparation is derived from the training you have actually recorded against the plan — it is not a judgement that the mountain is safe for you on the day.`;
    },
    disclaimer: GUIDE_DISCLAIMER,
  },
  {
    match: /\beat(ing)?\b|nutrition|\bfood\b|\bfuel(ling|s)?\b|\bcarb/i,
    reply: () =>
      "For a long ascent tomorrow, shift today's balance toward carbohydrate — roughly 6–8 g per kilogram of body weight across the day, weighted to the evening meal.\n\nOn the hill, aim for 60–90 g of carbohydrate per hour once you pass the two-hour mark, and start drinking before you feel thirsty. Test the exact foods on a training day, never for the first time on the objective.",
    disclaimer:
      "General guidance only. For individualised nutrition — particularly with any medical condition — consult a registered dietitian.",
  },
  /*
   * BEING ILL, AND ASKING FOR THE DAY BACK.
   *
   * Charlie, 11 September 2026, typed "hey, i dont feel good today im sick can
   * we change my plan" and got the welcome menu — the generic fallback, with a
   * row of suggestion chips. Nine keyword rules covered training, fuelling,
   * fatigue, gear, altitude, volume and weather, and NOT ONE of them covered an
   * athlete saying they are unwell, which is among the most common things
   * anybody says to a coach.
   *
   * IT SITS ABOVE THE FATIGUE RULE DELIBERATELY. "tired" and "exhausted" are in
   * that rule's pattern and illness is not the same thing: fatigue is a
   * training response to be read, illness is a reason to stop. Below it, "I
   * feel rough and I'm ill" would have been answered with a lecture about sleep
   * duration and energy intake.
   *
   * IT DOES NOT DIAGNOSE AND IT DOES NOT REASSURE. `checkSafety` has already
   * run several hundred lines above and returned for anything with a red flag
   * in it, so what reaches here is an ordinary "I'm under the weather". The
   * answer is the same one a guide gives: today is not a training day, and the
   * week survives losing it.
   */
  {
    /* A STATEMENT ABOUT THEMSELVES, NOW — not the word "sick" anywhere in a
       sentence. The first draft matched "how do I avoid getting sick at
       altitude" and answered a general question with "today is not a training
       day", which is the wrong answer delivered confidently. It now needs a
       first-person present claim, and refuses anything phrased as advice. */
    match: {
      test: (q: string) =>
        !/\b(?:how (?:do|can|to)|avoid|prevent|stop getting|what if|in case|risk of)\b/i.test(q) &&
        (/\b(?:i'?m|im|i am|feeling|i feel)\s+(?:really |very |a bit |pretty |quite |so |bit )?(?:sick|unwell|ill|poorly|rough|awful|terrible|rotten|lousy)\b/i.test(q) ||
          /\b(?:i )?(?:don'?t|do not) feel (?:good|well|great|right|ok|okay)\b/i.test(q) ||
          /\bi(?:'ve| have)? (?:got|caught|come down with)\b/i.test(q) ||
          /\bi have a (?:cold|sore throat|fever|temperature|chest infection|bug)\b/i.test(q)),
    },
    reply: (c) => {
      const prescribed = c.today.session;
      const line = prescribed
        ? `Today's prescribed session is ${prescribed}. Drop it.`
        : "Nothing is prescribed today anyway, so there is nothing to drop.";

      return (
        `Then today is not a training day. ${line}\n\n` +
        "Training through an illness does not bank the session — it lengthens the illness and costs you the next few days as well. The week is built to survive losing a day; it is not built to survive you turning a three-day cold into a fortnight.\n\n" +
        "**Rest until you have been clear for a full day, then come back one notch easier than where you stopped.** If it goes to your chest, if you have a fever, or if it has not started lifting after a few days, that is a doctor's call rather than a training one.\n\n" +
        "Tell me when you are back and I will move the week around what is left."
      );
    },
    disclaimer: MEDICAL_DISCLAIMER,
  },
  {
    match: /fatigue|tired|exhausted|recover|sleep|heavy legs/i,
    reply: (c) =>
      `Fatigue after ${c.weekly.activities} sessions and ${fmtElevation(c.weekly.elevationM)} m of ascent in seven days is a normal training response, particularly with a long mountain day in that block.\n\nBefore adding load, check the ordinary things: sleep duration, total energy intake, and whether your easy days are genuinely easy. If two consecutive easy sessions still feel hard, take the deload week early — it costs a week and protects the season.`,
    disclaimer: MEDICAL_DISCLAIMER,
  },
  {
    match: /gear|equipment|kit|wear|jacket|boots|layer/i,
    reply: (c) =>
      `For ${c.objective?.name ?? "your objective"}, the system matters more than any single piece: a merino base to regulate, a grid midlayer for the climb, insulation for stops, and a hardshell that survives ridge wind.\n\nOpen Gear from your profile for the full recommended system, with temperature ranges and the reasoning behind each choice.`,
  },
  {
    match: /altitude|acclimat|oxygen|thin air|hypox/i,
    reply: () =>
      "Altitude is earned slowly. Above 3,000 m, raise your sleeping altitude by no more than 300–500 m per night and build in a rest day every third or fourth.\n\nClimb high, sleep low is still the most reliable pattern. Know the symptoms of acute mountain sickness and treat descent as the answer rather than the failure — going down early is the decision that keeps the objective available next season.",
    disclaimer:
      "Altitude illness can become life-threatening quickly. Discuss any altitude plan and any prophylactic medication with a doctor experienced in altitude medicine, and climb with a certified guide on high peaks.",
  },
  {
    match: /increase|more volume|harder|\bpush\b|add training|\bramp(ing|s)?\b/i,
    reply: (c) =>
      `Not this week. You are at ${fmtElevation(c.weekly.elevationM)} m of ascent across ${c.weekly.activities} sessions, which is already at the top of your recent range.\n\nThe usual guidance is to raise weekly load by no more than about 10%, and to hold volume steady in any week containing a long mountain day. Add the volume in the next block instead — the adaptation you are chasing happens during recovery, not during the session.`,
  },
  {
    match: /weather|conditions|forecast|window/i,
    reply: () =>
      "Conditions shown in ICEFALL are indicative and should never be your only source. For any objective above the treeline, check a dedicated mountain forecast the evening before and again on the morning, and speak to the hut guardian or local guides office.\n\nBuild a turnaround time before you start, and honour it regardless of how close the summit looks.",
    disclaimer: GUIDE_DISCLAIMER,
  },
];

const FALLBACK = (c: CoachContext) => {
  const where = c.objective
    ? `Right now you are ${c.objective.preparationPct}% prepared for ${c.objective.name}.`
    : "You have not set an objective yet, so there is nothing for me to measure you against.";
  return `I can answer questions about training, fuelling, recovery, gear, altitude and conditions — read against your own recorded activity.\n\n${where}\n\nTry: what should I train today, am I ready for my objective, what should I eat before a long day, or why am I so tired.`;
};

function scripted(
  question: string,
  ctx: CoachContext,
  routes: RouteCandidates | null,
): Omit<CoachMessage, "id" | "at"> {
  const rule = RULES.find((r) => r.match.test(question));
  const body = rule ? rule.reply(ctx, routes) : FALLBACK(ctx);

  /*
   * THE OFFLINE COACH ONLY WRITES ENGLISH, AND SAYS SO — Phase 2, step 3.
   *
   * Every reply in `RULES` is a hand-written English string. The alternative
   * was to machine-translate them at request time, which would have put the
   * model on the one path that exists precisely because the model is not
   * reachable — offline, signed out, out of allowance, demo build. So a
   * non-English athlete gets English here.
   *
   * They are TOLD that, rather than left to wonder whether the setting took.
   * The note is itself in English, which is the least-bad option available and
   * not a good one; it comes out of the same reviewed-translation table as the
   * safety messages and will read in their language the day somebody reviews
   * one. See `@/coach/language`.
   *
   * NOT ADDED TO A SAFETY ANSWER: that path returns above this function and
   * never reaches it. An emergency card must not end with a note about
   * localisation.
   */
  const note = scriptedEnglishOnlyNote(resolveReplyLanguage());

  return {
    role: "coach",
    body: note ? `${body}\n\n${note}` : body,
    disclaimer: rule?.disclaimer,
  };
}

/**
 * WHAT A QUESTION IS FOR, which is how the proxy chooses a model: the cheap one
 * for everyday chat, a stronger one for a plan build or a weekly review.
 *
 * IT IS A DECLARATION, NOT A LEVER. The server reads it against the athlete's
 * plan and its own daily allowance for the stronger model, so a client that
 * declared `plan` on every turn would simply be answered by the cheap model —
 * never refused, and never billed more than the plan allows.
 *
 * ONLY `chat` IS SENT TODAY. Nothing in the app builds a plan or a weekly
 * review through the model yet; the other two exist so that when something
 * does, the routing it needs is already server-side rather than bolted on.
 */
export type CoachPurpose = "chat" | "plan" | "review";

/**
 * The drawn form of a `suggest_routes` turn.
 *
 * `basis` and `nearLabel` travel with the cards because "near you" and "near
 * Mont Blanc" are different claims and the cards alone cannot tell them apart —
 * a trail 30 km from the mountain somebody is training for looks exactly like a
 * trail 30 km from their house.
 */
export interface AskRoutes {
  cards: RouteCard[];
  basis: NearBasis;
  nearLabel: string | null;
  /**
   * The app's own sentence for the transcript, written from the app's records.
   * Names the routes and states no figure, so it is as true after a reload —
   * when the cards are gone, being memory-only — as it was before one.
   */
  summary: string;
}

export interface AskResult {
  message: CoachMessage;
  /** What this exchange cost, in micro-dollars. 0 when nothing was billed. */
  spentMicros: number;
  /** True when the model was skipped and the scripted coach answered instead. */
  scripted: boolean;
  /**
   * A CHANGE THE COACH IS ASKING THE APP TO MAKE — not a change that has been
   * made. Phase 2.
   *
   * The proxy returns the model's tool call untouched; `parseCoachAction`
   * re-validates it here against the closed vocabulary in `@/coach/tools`, and
   * whatever survives is handed to `@/coach/planActions`, which computes the
   * plan before and after, refuses it outright if it would make a downgraded
   * day harder, and renders every figure the athlete reads from the generator.
   *
   * ON A TOOL TURN `message.body` IS EMPTY and that is deliberate rather than a
   * failure: the proxy drops the model's prose because it was written before
   * the change was attempted and may describe an outcome the guard is about to
   * refuse. The screen writes the sentence, from what actually happened.
   *
   * Undefined on every ordinary answer, on the scripted coach, offline, on a
   * demo build, and when the model asked for something this version of the app
   * cannot carry out — refusing is always the safe direction.
   */
  action?: CoachAction;
  /**
   * ROUTES THE COACH ASKED THE APP TO DRAW — Phase 2, step 3.
   *
   * Present only when the model called `suggest_routes`. It carries CARDS, not
   * the model's picks: the resolution against the retrieved shortlist has
   * already happened by the time this is returned, in `resolveRouteCards`, so
   * an id the search never produced has already become nothing. The screen
   * renders what is here and decides nothing.
   *
   * `cards` MAY BE EMPTY AND THAT IS A REAL OUTCOME, not a null case. It means
   * the coach named routes ICEFALL could not match, and the athlete is told so
   * — see `summary`, which carries the app's sentence either way.
   */
  routes?: AskRoutes;
  /**
   * GUIDES AND COMPANIES THE APP RETRIEVED FOR THIS QUESTION — Phase 2, step 3.
   *
   * Present on BOTH paths whenever the question asked who to hire, and absent
   * on every other question. Unlike `routes` it is not the result of a tool
   * call: the model never chose these, never ordered them and cannot add one.
   * The app searched its own catalogue and ranked it with the marketplace's own
   * matcher, and the screen draws exactly what is here.
   *
   * IT CAN BE ENTIRELY EMPTY AND THAT IS THE PRODUCTION STATE, not a failure:
   * no guide has listed with ICEFALL. The screen renders the empty state from
   * the same object rather than drawing nothing, so the athlete is sent to a
   * real register instead of being left with a paragraph.
   */
  professionals?: ProfessionalShortlist;
}

/**
 * Ask the Coach.
 *
 * `budgetMicros` is what is LEFT of this athlete's allowance. When the estimated
 * cost of the next exchange would exceed it, the model is not called at all and
 * the scripted coach answers — the athlete keeps a working coach rather than an
 * error, and the bill stops. The estimate is deliberately pessimistic (full
 * reply length, no cache hit) so the cap is never crossed and then discovered.
 *
 * The client-side check is a courtesy stop, and always was — everything it
 * reads lives in one localStorage key. The real limits are the proxy's, keyed
 * to the account: a free monthly allowance, a daily one, a monthly spend
 * backstop and a burst window, all in the database (migration 20260911140000)
 * and checked before a token is spent. Over any of them the proxy answers 429
 * and the scripted coach takes the question, exactly as it does offline.
 */
export async function askCoach(
  question: string,
  ctx: CoachContext,
  history: CoachMessage[] = [],
  budgetMicros = Number.POSITIVE_INFINITY,
  purpose: CoachPurpose = "chat",
): Promise<AskResult> {
  const base = { id: `coach-${Date.now()}`, at: new Date().toISOString() };
  const recent = history.slice(-HISTORY_TURNS);

  /*
   * THE SYMPTOM GATE, AHEAD OF BOTH COACHES.
   *
   * Roadmap rule 3: safety never depends on the model. So this runs before the
   * endpoint check, before the budget estimate, before the session token and
   * before `RULES` — it is plain code in @/coach/safety with no imports that
   * can reach the network, and it answers the same offline, signed out, out of
   * budget and on a demo build.
   *
   * IT IS DELIBERATELY THE SECOND LINE HERE. `CoachChat.send` calls the same
   * function first, because it also has to get ahead of the free-tier counter
   * and the 5-9s "Thinking…" floor, neither of which this function can see.
   * This copy exists because `askCoach` is the seam any future caller will
   * use, and a safety layer that lives in one screen is one refactor from gone.
   *
   * Nothing is billed and nothing is counted: reporting chest pain must not
   * cost an athlete a credit.
   */
  const safety = checkSafety(question);
  if (safety) {
    return {
      message: { ...base, role: "coach", body: safety.body, disclaimer: safety.disclaimer },
      spentMicros: 0,
      scripted: true,
    };
  }

  /*
   * THE ROUTE SHORTLIST, RETRIEVED BEFORE EITHER COACH ANSWERS — Phase 2 step 3.
   *
   * ABOVE THE ENDPOINT BRANCH ON PURPOSE. Both coaches need the same records:
   * the model is handed them as ids it may pick from, and the scripted coach
   * reads them straight out. Retrieving inside the model branch would have left
   * the offline answer to invent a "near", which is the one thing this whole
   * mechanism exists to stop.
   *
   * BELOW THE SAFETY GATE, equally on purpose. A message reporting chest pain
   * has already returned several lines above, so nothing here runs for it — no
   * search, no network, no delay between an athlete and the word "descend".
   *
   * `isRouteQuestion` is what keeps this off every other question. The search
   * is a static-file read in most of Europe and an Overpass round trip off it,
   * and the block it produces is tokens the athlete pays for — neither is worth
   * spending on a question about fuelling.
   *
   * IT CANNOT THROW. `gatherRouteCandidates` returns a shortlist that says why
   * it is empty rather than rejecting, so a dead trail index costs this answer
   * a section and never the answer.
   */
  const routeCandidates = isRouteQuestion(question) ? await gatherRouteCandidates(ctx) : null;

  /*
   * THE GUIDE AND OPERATOR SHORTLIST — retrieved before either coach answers,
   * for the same two reasons as the routes above: both coaches must see the
   * same catalogue, and it must be below the safety gate so nothing about it
   * runs for somebody reporting a symptom.
   *
   * Synchronous, unlike the route search — the catalogue is a module in this
   * bundle, so this is a filter and a sort. It cannot fail and it cannot be
   * slow, which is why there is no empty-result fallback here: an empty
   * shortlist IS the answer, and it carries which kind of empty it is.
   */
  const professionals = isProfessionalQuestion(question)
    ? professionalsFor(ctx.objective?.name, ctx.objective?.elevationM)
    : undefined;

  // `ENDPOINT` IS set now (`.env.local`, 11 September), so this branch is the
  // live one on a signed-in online build — the sentence that used to sit here
  // saying it was unset stopped being true that night. A demo or offline build
  // still never reaches it, which is why nothing below may be the only copy of
  // something the athlete needs.
  if (ENDPOINT && !DEMO) {
    /* PH-14b. The trek shortlist is RETRIEVED and handed to the model as data
       with a closed-world rule. Without it, a model told to "suggest treks
       near their objective" will produce real-sounding treks ICEFALL does not
       hold — its failure mode here is generosity, not rudeness. Appended only
       when the question asks, because the block is tokens the athlete pays
       for on every other question. */
    /* The shortlist goes to the model as DATA with a closed-world rule, because
       its failure mode here is generosity rather than rudeness: told to suggest
       a prep hike with no data it will produce a real-sounding trail nobody can
       walk to. Appended only when the question asked, for the reason above. */
    /* The guide/operator shortlist goes over the same wall as the routes, and
       the closed-world rule on it is stricter: a model asked to recommend a
       guide with no data invents a person, with a plausible name and a
       plausible IFMGA licence, and somebody may try to hire them. Appended
       only when the question asked. */
    /*
     * ORDER MATTERS BECAUSE THE PROXY CLAMPS. The edge function caps the
     * client's `system` at 12,000 characters and truncates the END, so
     * whatever sits last is what is silently lost. Measured rather than
     * assumed: the professional block is 1,174 chars for Mont Blanc and 1,502
     * for Everest, the language instruction 626, and the route block and base
     * prompt together have never approached the cap — so the margin is large.
     * If a future block makes this tight, the closed-world rules must move
     * ahead of anything decorative, because a half-delivered "these are the
     * ONLY guides you may name" is worse than none.
     */
    const system = [
      systemPromptFor(ctx),
      routeCandidates ? routeContextBlock(routeCandidates) : null,
      professionals
        ? professionalContextBlock(ctx.objective?.name, ctx.objective?.elevationM)
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    const estimate = estimateExchangeMicros(
      approxTokens(system),
      recent.reduce((n, m) => n + approxTokens(m.body), 0),
    );

    if (estimate > budgetMicros) {
      // Out of allowance — answer from the scripted coach and say so, rather
      // than failing or quietly spending past the cap.
      await new Promise((r) => setTimeout(r, 320));
      return {
        message: { ...base, ...scripted(question, ctx, routeCandidates) },
        professionals,
        spentMicros: 0,
        scripted: true,
      };
    }

    try {
      /*
       * THE SESSION TOKEN GOES WITH THE QUESTION.
       *
       * The coach function is the one ICEFALL edge function that keeps
       * `verify_jwt` at its default. `strava` and `watch` must be public —
       * they are bare browser redirects that carry no Authorization header and
       * never can — but this one spends money on an Anthropic key per call, and
       * an unauthenticated endpoint whose URL is sitting in the app bundle in
       * plain text is somebody else's budget waiting to be found.
       *
       * Without this header every real call returned 401 and fell silently
       * through to the scripted coach, which looks exactly like the endpoint
       * not being configured at all — the failure would have been invisible.
       *
       * A signed-out athlete has no token, so the `?? ''` sends none and the
       * function refuses. That is the right answer rather than an error: the
       * catch below drops to the scripted coach, which is what a signed-out
       * device had anyway.
       */
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        // The system prompt carries the athlete AND ICEFALL's rules. A model
        // handed only the question will invent a readiness score, clear someone
        // for a summit, or prescribe a hard day the app has already vetoed.
        body: JSON.stringify({
          question,
          system,
          history: recent.map((m) => ({ role: m.role, body: m.body })),
          // Which model runs is the proxy's decision, taken from this and the
          // athlete's plan. See `CoachPurpose`.
          purpose,
          // Kept only so an older proxy still gets a model it recognises. The
          // current one ignores this field rather than letting a client pick
          // what it costs to answer.
          model: DEFAULT_COACH_MODEL,
          // Enforced by the API itself rather than hoped for.
          maxTokens: MAX_REPLY_TOKENS,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        body: string;
        disclaimer?: string;
        model?: string;
        usage?: TokenUsage;
        action?: { tool?: unknown; input?: unknown };
      };
      /* VALIDATED HERE AS WELL AS DECLARED THERE. The proxy is ours, but a
         schema that drifted across a deploy, or a model that returned a date as
         "next Tuesday", both arrive looking exactly like a valid call. Anything
         that does not match the vocabulary exactly becomes `undefined` and the
         athlete is told the coach asked for something the app could not read —
         which is the honest outcome, and the safe one. */
      const action = data.action
        ? (parseCoachAction(data.action.tool, data.action.input) ?? undefined)
        : undefined;

      /*
       * THE ROUTE TOOL, PARSED SEPARATELY AND EXCLUSIVELY.
       *
       * One envelope, two parsers, and they cannot both answer: every name in
       * `COACH_TOOL_NAMES` is refused by `parseRouteSuggestion`, and
       * `suggest_routes` is refused by `parseCoachAction`. It is kept out of
       * the plan vocabulary because it changes nothing — see the header of
       * `@/coach/routeTools`.
       *
       * RESOLVED HERE, AGAINST THE SHORTLIST THIS REQUEST SENT. That pairing is
       * the defence and it only holds in this scope: `routeCandidates` is the
       * list the model was shown a few lines above, so an id from anywhere else
       * — a hallucination, a stale id from an earlier turn, a name — matches
       * nothing and draws nothing. Passing the picks up to the screen and
       * resolving them there would have meant re-fetching a shortlist and
       * hoping it was the same one.
       */
      const suggestion = data.action
        ? parseRouteSuggestion(data.action.tool, data.action.input)
        : null;
      let routes: AskRoutes | undefined;
      if (suggestion && routeCandidates) {
        const cards = resolveRouteCards(suggestion.picks, routeCandidates);
        routes = {
          cards,
          basis: routeCandidates.basis,
          nearLabel: routeCandidates.nearLabel,
          summary: cards.length > 0 ? routeCardsSummary(cards, routeCandidates) : ROUTES_NOT_FOUND,
        };
      } else if (suggestion) {
        /* The coach asked for routes on a turn where nothing was retrieved —
           which means `isRouteQuestion` said no and the model was never shown a
           list, so every id it sent is one it made up. Nothing is drawn and the
           athlete is told, rather than being handed an empty bubble. */
        routes = { cards: [], basis: "none", nearLabel: null, summary: ROUTES_NOT_FOUND };
      }

      return {
        message: { ...base, role: "coach", body: data.body, disclaimer: data.disclaimer },
        action,
        routes,
        professionals,
        // Bill from the usage the proxy reports, at the model the proxy says
        // answered. Assuming the default here was right while every reply came
        // from the same model; with routing server-side it would under-count
        // an escalated one by a factor of two.
        spentMicros: data.usage
          ? costOf(data.usage, isCoachModel(data.model) ? data.model : DEFAULT_COACH_MODEL)
          : 0,
        scripted: false,
      };
    } catch {
      // Fall through to the scripted coach rather than showing an error.
    }
  }

  // A short pause so the response reads as considered rather than instant.
  await new Promise((r) => setTimeout(r, 620));
  return {
    message: { ...base, ...scripted(question, ctx, routeCandidates) },
    professionals,
    spentMicros: 0,
    scripted: true,
  };
}

export const openingMessage = (ctx: CoachContext): CoachMessage => ({
  id: "coach-opening",
  role: "coach",
  at: new Date().toISOString(),
  body: `Good to see you, ${ctx.athlete.firstName}.\n\nBased on your activity, sleep and progress toward ${ctx.objective?.name ?? "your objective"}, here is what I would prioritise today.`,
});
