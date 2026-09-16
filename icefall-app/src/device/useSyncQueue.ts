import { useCallback, useEffect, useRef, useState } from "react";
import {
  onSyncQueueChange,
  readLastSyncResult,
  readSyncQueue,
  runSyncQueue,
  syncedLabel,
  waitingLabel,
  type SyncQueueSnapshot,
  type SyncRunResult,
} from "./syncQueue";

export interface UseSyncQueue {
  /** Things with a destination still to send. */
  waiting: number;
  /** "3 things waiting to send", or null at zero. */
  waitingText: string | null;
  stopped: SyncQueueSnapshot["stopped"];
  lastResult: SyncRunResult | null;
  /** "Synced 3 items" from the last run that sent something, or null. */
  syncedText: string | null;
  /** False when the phone has no database; the queue then holds nothing. */
  storageOk: boolean;
  /** Runs the queue now. Only call when a connection is confirmed. */
  runNow: () => Promise<void>;
}

/**
 * `confirmedOnline` comes from the reachability check, never from
 * `navigator.onLine`. The queue runs when it turns true, when the app comes
 * back to the foreground with it true, and after anything is enqueued while
 * it is true. No timers.
 */
export function useSyncQueue({ confirmedOnline }: { confirmedOnline: boolean }): UseSyncQueue {
  const [snap, setSnap] = useState<SyncQueueSnapshot>({ waiting: 0, stopped: [] });
  const [lastResult, setLastResult] = useState<SyncRunResult | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const onlineRef = useRef(confirmedOnline);
  onlineRef.current = confirmedOnline;
  const waitingRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([readSyncQueue(), readLastSyncResult()]);
      waitingRef.current = s.waiting;
      setSnap(s);
      setLastResult(r);
      setStorageOk(true);
    } catch {
      setStorageOk(false);
    }
  }, []);

  const runNow = useCallback(async () => {
    try {
      await runSyncQueue();
    } catch {
      setStorageOk(false);
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    const off = onSyncQueueChange(() => {
      if (!alive) return;
      const before = waitingRef.current;
      void refresh().then(() => {
        if (alive && onlineRef.current && waitingRef.current > before) void runNow();
      });
    });
    void refresh();
    return () => {
      alive = false;
      off();
    };
  }, [refresh, runNow]);

  useEffect(() => {
    if (confirmedOnline) void runNow();
  }, [confirmedOnline, runNow]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && onlineRef.current) void runNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [runNow]);

  return {
    waiting: snap.waiting,
    waitingText: waitingLabel(snap.waiting),
    stopped: snap.stopped,
    lastResult,
    syncedText: syncedLabel(lastResult?.sent ?? 0),
    storageOk,
    runNow,
  };
}
