import { useCallback, useEffect, useRef, useState } from "react";

/**
 * What the browser says about keeping ICEFALL's saved data (plan 2.5).
 *
 * Asking to keep data permanently is not a button that works: Safari and
 * Chrome decide silently, largely on whether the app is on the Home Screen.
 * So this module only ever reports the browser's actual answer, and the
 * figures from `estimate()` are always worded as estimates, because browsers
 * pad them on purpose.
 */

/** The browser's answer, never what we hoped for. */
export type PersistState =
  /** The browser agreed to keep the data. */
  | "granted"
  /** The browser was asked, or checked, and said no. */
  | "refused"
  /** This browser has no way to ask. */
  | "unsupported"
  /** Not read yet. */
  | "unknown";

export interface StorageStatus {
  /** `navigator.storage.estimate()` exists. */
  supported: boolean;
  /** Bytes used by this site, or null when the browser gave no figure. */
  used: number | null;
  /** Quota minus usage, clamped at zero, or null when unknown. */
  available: number | null;
  /** The raw quota, or null when unknown. */
  quota: number | null;
  persisted: PersistState;
  /** Running as a Home Screen / installed app. */
  standalone: boolean;
  /** Epoch ms of the reading, or null before the first one. */
  checkedAt: number | null;
}

/** Only the parts of `Navigator` this module touches, so tests can fake it. */
export interface StorageNavigator {
  storage?: {
    estimate?: () => Promise<{ usage?: number; quota?: number }>;
    persisted?: () => Promise<boolean>;
    persist?: () => Promise<boolean>;
  };
  standalone?: boolean;
}

export interface StandaloneEnv {
  matchMedia?: (q: string) => { matches: boolean };
  navigator?: StorageNavigator;
}

function defaultNavigator(): StorageNavigator | undefined {
  return typeof navigator === "undefined" ? undefined : (navigator as unknown as StorageNavigator);
}

function defaultEnv(): StandaloneEnv {
  if (typeof window === "undefined") return { navigator: defaultNavigator() };
  return { matchMedia: window.matchMedia?.bind(window), navigator: defaultNavigator() };
}

/**
 * Same rule as `src/lib/install.ts` (which keeps its copy private): the
 * standard media query, or iOS Safari's older `navigator.standalone` flag.
 */
