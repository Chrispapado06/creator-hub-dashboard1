/**
 * Light or dark, chosen by the person rather than by the build — or, under
 * "System", by their phone.
 *
 * The bootstrap in `index.html` is what actually stamps `data-theme` on <html>,
 * inline and in <head>, so it runs BEFORE first paint. That placement is the
 * whole design: read the preference from a module and the dark canvas paints
 * first and flashes a frame later, on every single launch.
 *
 * So this module does not own the decision at startup — it owns CHANGING it,
 * and it writes to the same key the bootstrap reads. Two readers, one key, and
 * the bootstrap is the authority on what is showing right now.
 *
 * THREE CHOICES, AND WHAT EACH MEANS FOR THE KEY. "dark" and "light" are stored
 * and always win. "system" is the ABSENCE of the key: the bootstrap then asks
 * `prefers-color-scheme` and follows it, including live changes while the app
 * is open. Storing the word "system" would have been a fourth state the
 * bootstrap had to special-case; absence is the state it already handles, and
 * it is also what `resetAll`'s `icefall.` prefix clear leaves behind — so a
 * fresh onboarding follows the phone, which is the right default for somebody
 * who has never told ICEFALL otherwise. (Owner's ruling, 2026-09-04: the app
 * matches the person's preference on every page.)
 *
 * WHY THE PAGE RELOADS ON CHANGE, rather than just re-stamping the attribute.
 * Re-stamping works for everything driven by a CSS token — which is most of the
 * app — but not for what is drawn ONTO a canvas or fetched as a styled asset:
 * the map style is chosen once at load, and its tiles do not re-colour. A reload
 * is a quarter of a second and it is the difference between "the theme changed"
 * and "the theme changed except the map", which is the sort of half-state this
 * app refuses to ship. (A live SYSTEM change while the app is open re-stamps
 * without reloading — the bootstrap owns that — so the map is the one thing
 * that waits for the next launch in that case. Rare, and said in Settings.)
 */

export type Theme = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

const KEY = "icefall.theme.v1";

/** What the person chose. "system" when they have never chosen. */
export function currentTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    /* Private mode. Nothing can have been stored, so nothing was chosen. */
    return "system";
  }
}

/** What the phone prefers right now. Dark when it cannot be asked. */
export function systemTheme(): ResolvedTheme {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

/** What is — or should be — on screen: the choice, else the phone's. */
export function resolvedTheme(): ResolvedTheme {
  const chosen = currentTheme();
  return chosen === "system" ? systemTheme() : chosen;
}

/**
 * Change it. Returns false when nothing happened, so a caller can tell a real
 * change from a no-op instead of assuming the tap did something.
 */
export function setTheme(next: Theme): boolean {
  if (next === currentTheme()) return false;
  try {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* Storage refused: the choice cannot be kept, so it must not be applied
       either. Applying it would give them a theme that silently reverts on the
       next launch, which is worse than the switch appearing not to work. */
    return false;
  }
  /* `replace`, not `assign`: a theme change is not a place in history, and a
     back-tap should not undo it halfway. */
  window.location.replace(window.location.pathname + window.location.search);
  return true;
}
