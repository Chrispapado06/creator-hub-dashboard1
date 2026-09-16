/**
 * Mountain mode display and battery settings: battery saver, theme, large text.
 *
 * Kept under its own key rather than inside `icefall.settings.v1`, because
 * that object is merged with the server by `settings/hydrate.ts`, and these
 * are properties of this phone on this trip, not of the account. The
 * `icefall.` prefix still means "Erase all data" clears them.
 *
 * Pure functions first (tested in `mountain.test.ts`), then a tiny subscriber
 * store. The React hooks live in `useMountainSettings.ts`.
 */

export type MountainThemeChoice = "auto" | "dark" | "glare";
export type ResolvedMountainTheme = "dark" | "glare";

export interface MountainSettings {
  /** On by default. What it actually does depends on `resolveBatterySaver`. */
  batterySaver: boolean;
  theme: MountainThemeChoice;
  largeText: boolean;
}

export const DEFAULT_MOUNTAIN_SETTINGS: MountainSettings = {
  batterySaver: true,
  theme: "auto",
  largeText: false,
};

export const MOUNTAIN_SETTINGS_KEY = "icefall.mountain.v1";

/** What the shell knows right now and the settings cannot know on their own. */
export interface MountainRuntime {
  recording: boolean;
  /** True when the phone reports no network, or reachability has failed. */
  noSignal: boolean;
  onSos: boolean;
}

export const DEFAULT_RUNTIME: MountainRuntime = { recording: false, noSignal: false, onSos: false };

/* ---------------------------------------------------------------------------
   Battery saver
   ------------------------------------------------------------------------- */

export interface BatterySaverState {
  enabled: boolean;
  /**
   * GPS without high accuracy. Never with no signal and never on SOS (plan
   * §6.2): without high accuracy the phone may skip the GPS chip and use wifi
   * and masts, and on a mountain there are none.
   */
  gps: boolean;
  /** Dark theme under "auto", reduced animation. */
  screen: boolean;
  /** Skip background refreshes (forecast polling and the like). */
  pauseBackgroundRefresh: boolean;
  /** One short line for the settings row, describing what is true now. */
  status: string;
}

export const SAVER_NO_SIGNAL_SENTENCE =
  "Battery saver never applies to GPS when you have no signal. Without a signal, GPS is the only thing that can find you.";
export const SAVER_RECORDING_SENTENCE = "Off while recording, so your track stays accurate.";
export const SAVER_SOS_SENTENCE = "Off on the SOS screen. Full GPS accuracy.";

export function resolveBatterySaver(enabled: boolean, rt: MountainRuntime): BatterySaverState {
  const off = { gps: false, screen: false, pauseBackgroundRefresh: false };
  if (!enabled) return { enabled, ...off, status: "Off." };
  if (rt.recording) return { enabled, ...off, status: SAVER_RECORDING_SENTENCE };
  const screenOnly = { gps: false, screen: true, pauseBackgroundRefresh: true };
  if (rt.onSos) return { enabled, ...screenOnly, status: SAVER_SOS_SENTENCE };
  if (rt.noSignal) return { enabled, ...screenOnly, status: SAVER_NO_SIGNAL_SENTENCE };
  return {
    enabled,
    gps: true,
    screen: true,
    pauseBackgroundRefresh: true,
    status: "On. Dark screen, less animation, lower GPS accuracy.",
  };
}

/**
 * Options for `navigator.geolocation`. The web offers no sampling rate
 * (plan §6.2), so the only real levers are high accuracy and fix age.
 */
export function gpsOptions(saver: Pick<BatterySaverState, "gps">): PositionOptions {
  return saver.gps
    ? { enableHighAccuracy: false, maximumAge: 30_000, timeout: 60_000 }
    : { enableHighAccuracy: true, maximumAge: 0, timeout: 60_000 };
}

/* ---------------------------------------------------------------------------
   Theme
   ------------------------------------------------------------------------- */

/**
 * "auto": dark while battery saver's screen effects are on, otherwise follow
 * the app's own theme, with the app's light mapped to glare (the app's light
 * is a warm off-white for reading indoors, too soft for snow).
 */
