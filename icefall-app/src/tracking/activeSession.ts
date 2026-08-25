import type { RecorderState } from "./recorder";
import type { ActivityTypeId } from "./types";
import type { GpsMode } from "./useRecorder";

/**
 * The IN-PROGRESS activity, persisted so it survives the app closing.
 *
 * A finished activity is saved by `store.ts`. This is the OTHER half: the
 * recording that is still running. iOS suspends a backgrounded web tab within
 * seconds — GPS and timers stop — and can kill it outright under memory
 * pressure. Without this, locking the phone mid-climb would lose the whole
 * activity. With it, the track, distance, ascent, splits and time are written
 * to localStorage continuously, so reopening the app RESUMES exactly where it
 * left off. (A native background service — the real fix for recording while
 * locked — lands with the Capacitor build; this keeps the web app honest until
 * then.)
 */

const KEY = "icefall.recorder.active.v1";

/** A resume older than this is treated as abandoned, not offered. */
const MAX_AGE_MS = 18 * 3_600_000; // 18h

export interface ActiveSession {
  version: 1;
  mode: GpsMode;
  state: RecorderState;
}

export function saveActiveSession(session: Omit<ActiveSession, "version">): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, ...session } satisfies ActiveSession));
  } catch {
    /* storage full or unavailable — recording continues in memory */
  }
}

export function loadActiveSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSession;
    if (parsed?.version !== 1 || !parsed.state) return null;
    // Ignore an already-finished or stale session.
    if (parsed.state.status === "finished") return null;
    if (Date.now() - (parsed.state.savedAt ?? 0) > MAX_AGE_MS) return null;
    if (!parsed.state.startedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

/** A light summary for the "resume" banner, without hydrating a recorder. */
export interface ActiveSessionSummary {
  activityTypeId: ActivityTypeId;
  distanceM: number;
  elevationGainM: number;
  elapsedMs: number;
  startedAt: number | null;
}

export function activeSessionSummary(): ActiveSessionSummary | null {
  const s = loadActiveSession();
  if (!s) return null;
  return {
    activityTypeId: s.state.activityTypeId,
    distanceM: s.state.distanceM,
    elevationGainM: s.state.gainM,
    elapsedMs: s.state.elapsedMs,
    startedAt: s.state.startedAt,
  };
}
