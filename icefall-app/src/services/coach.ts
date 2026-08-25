import type { CoachMessage } from "@/types";
import { systemPromptFor, type CoachContext } from "@/coach/context";
import {
  DEFAULT_COACH_MODEL, HISTORY_TURNS, MAX_REPLY_TOKENS, approxTokens, costOf,
  estimateExchangeMicros, type TokenUsage,
} from "@/coach/budget";
import { fmtCountdown, fmtDistance, fmtElevation } from "@/lib/format";

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
  match: RegExp;
  reply: (c: CoachContext) => string;
  disclaimer?: string;
}

const RULES: Rule[] = [
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

      return `Today is ${t.title.toLowerCase()}${spec ? ` — ${spec}` : ""}.\n\n${FOCUS_GUIDANCE[t.focus] ?? ""}\n\nYou have logged ${c.weekly.activities} sessions and ${fmtElevation(c.weekly.elevationM)} m of ascent this week, so judge the effort against that rather than against how you feel in the first ten minutes.`;
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
      const missing = weaknesses.length
        ? `What is not: ${weaknesses.join("; ")}.`
        : "";

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

function scripted(question: string, ctx: CoachContext): Omit<CoachMessage, "id" | "at"> {
  const rule = RULES.find((r) => r.match.test(question));
  return {
    role: "coach",
    body: rule ? rule.reply(ctx) : FALLBACK(ctx),
    disclaimer: rule?.disclaimer,
  };
}

export interface AskResult {
  message: CoachMessage;
  /** What this exchange cost, in micro-dollars. 0 when nothing was billed. */
  spentMicros: number;
  /** True when the model was skipped and the scripted coach answered instead. */
  scripted: boolean;
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
 * The client-side check is a courtesy stop. The proxy holding the API key must
 * enforce the same ceiling per account — see the note in @/coach/budget.
 */
export async function askCoach(
  question: string,
  ctx: CoachContext,
  history: CoachMessage[] = [],
  budgetMicros = Number.POSITIVE_INFINITY,
): Promise<AskResult> {
  const base = { id: `coach-${Date.now()}`, at: new Date().toISOString() };
  const recent = history.slice(-HISTORY_TURNS);

  if (ENDPOINT) {
    const system = systemPromptFor(ctx);
    const estimate = estimateExchangeMicros(
      approxTokens(system),
      recent.reduce((n, m) => n + approxTokens(m.body), 0),
    );

    if (estimate > budgetMicros) {
      // Out of allowance — answer from the scripted coach and say so, rather
      // than failing or quietly spending past the cap.
      await new Promise((r) => setTimeout(r, 320));
      return { message: { ...base, ...scripted(question, ctx) }, spentMicros: 0, scripted: true };
    }

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The system prompt carries the athlete AND ICEFALL's rules. A model
        // handed only the question will invent a readiness score, clear someone
        // for a summit, or prescribe a hard day the app has already vetoed.
        body: JSON.stringify({
          question,
          system,
          history: recent.map((m) => ({ role: m.role, body: m.body })),
          model: DEFAULT_COACH_MODEL,
          // Enforced by the API itself rather than hoped for.
          maxTokens: MAX_REPLY_TOKENS,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        body: string;
        disclaimer?: string;
        usage?: TokenUsage;
      };
      return {
        message: { ...base, role: "coach", body: data.body, disclaimer: data.disclaimer },
        // Bill from the usage the proxy reports. No usage means nothing to bank.
        spentMicros: data.usage ? costOf(data.usage, DEFAULT_COACH_MODEL) : 0,
        scripted: false,
      };
    } catch {
      // Fall through to the scripted coach rather than showing an error.
    }
  }

  // A short pause so the response reads as considered rather than instant.
  await new Promise((r) => setTimeout(r, 620));
  return { message: { ...base, ...scripted(question, ctx) }, spentMicros: 0, scripted: true };
}

export const openingMessage = (ctx: CoachContext): CoachMessage => ({
  id: "coach-opening",
  role: "coach",
  at: new Date().toISOString(),
  body: `Good to see you, ${ctx.athlete.firstName}.\n\nBased on your activity, sleep and progress toward ${ctx.objective?.name ?? "your objective"}, here is what I would prioritise today.`,
});
