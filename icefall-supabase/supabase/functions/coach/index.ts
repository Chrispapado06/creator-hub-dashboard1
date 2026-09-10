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
// POST { question, system, history: [{role, body}], model, maxTokens }
//   -> { body, disclaimer?, usage: { inputTokens, outputTokens, cachedInputTokens } }
//
// The shape is `src/services/coach.ts:245-270`. It is not invented here.
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
// THE CLIENT'S `model` IS A REQUEST, NOT AN INSTRUCTION. It is matched against
// an allowlist and mapped to a real API id; anything unrecognised falls to
// Haiku. A modified client asking for Opus on every turn would otherwise cost
// five times what the app's own cost table thinks it is banking.
//
// THE CLIENT'S `system` IS APPENDED, NEVER SUBSTITUTED. It carries the
// athlete's own context, which only the phone has — but the rules below are
// prepended here so that a modified client cannot strip the one paragraph that
// stops a coach clearing somebody for a summit. Client context is also length
// capped, because an unbounded system prompt is an unbounded bill.
//
// `maxTokens` is clamped, history is clamped, and the question is clamped. Each
// of those is a line on an invoice.

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

/* Ceilings. The client asks for 700; this is the wall behind that request. */
const MAX_REPLY_TOKENS = 900;
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

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

function clamp(s: unknown, max: number): string {
  return typeof s === "string" ? s.slice(0, max) : "";
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  /* The key is read per request rather than at module load so a rotation takes
     effect on the next invocation instead of the next cold start. */
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) {
    /* The app treats any non-OK status as "fall back to the scripted coach",
       so an unconfigured deployment degrades to what it did before rather
       than showing an error to somebody who asked about their training. */
    return json({ error: "not_configured" }, 503, origin);
  }

  let payload: {
    question?: unknown;
    system?: unknown;
    history?: unknown;
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

  const modelKey = typeof payload.model === "string" && payload.model in MODELS
    ? payload.model
    : DEFAULT_MODEL;
  const model = MODELS[modelKey];

  const asked = typeof payload.maxTokens === "number" ? Math.floor(payload.maxTokens) : 700;
  const maxTokens = Math.max(64, Math.min(asked, MAX_REPLY_TOKENS));

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

  const clientContext = clamp(payload.system, MAX_SYSTEM_CHARS).trim();
  const system = clientContext ? `${HOUSE_RULES}\n\n---\n\n${clientContext}` : HOUSE_RULES;

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
    content?: { type: string; text?: string }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };

  const body = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();

  if (!body) return json({ error: "empty_reply" }, 502, origin);

  const u = data.usage ?? {};
  return json(
    {
      body,
      usage: {
        inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        outputTokens: u.output_tokens ?? 0,
        cachedInputTokens: u.cache_read_input_tokens ?? 0,
      },
    },
    200,
    origin,
  );
});
