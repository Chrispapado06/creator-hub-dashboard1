import { useState } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { currentTheme, setTheme, systemTheme, type Theme } from "@/settings/theme";

/**
 * THE THEME PICKER — three miniature previews, the way a phone does it.
 *
 * iOS puts this at the top of Display & Brightness and shows the themes rather
 * than naming them: two little screens side by side, the chosen one ringed.
 * That is the right shape for a choice about how something LOOKS — a row of
 * word-buttons asks somebody to imagine the answer, and this shows it.
 *
 * ── WHY THE PREVIEWS ARE HARD-CODED HEX, AND MUST STAY THAT WAY ─────────────
 *
 * Everything else in the app draws from theme tokens, so it follows the
 * person's choice. These previews are the one place that must NOT: a picture of
 * the dark theme has to be dark while you are standing in the light one, or it
 * is not a picture of anything. So each preview carries the literal values of
 * the theme it depicts, copied from the two blocks in `index.css`.
 *
 * THAT MAKES THEM A DUPLICATE, and duplicates go stale — this project has been
 * bitten by exactly that more than once. The mitigation is that they are
 * duplicates of only FIVE values each, they are named in one place, and a drift
 * is visible the instant anybody opens this screen in either theme: the preview
 * stops matching the app behind it. If the palette in `index.css` changes,
 * change `PREVIEW` too.
 *
 * ── THE SYSTEM TILE SHOWS BOTH, AND SAYS WHICH IS ACTIVE ────────────────────
 *
 * Split down the middle, light on the left and dark on the right, because
 * "System" is not a third appearance — it is a promise to follow something
 * else. Under it, the label says which one that currently resolves to, so the
 * tile is never a mystery about what you are about to get.
 */

/* The five values each preview needs, from the two blocks in `index.css`. */
const PREVIEW = {
  light: {
    canvas: "#F6F4F0",
    card: "#FFFFFF",
    text: "#1D222A",
    muted: "#8E94A0",
    accent: "#2F5BE8",
  },
  dark: {
    canvas: "#05070B",
    card: "#0E1219",
    text: "#EAEEF5",
    muted: "#5A6375",
    accent: "#4B9BFF",
  },
} as const;

type Scheme = keyof typeof PREVIEW;

/** A little ICEFALL screen: a serif-ish heading bar, a card, an accent pill. */
function Preview({ scheme, half }: { scheme: Scheme; half?: "left" | "right" }) {
  const c = PREVIEW[scheme];
  return (
    <div
      aria-hidden="true"
      className={cn("absolute inset-0", half === "left" && "right-1/2", half === "right" && "left-1/2")}
      style={{ backgroundColor: c.canvas }}
    >
      {/* The inner frame is always the full tile width, so a half-tile crops
          the same drawing rather than squashing it into half the space. */}
      <div
        className={cn("absolute top-0 h-full w-[92px] p-2.5", half === "right" ? "right-0" : "left-0")}
      >
        <div className="h-2 w-11 rounded-full" style={{ backgroundColor: c.text }} />
        <div className="mt-1.5 h-1.5 w-16 rounded-full" style={{ backgroundColor: c.muted }} />
        <div className="mt-2.5 rounded-[6px] p-2" style={{ backgroundColor: c.card }}>
          <div className="h-1.5 w-12 rounded-full" style={{ backgroundColor: c.muted }} />
          <div className="mt-1.5 h-2.5 w-16 rounded-full" style={{ backgroundColor: c.text }} />
          <div className="mt-2 h-3 w-14 rounded-full" style={{ backgroundColor: c.accent }} />
        </div>
      </div>
    </div>
  );
}

const OPTIONS: { id: Theme; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function ThemePicker() {
  const chosen = currentTheme();
  const follows = systemTheme();
  const [refused, setRefused] = useState(false);

  return (
    <div>
      <div role="radiogroup" aria-label="Theme" className="flex gap-3">
        {OPTIONS.map((o) => {
          const on = chosen === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                /* Returns false when nothing changed — a no-op tap, or storage
                   refused. Only then is there anything to say; a real change
                   reloads the page and this component is gone with it. */
                if (!setTheme(o.id) && !on) setRefused(true);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <span
                className={cn(
                  "relative block aspect-[9/13] w-full overflow-hidden rounded-[12px] border-2 transition-colors",
                  on ? "border-azure" : "border-hairline-strong",
                )}
              >
                {o.id === "system" ? (
                  <>
                    <Preview scheme="light" half="left" />
                    <Preview scheme="dark" half="right" />
                  </>
                ) : (
                  <Preview scheme={o.id === "light" ? "light" : "dark"} />
                )}
              </span>

              <span className="mt-2.5 flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors",
                    on ? "border-azure bg-azure text-[color:var(--ice-obsidian)]" : "border-hairline-strong",
                  )}
                >
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                <span className={cn("truncate text-[13px]", on ? "text-snow" : "text-mist")}>
                  {o.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
        {chosen === "system"
          ? `Following your phone, which is set to ${follows}. It changes with it.`
          : "Your choice, on every page. Pick System to follow your phone instead."}
      </p>

      {refused && (
        <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--ice-danger)]">
          This device would not store the choice, so nothing changed. Applying it anyway would give
          you a theme that reverts on the next launch.
        </p>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
        Changing it reloads the app — the map reads its colours once, when it loads, so switching
        without a reload would leave the map on the old theme.
      </p>
    </div>
  );
}
