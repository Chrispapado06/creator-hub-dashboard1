import { useState } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  APP_LANGUAGES,
  browserAppLanguage,
  resolveAppLanguage,
  setAppLanguage,
  storedAppLanguage,
  type AppLanguage,
} from "@/i18n/language";

/**
 * THE LANGUAGE THE APP'S OWN SCREENS ARE IN — separate from `CoachLanguagePicker`,
 * which only changes what the Coach writes back to you.
 *
 * SAME REASON AS THE THEME PICKER FOR THE RELOAD. Plenty of the app reads its
 * strings once at load rather than watching for a change, so this control does
 * what `ThemePicker` already does for the same shape of choice: persist, then
 * reload, rather than trying to push a new value through everything live.
 *
 * ONLY TWO OPTIONS, AND THE SECOND SAYS WHAT IT ACTUALLY COVERS. Spanish today
 * translates the Settings screen and nothing beyond it — the rest of the app
 * stays in English even after you choose it — and the row under the list says
 * so, rather than letting somebody discover the gap screen by screen.
 */
export function AppLanguagePicker() {
  const [stored, setStored] = useState<AppLanguage | null>(() => storedAppLanguage());
  const [refused, setRefused] = useState(false);
  const browser = browserAppLanguage();
  const effective = stored ?? resolveAppLanguage();
  const effectiveInfo = APP_LANGUAGES.find((l) => l.code === effective) ?? APP_LANGUAGES[0];

  function choose(code: AppLanguage) {
    if (code === effective) return;
    const ok = setAppLanguage(code);
    if (!ok) {
      setRefused(true);
      return;
    }
    setStored(code);
    /* Reload rather than re-render — see the note in `@/i18n/index` on why
       this mirrors ThemePicker exactly. */
    window.location.reload();
  }

  return (
    <div className="pt-1.5">
      <p className="px-1 text-[12px] leading-relaxed text-mist">
        The language ICEFALL's own screens, buttons and menus are written in.
      </p>

      <div className="mt-2.5">
        {APP_LANGUAGES.map((l) => {
          const chosen = effective === l.code;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => choose(l.code)}
              className={cn(
                "flex w-full items-center justify-between gap-3 border-b border-hairline py-2.5 text-left last:border-b-0",
                "transition-colors hover:text-snow",
              )}
            >
              <span className="min-w-0">
                <span className={cn("text-[14px]", chosen ? "text-snow" : "text-mist")}>
                  {l.nativeName}
                </span>
                {l.nativeName !== l.englishName && (
                  <span className="ml-2 text-[12px] text-mist-dim">{l.englishName}</span>
                )}
                {stored === null && browser === l.code && (
                  <span className="ml-2 text-[11px] text-mist-dim">· following your device</span>
                )}
              </span>
              {chosen && (
                <Check
                  size={16}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="shrink-0 text-azure"
                />
              )}
            </button>
          );
        })}
      </div>

      {effectiveInfo.coverage === "settings" && (
        <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
          {effectiveInfo.englishName} is translated on the Settings screen only today. The rest of
          ICEFALL — Home, Explore, Coach, everywhere else — stays in English until it has had the
          same care.
        </p>
      )}

      {refused && (
        <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--ice-danger)]">
          This device would not store the choice, so nothing changed.
        </p>
      )}
    </div>
  );
}
