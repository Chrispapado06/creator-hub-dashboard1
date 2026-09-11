// ICEFALL Coach — the model call, server side.
//
// ============================================================================
// WHY THIS IS SERVER CODE AT ALL
// ============================================================================
//
// The same fact as strava/index.ts and watch/index.ts: ICEFALL is a static
// site, and an Anthropic API key handed to a browser bundle is an API key
// anybody can read out of the bundle and spend. So the key lives in
// `supabase secrets` and is read here, and the phone never sees it.
//
// Until this function existed there was NO model call in a production build.
// `src/services/coach.ts` posts to `VITE_COACH_ENDPOINT` when it is set and
// otherwise falls through to a hand-written table of regular-expression rules
// with a 620 ms pause. Everything on the client side was already built — the
// contract, the model allowlist, the cost table, the credit ledger, the
// history cap — and this is the missing half.
//
// ============================================================================
// THE CONTRACT, WHICH THE CLIENT ALREADY SPEAKS
// ============================================================================
//
// POST { question, system, history: [{role, body}], purpose?, model?, maxTokens? }
//   -> 200 { body, action?, model, usage: {...}, allowance: {...} }
//   -> 429 { error: "limit", reason, retryAfterSeconds, allowance }
//
// `action` IS NEW AND IT IS A PROPOSAL, NOT A RESULT. See THE TOOLS below.
//
// The shape is the `fetch` body in `askCoach` (src/services/coach.ts) — not
// invented here. Two corrections to what this header used to claim:
//
//   * It listed a `disclaimer?` in the 200 response. This function has never
//     returned one and does not now. Safety text on the model path comes from
//     HOUSE_RULES below and, ahead of both coaches, from the plain-code gate in
//     `src/coach/safety.ts` which never reaches the network at all.
//   * `model` in the REQUEST is now ignored. Which model answers is decided
//     here, from `purpose` and the caller's tier — see MODEL ROUTING. The field
//     is still accepted so an older bundle does not break.
//
// ============================================================================
// WHAT THIS FUNCTION DOES NOT TRUST
// ============================================================================
//
// THE CALLER IS AUTHENTICATED. `verify_jwt` is left at its default (true) for
// this function, unlike strava and watch, which are bare browser redirects and
// must be public. There is no such excuse here: an unauthenticated coach
// endpoint is an open invitation to spend somebody else's model budget, and it
// would be found — these URLs are in the app bundle in plain text.
//
// THE CLIENT'S `system` IS APPENDED, NEVER SUBSTITUTED. It carries the
// athlete's own context, which only the phone has — but the rules below are
// prepended here so that a modified client cannot strip the one paragraph that
// stops a coach clearing somebody for a summit. Client context is also length
// capped, because an unbounded system prompt is an unbounded bill.
//
// `maxTokens` is clamped, history is clamped, and the question is clamped. Each
// of those is a line on an invoice.
//
// THE CLIENT'S COUNTERS ARE NOT COUNTERS. `src/coach/budget.ts` keeps three —
// three conversations a month, eight credits a day, a $1/month backstop — and
// says in its own header that they are "a DISPLAY and a client-side courtesy
// stop — not a limit", because they live in one localStorage key. Since
// 20260911140000 the real ones live in the database and are checked below,
// per account, before any token is spent.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * The client sends a short name; the API needs a real id. Mapping here rather
 * than in the app keeps the app's cost table and this allowlist honest about
 * being the same list, and means a model rename is one server deploy rather
 * than an app release.
 */
const MODELS: Record<string, string> = {
  "claude-haiku-4-5": "claude-haiku-4-5-20251001",
  "claude-sonnet-5": "claude-sonnet-5",
  "claude-opus-5": "claude-opus-5",
};
const DEFAULT_MODEL = "claude-haiku-4-5";
const STRONG_MODEL = "claude-sonnet-5";

/* ========================================================================== */
/* MODEL ROUTING                                                              */
/* ========================================================================== */

