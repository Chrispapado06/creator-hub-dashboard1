/**
 * Wording and choices for the Mountain mode settings screen (brief M10).
 *
 * Kept apart from the screen so the copy and the one rule behind it are tested
 * without a browser. The settings themselves live in `@/settings/mountain`.
 */

import type { MountainThemeChoice, ResolvedMountainTheme } from "@/settings/mountain";

export const SETTINGS_TITLE = "Settings";

/** The one line under the battery saver switch, and the only trade-off it has. */
export const BATTERY_SAVER_TRADEOFF = "GPS updates less often while you move.";

export const THEME_OPTIONS: { value: MountainThemeChoice; label: string; note: string }[] = [
  { value: "auto", label: "Auto", note: "Follows the app and battery saver." },
  { value: "dark", label: "Dark", note: "Always dark." },
  { value: "glare", label: "Glare", note: "High contrast for snow and sun." },
];

export const RESOLVED_THEME_LABEL: Record<ResolvedMountainTheme, string> = {
  dark: "dark",
  glare: "glare",
};

/**
 * Under "Auto" the choice does not say what is on the screen, so the screen
 * says it. Under Dark or Glare the button already reads it back.
 */
export function themeNowSentence(
  choice: MountainThemeChoice,
  resolved: ResolvedMountainTheme,
): string | null {
  if (choice !== "auto") return null;
  return `Showing ${RESOLVED_THEME_LABEL[resolved]} now.`;
}

export const LARGE_TEXT_LABEL = "Large text";
export const LARGE_TEXT_TRADEOFF = "Big numbers grow less, so they still fit one line.";

export const SWITCH_ON = "On";
export const SWITCH_OFF = "Off";

/** Shown when the phone refused to keep a change (private mode, full storage). */
export const NOT_KEPT_SENTENCE =
  "This phone would not save the change. It stays until you close ICEFALL.";

export const ON_THIS_PHONE_SENTENCE = "These three are kept on this phone, not on your account.";
