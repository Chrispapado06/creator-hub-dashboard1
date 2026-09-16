/**
 * WHICH NUMBERS THIS SCREEN SHOWS, AND HOW OLD THEY ARE (brief M6, plan §5).
 *
 * No React, no storage, no network, no AI. It imports the data file and the
 * fixed 112 wording, and neither of those imports anything that can fail. This
 * is deliberate: the SOS screen must draw on the first frame in airplane mode.
 *
 * ── THE ONE PLACE MOUNTAIN MODE DOES NOT GREY STALE SAFETY DATA (plan §5.4) ─
 *
 * Everywhere else, old safety data is greyed and labelled. Not here. A greyed
 * or disabled dialling button is worse than a two-year-old number that is very
 * probably still correct, so the digits stay at full contrast and the call
 * button never disables. The AGE LINE carries the staleness instead, and it
 * gets louder rather than quieter. Nothing below can return a "disabled" or
 * "hidden" number, and there is a test that says so.
 *
 * And the order never changes with age. Promoting 112 above Nepal's 1144
 * because the read is old would steer somebody towards a routing convention
 * over a number we read off a government page. National numbers stay first at
 * any age; 112 stays where it is, a labelled last resort.
 *
 * ── REVIEW IS ABOUT LOUDNESS, NEVER ABOUT PRESENCE (plan §5.3) ──────────────
 *
 * An unreviewed climbing threshold is withheld, because showing it would be
 * the app asserting somebody is ready. An unreviewed emergency number is
 * SHOWN, because leaving somebody with nothing at the bad moment is worse by a
 * wide margin. Review changes how loudly ICEFALL vouches for a number, never
 * whether the number is there.
 */

import {
  COUNTRY_EMERGENCY,
  EMERGENCY_GAPS,
  RECORDS,
  countryEmergency,
  emergencyGap,
  rescueFor,
  type CountryEmergency,
  type EmergencyGap,
  type EmergencyNumber,
  type EmergencyReview,
  type MountainRescueRecord,
  type Reviewer,
} from "@/data/mountainRescue";

import {
  INTERNATIONAL_112,
  INTERNATIONAL_112_NOTE,
  NO_NUMBER_HEADING,
} from "./format";

/** The 112 fallback, word for word (plan §5.5). Held once, in `format.ts`. */
export { INTERNATIONAL_112, INTERNATIONAL_112_NOTE, NO_NUMBER_HEADING };

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(iso: string | null | undefined): boolean {
  const m = iso ? ISO.exec(iso) : null;
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.getUTCDate() === day;
}

