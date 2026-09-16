import { en, type Strings } from "@/i18n/dictionaries/en";
import { es } from "@/i18n/dictionaries/es";
import { resolveAppLanguage, type AppLanguage } from "@/i18n/language";
import type { DeepPartial } from "@/i18n/types";

/**
 * THE STRING-LOOKUP SYSTEM.
 *
 * `@/i18n/language.ts` decides WHICH language is active and keeps that choice
 * on the device. This file turns that choice into an actual strings object a
 * screen can read from — `t.settings.rows.security.title` rather than a
 * scattered literal — with English underneath every key so a partial or
 * missing translation degrades to correct English instead of a blank.
 *
 * ============================================================================
 * HOW A SCREEN OPTS IN
 * ============================================================================
 *
 *   import { useAppStrings } from "@/i18n";
 *   const t = useAppStrings();
 *   <p>{t.settings.rows.security.title}</p>
 *
 * ============================================================================
 * WHY THIS IS A RELOAD-ON-CHANGE SYSTEM, NOT A LIVE-SUBSCRIBED ONE
 * ============================================================================
 *
 * `ThemePicker` already answered this question for the same shape of choice:
 * changing the theme calls `location.reload()` rather than pushing the new
 * value through React state, because plenty of the app reads its look once,
 * at load, rather than subscribing to it. The language choice has the same
 * property and the same fix — `AppLanguagePicker` reloads the page when you
 * change it, so `useAppStrings` only has to read localStorage once, on mount,
 * and never has to guess which components would need to re-render if it
 * changed under them without a reload.
 */

const DICTIONARIES: Record<AppLanguage, DeepPartial<Strings>> = { en, es };

/**
 * Merges `override` onto `base`, key by key, recursing into plain objects.
 * A key `override` does not define falls through to `base`'s value — this is
 * what lets `es.ts` (or any future, partial dictionary) name only the strings
 * somebody has actually translated.
 */
function deepMerge<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (!override) return base;
  const out = { ...base } as T;
  for (const key in override) {
    const overrideValue = override[key];
    if (overrideValue === undefined) continue;
    const baseValue = base[key as unknown as keyof T];
    if (
      typeof overrideValue === "object" &&
      overrideValue !== null &&
      !Array.isArray(overrideValue) &&
      typeof baseValue === "object" &&
      baseValue !== null
    ) {
      out[key as unknown as keyof T] = deepMerge(
        baseValue,
        overrideValue as DeepPartial<typeof baseValue>,
      );
    } else {
      out[key as unknown as keyof T] = overrideValue as T[keyof T];
    }
  }
  return out;
}

/** The full strings object for one language — English filling every gap. */
export function stringsFor(language: AppLanguage): Strings {
  if (language === "en") return en;
  return deepMerge(en, DICTIONARIES[language]);
}

/**
 * The strings object for whichever language is active right now (stored
 * choice, else the browser, else English — see `resolveAppLanguage`).
 *
 * Named `useAppStrings` for the call-site shape screens want — read once per
 * render, right beside the component that uses it — but it is a plain
 * function, not a React hook: it holds no state and subscribes to nothing, on
 * purpose (see the reload note above). Calling it outside a component, in a
 * test, or conditionally is all fine.
 */
export function useAppStrings(): Strings {
  return stringsFor(resolveAppLanguage());
}

export type { Strings };
export { APP_LANGUAGES, DEFAULT_APP_LANGUAGE, resolveAppLanguage, setAppLanguage, storedAppLanguage } from "@/i18n/language";
export type { AppLanguage, AppLanguageInfo } from "@/i18n/language";
