import { useEffect, useState } from "react";

/**
 * Summit logs — the atomic unit of ICEFALL's social layer.
 *
 * "I've made it to this summit" is the sentence the whole design hangs off.
 * Not a status update, not a text box waiting for inspiration: a record of a
 * real ascent, with the two fields that make it worth another climber's time —
 * the ROUTE taken and the CONDITIONS found. Camptocamp built the most
 * respected alpine community in Europe on exactly this shape (they call it an
 * outing); Strava proved the feed should write itself from what you actually
 * did rather than what you thought to say.
 *
 * Conditions are the load-bearing field. "Is the route in? Where does the snow
 * start?" is the question climbers actually ask each other, it is perishable,
 * and it is first-person observation — the one kind of content a new app with
 * few users can carry honestly, because a single fresh report on a mountain
 * page is signal, while a single post in a feed is an empty room.
 *
 * Stored locally, like everything in ICEFALL until a backend exists, and the
 * UI says so. The shape is deliberately sync-ready: ids are stable, dates are
 * ISO, and nothing here would change when Supabase is provisioned — logs would
 * simply start travelling.
 */

export interface SummitLog {
  id: string;
  /** The peak's display name, always present even when no page link exists. */
  peakName: string;
  /** A peak id (`osm:…` or a curated id) so the log can anchor to its page. */
  peakId?: string;
  elevationM?: number;
  /** ISO date of the ascent — the day you stood on top, not the day you typed. */
  date: string;
  /** The way up, in the climber's words: "NE ridge", "normal route from the hut". */
  route?: string;
  /**
   * What the mountain was like. The most valuable sentence in the app:
   * "snow from 1,900 m, ice on the summit ridge, crampons from the col".
   */
  conditions?: string;
  /** Anything else worth saying. */
  note?: string;
  /** A small JPEG data URL, same budget discipline as the profile photos. */
  photo?: string;
  /** The recorded activity this was drafted from, when there is one. */
  activityId?: string;
  createdAt: string;
}

const KEY = "icefall.summit-logs.v1";

function read(): SummitLog[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SummitLog[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let current = read();
const listeners = new Set<(logs: SummitLog[]) => void>();

function write(next: SummitLog[]) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Quota — the log stays for this session; nothing else useful to do. */
  }
  listeners.forEach((l) => l(current));
}

export const summitLogs = (): SummitLog[] => current;

export function addSummitLog(log: Omit<SummitLog, "id" | "createdAt">): SummitLog {
  const entry: SummitLog = {
    ...log,
    id: `log:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  // Newest first — the feed order, decided once, here.
  write([entry, ...current]);
  return entry;
}

export function removeSummitLog(id: string) {
  write(current.filter((l) => l.id !== id));
}

/** The logs for one mountain — what its page shows under "conditions & ascents". */
export const logsForPeak = (peakName: string, peakId?: string): SummitLog[] =>
  current.filter(
    (l) =>
      (peakId && l.peakId === peakId) ||
      l.peakName.toLowerCase() === peakName.toLowerCase(),
  );

export function useSummitLogs(): SummitLog[] {
  const [logs, setLogs] = useState(current);
  useEffect(() => {
    listeners.add(setLogs);
    setLogs(current);
    return () => {
      listeners.delete(setLogs);
    };
  }, []);
  return logs;
}

/** Said wherever logs render, until a backend exists. */
export const LOG_LOCAL_NOTICE =
  "Your logs live on this device. ICEFALL has no accounts yet, so nothing is published anywhere — when accounts arrive, logs like these become the community feed.";