export function isStandalone(env: StandaloneEnv = defaultEnv()): boolean {
  try {
    if (env.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (env.matchMedia?.("(display-mode: fullscreen)").matches) return true;
  } catch {
    // Some embedded webviews throw on unknown media features.
  }
  return env.navigator?.standalone === true;
}

export const EMPTY_STORAGE_STATUS: StorageStatus = {
  supported: false,
  used: null,
  available: null,
  quota: null,
  persisted: "unknown",
  standalone: false,
  checkedAt: null,
};

function finite(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

/** Reads the estimate and persisted flag. Never rejects. */
export async function readStorageStatus(
  nav: StorageNavigator | undefined = defaultNavigator(),
  env: StandaloneEnv = defaultEnv(),
  now: number = Date.now(),
): Promise<StorageStatus> {
  const storage = nav?.storage;
  const standalone = isStandalone(env);
  let used: number | null = null;
  let quota: number | null = null;
  const supported = typeof storage?.estimate === "function";
  if (supported) {
    try {
      const e = await storage!.estimate!();
      used = finite(e.usage);
      quota = finite(e.quota);
    } catch {
      // Leave both null: silence beats a made-up figure.
    }
  }
  let persisted: PersistState = "unsupported";
  if (typeof storage?.persisted === "function") {
    try {
      persisted = (await storage.persisted()) ? "granted" : "refused";
    } catch {
      persisted = "unknown";
    }
  }
  const available = used !== null && quota !== null ? Math.max(0, quota - used) : null;
  return { supported, used, available, quota, persisted, standalone, checkedAt: now };
}

/**
 * Asks the browser to keep the data. There is no prompt on any current
 * browser; the answer comes back silently. Never rejects.
 */
export async function requestPersistentStorage(
  nav: StorageNavigator | undefined = defaultNavigator(),
): Promise<PersistState> {
  const storage = nav?.storage;
  if (typeof storage?.persist !== "function") return "unsupported";
  try {
    if (typeof storage.persisted === "function" && (await storage.persisted())) return "granted";
    return (await storage.persist()) ? "granted" : "refused";
  } catch {
    return "unknown";
  }
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

const UNITS = ["KB", "MB", "GB", "TB"];

/**
 * "41 MB", "1.2 GB". Binary steps, because that is what phone settings
 * screens use. Below 1 KB rounds up to "1 KB" so "0 KB" never describes
 * something that exists. Returns null for no figure.
 */
export function formatBytes(bytes: number | null | undefined): string | null {
  const b = finite(bytes);
  if (b === null) return null;
  if (b === 0) return "0 KB";
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  if (v < 1) return "1 KB";
  const shown = v >= 10 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString();
  return `${shown} ${UNITS[i]}`;
}

/** "About 41 MB saved." or null when the browser gave no figure. */
export function usedSentence(s: Pick<StorageStatus, "used">): string | null {
  const used = formatBytes(s.used);
  return used ? `About ${used} saved.` : null;
}

/** The free-space sentence, always flagged as an estimate. */
export function availableSentence(s: Pick<StorageStatus, "available">): string | null {
  const free = formatBytes(s.available);
  return free ? `Your phone reports roughly ${free} free. That is an estimate, not a promise.` : null;
}

/** Plain copy for the persisted answer. */
export function persistSentence(state: PersistState): string {
  switch (state) {
    case "granted":
      return "Your phone agreed to keep ICEFALL's saved data.";
    case "refused":
      return PERSIST_REFUSED_SENTENCE;
    case "unsupported":
      return "This browser cannot promise to keep saved data.";
    case "unknown":
      return "Not checked yet.";
  }
}

/** Status line for the pre-trip checklist: ok only on a real yes. */
export function storageCheck(s: StorageStatus): { ok: boolean; label: string; detail: string } {
  const ok = s.persisted === "granted";
  const label = ok ? "Saved data kept" : "Saved data may be cleared";
  const parts = [persistSentence(s.persisted)];
  if (!ok && !s.standalone) parts.push(IOS_CLEARING_SENTENCE);
  const used = usedSentence(s);
  if (used) parts.push(used);
  return { ok, label, detail: parts.join(" ") };
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

export const PERSIST_REFUSED_SENTENCE =
  "Your phone decided this for itself and said no. It does not ask you. Adding ICEFALL to your Home Screen makes it far more likely to say yes.";

export const IOS_CLEARING_SENTENCE =
  "Safari can clear a website's saved data after a period of not using it. Home Screen apps are treated better.";

export const HOME_SCREEN_PROMPT_TITLE = "Add ICEFALL to your Home Screen before your trip";

export const HOME_SCREEN_PROMPT_BODY =
  "Your trip, maps and check-ins are kept on this phone. Safari can clear a website's saved data after a period of not using it. Home Screen apps are treated better.";

/** Where it is not already on the Home Screen, show the prompt. */
export function shouldShowHomeScreenPrompt(s: Pick<StorageStatus, "standalone">): boolean {
  return !s.standalone;
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

export interface UseStorageStatus extends StorageStatus {
  loading: boolean;
  refresh: () => Promise<void>;
  /** Asks the browser, then re-reads so the figures match the answer. */
  requestPersist: () => Promise<PersistState>;
}

export function useStorageStatus(): UseStorageStatus {
  const [status, setStatus] = useState<StorageStatus>(() => ({
    ...EMPTY_STORAGE_STATUS,
    standalone: typeof window === "undefined" ? false : isStandalone(),
  }));
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const next = await readStorageStatus();
    if (!alive.current) return;
    setStatus(next);
    setLoading(false);
  }, []);

  const requestPersist = useCallback(async () => {
    const answer = await requestPersistentStorage();
    const next = await readStorageStatus();
    // persisted() can lag persist() on some browsers; the direct answer wins.
    if (alive.current) setStatus({ ...next, persisted: answer === "unknown" ? next.persisted : answer });
    return answer;
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { ...status, loading, refresh, requestPersist };
}
