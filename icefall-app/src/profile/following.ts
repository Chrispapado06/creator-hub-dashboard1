import { useCallback, useEffect, useState } from "react";
import type { SharedProfile } from "./shareLink";

/**
 * People whose card you have kept.
 *
 * "Follow" on a shared link cannot mean what it means everywhere else: there is
 * no server, so nobody is notified and no feed is subscribed to. What it CAN do
 * honestly is keep the card — so when you open ICEFALL, the person whose link
 * you opened is there rather than lost in a chat thread.
 *
 * The screens say exactly that, and the verb is chosen to match: the card is
 * SAVED, not followed. When accounts ship this becomes a real follow and the
 * saved cards become the first people to sync.
 */

const KEY = "icefall.following.v1";

export interface SavedPerson extends SharedProfile {
  savedAt: string;
}

function read(): SavedPerson[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedPerson[]) : [];
  } catch {
    return [];
  }
}

const listeners = new Set<(v: SavedPerson[]) => void>();
let current = read();

function write(next: SavedPerson[]) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l(next));
}

export function useFollowing() {
  const [people, setPeople] = useState(current);

  useEffect(() => {
    listeners.add(setPeople);
    setPeople(current);
    return () => {
      listeners.delete(setPeople);
    };
  }, []);

  const isSaved = useCallback((handle: string) => people.some((p) => p.handle === handle), [people]);

  const save = useCallback((profile: SharedProfile) => {
    write([
      { ...profile, savedAt: new Date().toISOString() },
      ...current.filter((p) => p.handle !== profile.handle),
    ]);
  }, []);

  const forget = useCallback((handle: string) => {
    write(current.filter((p) => p.handle !== handle));
  }, []);

  return { people, isSaved, save, forget };
}

export const FOLLOW_NOTICE =
  "Saved to this device. Following is not built yet, so nobody is notified and nothing is subscribed to — the card is simply kept so you can find them again.";
