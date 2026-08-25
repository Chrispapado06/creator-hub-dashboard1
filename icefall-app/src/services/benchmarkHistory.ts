import type { Score, Unavailable } from "@/coach/types";

/**
 * Readiness history, and where it comes from.
 *
 * ICEFALL has never stored a readiness figure before this module existed, so
 * there IS no history for anyone. The only defensible way to draw a trend is to
 * start keeping one now and plot the points as they accrue — which is what this
 * does — and to say plainly, on the screen, that the line begins today.
 *
 * THREE RULES, and the first one is the reason this file exists rather than a
 * chart component with a `generateHistory()` helper in it:
 *
 *   1. NOTHING IS BACK-FILLED. Not from the training feed, not by interpolating
 *      between two readings, not by assuming last month looked like a smaller
 *      version of today. A readiness figure is a statement about what ICEFALL
 *      knew on a given day, and it cannot be reconstructed after the fact.
 *   2. A WITHHELD SCORE IS STORED AS WITHHELD. `value: null` with the engine's
 *      own reason, never a zero and never skipped — a day when readiness could
 *      not be computed is a real and informative day, and the chart draws it as
 *      a break in the line rather than a dip to the floor.
 *   3. ONE ENTRY A DAY, PER OBJECTIVE. Readiness is objective-specific: a score
 *      against Mont Blanc says nothing about the same athlete on a hill walk,
 *      so the two are never plotted on one line.
 *
 * Local device storage, like every other ICEFALL store. There is no server, so
 * this history lives and dies with the browser profile it was written in.
 */

const KEY = "icefall.readiness-history.v1";

/** Roughly six months per objective. Beyond that the early points say little. */
const MAX_PER_OBJECTIVE = 180;

/** Bounds total storage. Oldest-touched objectives are dropped first. */
const MAX_OBJECTIVES = 40;

export interface ReadinessSnapshot {
  /** Local calendar date, YYYY-MM-DD. Never a UTC date string — see `todayKey`. */
  date: string;
  /** Null when readiness was withheld that day. NEVER a substituted zero. */
  value: number | null;
  /** The engine's reason, carried so a gap in the line can explain itself. */
  reason?: Unavailable;
}

type Stored = Record<string, ReadinessSnapshot[]>;

/**
 * Local date components, never `toISOString()`.
 *
 * A UTC key rolls the day over early for anyone west of Greenwich, which would
 * write two "days" of readiness in one evening — the same bug that already bit
 * the training week strip and the coach's monthly allowance.
 */
export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readAll(): Stored {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Stored;
  } catch {
    // Corrupt or unreadable storage reads as "no history", which is true and
    // safe. It must never read as a flat line at zero.
    return {};
  }
}

function writeAll(next: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or quota. The screen still works; it simply will not
    // remember today, and the empty state says history begins now.
  }
}

/** Oldest first, which is the order a chart wants. */
function sorted(list: ReadinessSnapshot[]): ReadinessSnapshot[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * A stable key for one objective.
 *
 * Elevation is part of it deliberately: a goal renamed from "Mont Blanc" to
 * "Mont Blanc — Goûter" is the same mountain and should keep its history,
 * whereas a goal edited to point at a different peak entirely is not, and must
 * not inherit the old line.
 */
export function objectiveKey(peak: { name: string; elevationM: number }): string {
  const name = peak.name.trim().toLowerCase().replace(/\s+/g, " ");
  const elevation = Number.isFinite(peak.elevationM) ? Math.round(peak.elevationM) : "unknown";
  return `${name}@${elevation}`;
}

export function loadSnapshots(key: string): ReadinessSnapshot[] {
  const all = readAll();
  const list = all[key];
  return Array.isArray(list) ? sorted(list) : [];
}

/**
 * Records today's reading, at most once a day, and returns the full series.
 *
 * A second view on the same day OVERWRITES rather than appends: the athlete may
 * have recorded a session or reported a skill since this morning, and the later
 * reading is the truer statement of what ICEFALL knew today. It is not a second
 * data point, and plotting it as one would manufacture a trend out of one day.
 */
export function recordSnapshot(key: string, score: Score, now: Date = new Date()) {
  const date = todayKey(now);
  const entry: ReadinessSnapshot = { date, value: score.value };
  if (score.value === null && score.reason !== undefined) entry.reason = score.reason;

  const all = readAll();
  const existing = Array.isArray(all[key]) ? all[key] : [];
  const today = existing.find((s) => s.date === date);

  // Nothing has changed since the last view — leave storage alone rather than
  // rewriting the whole record on every render.
  if (today && today.value === entry.value && today.reason === entry.reason) {
    return sorted(existing);
  }

  const next = sorted([...existing.filter((s) => s.date !== date), entry]).slice(
    -MAX_PER_OBJECTIVE,
  );

  const trimmed: Stored = { ...all, [key]: next };
  const keys = Object.keys(trimmed);
  if (keys.length > MAX_OBJECTIVES) {
    // Drop whichever objectives have gone longest without a reading. Keyed by
    // their most recent date, so an objective still being trained for survives.
    const ranked = keys
      .map((k) => ({ k, last: trimmed[k][trimmed[k].length - 1]?.date ?? "" }))
      .sort((a, b) => b.last.localeCompare(a.last))
      .slice(0, MAX_OBJECTIVES)
      .map((x) => x.k);
    const kept: Stored = {};
    for (const k of ranked) kept[k] = trimmed[k];
    writeAll(kept);
    return next;
  }

  writeAll(trimmed);
  return next;
}

/** Shown beside the chart. The history is short because it is honest. */
export const HISTORY_NOTICE =
  "ICEFALL records one readiness reading a day for an objective, on the days you open this screen. Nothing before your first reading is reconstructed or estimated — the line starts where the record starts.";
