/**
 * The Coach's spending limit.
 *
 * ICEFALL pays per token when the Coach is backed by a language model, so an
 * unbounded chat is an unbounded bill: one curious athlete on a €15/month plan
 * can outspend their subscription in an afternoon. This module is the ceiling.
 *
 * ── WHERE THIS IS ACTUALLY ENFORCED ────────────────────────────────────────
 *
 * READ THIS BEFORE TRUSTING IT. Everything here runs in the browser, so it is a
 * DISPLAY and a client-side courtesy stop — not a limit. Anyone can edit
 * localStorage or call the endpoint directly. The real cap MUST live in the
 * server-side proxy that holds the API key, keyed to the account, because that
 * is the only place an attacker cannot reach. When that proxy exists it should
 * reject a request over budget with 429 and the client will show the same
 * "budget spent" state it shows here.
 *
 * Treating this file as the limit would be the same mistake as validating a
 * price in the client and letting the server take whatever it is sent.
 *
 * ── UNITS ──────────────────────────────────────────────────────────────────
 *
 * Integer MICRO-DOLLARS (1_000_000 = $1.00), never floats. A single exchange
 * costs fractions of a cent, and accumulating those in floating point drifts —
 * the same reason the booking money model counts integer cents.
 */

export type CoachModel = "claude-haiku-4-5" | "claude-sonnet-5" | "claude-opus-5";

/** Micro-dollars per million tokens. Source: Anthropic list pricing. */
interface Rate {
  input: number;
  output: number;
  /** Cache reads are ~0.1x input. The athlete profile is the same every turn. */
  cachedInput: number;
}

export const MODEL_RATES: Record<CoachModel, Rate> = {
  // $1.00 / $5.00 per MTok — the right default for a short, grounded reply.
  "claude-haiku-4-5": { input: 1_000_000, output: 5_000_000, cachedInput: 100_000 },
  // $3.00 / $15.00 per MTok.
  "claude-sonnet-5": { input: 3_000_000, output: 15_000_000, cachedInput: 300_000 },
  // $5.00 / $25.00 per MTok.
  "claude-opus-5": { input: 5_000_000, output: 25_000_000, cachedInput: 500_000 },
};

/** What the Coach runs on unless overridden. Cheapest that answers well. */
export const DEFAULT_COACH_MODEL: CoachModel = "claude-haiku-4-5";

/**
 * The athlete's visible allowance: CREDITS, one per Coach reply.
 *
 * Deliberately NOT money. What ICEFALL pays per token is a cost of goods, and
 * showing it to an athlete both reveals commercial information and invites them
 * to price their own questions ("is this worth 2 cents?") — which is exactly the
 * wrong thing to be thinking about while asking a coach whether to rest.
 * Credits are a plain, stable count they can reason about.
 *
 * DAILY, not monthly. A monthly pool can be spent in a single afternoon and
 * then the coach is dead for four weeks — the athlete is punished hardest
 * exactly when they were most engaged. A daily allowance cannot lock anyone out
 * for longer than one night, so in normal use nobody ever "runs out".
 *
 * Eight a day is comfortably more than a real conversation needs (a typical day
 * is three), so the allowance is invisible to ordinary use and only bites on a
 * runaway loop — which is the only thing it is there to stop.
 */
export const DAILY_CREDITS = 8;

/**
 * The invisible backstop, in micro-dollars.
 *
 * Credits are the limit an athlete sees and, in normal use, the one that binds.
 * This is the ceiling underneath it: if a pathological exchange ever cost far
 * more than a credit is worth — a very long question, a cache miss on every
 * turn, a model swap — spend stops here regardless of credits remaining. It is
 * never shown to anyone.
 *
 * Deliberately MONTHLY while credits are daily: a per-day money cap would be a
 * per-month cost of thirty times as much. Credits keep any single day sane;
 * this keeps the month sane. At a normal three answers a day it is never
 * approached (~$0.24/month) — it only engages for sustained heavy use.
 */