export function resolveMountainTheme(
  choice: MountainThemeChoice,
  saverScreen: boolean,
  appTheme: "dark" | "light",
): ResolvedMountainTheme {
  if (choice === "dark" || choice === "glare") return choice;
  if (saverScreen) return "dark";
  return appTheme === "light" ? "glare" : "dark";
}

/** Status-bar colour for each Mountain theme's canvas. Matches mountainTheme.css. */
export const MOUNTAIN_THEME_COLOR: Record<ResolvedMountainTheme, string> = {
  dark: "#05070B",
  glare: "#FFFFFF",
};

/* ---------------------------------------------------------------------------
   Persistence + subscribers
   ------------------------------------------------------------------------- */

export function parseMountainSettings(raw: string | null): MountainSettings {
  if (!raw) return DEFAULT_MOUNTAIN_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof MountainSettings, unknown>>;
    return {
      batterySaver:
        typeof v.batterySaver === "boolean" ? v.batterySaver : DEFAULT_MOUNTAIN_SETTINGS.batterySaver,
      theme: v.theme === "dark" || v.theme === "glare" || v.theme === "auto" ? v.theme : "auto",
      largeText: typeof v.largeText === "boolean" ? v.largeText : false,
    };
  } catch {
    return DEFAULT_MOUNTAIN_SETTINGS;
  }
}

function readStored(): MountainSettings {
  try {
    return parseMountainSettings(localStorage.getItem(MOUNTAIN_SETTINGS_KEY));
  } catch {
    return DEFAULT_MOUNTAIN_SETTINGS;
  }
}

let settings: MountainSettings = readStored();
let runtime: MountainRuntime = DEFAULT_RUNTIME;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeMountainSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentMountainSettings(): MountainSettings {
  return settings;
}

export function currentMountainRuntime(): MountainRuntime {
  return runtime;
}

/**
 * Returns false when the value could not be kept. The change still applies
 * for this session: unlike the app theme, nothing here survives a reload
 * wrongly, and a glove tap that visibly does nothing is worse.
 */
export function patchMountainSettings(p: Partial<MountainSettings>): boolean {
  settings = { ...settings, ...p };
  let kept = true;
  try {
    localStorage.setItem(MOUNTAIN_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    kept = false;
  }
  emit();
  return kept;
}

export function setMountainRuntime(p: Partial<MountainRuntime>): void {
  const next = { ...runtime, ...p };
  if (next.recording === runtime.recording && next.noSignal === runtime.noSignal && next.onSos === runtime.onSos) return;
  runtime = next;
  emit();
}

/**
 * Something outside the settings changed what they resolve to (the phone's
 * motion preference, the app theme). A new object so snapshot readers re-render.
 */
export function notifyMountainEnvironmentChanged(): void {
  settings = { ...settings };
  emit();
}

/** Picks up a change made in another tab of the app. */
export function reloadMountainSettingsFromStorage(): void {
  settings = readStored();
  emit();
}

export function __resetMountainSettingsForTests(s: MountainSettings = DEFAULT_MOUNTAIN_SETTINGS): void {
  settings = s;
  runtime = DEFAULT_RUNTIME;
  listeners.clear();
}

/* ---------------------------------------------------------------------------
   What goes on <html>
   ------------------------------------------------------------------------- */

export interface MountainDocumentAttributes {
  "data-mountain-theme": ResolvedMountainTheme;
  "data-mountain-motion": "reduced" | "full";
  "data-mountain-text": "large" | "normal";
}

export function mountainAttributes(
  s: MountainSettings,
  rt: MountainRuntime,
  env: { appTheme: "dark" | "light"; prefersReducedMotion: boolean },
): MountainDocumentAttributes {
  const saver = resolveBatterySaver(s.batterySaver, rt);
  return {
    "data-mountain-theme": resolveMountainTheme(s.theme, saver.screen, env.appTheme),
    "data-mountain-motion": env.prefersReducedMotion || saver.screen ? "reduced" : "full",
    "data-mountain-text": s.largeText ? "large" : "normal",
  };
}
