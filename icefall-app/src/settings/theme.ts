/**
 * Light or dark, chosen by the person rather than by the build.
 *
 * The bootstrap in `index.html` is what actually stamps `data-theme` on <html>,
 * inline and in <head>, so it runs BEFORE first paint. That placement is the
 * whole design: read the preference from a module and the dark canvas paints
 * first and flashes white a frame later, on every single launch.
 *
 * So this module does not own the decision at startup — it owns CHANGING it,
 * and it writes to the same key the bootstrap reads. Two readers, one key, and
 * the bootstrap is the authority on what is showing right now.
 *
 * WHY THE PAGE RELOADS ON CHANGE, rather than just re-stamping the attribute.
 * Re-stamping works for everything driven by a CSS token — which is most of the
 * app — but not for what is drawn ONTO a canvas or fetched as a styled asset:
 * the map style is chosen once at load, and its tiles do not re-colour. A reload
 * is a quarter of a second and it is the difference between "the theme changed"
 * and "the theme changed except the map", which is the sort of half-state this
 * app refuses to ship.
 */

export type Theme = "dark" | "light";

const KEY = "icefall.theme.v1";

/** Dark unless told otherwise — the default the app was designed at. */
export function currentTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    /* Private mode. Dark is the honest fallback: it is what is on screen. */
    return "dark";
  }
}

/**
 * Change it. Returns false when nothing happened, so a caller can tell a real
 * change from a no-op instead of assuming the tap did something.
 */
export function setTheme(next: Theme): boolean {
  if (next === currentTheme()) return false;
  try {
    localStorage.setItem(KEY, next);
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