/**
 * WHAT THE QUESTION IS FOR decides which model answers it, and the decision is
 * made HERE rather than on the phone.
 *
 * An everyday chat turn is a short, grounded reply from a context the app has
 * already assembled: Haiku answers it as well as anything and costs a fifth of
 * Sonnet. A plan build or a weekly review is a different job — more input, more
 * structure held at once, and a mistake that persists for weeks rather than for
 * one message — so those are worth the stronger model.
 *
 * `purpose` IS A DECLARATION, NOT A LEVER. A modified client can put any of
 * these words in the body; what it cannot do is turn that into spend. Two
 * things stop it, both server side:
 *
 *   1. TIER. `daily_strong_calls` is 0 on the free plan (20260911140000), so a
 *      free account declaring `plan` on every turn is answered by Haiku, every
 *      turn. It is not refused — the athlete asked a real question — it is
 *      simply not escalated.
 *   2. A DAILY ALLOWANCE ON TOP. Even on the paid plan the stronger model has
 *      its own per-day count. Past it, the same downgrade happens.
 *
 * So the worst a declared purpose can do is ask. `coach_consume` answers.
 *
 * NOTHING IN THE APP DECLARES `plan` OR `review` TODAY. `askCoach` is called
 * from one place, the chat screen, and sends `chat`. The other two purposes are
 * the server half of a client that does not exist yet — said plainly so nobody
 * reads this block as evidence that plan builds are model-backed. They are not.
 */
type Purpose = "chat" | "plan" | "review";

interface Route {
  /** Whether this purpose ASKS for the stronger model. The tier answers. */
  strong: boolean;
  /** Ceiling on the reply. A plan needs more room than a chat turn. */
  maxReplyTokens: number;
}

const ROUTES: Record<Purpose, Route> = {
  chat: { strong: false, maxReplyTokens: 900 },
  plan: { strong: true, maxReplyTokens: 1_600 },
  review: { strong: true, maxReplyTokens: 1_400 },
};

const purposeOf = (v: unknown): Purpose =>
  v === "plan" || v === "review" || v === "chat" ? v : "chat";

/**
 * Micro-dollars per million tokens — 1_000_000 micros = $1.00, integers only,
 * the same units as `src/coach/budget.ts`.
 *
 * These are Anthropic's list prices and they are checked, not remembered:
 * Haiku 4.5 $1/$5, Sonnet 5 $2/$10, Opus 5 $5/$25 per MTok. NOTE that
 * budget.ts carried Sonnet at $3/$15 — that is Sonnet 4.6's price, and the
 * client's table has been corrected to match this one. Cache reads are ~0.1x
 * input, which is why the system block is sent with `cache_control` below.
 */
const RATES: Record<string, { input: number; output: number; cached: number }> = {
  "claude-haiku-4-5": { input: 1_000_000, output: 5_000_000, cached: 100_000 },
  "claude-sonnet-5": { input: 2_000_000, output: 10_000_000, cached: 200_000 },
  "claude-opus-5": { input: 5_000_000, output: 25_000_000, cached: 500_000 },
};

/** Tokens ≈ chars / 4. Only ever used for the pre-flight estimate. */
const approxTokens = (text: string) => Math.ceil(text.length / 4);

/**
 * What this exchange will cost AT WORST, in micro-dollars: every input token
 * billed fresh, and a reply that runs to the ceiling. Deliberately pessimistic,
 * so the month's cap is refused BEFORE it is crossed rather than discovered
 * afterwards — the same reasoning as `estimateExchangeMicros` on the client.
 */
function estimateMicros(model: string, inputTokens: number, maxTokens: number): number {
  const rate = RATES[model] ?? RATES[DEFAULT_MODEL];
  return Math.ceil(
    (inputTokens * rate.input) / 1_000_000 + (maxTokens * rate.output) / 1_000_000,
  );
}

/** What it actually cost, from the usage the API reported. */
function costMicros(
  model: string,
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number },
): number {
  const rate = RATES[model] ?? RATES[DEFAULT_MODEL];
  const fresh = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return Math.ceil(
    (fresh * rate.input) / 1_000_000 +
      (usage.cachedInputTokens * rate.cached) / 1_000_000 +
      (usage.outputTokens * rate.output) / 1_000_000,
  );
}

/* Ceilings on ONE call. The per-USER ceilings are in the database. */
const MAX_REPLY_TOKENS = 1_600;
const MAX_QUESTION_CHARS = 2_000;
const MAX_SYSTEM_CHARS = 12_000;
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS = 8_000;

/**
 * PREPENDED TO WHATEVER THE CLIENT SENDS, and not removable by it.
 *
 * Every line here is a rule this app already holds itself to elsewhere, written
 * for the model rather than for a reader. The readiness rule and the guide
 * deferral in particular exist because this is mountaineering: a chat reply
 * that reads as clearance to go up something technical is the one failure that
 * is not recoverable.
 */
