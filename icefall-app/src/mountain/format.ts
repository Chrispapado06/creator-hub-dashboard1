/** Small shared wording for Mountain mode. Plain words, short. */

/** "just now", "40 s ago", "14 min ago", "3 h ago", "2 days ago". */
export function ageLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** A duration as "1 h 12 min" / "12 min" / "45 s". */
export function durationLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} h ${rem} min` : `${h} h`;
}

/** The 112 fallback, word for word from plan §5.5. Never a guessed number. */
export const INTERNATIONAL_112 = "112";
export const NO_NUMBER_HEADING = "ICEFALL holds no emergency number for this country.";
export const INTERNATIONAL_112_NOTE: readonly string[] = [
  "112 is the emergency number across the European Union. Outside it, most mobile phones recognise 112 and try to route it to whatever local service exists — that is a convention built into handsets and networks, not a promise about what is at the other end.",
  "It may not be answered here. It may not reach mountain rescue. Whoever answers may not speak English. And none of it works without a signal.",
  "Ask your guide or your operator for the local number, and ask before you are on the mountain.",
];
