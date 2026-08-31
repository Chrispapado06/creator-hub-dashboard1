/**
 * Theme choice — Light (the default), Dark, or System.
 *
 * OP-09. The portal is light by owner decision #18 and stays light for anyone
 * who never opens the setting; this file only lets an operator say otherwise.
 * All it ever does is stamp `data-theme` on <html>. The colours themselves are
 * one block of values in `index.css` and nothing here knows any of them.
 *
 * WHY THE APPLY RUNS AT IMPORT TIME, NOT IN AN EFFECT.
 * An effect runs after the first paint, so an operator who chose Dark would get
 * a white portal for a frame on every reload — the flash is worst on the screen
 * they look at most. `main.tsx` and `index.html` belong to nobody in this batch,
 * so instead of an inline <script> the stamp happens as a side effect of
 * importing this module, which the provider chain pulls in before React renders
 * anything. Same result, no file outside this session's ownership.
 *
 * WHY `localStorage` IS TOUCHED ONLY THROUGH THESE TWO FUNCTIONS.
 * Both the read AND the write throw in a private window, and a portal that
 * cannot boot because somebody opened it in a private tab is a worse bug than
 * a forgotten colour preference. Every access below is wrapped; failure means
 * "no stored choice", never an exception.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** What the operator picked. `system` is a live subscription, not a snapshot. */
export type ThemeChoice = "light" | "dark" | "system";

/** What that resolves to right now. The only thing the DOM ever sees. */
export type ResolvedTheme = "light" | "dark";

/** Namespaced: this portal shares an origin with the other Icefall apps in dev. */
const THEME_KEY = "icefall-operator.theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The default, stated once so it cannot drift between the reads below. */
const DEFAULT_CHOICE: ThemeChoice = "light";

function readStoredChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Storage disabled or blocked. Fall through to the default.
  }
  return DEFAULT_CHOICE;
}

function writeStoredChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // The choice still applies for this session; it just will not be remembered.
  }
}

/** `matchMedia` is missing in some embedded runtimes and throws in others. */
function darkQuery(): MediaQueryList | null {
  try {
    return window.matchMedia ? window.matchMedia(DARK_QUERY) : null;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return darkQuery()?.matches ?? false;
}

export function resolveChoice(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  if (choice === "system") return systemDark ? "dark" : "light";
  return choice;
}

function stamp(theme: ResolvedTheme): void {
  try {
    document.documentElement.dataset.theme = theme;
  } catch {
    // Nothing to do; the light default is what the stylesheet already says.
  }
}

/* Before the first paint — see the header. */
stamp(resolveChoice(readStoredChoice(), systemPrefersDark()));

interface ThemeContextValue {
  /** What the operator picked, including `system`. This is what the control shows. */
  choice: ThemeChoice;
  /** What is on screen. Follows the OS while the choice is `system`. */
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeCtx = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStoredChoice);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  /**
   * System has to keep meaning "system" after the portal is open. An operator
   * whose Mac flips to dark at sunset with the portal on a second monitor
   * should watch it flip too, not find out at the next reload.
   */
  useEffect(() => {
    const mql = darkQuery();
    if (!mql) return;
    setSystemDark(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const resolved = resolveChoice(choice, systemDark);

  useEffect(() => {
    stamp(resolved);
  }, [resolved]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    writeStoredChoice(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ choice, resolved, setChoice }),
    [choice, resolved, setChoice],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeCtx);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