/** "11 September 2026" from "2026-09-11". Null for anything that is not a date. */
export function longDate(iso: string): string | null {
  const m = ISO.exec(iso);
  if (!m || !isIsoDate(iso)) return null;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Whole months from one ISO date to another. 0 for anything unparseable. */
export function monthsBetween(fromISO: string, toISO: string): number {
  const a = ISO.exec(fromISO);
  const b = ISO.exec(toISO);
  if (!a || !b) return 0;
  let months = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
  if (Number(b[3]) < Number(a[3])) months -= 1;
  return months;
}

/**
 * Plan §5.2: the screen shows the OLDER of the two dates, because the reader's
 * question is "how old is the freshest confirmation anyone made", and the
 * honest answer is the weakest link.
 */
export function olderDate(a: string, b: string | null | undefined): string {
  if (!b || !isIsoDate(b)) return a;
  if (!isIsoDate(a)) return b;
  return a <= b ? a : b;
}

/* -------------------------------------------------------------------------- */
/* Dialling                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The exact characters a `tel:` link needs, or null where this is not a phone
 * number (plan §5.1). It reads the data's `contact` field rather than guessing
 * from the string, so "VHF 142.800" can never become a dead tap.
 */
export function dialString(n: EmergencyNumber): string | null {
  if (n.contact !== "dial") return null;
  const raw = (n.dial ?? n.number).replace(/[\s-]/g, "");
  return /^\+?\d+$/.test(raw) ? raw : null;
}

export function telHref(n: EmergencyNumber): string | null {
  const d = dialString(n);
  return d ? `tel:${d}` : null;
}

/* -------------------------------------------------------------------------- */
/* Age and review sentences — never a bare date (plan §5.2, §5.3)              */
/* -------------------------------------------------------------------------- */

export interface AgeLine {
  sentence: string;
  /** Over a year old: drawn loud. The number itself never greys (plan §5.4). */
  loud: boolean;
  /** The older of the read date and any confirmation (plan §5.2). */
  shownDate: string;
}

function names(reviewers: Reviewer[]): string {
  const list = reviewers.map((r) => `${r.name} (${r.role}, ${r.organisation})`);
  if (list.length === 0) return "nobody named";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function readSentence(n: EmergencyNumber, countryName: string): string {
  const date = longDate(n.readOn ?? n.source.checked) ?? (n.readOn ?? n.source.checked);
  const where =
    n.source.kind === "issuer"
      ? `“${n.source.label}”`
      : `“${n.source.label}”, a secondary source,`;
  return `Read off ${where} on ${date}. Nobody who works in ${countryName} has confirmed it since.`;
}

/**
 * The whole sentence for one number, in the country's review state. There is no
 * generic age line for an emergency number and never a bare date — "Checked 11
 * September 2026" implies somebody verified it, and nobody has.
 */
export function ageLine(
  n: EmergencyNumber,
  country: CountryEmergency,
  today: string,
): AgeLine {
  const readOn = n.readOn ?? n.source.checked;
  const review = country.review;
  if (review.state === "reviewed") {
    const shownDate = olderDate(readOn, review.confirmedOn);
    const loud = monthsBetween(shownDate, today) >= 12;
    let sentence =
      `Confirmed ${longDate(review.confirmedOn) ?? review.confirmedOn} by ${names(review.reviewers)}.` +
      ` Scope: ${review.scope}.` +
      ` Read off “${n.source.label}” on ${longDate(readOn) ?? readOn}.`;
    if (loud) sentence += " The older of those two dates is over a year ago.";
    return { sentence, loud, shownDate };
  }
  const loud = monthsBetween(readOn, today) >= 12;
  let sentence = readSentence(n, country.name);
  if (loud) sentence += " That was over a year ago.";
  return { sentence, loud, shownDate: readOn };
}

/** The country-level line above the numbers, for the two reviewed states. */
export function reviewSentence(review: EmergencyReview): string | null {
  if (review.state === "unreviewed") return null;
  if (review.state === "reviewed") {
    return `Confirmed ${longDate(review.confirmedOn) ?? review.confirmedOn} by ${names(review.reviewers)}. Scope: ${review.scope}.`;
  }
  return `${review.reason} — ${names(review.reviewers)}, ${longDate(review.confirmedOn) ?? review.confirmedOn}. Scope: ${review.scope}.`;
}

/* -------------------------------------------------------------------------- */
/* Resolution (plan §5.6)                                                      */
/* -------------------------------------------------------------------------- */

export interface ResolvedNumber {
  entry: EmergencyNumber;
  /** `tel:` target, or null for a radio frequency or a text-message line. */
  tel: string | null;
  age: AgeLine;
}

export interface EmergencyResolution {
  /**
   * "mountain" — resolved through the trip's mountain.
   * "country"  — resolved through the destination country the athlete set.
   * "none"     — ICEFALL holds nothing; the 112 fallback is the whole answer.
   */
  via: "mountain" | "country" | "none";
  /**
   * The mountain ICEFALL thinks you are on, shown on the screen so a wrong
   * match is visible rather than silent (plan §5.6).
   */
  mountainId: string | null;
  record: MountainRescueRecord | null;
  country: CountryEmergency | null;
  /**
   * The country name(s) to show beside the mountain — every border a mountain
   * record names (`alsoCountryCodes`), joined "France / Italy", never just the
   * one whose number happens to be primary. A rescue on a mountain with a
   * frontier across it can come from either side (plan §5.6).
   */
  countryLabel: string | null;
  /** A country ICEFALL deliberately holds nothing for, with the reason. */
  gap: EmergencyGap | null;
  /** National numbers first, then the mountain's own. Never reordered by age. */
  numbers: ResolvedNumber[];
  /** Read above the numbers, never on one row (plan §5.9). */
  warnings: string[];
  /** Named holes in the data for this country. */
  gaps: string[];
  /** The country-level confirmation line, where a human has signed one. */
  review: string | null;
  /** Show the 112 block: always when there is nothing, and below the numbers when 112 is not among them. */
  show112: boolean;
}

export interface ResolveInput {
  /** The mountain identifier the trip copied when it was created. */
  mountainId?: string | null;
  /** The destination country the athlete set. Never derived from position. */
  countryCode?: string | null;
  /** ISO date; the caller passes the phone's own day. */
  today: string;
}

/**
 * The trip's mountain, then the destination country, then 112 with its note.
 *
 * THE APP NEVER GUESSES THE COUNTRY FROM YOUR POSITION. There is no boundary
 * data in the app, and a position forty kilometres from Mont Blanc could be in
 * France, Italy or Switzerland — three services, three bills, one wrong number
 * on the biggest button on the screen.
 */
export function resolveEmergency(input: ResolveInput): EmergencyResolution {
  const { today } = input;
  const record = rescueFor(input.mountainId ?? undefined);
  // An athlete's own typed destination can name the far side of a mountain
  // that has a border across it (e.g. China, on Everest/K2/Broad Peak). That
  // explicit answer must win over the record's default country, or the gap
  // EMERGENCY_GAPS exists to catch never reaches the numbers block (rt:honest-gaps §2).
  const explicitGap =
    record && input.countryCode
      ? EMERGENCY_GAPS.find(
          (g) => g.mountainIds.includes(record.mountainId) && g.code === input.countryCode?.toUpperCase(),
        )
      : null;
  const code = explicitGap ? explicitGap.code : (record?.countryCode ?? input.countryCode ?? null);
  const country = explicitGap ? null : countryEmergency(code);
  const gap = country ? null : (explicitGap ?? emergencyGap(code));

  const empty: EmergencyResolution = {
    via: "none",
    mountainId: record?.mountainId ?? null,
    record,
    country: null,
    countryLabel: null,
    gap,
    numbers: [],
    warnings: record?.warnings ?? [],
    gaps: [],
    review: null,
    show112: true,
  };
  if (!country) return empty;

  const noNumbers =
    country.review.state === "reviewed-no-number" || country.numbers.length === 0;

  const entries: EmergencyNumber[] = noNumbers
    ? []
    : record
      ? record.numbers
      : country.numbers;

  const numbers = entries.map((entry) => ({
    entry,
    tel: telHref(entry),
    age: ageLine(entry, country, today),
  }));

  const borderNames = (record?.alsoCountryCodes ?? [])
    .map((c) => countryEmergency(c)?.name)
    .filter((n): n is string => Boolean(n));
  const countryLabel = [country.name, ...borderNames].join(" / ");

  return {
    via: record ? "mountain" : "country",
    mountainId: record?.mountainId ?? null,
    record,
    country,
    countryLabel,
    gap: null,
    numbers,
    warnings: [...(country.warnings ?? []), ...(record?.warnings ?? [])],
    gaps: country.gaps ?? [],
    review: reviewSentence(country.review),
    show112: numbers.every((n) => n.entry.number !== INTERNATIONAL_112),
  };
}

/* -------------------------------------------------------------------------- */
/* The validator                                                               */
/* -------------------------------------------------------------------------- */

export type ProblemLevel = "error" | "warning";

export interface DataProblem {
  level: ProblemLevel;
  where: string;
  what: string;
}

/**
 * Everything the data must hold for the SOS screen to be honest. The unit test
 * runs this over the real file, so a number added later without a source, or a
 * radio frequency mislabelled as dialable, fails the build rather than the
 * athlete.
 */
export function validateEmergencyData(today: string): DataProblem[] {
  const out: DataProblem[] = [];
  const err = (where: string, what: string) => out.push({ level: "error", where, what });
  const warn = (where: string, what: string) => out.push({ level: "warning", where, what });

  const seenCodes = new Set<string>();
  for (const c of COUNTRY_EMERGENCY) {
    const at = `${c.code} ${c.name}`;
    if (!/^[A-Z]{2}$/.test(c.code)) err(at, "country code is not ISO 3166-1 alpha-2 in upper case");
    if (seenCodes.has(c.code)) err(at, "country appears twice");
    seenCodes.add(c.code);
    if (emergencyGap(c.code)) err(at, "country is listed both as held and as a named gap");

    if (c.numbers.length === 0 && c.review.state !== "reviewed-no-number") {
      err(at, "no numbers and no signed answer saying there are none");
    }

    const seenNumbers = new Set<string>();
    for (const n of c.numbers) {
      const nAt = `${at} — ${n.number}`;
      if (!n.label.trim()) err(nAt, "no label");
      if (seenNumbers.has(n.number)) err(nAt, "the same number is listed twice for this country");
      seenNumbers.add(n.number);
      if (!n.source.url.startsWith("http")) err(nAt, "source has no URL");
      if (!n.source.label.trim()) err(nAt, "source has no label");
      if (!isIsoDate(n.source.checked)) err(nAt, "source read date is not a real ISO date");
      if (n.readOn && !isIsoDate(n.readOn)) err(nAt, "readOn is not a real ISO date");
      if (n.contact === "dial" && !dialString(n)) {
        err(nAt, "marked dialable but no usable tel: form — add a `dial` field");
      }
      if (n.contact !== "dial" && dialString(n)) err(nAt, "not marked dialable but produces a tel: link");
      if (n.contact === "radio" && !/^(VHF|UHF|HF)\b/i.test(n.number)) {
        warn(nAt, "marked as radio but does not read as a frequency");
      }
      if (/\s/.test(n.number) && n.contact === "dial" && !n.dial) {
        err(nAt, "readable form has spaces and there is no `dial` field (plan §5.9)");
      }
      if (monthsBetween(n.readOn ?? n.source.checked, today) >= 24) {
        warn(nAt, "not read for two years — the age line says so, and the number still shows");
      }
    }

    const r = c.review;
    if (r.state !== "unreviewed") {
      if (!isIsoDate(r.confirmedOn)) err(at, "confirmation date is not a real ISO date");
      if (r.confirmedOn > today) err(at, "confirmed in the future");
      if (r.reviewers.length === 0) err(at, "reviewed with nobody named");
      for (const p of r.reviewers) {
        if (!p.name.trim() || !p.role.trim() || !p.organisation.trim()) {
          err(at, "a reviewer is missing a name, a role or an organisation");
        }
      }
      // "Nepal, Khumbu, spring trekking season" is a scope. "Nepal" is not.
      if (!r.scope.includes(",")) err(at, "the review scope is not narrower than the country");
      if (r.state === "reviewed-no-number" && !r.reason.trim()) {
        err(at, "signed as having no number, without their reason");
      }
    }
  }

  for (const g of EMERGENCY_GAPS) {
    const at = `${g.code} ${g.name}`;
    if (!/^[A-Z]{2}$/.test(g.code)) err(at, "gap code is not ISO 3166-1 alpha-2 in upper case");
    if (!g.reason.trim()) err(at, "a gap with no reason is a silent hole");
    if (g.mountainIds.length === 0) warn(at, "gap names no mountain it bites on");
  }

  for (const m of RECORDS) {
    const at = m.mountainId;
    if (!countryEmergency(m.countryCode) && !emergencyGap(m.countryCode)) {
      err(at, `country ${m.countryCode} is neither held nor recorded as a gap`);
    }
    for (const c of m.alsoCountryCodes ?? []) {
      if (!countryEmergency(c) && !emergencyGap(c)) {
        err(at, `second country ${c} is neither held nor recorded as a gap`);
      }
    }
    const national = new Set((countryEmergency(m.countryCode)?.numbers ?? []).map((n) => n.number));
    for (const n of m.localNumbers ?? []) {
      if (national.has(n.number)) {
        err(`${at} — ${n.number}`, "a national number is repeated on the mountain record");
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* The review sheet (plan §5.10)                                               */
/* -------------------------------------------------------------------------- */

export const REVIEW_SHEET_RULE =
  "**Nobody rings an emergency number to test it.** Confirm from what you know and from the pages named below, never by dialling.";

/** The questions a web page cannot answer, and a reviewer can. */
export const REVIEW_QUESTIONS: readonly string[] = [
  "Which of these is actually answered in the mountains, as opposed to in the capital?",
  "What language is answered in?",
  "Is there a number people here use that is not on this list?",
  "Is any number on this list one you would tell somebody not to ring?",
];

/**
 * Generated from the data, never written by hand, so the sheet cannot quietly
 * disagree with what the app shows.
 */
export function reviewSheet(code: string): string | null {
  const c = countryEmergency(code);
  if (!c) return null;
  const rows = c.numbers.map(
    (n) =>
      `| ${n.number} | ${n.label} | ${n.contact} | ${longDate(n.readOn ?? n.source.checked) ?? "—"} | ${n.source.label} |`,
  );
  const lines = [
    `# ${c.name} — emergency numbers, for review`,
    "",
    REVIEW_SHEET_RULE,
    "",
    "## What ICEFALL shows today",
    "",
    "| Number | Label | Kind | Read on | Source |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    ...(c.warnings?.length ? ["## Warnings shown above the numbers", "", ...c.warnings.map((w) => `- ${w}`), ""] : []),
    ...(c.gaps?.length ? ["## What ICEFALL says it does not hold", "", ...c.gaps.map((g) => `- ${g}`), ""] : []),
    "## Corrections",
    "",
    "| Number | Wrong how | What it should say |",
    "| --- | --- | --- |",
    "|  |  |  |",
    "",
    "## Questions",
    "",
    ...REVIEW_QUESTIONS.map((q) => `- ${q}`),
    "",
    "An empty sheet is a valid signed answer. If there is no number here that works, say so in your own words and sign it.",
    "",
    "## Sign-off",
    "",
    "- Name, role, organisation:",
    "- Name, role, organisation:",
    "- Scope (for example “Nepal, Khumbu, spring trekking season” — a country on its own is not a scope):",
    "- Date:",
  ];
  return lines.join("\n");
}
