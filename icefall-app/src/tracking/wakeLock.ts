/**
 * THE SCREEN WAKE LOCK, WITH ITS THREE DEFECTS FIXED.
 *
 * `useRecorder` used to hold one sentinel in a ref and ask for it on start,
 * resume and the auto-restart effect. The Mountain mode plan (§6.1, §9.2)
 * measured three things wrong with that:
 *
 *   1. NEVER RE-ACQUIRED. Browsers release the lock the moment the page is
 *      hidden — locking the phone, a photo, a call. Nothing asked again when
 *      the page came back, so one pocket-lock ended "screen kept on" for the
 *      rest of the day.
 *   2. ORPHANED. A second request overwrote the ref while the first sentinel
 *      was still held, so the first could never be released (measured: 2
 *      requests, 0 releases).
 *   3. SILENT. A refusal (low-power mode can refuse outright) or a browser
 *      with no API was swallowed by an empty catch, so no screen could tell
 *      the athlete the screen may go dark.
 *
 * This class owns ONE sentinel at a time, re-asks on return while it is
 * wanted, and reports every state with the sentence the athlete is shown.
 * Framework-free so the alarm, the SOS screen and the recorder share it.
 */

import { useEffect, useRef, useState } from "react";

export type WakeLockStatus =
  /** No Screen Wake Lock API in this browser. */
  | "unsupported"
  /** Not wanted. */
  | "off"
  /** Wanted; a request is in flight, or the page is hidden and will ask on return. */
  | "waiting"
  /** The screen is being kept on. */
  | "held"
  /** Wanted, and the browser said no. */
  | "refused";

export interface WakeLockState {
  status: WakeLockStatus;
  /** What the athlete is told. Null only for "off". */
  sentence: string | null;
}

export const WAKE_LOCK_SENTENCES: Record<Exclude<WakeLockStatus, "off">, string> = {
  held: "Screen kept on. This uses more battery — and a lit screen in the cold flattens a phone fast. A flat phone has no SOS.",
  waiting: "Keeping the screen on when ICEFALL is back in front.",
  refused: "Your phone would not keep the screen on. Low-power mode can refuse it. The screen may go dark.",
  unsupported: "This browser cannot keep the screen on. The screen may go dark.",
};

interface Sentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", fn: () => void): void;
}

interface WakeLockApi {
  request(type: "screen"): Promise<Sentinel>;
}

function api(): WakeLockApi | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock ?? null;
}

const OFF: WakeLockState = { status: "off", sentence: null };

function stateFor(status: WakeLockStatus): WakeLockState {
  return status === "off" ? OFF : { status, sentence: WAKE_LOCK_SENTENCES[status] };
}

export class ScreenWakeLock {
  static supported(): boolean {
    return api() !== null;
  }

  private wanted = false;
  private sentinel: Sentinel | null = null;
  private inFlight: Promise<void> | null = null;
  private state: WakeLockState = OFF;
  private readonly listeners = new Set<(s: WakeLockState) => void>();
  private listening = false;

  private readonly onVisibility = () => {
    if (this.wanted && document.visibilityState === "visible") void this.request();
  };

  getState(): WakeLockState {
    return this.state;
  }

  subscribe(fn: (s: WakeLockState) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Ask for the lock and keep asking on every return, until `release()`. */
  async acquire(): Promise<WakeLockState> {
    if (!api()) {
      this.set("unsupported");
      return this.state;
    }
    this.wanted = true;
    if (!this.listening && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibility);
      this.listening = true;
    }
    await this.request();
    return this.state;
  }

  /** Stop wanting the lock and let go of the one sentinel held. */
  release(): void {
    this.wanted = false;
    if (this.listening && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibility);
      this.listening = false;
    }
    const s = this.sentinel;
    this.sentinel = null;
    if (s && !s.released) s.release().catch(() => {});
    this.set("off");
  }

  private async request(): Promise<void> {
    const wl = api();
    if (!wl || !this.wanted) return;
    // Defect 2: never a second request while one is held or on its way.
    if (this.sentinel && !this.sentinel.released) return this.set("held");
    if (this.inFlight) return this.inFlight;
    // A hidden page is refused by spec; wait for the visibility listener.
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return this.set("waiting");
    }
    this.set("waiting");
    this.inFlight = (async () => {
      try {
        const s = await wl.request("screen");
        if (!this.wanted) {
          s.release().catch(() => {});
          return;
        }
        this.sentinel = s;
        s.addEventListener("release", () => {
          if (this.sentinel !== s) return;
          this.sentinel = null;
          if (!this.wanted) return;
          // Defect 1: the system let go (page hidden, power saving). Ask again
          // if we are still in front; otherwise the visibility listener will.
          if (typeof document !== "undefined" && document.visibilityState === "visible") {
            void this.request();
          } else {
            this.set("waiting");
          }
        });
        this.set("held");
      } catch {
        // Defect 3: said, not swallowed.
        this.set("refused");
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  private set(status: WakeLockStatus) {
    if (this.state.status === status) return;
    this.state = stateFor(status);
    this.listeners.forEach((l) => l(this.state));
  }
}

/**
 * Hold the screen on while `active` is true. For the SOS screen, the last 30
 * minutes before turnaround and an explicitly opened map — never all day
 * (plan §9.1 point 4).
 */
export function useScreenWakeLock(active: boolean): WakeLockState {
  const lockRef = useRef<ScreenWakeLock | null>(null);
  if (!lockRef.current) lockRef.current = new ScreenWakeLock();
  const lock = lockRef.current;
  const [state, setState] = useState<WakeLockState>(lock.getState());

  useEffect(() => lock.subscribe(setState), [lock]);

  useEffect(() => {
    if (!active) return;
    void lock.acquire();
    return () => lock.release();
  }, [active, lock]);

  return state;
}
