/**
 * "How did it feel?" — the athlete's own word for a finished session.
 *
 * The mockup's four buttons (Easy / Steady / Hard / Too hard). This is its own
 * small record rather than the activity debrief in `tracking/debrief.ts`,
 * because that one needs a recorded activity and a 1–10 effort, and four words
 * cannot become a number without the app choosing it. Stored on this device,
 * keyed by the plan day. Nothing reads it back as a score.
 */
import { useEffect, useState } from "react";

export type SessionFeel = "easy" | "steady" | "hard" | "too-hard";

export const SESSION_FEELS: readonly { value: SessionFeel; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "steady", label: "Steady" },
  { value: "hard", label: "Hard" },
  { value: "too-hard", label: "Too hard" },
];

export interface SessionFeelRecord {
  date: string;
  feel?: SessionFeel;
  note?: string;
  answeredAt: string;
}

const KEY = "icefall.session-feel.v1";

function read(): Record<string, SessionFeelRecord> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

let current: Record<string, SessionFeelRecord> = read();
const listeners = new Set<(s: Record<string, SessionFeelRecord>) => void>();

function write(next: Record<string, SessionFeelRecord>) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Storage refused — the answer stays for this session. */
  }
  listeners.forEach((l) => l(current));
}

export function saveSessionFeel(date: string, patch: { feel?: SessionFeel; note?: string }) {
  const prev = current[date];
  const note = patch.note !== undefined ? patch.note.trim() : prev?.note;
  write({
    ...current,
    [date]: {
      date,
      feel: patch.feel ?? prev?.feel,
      note: note ? note : undefined,
      answeredAt: new Date().toISOString(),
    },
  });
}

export function useSessionFeel(date: string | undefined): SessionFeelRecord | undefined {
  const [state, setState] = useState(current);
  useEffect(() => {
    listeners.add(setState);
    setState(current);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return date ? state[date] : undefined;
}