export const HARD_CAP_MICROS = 1_000_000; // $1.00

/**
 * Hard ceiling on a single reply.
 *
 * The Coach answers in a few short paragraphs; it has never needed more. This
 * is the difference between a runaway reply costing cents and costing dollars,
 * and it is enforced by the API itself rather than by hoping.
 */
export const MAX_REPLY_TOKENS = 700;

/** How many past turns are resent. Every one is re-billed as input. */
export const HISTORY_TURNS = 6;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Tokens served from the prompt cache, billed at ~10% of input. */
  cachedInputTokens?: number;
}

/** Cost of one exchange, in integer micro-dollars. */
export function costOf(usage: TokenUsage, model: CoachModel = DEFAULT_COACH_MODEL): number {
  const rate = MODEL_RATES[model] ?? MODEL_RATES[DEFAULT_COACH_MODEL];
  const cached = usage.cachedInputTokens ?? 0;
  const fresh = Math.max(0, usage.inputTokens - cached);
  const micros =
    (fresh * rate.input) / 1_000_000 +
    (cached * rate.cachedInput) / 1_000_000 +
    (usage.outputTokens * rate.output) / 1_000_000;
  return Math.ceil(micros);
}

export interface BudgetState {
  /** Credits consumed TODAY — one per model-answered reply. Resets nightly. */
  creditsUsed: number;
  /** Local day key, "YYYY-MM-DD". */
  day: string;
  /** Real spend this MONTH, for the money backstop. */
  spentMicros: number;
  /** Month key, "YYYY-MM". */
  period: string;
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** Month key for the money backstop. */
export function currentPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

/**
 * LOCAL day key for the credit allowance.
 *
 * Local, not UTC: "today" must mean the athlete's today. A UTC boundary would
 * refresh credits mid-afternoon for anyone far enough east, and mid-evening
 * would still be "yesterday" for anyone west of Greenwich.
 */
export function currentDay(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Roll the two clocks independently: credits refresh every night, spend every
 * month. Records written by earlier versions (no `day`) are tolerated.
 */
export function normalise(state: BudgetState | undefined, now = new Date()): BudgetState {
  const period = currentPeriod(now);
  const day = currentDay(now);
  if (!state) return { creditsUsed: 0, day, spentMicros: 0, period };
  return {
    creditsUsed: state.day === day ? (state.creditsUsed ?? 0) : 0,
    day,
    spentMicros: state.period === period ? (state.spentMicros ?? 0) : 0,
    period,
  };
}

/* -- What the athlete sees ------------------------------------------------- */

export const creditsLeft = (s: BudgetState) => Math.max(0, DAILY_CREDITS - s.creditsUsed);

/* -- What only ICEFALL sees ------------------------------------------------ */

export const remainingMicros = (s: BudgetState) => Math.max(0, HARD_CAP_MICROS - s.spentMicros);

/**
 * Whether the Coach should stop calling the model.
 *
 * Either limit ends it: today's credits, or the month's cost backstop. The chat
 * does not break when this is true — the scripted coach answers instead, and
 * credits return in the morning.
 */
export const isExhausted = (s: BudgetState) => creditsLeft(s) <= 0 || remainingMicros(s) <= 0;

/**
 * Roughly what one more exchange will cost, used to stop BEFORE going over
 * rather than discovering it afterwards. Deliberately pessimistic: it assumes a
 * full-length reply and no cache hit.
 */
export function estimateExchangeMicros(
  systemTokens: number,
  historyTokens: number,
  model: CoachModel = DEFAULT_COACH_MODEL,
): number {
  return costOf(
    {
      inputTokens: systemTokens + historyTokens + 40,
      outputTokens: MAX_REPLY_TOKENS,
    },
    model,
  );
}

/** Tokens ≈ chars / 4. Only ever used for the pre-flight estimate above. */
export const approxTokens = (text: string) => Math.ceil(text.length / 4);
