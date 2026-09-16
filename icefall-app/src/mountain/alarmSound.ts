/**
 * SOUND AND VIBRATION FOR THE TURNAROUND ALARM — where the browser allows it,
 * and a stated "no" where it does not.
 *
 * Browsers only let a page make sound after a tap. So the alarm "primes" an
 * audio context on the athlete's taps while a turnaround is set (the Set
 * button is one), and the full-screen alarm says plainly when sound is still
 * blocked. The hardware ringer switch on an iPhone silences it anyway, and no
 * page can detect that — the limits sentence where the time is set says so.
 *
 * Vibration: Safari has never shipped `navigator.vibrate` on any iPhone (see
 * the note in `components/layout/TabBar.tsx`). Tested, never assumed.
 */

export type SoundState = "unsupported" | "blocked" | "ready";
export type VibrationState = "unsupported" | "on";

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function ctor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Call from inside a tap handler. Safe to call often. */
export function primeAlarmSound(): void {
  const C = ctor();
  if (!C) return;
  try {
    if (!ctx) ctx = new C();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

export function soundState(): SoundState {
  if (!ctor()) return "unsupported";
  return ctx && ctx.state === "running" ? "ready" : "blocked";
}

/** Three short high beeps. Returns whether anything was played. */
export function beep(): boolean {
  if (!ctx || ctx.state !== "running") return false;
  try {
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const start = t0 + i * 0.28;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 1760;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    }
    return true;
  } catch {
    return false;
  }
}

export function vibrationState(): VibrationState {
  if (typeof navigator === "undefined") return "unsupported";
  const v = (navigator as Navigator & { vibrate?: unknown }).vibrate;
  return typeof v === "function" ? "on" : "unsupported";
}

export function buzz(): void {
  if (vibrationState() !== "on") return;
  try {
    navigator.vibrate([400, 200, 400, 200, 400]);
  } catch {
    /* Some engines refuse without a recent tap; the screen still shows the state. */
  }
}

export function stopBuzz(): void {
  if (vibrationState() !== "on") return;
  try {
    navigator.vibrate(0);
  } catch {
    /* nothing to stop */
  }
}

export const SOUND_SENTENCES: Record<SoundState, string> = {
  ready: "Beeping. No sound if the phone is on silent.",
  blocked: "No sound yet. Tap the screen once to allow it.",
  unsupported: "This browser cannot make a sound.",
};

export const VIBRATION_SENTENCES: Record<VibrationState, string> = {
  on: "Vibrating.",
  unsupported: "This phone cannot vibrate from ICEFALL.",
};
