import type { WatchProvider } from "./types";

/**
 * EVERY SPORT VALUE A WATCH SERVICE SENT THAT ICEFALL COULD NOT NAME.
 *
 * `SPORT_TO_TYPE` in `map.ts` falls through to `"other"` for anything it does
 * not recognise, and that fallthrough used to be completely silent: an athlete
 * whose every mountaineering day landed as "Other" had no way to say which
 * word was missing, and nobody building ICEFALL had any way to find out. A
 * mapping table can only be finished from real vendor values. This is where
 * the real values are collected.
 *
 * WHAT THIS IS NOT. It is not analytics and it is not sent anywhere — it is a
 * list on this device, readable by the person whose watch produced it, which
 * they can read out or screenshot. Nothing here leaves the browser unless the
 * athlete themselves carries it.
 *
 * WHAT IT HOLDS, and deliberately nothing else: the provider, the vendor's own
 * sport string, how many activities carried it, when it was first and last
 * seen, and one example activity id so a specific outing can be pointed at.
 * No distance, no location, no time of day — the point of the record is the
 * missing WORD, and everything else would be a training log kept in a second
 * place.
 *
 * Wrapped in try/catch throughout, same as `cursor.ts`: a private window or a
 * browser that blocks storage must never break an import, and losing this
 * costs nothing an import cannot rebuild.
 */

const KEY = "icefall.watch.unmappedSports.v1";

/** No vendor has this many sports; the ceiling exists so a vendor that starts
    sending a unique string per activity (an id rather than a sport name)
    cannot quietly fill a person's storage quota. */
const MAX_ENTRIES = 200;

export interface UnmappedSport {
  provider: WatchProvider;
  /** The vendor's own value, verbatim. Empty string when the vendor sent none. */
  sport: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** One example, so a specific activity can be opened and checked. */
  exampleActivityId: string;
}

type Store = Record<string, UnmappedSport>;

const keyFor = (provider: WatchProvider, sport: string) => `${provider}:${sport}`;

function readStore(): Store {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore — an unrecorded unmapped sport is a lost note, not a lost activity */
  }
}

/**
 * Called by `watchActivityToRecorded` on every fallthrough to `"other"`.
 *
 * Deliberately NOT called when a sport maps successfully. It IS called when a
 * vendor sent no sport at all, under the empty-string key: "this vendor sends
 * no sport for some activities" is itself a finding worth having, and a silent
 * absence is exactly what this module exists to stop.
 */
export function recordUnmappedSport(
  provider: WatchProvider,
  sport: string,
  activityId: string,
): void {
  try {
    const store = readStore();
    const k = keyFor(provider, sport);
    const now = new Date().toISOString();
    const existing = store[k];
    if (existing) {
      store[k] = {
        ...existing,
        count: (typeof existing.count === "number" ? existing.count : 0) + 1,
        lastSeenAt: now,
      };
    } else {
      if (Object.keys(store).length >= MAX_ENTRIES) return;
      store[k] = {
        provider,
        sport,
        count: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        exampleActivityId: activityId,
      };
    }
    writeStore(store);
  } catch {
    /* ignore */
  }
}

/** Most-seen first, so the mapping worth writing next is at the top. */
export function unmappedSports(provider?: WatchProvider): UnmappedSport[] {
  try {
    return Object.values(readStore())
      .filter((u): u is UnmappedSport => !!u && typeof u === "object" && "sport" in u)
      .filter((u) => !provider || u.provider === provider)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  } catch {
    return [];
  }
}

/** Cleared on disconnect alongside the cursor — the notes belong to the
    connection that produced them, and a reconnect re-collects them. */
export function clearUnmappedSports(provider: WatchProvider): void {
  try {
    const store = readStore();
    for (const [k, v] of Object.entries(store)) {
      if (v?.provider === provider) delete store[k];
    }
    writeStore(store);
  } catch {
    /* ignore */
  }
}