const HOUSE_RULES = `You are ICEFALL's mountaineering coach, speaking to one athlete inside their training app.

HONESTY, WHICH OUTRANKS BEING HELPFUL:
- Answer only from what you are given. If a figure is not in the context, say you do not have it. Never estimate a number and present it as measured.
- If the athlete's context says a figure is withheld or not yet computable, say so and say what is missing. Do not fill the gap.
- Never invent an activity, a date, a heart rate, a summit or a plan the context does not contain.

SAFETY, WHICH OUTRANKS EVERYTHING:
- You never clear anybody for a summit, a route or a grade. Readiness in this app is a planning aid, not a clearance, and you must not describe it as one.
- Route and conditions judgement on technical terrain belongs with a certified mountain guide who can see the mountain that day. Say so when the question touches it.
- Symptoms — chest pain, breathlessness at rest, confusion, severe headache with altitude, anything neurological — get a doctor or a descent, not training advice.
- You do not diagnose, and you do not give medical advice.

VOICE:
- Plain, spare, specific. Short paragraphs. No exclamation marks, no cheerleading, no emoji.
- Give the reason with the instruction, briefly.
- Speak to a serious amateur, not a beginner and not a professional.
- Put **double asterisks** around the ACTION the athlete should take, and nothing else: "**add vertical**", "**skip the long day**", "**keep it easy for 40 minutes**". At most two per reply, and never around a whole sentence, a number, a warning or a heading. If a reply contains no instruction, it contains no bold. This is the one piece of formatting available. Never use single asterisks, italics, headings, bullet lists or any other markdown — the app renders bold and nothing else, and anything else you write is stripped before the athlete sees it.`;

/* ========================================================================== */
/* THE TOOLS                                                                  */
/* ========================================================================== */

/**
 * WHAT THE MODEL MAY ASK FOR — AND WHY ASKING IS ALL IT CAN DO.
 *
 * ==========================================================================
 * THE SERVER DECLARES; THE PHONE PERFORMS
 * ==========================================================================
 *
 * These tools are declared to the API here and the model's choice is passed
 * back to the app UNTOUCHED. This function does not carry any of them out, and
 * that is not a shortcut — it is where the data is. The training plan is
 * generated on the phone by a pure function of the objective and the date; the
 * adjustments that sit on top of it live in `localStorage`; readiness and
 * recovery are computed on the phone from activities the phone holds. There is
 * no table here to write to and nothing here to write about.
 *
 * So the response carries `action: { tool, input }` and the app does the rest:
 * it re-validates every field (`src/coach/tools.ts`), computes the plan before
 * and the plan after (`src/coach/planActions.ts`), refuses the change outright
 * if it would make a downgraded day harder (`src/coach/planGuard.ts`), and
 * renders the figures from its own engine's output. Nothing this file returns
 * is applied on the strength of having been returned.
 *
 * ==========================================================================
 * NO TOOL RESULT GOES BACK TO THE MODEL, AND THE TURN ENDS AT THE TOOL CALL
 * ==========================================================================
 *
 * The ordinary tool-use loop returns a `tool_result` and lets the model write a
 * closing sentence. Not here, for two reasons and the first is decisive:
 *
 *   1. THE MODEL WOULD BE DESCRIBING WHAT HAPPENED. Whether the change actually
 *      happened is decided on the phone, seconds later, by a guard this
 *      function cannot see the inputs to — so anything written now about the
 *      outcome is a prediction, and a prediction rendered as a coach's report
 *      is exactly the false claim the app must never make. The app writes that
 *      sentence instead, from what its engine did.
 *   2. It is a second billed round trip per change, against a budget of about
 *      one euro per paying athlete per month.
 *
 * THE MODEL'S TEXT BLOCK IS DROPPED WHEN A TOOL IS CALLED, for the same reason.
 * It is composed before the tool runs, so a cheerful "I've moved Saturday's
 * long day to Sunday and trimmed it" can accompany a change the guard is about
 * to refuse. The model's one surviving sentence is the `why` argument, which is
 * a REASON rather than a report — the app shows it in quotation marks with the
 * coach's name on it, beside figures it computed itself.
 *
 * ==========================================================================
 * WHAT THESE SCHEMAS CANNOT EXPRESS
 * ==========================================================================
 *
 * There is no field for a session title, a distance, an ascent, a difficulty or
 * a description of a workout — only dates, a direction and, in two places, a
 * number the athlete said out loud. A model here cannot write training; it can
 * only point at a day in training the app already generated.
 *
 * Nor is there any way to make a day HARDER. There is no `lengthen`, no
 * `add_session`, no `intensify`. The four things a change can do to a day are
 * move it, clear it, shorten it and ease it, and every one of them is the same
 * or less work than the day had. The guard on the phone exists for the one
 * remaining route — moving a hard session ONTO a day that has been downgraded —
 * which is a property of the resulting plan rather than of any argument here.
 *
 * ==========================================================================
 * THESE NAMES ARE MIRRORED BY HAND
 * ==========================================================================
 *
 * The app holds the same list, because a Deno deploy cannot import from the app
 * bundle. It is split across two files there, matching the split below: the
 * eight plan tools are mirrored in `src/coach/tools.ts`, and `suggest_routes` —
 * which changes nothing — in `src/coach/routeTools.ts`.
 *
 * Note which way drift hurts: a tool declared here and unknown there is refused
 * on the phone and the athlete is told; a tool known there and never declared
 * here is simply never called. Drift produces refusals, never a wrong change.
 */

