import { useState } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  REPLY_LANGUAGES,
  browserReplyLanguage,
  languageInfo,
  resolveReplyLanguage,
  setReplyLanguage,
  storedReplyLanguage,
  type ReplyLanguage,
} from "@/coach/language";

/**
 * THE LANGUAGE THE COACH WRITES IN.
 *
 * NOT "the app's language", and the copy says so plainly. ICEFALL's screens,
 * tabs and buttons are in English and this control does not change one of
 * them — it changes the coach's prose. Somebody who taps Español and then
 * finds the tab bar still reading PLAN has not been misled, because the line
 * above the list told them that is what would happen.
 *
 * NO FLAGS. A flag is a country and this is a language; Spanish is not
 * Spain's, French is not France's, and putting a tricolour beside a language
 * spoken across four continents tells a good part of its speakers that the
 * app thinks they are foreign. The native name in its own script does the
 * whole job and does it for the one person who most needs to read it.
 *
 * WHAT THE DEFAULT ROW SAYS. Until somebody chooses, the coach follows the
 * browser, so the default option NAMES what the browser currently resolves to
 * rather than saying "Automatic" and leaving them to find out. A default that
 * will not say what it does is a mystery, not a default.
 *
 * NO BOXES: rows and hairlines, with a tick against the chosen one — the same
 * shape the rest of Settings uses.
 */
export function CoachLanguagePicker() {
  const [stored, setStored] = useState<ReplyLanguage | null>(() => storedReplyLanguage());
  const browser = browserReplyLanguage();
  const effective = stored ?? resolveReplyLanguage();

  function choose(code: ReplyLanguage) {
    setReplyLanguage(code);
    setStored(code);
  }

  return (
    <div className="pt-1.5">
      <p className="px-1 text-[12px] leading-relaxed text-mist">
        The coach answers in this language. The rest of ICEFALL stays in English — screen and tab
        names are left as they are so you can still find them.
      </p>

      <div className="mt-2.5">
        {REPLY_LANGUAGES.map((l) => {
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

      {/*
        THE TWO THINGS THIS CONTROL CANNOT DO, SAID BEFORE ANYBODY IS
        SURPRISED BY THEM.

        Both are real limits of the build rather than caveats for their own
        sake, and both are the kind of thing somebody only discovers at the
        worst moment — halfway up, offline, or reading an emergency card.
      */}
      {effective !== "en" && (
        <div className="mt-3 space-y-2 border-t border-hairline pt-3">
          <p className="text-[11px] leading-relaxed text-mist-dim">
            Two answers stay in English whatever you choose here. Emergency guidance — what ICEFALL
            says when you describe a symptom — is fixed text that a person has written and checked,
            and it is never machine-translated: an instruction to descend must not change meaning in
            translation, so until a {languageInfo(effective).englishName} version has been reviewed
            by someone, you get the English one.
          </p>
          <p className="text-[11px] leading-relaxed text-mist-dim">
            The offline coach is also English only. When your phone has no signal, ICEFALL answers
            from guidance written into the app, and that is written in English.
          </p>
        </div>
      )}
    </div>
  );
}
