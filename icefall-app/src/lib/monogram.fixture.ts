import { initialsFor } from "./monogram";

/**
 * The agreed fixture, shared verbatim with `icefall-web`.
 *
 * SHIP THE FIXTURE, NOT JUST THE RULE. Two rounds of this change agreed on
 * every name that behaved the same way and diverged on every name that did
 * not — "the reference set cannot catch a disagreement it does not exercise".
 * These are the cases that actually separate two implementations, so they are
 * written down rather than re-derived: a leading digit, a trailing year, a name
 * that is only a year, a two-character name, a three-part Nepali name, and
 * nothing at all.
 *
 * If you change `initialsFor`, this file changes in `icefall-web` too, in the
 * same pass. See constitution §6u.
 */
export const COMPANY_FIXTURE: readonly (readonly [string, string])[] = [
  ["Solukhumbu Expeditions", "SE"],
  ["Elite Exped", "EE"],
  ["Cordillera Ascents", "CA"],
  ["Chamonix Alpine Guides", "CG"],
  ["Alaska & Yukon", "AY"],
  ["Nima Chhiring Lama", "NL"],
  ["Everest Spring 2027", "ES"],
  ["Seven Summit Treks", "ST"],
  ["Sherpa", "SH"],
  ["14 Peaks Expedition", "PE"],
  ["7 Summits Club", "SC"],
  ["8000ers Ltd", "LT"],
  ["Everest 2027", "EV"],
  ["K2 8611", "K2"],
  ["2027", "20"],
  ["", "··"],
];

/** People go through the SAME function — there is no second algorithm. */
export const PEOPLE_FIXTURE: readonly (readonly [string, string])[] = [
  ["Nima Chhiring Lama", "NL"],
  ["Kami Rita Sherpa", "KS"],
  ["Ang Dorje", "AD"],
  ["Sherpa", "SH"],
  ["", "··"],
];

/** Returns the rows that do not match. Empty means the trees agree. */
export function monogramMismatches(): { name: string; want: string; got: string }[] {
  return [...COMPANY_FIXTURE, ...PEOPLE_FIXTURE]
    .map(([name, want]) => ({ name, want, got: initialsFor(name) }))
    .filter((r) => r.got !== r.want);
}