/** A calendar day, said the same way in every schema below. */
const DATE_ARG = {
  type: "string",
  description: "A calendar date as YYYY-MM-DD. Never a weekday name or a phrase.",
};

const WHY_ARG = {
  type: "string",
  description:
    "One short sentence saying why, in your own words, shown to the athlete in quotation marks and attributed to you. No figures the app has not given you, and no description of the result — the app writes that from what it actually did.",
};

const TOOLS = [
  {
    name: "log_activity",
    description:
      "Record training the athlete says they have already done. Use this only when they report a session in the past; never to plan one. The figures are theirs, not yours — transcribe what they said and do not fill in what they did not. It is recorded as self-reported and never counts toward a personal best.",
    input_schema: {
      type: "object",
      properties: {
        date: DATE_ARG,
        startTimeLocal: {
          type: "string",
          description:
            "The local clock time they started, 24-hour HH:MM, e.g. 05:30. Include it ONLY if they said when — 'this morning' is not a time, and if you want one, ask. Omit it otherwise: the app places the session itself and tells them it did. Never supply a time they did not give.",
        },
        activityTypeId: {
          type: "string",
          description:
            "The ICEFALL activity type id, e.g. hiking, trail-running, running, cycling, alpine-climbing, ski-touring, strength. If unsure, ask the athlete rather than guessing.",
        },
        durationMin: { type: "number", description: "Minutes, as the athlete reported them." },
        distanceKm: { type: "number", description: "Kilometres. Omit if they did not say." },
        ascentM: { type: "number", description: "Metres of ascent. Omit if they did not say." },
        why: WHY_ARG,
      },
      required: ["date", "activityTypeId", "durationMin", "why"],
    },
  },
  {
    name: "shorten_session",
    description:
      "Hold one day's session to a shorter time, keeping what kind of session it is. Use when the athlete has less time than the plan asks for. Distance and ascent are scaled by the app; you do not supply them. Fifteen minutes is the floor.",
    input_schema: {
      type: "object",
      properties: {
        date: DATE_ARG,
        minutes: { type: "number", description: "The time the athlete actually has." },
        why: WHY_ARG,
      },
      required: ["date", "minutes", "why"],
    },
  },
  {
    name: "ease_session",
    description:
      "Take one or two notches off a day — less volume at a lower difficulty, same kind of work. Use when the athlete is tired or sore but still wants to train.",
    input_schema: {
      type: "object",
      properties: {
        date: DATE_ARG,
        notches: { type: "number", description: "1 or 2. Two is a substantial reduction." },
        why: WHY_ARG,
      },
      required: ["date", "notches", "why"],
    },
  },
  {
    name: "rest_day",
    description:
      "Clear one day to full rest. The session is not moved anywhere — it is dropped. Use when the athlete should not train that day at all.",
    input_schema: {
      type: "object",
      properties: { date: DATE_ARG, why: WHY_ARG },
      required: ["date", "why"],
    },
  },
  {
    name: "move_session",
    description:
      "Move one day's session to another day. If that day already has a session the two exchange, so nothing is lost.",
    input_schema: {
      type: "object",
      properties: { date: DATE_ARG, to: DATE_ARG, why: WHY_ARG },
      required: ["date", "to", "why"],
    },
  },
  {
    name: "swap_sessions",
    description:
      "Exchange the sessions on two days. Use when the athlete names both days; otherwise move_session.",
    input_schema: {
      type: "object",
      properties: { date: DATE_ARG, withDate: DATE_ARG, why: WHY_ARG },
      required: ["date", "withDate", "why"],
    },
  },
  {
    name: "reschedule_week",
    description:
      "Shift a whole week's remaining sessions earlier or later by up to three days. Days already trained and days already gone stay where they are. Use for travel or a disrupted week.",
    input_schema: {
      type: "object",
      properties: {
        weekStartDate: { ...DATE_ARG, description: "The Monday the week starts on, as YYYY-MM-DD." },
        byDays: { type: "number", description: "-3 to 3, not 0. Negative is earlier." },
        why: WHY_ARG,
      },
      required: ["weekStartDate", "byDays", "why"],
    },
  },
  {
    name: "set_target_date",
    description:
      "Move the objective's date. This rebuilds every week of the plan, so use it only when the athlete says the trip itself has moved — never to make a plan fit.",
    input_schema: {
      type: "object",
      properties: { date: DATE_ARG, why: WHY_ARG },
      required: ["date", "why"],
    },
  },
  /*
   * THE NINTH TOOL, AND THE ONLY ONE THAT CHANGES NOTHING.
   *
   * The eight above rearrange a training plan. This one asks the app to DRAW
   * something it already holds: a trek from ICEFALL's catalogue, or a trail
   * from its OpenStreetMap index. Nothing is written and nothing is adjusted,
   * so it does not go near `planActions` or the guard on the phone — the app
   * parses it with a separate function (`src/coach/routeTools.ts`) for exactly
   * that reason.
   *
   * WHY IT TAKES IDS AND NOT ROUTES. A model asked for a prep hike near
   * somebody will produce one, complete with a length, an ascent and a grade,
   * none of which come from anywhere. So the app searches its own records
   * FIRST and puts the shortlist in the system prompt as `trek:<slug>` and
   * `trail:<osm id>` lines; this tool takes those ids back. There is no field
   * for a name, a distance, an ascent, a grade or a coordinate, and an id that
   * was not on the shortlist resolves to nothing and draws nothing. The model
   * cannot name a trail into existence, because a name is not what it hands
   * over.
   *
   * `reason` is the one string it authors, the same carve-out `why` is above.
   * It appears on the card in quotation marks with the coach's name on it,
   * beside figures the app read out of its own record — so a reason that does
   * not match the route is contradicted an inch beneath itself.
   */
  {
    name: "suggest_routes",
    description:
      "Show the athlete up to three routes from ICEFALL's own records. Use it only when the system prompt has given you a ROUTES ICEFALL HOLDS list, and only with ids copied exactly from that list. An id that is not on the list draws nothing at all. Do not state a length, an ascent, a grade, a duration or a high point yourself — the card carries every figure. If the list says trails were not searched, say why instead of calling this.",
    input_schema: {
      type: "object",
      properties: {
        routes: {
          type: "array",
          description: "One to three routes, best fit first.",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description:
                  "An id copied exactly from the ROUTES ICEFALL HOLDS list, e.g. trek:tour-du-mont-blanc or trail:1234567. Never a name.",
              },
              reason: {
                type: "string",
                description:
                  "One short sentence on why this route suits THIS athlete — their objective, the week of the plan they are in, what that week is asking for. Shown in quotation marks and attributed to you. No figures: the card has them.",
              },
            },
            required: ["id", "reason"],
          },
        },
      },
      required: ["routes"],
    },
  },
] as const;

