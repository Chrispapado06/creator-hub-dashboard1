/**
 * THE LANGUAGE THE APP'S OWN SCREENS ARE WRITTEN IN.
 *
 * A different control from `@/coach/language`, on purpose. That one changes
 * the sentences the Coach writes back to you and leaves every tab, button and
 * label exactly where it is. This one is the other half: which language the
 * labels themselves are in — "Settings" vs "Ajustes", "Sign out" vs "Cerrar
 * sesión".
 *
 * ============================================================================
 * WHAT THIS PASS BUILDS, AND WHAT IT DELIBERATELY DOES NOT
 * ============================================================================
 *
 * This file is the SWITCH: a closed list of app languages, where the choice is
 * stored, and how it is resolved. `@/i18n/index` is the LOOKUP: given the
 * resolved language, it hands back a strings object with English underneath
 * every key, so a screen that has not been translated yet still reads
 * correctly rather than showing a blank or a raw key.
 *
 * Translating the app's hundreds of UI strings is NOT done in this pass. Only
 * the Settings screen's own strings are wired through the lookup system today
 * (`@/i18n/dictionaries/en.ts`, the complete source). Doing the rest properly
 * needs the same care the coach's language file demands of itself — reviewed
 * by somebody who can actually read the result — and rushing it would be
 * exactly the kind of invented content this app has been built never to ship.
 * See `@/i18n/index` for how a screen opts in.
 *
 * ============================================================================
 * WHY THE LIST IS CLOSED, AND WHY SPANISH IS THE ONLY SECOND ENTRY
 * ============================================================================
 *
 * Same reasoning as the coach's language list: an open list invites a language
 * nobody on the team can spot-check. Spanish is the one other language this
 * pass actually translated (the Settings screen only, see `es.ts`), so it is
 * the only one offered — offering a language with nothing behind it would be
 * a picker that lies the moment you tap it. Every other entry stays out until
 * a real translation exists for it.
 */

export type AppLanguage = "en" | "es";

export interface AppLanguageInfo {
  code: AppLanguage;
  /** In English, for anything the app logs or that a contributor reads. */
  englishName: string;
  /** In its own script — the label the picker actually shows. */
  nativeName: string;
  /**
   * What is actually translated today. `"full"` for English, the source
   * language everything is written in first. `"settings"` for a language
   * where only the Settings screen has been carried across — said here so the
   * picker can be honest about it rather than implying the whole app moved.
   */
  coverage: "full" | "settings";
}

export const APP_LANGUAGES: readonly AppLanguageInfo[] = [
  { code: "en", englishName: "English", nativeName: "English", coverage: "full" },
  { code: "es", englishName: "Spanish", nativeName: "Español", coverage: "settings" },
] as const;

export const DEFAULT_APP_LANGUAGE: AppLanguage = "en";

export function appLanguageInfo(code: AppLanguage): AppLanguageInfo {
  return APP_LANGUAGES.find((l) => l.code === code) ?? APP_LANGUAGES[0];
}

function isAppLanguage(v: unknown): v is AppLanguage {
  return typeof v === "string" && APP_LANGUAGES.some((l) => l.code === v);
}

/** A BCP-47 tag to one of ours, or null. Primary subtag only — see coach/language.ts. */
export function appLanguageFromTag(tag: string | null | undefined): AppLanguage | null {
  const primary = (tag ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return isAppLanguage(primary) ? primary : null;
}

/* -------------------------------------------------------------------------- */
/* Where the choice is kept                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Its own key, deliberately separate from `icefall.coach.language.v1`. The two
 * controls answer different questions and a person may reasonably want the
 * interface in English while the coach answers in Spanish, or the reverse.
 */
const STORAGE_KEY = "icefall.app.language.v1";

/** `null` when nobody has chosen; the caller then falls back to the browser. */
export function storedAppLanguage(): AppLanguage | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isAppLanguage(raw) ? raw : null;
  } catch {
    // Private mode, or storage disabled. English, and nothing breaks.
    return null;
  }
}

/**
 * Persists the choice and returns whether it was actually stored. `false`
 * means the device refused (private mode, storage disabled, quota) — the
 * caller is a UI control and should say so rather than pretending it worked.
 */
export function setAppLanguage(code: AppLanguage): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, code);
    return true;
  } catch {
    return false;
  }
}

/** The browser's own setting, if it is one we have a translation for. */
export function browserAppLanguage(): AppLanguage | null {
  if (typeof navigator === "undefined") return null;
  const tags =
    Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];
  for (const tag of tags) {
    const hit = appLanguageFromTag(tag);
    if (hit) return hit;
  }
  return null;
}

/**
 * The answer, in one call: stored choice, else the browser, else English.
 * Pure apart from two guarded reads — safe during render, safe in a test
 * runner with no DOM.
 */
export function resolveAppLanguage(): AppLanguage {
  return storedAppLanguage() ?? browserAppLanguage() ?? DEFAULT_APP_LANGUAGE;
}
