/**
 * The age of a forecast the phone kept (Mountain mode plan §3.0, slice item 2).
 *
 * Drawn above the weather now and above the forecast ahead. Renders nothing
 * while the forecast is fresh, so a screen read with a signal is unchanged.
 * The rules themselves live in `services/conditions.ts`.
 */

import { cn } from "@/lib/utils";
import { currentAgeSentence, forecastAgeSentence, type ForecastAge } from "@/services/conditions";

/** Greyed: old enough that it must not read as current, not yet old enough to withhold. */
export const GREYED = "opacity-60";

export function ForecastAgeNote({
  age,
  scope,
  className,
}: {
  age: ForecastAge | null;
  scope: "current" | "forecast";
  className?: string;
}) {
  const sentence = scope === "current" ? currentAgeSentence(age) : forecastAgeSentence(age);
  if (!age || !sentence) return null;
  const band = scope === "current" ? age.current : age.forecast;
  return (
    <p
      role="note"
      className={cn("text-[12px] leading-snug", band === "aged" ? "text-mist" : "text-alert", className)}
    >
      {sentence}
    </p>
  );
}
