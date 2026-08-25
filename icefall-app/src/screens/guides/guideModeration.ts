import { useCallback, useSyncExternalStore } from "react";

/**
 * Block, report and support, for the guide marketplace.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * `AppState` already holds `blockAthlete` for the Expedition Network, but a
 * guide is not an athlete: blocking a person you might climb with and reporting
 * a professional whose qualification claim looks wrong are different actions
 * with different consequences. Keeping them apart also keeps this feature
 * self-contained while the marketplace is being built — see the handover note at
 * the bottom of this file for what moving it into `AppState` would involve.
 *
 * WHAT IT HONESTLY DOES
 *
 * Blocking works: a blocked guide leaves the athlete's directory immediately and
 * stays out until they unblock, which they can always do.
 *
 * Reporting does NOT reach anybody. ICEFALL has no server and no safety desk
 * connected, so a report is written to this device and nowhere else — every
 * report carries `delivered: false` as a literal type so no code path can claim
 * otherwise, and the form says so before the athlete writes a word. A report
 * form that quietly files into localStorage while implying somebody is reading
 * it is worse than no form at all: someone with a real safety concern would
 * believe it had been raised.
 */

const STORAGE_KEY = "icefall.guides.moderation.v1";

export type GuideReportReason =
  | "not-a-guide"
  | "credentials"
  | "safety"
  | "conduct"
  | "off-platform"
  | "other";

export const REPORT_REASON_LABELS: Record<GuideReportReason, string> = {
  "not-a-guide": "Not a working guide",
  credentials: "Qualification claim looks wrong",
  safety: "Something unsafe happened",
  conduct: "Conduct towards a client",
  "off-platform": "Pushed me to arrange it off ICEFALL",
  other: "Something else",
};

export const REPORT_REASON_IDS = Object.keys(REPORT_REASON_LABELS) as GuideReportReason[];

export interface GuideReport {
  id: string;
  guideId: string;
  /** Kept so the record still reads if the directory changes under it. */
  guideName: string;
  reason: GuideReportReason;
  detail?: string;
  at: string;
  /**
   * The literal `false`, so nothing can set it true. There is no recipient:
   * no server, no moderation queue, no safety team on the other end.
   */
  delivered: false;
}

interface Persisted {
  blockedIds: string[];
  reports: GuideReport[];
}

const EMPTY: Persisted = { blockedIds: [], reports: [] };

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

export const REPORT_NOT_SENT_NOTICE =
  "This report is saved on your device and sent to nobody. ICEFALL has no safety desk connected in this build, so no one will read it and no one will act on it. If something happened in the mountains that needs reporting, take it to the guide's national association or, where a crime may have been committed, to the police.";

export const BLOCK_NOTE =
  "Blocking removes this guide from your directory on this device. They are not told, and blocking reports nothing to anybody. It is reversible from this page at any time — a blocked guide is counted at the foot of the directory so they cannot be lost.";

export const SUPPORT_NOTE =
  "ICEFALL support is not connected in this build. There is no inbox behind this button yet, so nothing you write here would reach a person. Anything already agreed with a guide should be settled with them directly, through ICEFALL, in writing.";

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

function load(): Persisted {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      blockedIds: Array.isArray(parsed.blockedIds) ? parsed.blockedIds : [],
      // Old records cannot carry a delivered flag that means anything, so it is
      // rewritten rather than trusted.
      reports: Array.isArray(parsed.reports)
        ? parsed.reports.map((r) => ({ ...r, delivered: false as const }))
        : [],
    };
  } catch {
    return EMPTY;
  }
}

/**
 * One module-level snapshot, shared by every component that reads it.
 *
 * `useSyncExternalStore` requires the snapshot to be reference-stable between
 * changes — returning a fresh object each call would re-render forever — so the
 * state is replaced only when something actually changes.
 */
let state: Persisted = load();
const listeners = new Set<() => void>();

function commit(next: Persisted) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or quota. The block still holds for this session.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;

let idSeq = 0;
const localId = () => `guide-report-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

export interface GuideModeration {
  blockedIds: string[];
  reports: GuideReport[];
  isBlocked: (guideId: string) => boolean;
  block: (guideId: string) => void;
  unblock: (guideId: string) => void;
  /** Returns the local id of the record. Nothing is transmitted. */
  report: (args: {
    guideId: string;
    guideName: string;
    reason: GuideReportReason;
    detail?: string;
  }) => string;
  reportsFor: (guideId: string) => GuideReport[];
}

export function useGuideModeration(): GuideModeration {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const isBlocked = useCallback(
    (guideId: string) => snapshot.blockedIds.includes(guideId),
    [snapshot],
  );

  const block = useCallback((guideId: string) => {
    if (state.blockedIds.includes(guideId)) return;
    commit({ ...state, blockedIds: [...state.blockedIds, guideId] });
  }, []);

  const unblock = useCallback((guideId: string) => {
    // Always reversible. A one-tap block with no way back is a trap, and an
    // athlete who blocked the only guide on their mountain by mistake would
    // have no way to find them again.
    commit({ ...state, blockedIds: state.blockedIds.filter((id) => id !== guideId) });
  }, []);

  const report = useCallback(
    (args: { guideId: string; guideName: string; reason: GuideReportReason; detail?: string }) => {
      const id = localId();
      commit({
        ...state,
        reports: [
          {
            id,
            guideId: args.guideId,
            guideName: args.guideName,
            reason: args.reason,
            detail: args.detail?.trim() || undefined,
            at: new Date().toISOString(),
            delivered: false,
          },
          ...state.reports,
        ],
      });
      return id;
    },
    [],
  );

  const reportsFor = useCallback(
    (guideId: string) => snapshot.reports.filter((r) => r.guideId === guideId),
    [snapshot],
  );

  return {
    blockedIds: snapshot.blockedIds,
    reports: snapshot.reports,
    isBlocked,
    block,
    unblock,
    report,
    reportsFor,
  };
}

/**
 * HANDOVER: moving this into `AppState`.
 *
 * The shapes above are deliberately the ones a real backend would use, so the
 * move is mechanical: add `blockedGuideIds` and `guideReports` to `Persisted`,
 * both optional so existing records load unchanged and read as "nothing blocked,
 * nothing reported"; expose `blockGuide`, `unblockGuide` and `reportGuide` on
 * `AppStateValue`; and delete this store. `delivered` must stay the literal
 * `false` until there is genuinely something on the other end of it.
 */
