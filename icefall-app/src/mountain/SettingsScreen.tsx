/**
 * MOUNTAIN MODE SETTINGS (brief M10, plan §6.2).
 *
 * Three switches and nothing else: battery saver, screen theme, large text.
 * No network, no account, no AI — every change is this phone's, applies
 * immediately and survives airplane mode.
 *
 * Nothing reloads. `useMountainDocument()` in the shell re-stamps the three
 * attributes on <html> and every Mountain surface is drawn from the tokens in
 * `mountainTheme.css`, so a glare tap repaints in place — losing a GPS lock to
 * a reload for a colour change would be absurd on a mountain.
 */

import { useState } from "react";

import { cn } from "@/lib/utils";
import { useBatterySaver, useLargeText, useMountainTheme } from "@/settings/useMountainSettings";

import {
  BATTERY_SAVER_TRADEOFF,
  LARGE_TEXT_LABEL,
  LARGE_TEXT_TRADEOFF,
  NOT_KEPT_SENTENCE,
  ON_THIS_PHONE_SENTENCE,
  SETTINGS_TITLE,
  SWITCH_OFF,
  SWITCH_ON,
  THEME_OPTIONS,
  themeNowSentence,
} from "./settingsModel";

/** Every control here is a glove-sized target: min-h-16 is 64px (plan §3.0). */
const CONTROL = "flex min-h-16 w-full items-center justify-between gap-4 px-5 py-3 text-left";
const LABEL = "section-label px-5 pb-2";

function Switch({
  label,
  note,
  on,
  onChange,
}: {
  label: string;
  note: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(CONTROL, "border-t border-hairline")}
    >
      <span className="min-w-0">
        <span className="m-text-body block text-snow">{label}</span>
        <span className="m-text-label mt-1 block leading-snug text-mist">{note}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "m-text-label shrink-0 rounded-full px-4 py-2 font-semibold",
          /* Azure is "on" everywhere else in the mode (the active tab, the
             selected state); a white chip read as a third colour. */
          on ? "bg-azure text-obsidian" : "border border-hairline-strong text-mist",
        )}
      >
        {on ? SWITCH_ON : SWITCH_OFF}
      </span>
    </button>
  );
}

export default function SettingsScreen() {
  const saver = useBatterySaver();
  const theme = useMountainTheme();
  const text = useLargeText();
  const [refused, setRefused] = useState(false);

  /* Each setter returns false when the phone would not keep the value. */
  const keep = (kept: boolean) => setRefused((was) => was || !kept);

  const now = themeNowSentence(theme.choice, theme.resolved);

  return (
    <div className="pb-10">
      <section className="px-5 pt-8">
        <h1 className="text-[40px] font-light leading-none tracking-[-0.02em] text-snow">
          {SETTINGS_TITLE}
        </h1>
        <p className="m-text-label mt-4 leading-snug text-mist">{ON_THIS_PHONE_SENTENCE}</p>
      </section>

      <section className="mt-8" aria-labelledby="m-battery">
        <h2 id="m-battery" className={LABEL}>
          Battery
        </h2>
        <Switch
          label="Battery saver"
          note={BATTERY_SAVER_TRADEOFF}
          on={saver.enabled}
          onChange={(next) => keep(saver.setEnabled(next))}
        />
        {/* What it is doing RIGHT NOW, which is not always what the switch says:
            recording, no signal and SOS each hold parts of it off (plan §6.2). */}
        <p className="m-text-label border-t border-hairline px-5 py-3 leading-snug text-mist">
          {saver.status}
        </p>
      </section>

      <section className="mt-8" aria-labelledby="m-screen">
        <h2 id="m-screen" className={LABEL}>
          Screen
        </h2>
        <div role="radiogroup" aria-labelledby="m-screen">
          {THEME_OPTIONS.map((o) => {
            const on = theme.choice === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => keep(theme.setTheme(o.value))}
                className={cn(CONTROL, "border-t border-hairline")}
              >
                <span className="min-w-0">
                  <span className={cn("m-text-body block", on ? "text-snow" : "text-mist")}>
                    {o.label}
                  </span>
                  <span className="m-text-label mt-1 block leading-snug text-mist">{o.note}</span>
                </span>
                {on && (
                  <span
                    aria-hidden
                    className="m-text-label shrink-0 rounded-full bg-azure px-4 py-2 font-semibold text-obsidian"
                  >
                    {SWITCH_ON}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {now && (
          <p className="m-text-label border-t border-hairline px-5 py-3 leading-snug text-mist">
            {now}
          </p>
        )}
      </section>

      <section className="mt-8" aria-labelledby="m-text">
        <h2 id="m-text" className={LABEL}>
          Text
        </h2>
        <Switch
          label={LARGE_TEXT_LABEL}
          note={LARGE_TEXT_TRADEOFF}
          on={text.largeText}
          onChange={(next) => keep(text.setLargeText(next))}
        />
      </section>

      {refused && (
        <p className="m-text-body mt-8 border-t border-hairline px-5 py-4 leading-snug text-alert">
          {NOT_KEPT_SENTENCE}
        </p>
      )}
    </div>
  );
}