const TOOL_NAMES: readonly string[] = TOOLS.map((t) => t.name);

/**
 * The rules the model is given ABOUT the tools, prepended with the rest.
 *
 * Every one is a restatement of something the app enforces anyway. That is the
 * point: none of these sentences is load-bearing, because a model that ignores
 * all of them still cannot get a forbidden change past `planGuard.ts` on the
 * phone. They exist so the model asks for the right thing in the first place
 * and the athlete is not shown a stream of refusals.
 *
 * THE SYMPTOM RULE IS THE EXCEPTION WORTH NOTING, and it is still not the
 * defence. The app's symptom layer (`src/coach/safety.ts`) answers those
 * questions in plain code BEFORE anything reaches this function, so a message
 * reporting chest pain produces no request here at all. The line below is what
 * is left over for a hypothetical modified client, and it is worth its tokens
 * for that alone.
 */
const TOOL_RULES = `CHANGING THE PLAN:
- You have tools that change the athlete's training plan. The app carries them out and writes what happened; you never describe the result. Do not say a session "is now" anything — say why you are making the change and let the app show what it did.
- Never state the new duration, distance, ascent or title. You do not compute those and you will be wrong.
- Use a tool only when the athlete has asked for a change or clearly needs one. A question about the plan is a question, not a request to rearrange it.
- Dates are always YYYY-MM-DD and always come from the plan you were given in the context. Never invent a date, and never guess what "Saturday" resolves to.
- One tool call per reply, at most. If two things need changing, do the more important one and say the other is waiting.
- You cannot make any day harder, longer or more intense. There is no tool for it and asking for one in words will not produce one.
- If the athlete reports a symptom — chest pain, breathlessness at rest, confusion, a severe headache at altitude, anything neurological — do not call any tool. Answer as the safety rules above require.

SUGGESTING ROUTES:
- suggest_routes changes nothing. It shows the athlete trails or treks and it is the only tool here that does not touch their plan.
- It takes ids from the ROUTES ICEFALL HOLDS list in this prompt and nothing else. No list, no call. A name is not an id.
- Never write a trail's length, ascent, grade or duration into your reply. You do not hold those and the card prints them.`;

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(
  body: unknown,
  status: number,
  origin: string | null,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin), ...extra },
  });
}

