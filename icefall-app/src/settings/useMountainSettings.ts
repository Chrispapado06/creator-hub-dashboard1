/**
 * React side of `settings/mountain.ts`. Theme changes re-stamp attributes on
 * <html>; nothing reloads (unlike `settings/theme.ts`, whose map style needs
 * one — Mountain mode's map is not a Mapbox style).
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  MOUNTAIN_SETTINGS_KEY,
  MOUNTAIN_THEME_COLOR,
  currentMountainRuntime,
  currentMountainSettings,
  mountainAttributes,
  notifyMountainEnvironmentChanged,
  patchMountainSettings,
  reloadMountainSettingsFromStorage,
  resolveBatterySaver,
  resolveMountainTheme,
  setMountainRuntime,
  subscribeMountainSettings,
  type BatterySaverState,
  type MountainDocumentAttributes,
  type MountainRuntime,
  type MountainSettings,
  type MountainThemeChoice,
  type ResolvedMountainTheme,
} from "./mountain";

function useSettingsSnapshot(): MountainSettings {
  return useSyncExternalStore(subscribeMountainSettings, currentMountainSettings, currentMountainSettings);
}

function useRuntimeSnapshot(): MountainRuntime {
  return useSyncExternalStore(subscribeMountainSettings, currentMountainRuntime, currentMountainRuntime);
}

/** The bootstrap in index.html is the authority on the app theme showing now. */
function appThemeNow(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function prefersReducedMotionNow(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function useBatterySaver(): BatterySaverState & { setEnabled: (on: boolean) => boolean } {
  const s = useSettingsSnapshot();
  const rt = useRuntimeSnapshot();
  const setEnabled = useCallback((on: boolean) => patchMountainSettings({ batterySaver: on }), []);
  return { ...resolveBatterySaver(s.batterySaver, rt), setEnabled };
}

export function useMountainTheme(): {
  choice: MountainThemeChoice;
  resolved: ResolvedMountainTheme;
  setTheme: (t: MountainThemeChoice) => boolean;
} {
  const s = useSettingsSnapshot();
  const rt = useRuntimeSnapshot();
  const saver = resolveBatterySaver(s.batterySaver, rt);
  const setTheme = useCallback((t: MountainThemeChoice) => patchMountainSettings({ theme: t }), []);
  return { choice: s.theme, resolved: resolveMountainTheme(s.theme, saver.screen, appThemeNow()), setTheme };
}

export function useLargeText(): { largeText: boolean; setLargeText: (on: boolean) => boolean } {
  const s = useSettingsSnapshot();
  const setLargeText = useCallback((on: boolean) => patchMountainSettings({ largeText: on }), []);
  return { largeText: s.largeText, setLargeText };
}

/**
 * The shell reports what it knows (recording, no signal, on SOS). Each value
 * is optional so one caller can own each fact. Reset to "unknown" defaults on
 * unmount.
 */
export function useReportMountainRuntime(p: Partial<MountainRuntime>): void {
  const { recording, noSignal, onSos } = p;
  useEffect(() => {
    const patch: Partial<MountainRuntime> = {};
    if (recording !== undefined) patch.recording = recording;
    if (noSignal !== undefined) patch.noSignal = noSignal;
    if (onSos !== undefined) patch.onSos = onSos;
    setMountainRuntime(patch);
  }, [recording, noSignal, onSos]);
  useEffect(
    () => () => {
      const reset: Partial<MountainRuntime> = {};
      if (recording !== undefined) reset.recording = false;
      if (noSignal !== undefined) reset.noSignal = false;
      if (onSos !== undefined) reset.onSos = false;
      setMountainRuntime(reset);
    },
    // Only on unmount; the first effect keeps values current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}

const ATTRS: (keyof MountainDocumentAttributes)[] = [
  "data-mountain-theme",
  "data-mountain-motion",
  "data-mountain-text",
];

/**
 * Mount once in the Mountain shell. Stamps the attributes on <html>, keeps the
 * status-bar colour in step, follows other tabs and the phone's motion
 * preference, and removes everything on unmount so the full app is untouched.
 */
export function useMountainDocument(): void {
  const s = useSettingsSnapshot();
  const rt = useRuntimeSnapshot();

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    /* Captured before the stamping effect below overwrites it. */
    const original = meta?.content;
    let mq: MediaQueryList | null = null;
    const onMotion = () => notifyMountainEnvironmentChanged();
    try {
      mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
      mq?.addEventListener?.("change", onMotion);
    } catch {
      mq = null;
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === MOUNTAIN_SETTINGS_KEY || e.key === null) reloadMountainSettingsFromStorage();
    };
    window.addEventListener("storage", onStorage);
    /* The index.html bootstrap re-stamps data-theme live when the phone's
       light/dark changes; "auto" follows it. */
    const observer =
      typeof MutationObserver === "function" ? new MutationObserver(onMotion) : null;
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      observer?.disconnect();
      mq?.removeEventListener?.("change", onMotion);
      window.removeEventListener("storage", onStorage);
      if (meta && original !== undefined) meta.content = original;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const apply = () => {
      const attrs = mountainAttributes(currentMountainSettings(), currentMountainRuntime(), {
        appTheme: appThemeNow(),
        prefersReducedMotion: prefersReducedMotionNow(),
      });
      for (const k of ATTRS) root.setAttribute(k, attrs[k]);
      if (meta) meta.content = MOUNTAIN_THEME_COLOR[attrs["data-mountain-theme"]];
    };
    apply();
    return () => {
      /* Re-applied on the next run; only a real unmount leaves them removed. */
      for (const k of ATTRS) root.removeAttribute(k);
    };
  }, [s, rt]);
}
