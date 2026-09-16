/**
 * THE DESTINATION THE ATHLETE TYPED, MATCHED TO THE EMERGENCY DATA (plan §5.6).
 *
 * `resolveEmergency` is keyed by ISO country code. The athlete's own emergency
 * info holds a free-text destination ("France") because it is a note to
 * themselves, not a database field. This is the only bridge between the two.
 *
 * IT MATCHES EXACTLY OR NOT AT ALL. No prefixes, no fuzzy distance, no "starts
 * with". A near-match here would put another country's number on the biggest
 * button on the SOS screen, and "Fra" is not evidence of France. Where nothing
 * matches, the screen says so and falls to 112 — which is the honest answer.
 *
 * No React, no storage, no network.
 */

import { COUNTRY_EMERGENCY, EMERGENCY_GAPS } from "@/data/mountainRescue";

export type DestinationMatch =
  /** Nothing typed. */
  | { state: "empty" }
  /** ICEFALL holds numbers for this country. */
  | { state: "held"; code: string; name: string }
  /** A country ICEFALL deliberately holds nothing for, with its reason. */
  | { state: "gap"; code: string; name: string; reason: string }
  /** Typed, but not a country ICEFALL holds anything under. */
  | { state: "unknown"; typed: string };

function key(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
}

/**
 * Only spellings that are the same country beyond argument. Nothing here is a
 * translation: ICEFALL does not hold "Suisse", and saying it does would mean
 * guessing at a language it has not been given.
 */
const ALSO_KNOWN_AS: Record<string, string> = {
  usa: "US",
  "u.s.a": "US",
  "u.s": "US",
  "united states of america": "US",
};

const BY_KEY = new Map<string, string>();
for (const c of COUNTRY_EMERGENCY) {
  BY_KEY.set(key(c.name), c.code);
  BY_KEY.set(key(c.code), c.code);
}
for (const g of EMERGENCY_GAPS) {
  BY_KEY.set(key(g.name), g.code);
  BY_KEY.set(key(g.code), g.code);
}
for (const [k, code] of Object.entries(ALSO_KNOWN_AS)) BY_KEY.set(key(k), code);

/** The ISO code the typed destination names, or null. Never a partial match. */
export function destinationCountryCode(typed: string | null | undefined): string | null {
  if (!typed) return null;
  return BY_KEY.get(key(typed)) ?? null;
}

export function matchDestination(typed: string | null | undefined): DestinationMatch {
  const text = (typed ?? "").trim();
  if (!text) return { state: "empty" };
  const code = destinationCountryCode(text);
  const held = code ? COUNTRY_EMERGENCY.find((c) => c.code === code) : undefined;
  if (held) return { state: "held", code: held.code, name: held.name };
  const gap = code ? EMERGENCY_GAPS.find((g) => g.code === code) : undefined;
  if (gap) return { state: "gap", code: gap.code, name: gap.name, reason: gap.reason };
  return { state: "unknown", typed: text };
}

/** The quiet line shown under the destination, in the athlete's own words back. */
export function destinationSentence(m: DestinationMatch): string | null {
  switch (m.state) {
    case "empty":
      return null;
    case "held":
      return `ICEFALL holds emergency numbers for ${m.name}. They are on the SOS screen.`;
    case "gap":
      return `ICEFALL holds no emergency number for ${m.name}.`;
    case "unknown":
      return `ICEFALL holds no numbers under “${m.typed}”. Write the country's name in English to match one, or ask your operator for the local number.`;
  }
}