function clamp(s: unknown, max: number): string {
  return typeof s === "string" ? s.slice(0, max) : "";
}

/** Service-role client. Bypasses RLS, which is how it reaches the ledger. */
function admin(url: string, key: string): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false } });
}

/** One row of `coach_consume`. */
interface Decision {
  allowed: boolean;
  reason: string;
  tier: string;
  strong_granted: boolean;
  retry_after_seconds: number;
  calls_today: number;
  calls_this_month: number;
  strong_today: number;
  spend_this_month: number;
  limit_daily_calls: number;
  limit_monthly_calls: number | null;
  limit_monthly_spend_micros: number;
}

/**
 * What the athlete is told they have left. COUNTS ONLY, NEVER MONEY: what
 * ICEFALL pays per token is a cost of goods, and putting it on a screen invites
 * somebody to price their own questions while deciding whether to ask a coach
 * about resting. `coach_allowance()` in the database draws the same line.
 */
const allowanceOf = (d: Decision) => ({
  callsToday: d.calls_today,
  callsThisMonth: d.calls_this_month,
  dailyCalls: d.limit_daily_calls,
  monthlyCalls: d.limit_monthly_calls,
});

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  /* The key is read per request rather than at module load so a rotation takes
     effect on the next invocation instead of the next cold start. */
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  const dbUrl = Deno.env.get("SUPABASE_URL");
  const dbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key || !dbUrl || !dbKey) {
    /* The app treats any non-OK status as "fall back to the scripted coach",
       so an unconfigured deployment degrades to what it did before rather
       than showing an error to somebody who asked about their training. The
       database credentials are in this check for the same reason the key is:
       without the ledger there is no cap, and running uncapped is not the
       degraded mode — it is the failure this function exists to prevent. */
    return json({ error: "not_configured" }, 503, origin);
  }

  /*
   * `verify_jwt` IS NOT THE DOOR IT LOOKS LIKE.
   *
   * It proves the bearer token was signed by this project — and the publishable
   * key IS such a token, ships in the app bundle in plain text, and is therefore
   * public. Verified against the deployed function: a POST carrying the
   * publishable key returned 200. So `verify_jwt` alone left this endpoint open
   * to anybody who read the bundle, which is exactly the budget-spending hole it
   * was supposed to close.
   *
   * A real athlete's token carries `role: "authenticated"`; the publishable key
   * carries `role: "anon"`. That distinction is the actual door.
   *
   * The signature is NOT re-checked here — the platform already did that before
   * this code ran, which is the whole point of leaving `verify_jwt` on. This
   * reads claims from a token whose signature is already proven, so decoding
   * without verifying is safe in this one specific order and nowhere else.
   *
   * `sub` IS READ THE SAME WAY, and it is what every limit below is keyed to.
   * A limit keyed to something the caller can choose is not a limit.
   */
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  let role = "";
  let uid = "";
  try {
    const [, payloadB64] = jwt.split(".");
    const claims = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    role = claims.role ?? "";
    uid = typeof claims.sub === "string" ? claims.sub : "";
  } catch {
    role = "";
    uid = "";
  }
  if (role !== "authenticated" || !uid) {
    /* The app falls back to its scripted coach on any non-OK status, so a
       signed-out athlete gets the same answers they had before rather than an
       error about tokens. */
    return json({ error: "sign_in_required" }, 401, origin);
  }

  let payload: {
    question?: unknown;
    system?: unknown;
    history?: unknown;
    purpose?: unknown;
    model?: unknown;
    maxTokens?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400, origin);
  }

  const question = clamp(payload.question, MAX_QUESTION_CHARS).trim();
  if (!question) return json({ error: "no_question" }, 400, origin);

  const purpose = purposeOf(payload.purpose);
  const route = ROUTES[purpose];

  const asked = typeof payload.maxTokens === "number" ? Math.floor(payload.maxTokens) : 700;
  const maxTokens = Math.max(64, Math.min(asked, route.maxReplyTokens, MAX_REPLY_TOKENS));

  /* Alternating user/assistant turns, oldest first, capped twice — by turn
     count and by total characters, because eight very long turns is the same
     bill as sixteen short ones. */
  const rawHistory = Array.isArray(payload.history) ? payload.history : [];
  let spent = 0;
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const turn of rawHistory.slice(-MAX_HISTORY_TURNS)) {
    const t = turn as { role?: unknown; body?: unknown };
    const body = clamp(t.body, 2_000).trim();
    if (!body) continue;
    if (spent + body.length > MAX_HISTORY_CHARS) break;
    spent += body.length;
    messages.push({ role: t.role === "coach" ? "assistant" : "user", content: body });
  }
  messages.push({ role: "user", content: question });

  /* HOUSE RULES, THEN THE TOOL RULES, THEN THE ATHLETE. The order is the order
     of authority: what the coach may never do, then how it may act, then who it
     is talking to. All three are cached as one block (see `cache_control`), so
     the tool rules cost their tokens once rather than once per turn. */
  const rules = `${HOUSE_RULES}\n\n${TOOL_RULES}`;
  const clientContext = clamp(payload.system, MAX_SYSTEM_CHARS).trim();
  const system = clientContext ? `${rules}\n\n---\n\n${clientContext}` : rules;

  /*
   * THE LIMITS, BEFORE A TOKEN IS SPENT.
   *
   * `coach_consume` decides and counts in one statement, so two requests
   * arriving together cannot both be told there is one call left. It also
   * answers the routing question: `strong_granted` is the tier's reply to this
   * purpose's request, not the request itself.
   *
   * The estimate is priced at the STRONGER model whenever the purpose asks for
   * it, before we know whether it was granted. Pessimistic in the safe
   * direction: if the answer is Haiku, the real cost comes in under what was
   * checked, and the cap is never crossed on a guess that was too generous.
   */
  const db = admin(dbUrl, dbKey);
  const wantedKey = route.strong ? STRONG_MODEL : DEFAULT_MODEL;
  /* THE TOOL DECLARATIONS ARE INPUT TOKENS AND ARE COUNTED AS SUCH. They are
     about a thousand of them by this file's own measure, sent on every turn, and leaving them out of the
     estimate would let the month's spend cap be crossed by about that much per
     call before anybody noticed. They sit in front of the system block in the
     cached prefix, so on a warm cache they are billed at a tenth — but the
     estimate is deliberately the worst case, and the worst case is a cold one. */
  const estimate = estimateMicros(
    wantedKey,
    approxTokens(system) +
      approxTokens(JSON.stringify(TOOLS)) +
      messages.reduce((n, m) => n + approxTokens(m.content), 0) +
      40,
    maxTokens,
  );

  let decision: Decision;
  try {
    const { data, error } = await db.rpc("coach_consume", {
      p_user: uid,
      p_strong: route.strong,
      p_estimate_micros: estimate,
    });
    if (error || !Array.isArray(data) || data.length === 0) throw new Error("no_decision");
    decision = data[0] as Decision;
  } catch {
    /*
     * FAIL CLOSED. If the ledger cannot be reached there is no cap, and a
     * function that spends an Anthropic key with no cap is the exact thing this
     * file is for. The athlete is not stranded: 503 sends the app to its
     * scripted coach, which answers every question it has always answered.
     */
    return json({ error: "ledger_unavailable" }, 503, origin);
  }

  if (!decision.allowed && (decision.reason === "not_configured" || decision.reason === "no_user")) {
    /* Not a limit — a half-applied migration or a token with no subject. 429
       would tell the athlete they had run out of something when they had not,
       and would invite a retry that fails the same way. 503 is the honest
       status and sends the app to its scripted coach. */
    return json({ error: decision.reason }, 503, origin);
  }

  if (!decision.allowed) {
    /*
     * 429, which is the status `src/coach/budget.ts` asked for while this
     * function was still hypothetical: "it should reject a request over budget
     * with 429 and the client will show the same 'budget spent' state it shows
     * here."
     *
     * TODAY THE CLIENT DOES NOT SHOW THAT. `askCoach` treats every non-OK
     * status the same way — it falls silently through to the scripted coach —
     * so an athlete who has run out gets a normal-looking answer and no
     * explanation. That is a real gap and it belongs to the client, which is
     * why `reason` and `allowance` are in this body waiting to be used.
     */
    return json(
      {
        error: "limit",
        reason: decision.reason,
        retryAfterSeconds: decision.retry_after_seconds,
        allowance: allowanceOf(decision),
      },
      429,
      origin,
      decision.retry_after_seconds > 0
        ? { "Retry-After": String(decision.retry_after_seconds) }
        : {},
    );
  }

  const modelKey = decision.strong_granted ? STRONG_MODEL : DEFAULT_MODEL;
  const model = MODELS[modelKey];

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        /* The house rules and the athlete's profile are identical turn after
           turn, so the cache read is ~0.1x the input rate. The client's cost
           table already has a `cachedInput` column expecting this. */
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        /* DECLARED ON EVERY TURN, and `tool_choice` is left at its default
           ("auto") on purpose. Forcing a tool would make a coach that rearranges
           somebody's training in answer to "what should I eat before a long
           day" — most questions are questions. The model decides whether this
           one is a request to change something; the app decides whether the
           change is allowed. */
        tools: TOOLS,
        messages,
      }),
    });
  } catch {
    return json({ error: "unreachable" }, 502, origin);
  }

  if (!res.ok) {
    /* The upstream body can quote the request back, so it is not forwarded —
       it is one of the few places an API key could end up in a client log. */
    return json({ error: "upstream", status: res.status }, 502, origin);
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string; name?: string; input?: unknown }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };

  /*
   * THE FIRST TOOL CALL, AND ONLY THE FIRST.
   *
   * The API can return several `tool_use` blocks in one reply. Taking more than
   * one would mean applying two changes to somebody's training off a single
   * sentence, and the athlete confirming or undoing a pair as though it were
   * one decision. The tool rules ask for one; this is what makes it one.
   *
   * The name is checked against `TOOL_NAMES` even though the API only ever
   * returns a tool this request declared — the app re-validates everything
   * anyway, and a name that reached the client unchecked would be a name the
   * client has to reject rather than one that was never sent.
   */
  const call = (data.content ?? []).find(
    (b) => b.type === "tool_use" && typeof b.name === "string" && TOOL_NAMES.includes(b.name),
  );
  const action = call
    ? { tool: call.name as string, input: (call.input ?? {}) as Record<string, unknown> }
    : undefined;

  /*
   * THE TEXT IS DROPPED WHEN A TOOL WAS CALLED. See THE TOOLS above for the
   * reasoning in full; in one line: the model wrote that sentence BEFORE the
   * change was attempted, so it is a prediction of an outcome the phone has not
   * decided yet, and the guard there may be about to refuse it. The app writes
   * the account of what happened from what its own engine did, and shows the
   * model's `why` argument beside it in quotation marks.
   */
  const body = action
    ? ""
    : (data.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("")
        .trim();

  /* An empty reply is still an error — unless a tool was called, in which case
     empty is the correct and expected shape. */
  if (!body && !action) return json({ error: "empty_reply" }, 502, origin);

  const u = data.usage ?? {};
  const usage = {
    inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    outputTokens: u.output_tokens ?? 0,
    cachedInputTokens: u.cache_read_input_tokens ?? 0,
  };

  /*
   * Bank what it really cost. Deliberately AFTER the answer exists and
   * deliberately not awaited-into-the-critical-path any earlier: the reply is
   * the athlete's, and a ledger write that fails must not take it away.
   *
   * If this write is lost the call is still counted — `coach_consume` did that
   * before the model ran — so the day and the month are still bounded. What is
   * lost is one exchange's contribution to the money backstop. That is the
   * right way round; an uncounted CALL would be free to repeat.
   */
  const micros = costMicros(modelKey, usage);
  try {
    await db.rpc("coach_settle", { p_user: uid, p_spend_micros: micros });
  } catch {
    /* Nothing to say to the athlete about our own bookkeeping. */
  }

  return json(
    {
      body,
      /* THE PROPOSAL, WHEN THERE IS ONE. Absent on an ordinary answer. Nothing
         has been changed by anything in this file — see THE TOOLS. */
      ...(action ? { action } : {}),
      /* WHICH MODEL ANSWERED. The client banks its own copy of the cost and
         cannot price it without this — before routing existed it assumed Haiku
         every time, which would now under-count every plan build. */
      model: modelKey,
      usage,
      allowance: allowanceOf(decision),
    },
    200,
    origin,
  );
});
