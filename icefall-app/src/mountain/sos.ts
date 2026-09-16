/**
 * SOS — the pure half (brief M6, plan §3.6 and §5). No React, no storage, no
 * network. Imports only the emergency data file and the fixed 112 wording,
 * both of which have no imports of their own.
 */

import { countryEmergency, rescueFor, type EmergencyNumber, type MountainRescueRecord, type Source } from "@/data/mountainRescue";

import { INTERNATIONAL_112, INTERNATIONAL_112_NOTE, NO_NUMBER_HEADING } from "./format";

/* -------------------------------------------------------------------------- */
/* Coordinates                                                                 */
/* -------------------------------------------------------------------------- */

type Axis = "lat" | "lon";

function hemisphere(value: number, axis: Axis): string {
  if (axis === "lat") return value < 0 ? "S" : "N";
  return value < 0 ? "W" : "E";
}

/** "45.83262° N" — five decimals is about a metre, finer than any phone fix. */
export function formatDecimal(value: number, axis: Axis): string {
  const abs = Math.abs(value).toFixed(5);
  // "-0.000001" rounds to 0.00000 and must not read as south/west.
  const h = Number(abs) === 0 ? hemisphere(0, axis) : hemisphere(value, axis);
  return `${abs}° ${h}`;
}

/** "45.83262, 6.86517" — the signed form a rescue service can paste into a map. */
export function formatSignedDecimal(lat: number, lon: number): string {
  const s = (v: number) => {
    const t = v.toFixed(5);
    return Number(t) === 0 ? Math.abs(Number(t)).toFixed(5) : t;
  };
  return `${s(lat)}, ${s(lon)}`;
}

/**
 * "45° 49′ 57.4″ N". Rounds the seconds to one decimal FIRST and carries, so
 * 59.96″ becomes the next minute rather than "60.0″".
 */
export function formatDMS(value: number, axis: Axis): string {
  const tenths = Math.round(Math.abs(value) * 36000);
  const deg = Math.floor(tenths / 36000);
  const min = Math.floor((tenths % 36000) / 600);
  const sec = (tenths % 600) / 10;
  const h = tenths === 0 ? hemisphere(0, axis) : hemisphere(value, axis);
  return `${deg}° ${String(min).padStart(2, "0")}′ ${sec.toFixed(1).padStart(4, "0")}″ ${h}`;
}

/** "45° 49.957′ N" — degrees and decimal minutes, what many rescue services read back (plan §3.6). */
export function formatDDM(value: number, axis: Axis): string {
  const thousandths = Math.round(Math.abs(value) * 60000);
  const deg = Math.floor(thousandths / 60000);
  const min = (thousandths % 60000) / 1000;
  const h = thousandths === 0 ? hemisphere(0, axis) : hemisphere(value, axis);
  return `${deg}° ${min.toFixed(3).padStart(6, "0")}′ ${h}`;
}

/** "± 8 m". Null when the phone gave no figure — never a made-up one. */
export function accuracyLabel(metres: number | null): string | null {
  if (metres === null || !Number.isFinite(metres) || metres < 0) return null;
  return `± ${Math.round(metres).toLocaleString("en-GB")} m`;
}

/** "4,210 m" */
export function metresLabel(metres: number): string {
  return `${Math.round(metres).toLocaleString("en-GB")} m`;
}

export interface CopyablePosition {
  lat: number;
  lon: number;
  accuracyM: number | null;
  altitudeM: number | null;
  altitudeAccuracyM: number | null;
  at: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "14 September 2026, 09:42" in the phone's local time. */
export function fullDateTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

/** The text Copy puts on the clipboard: every format, the accuracy and the time of the fix. */
export function positionCopyText(p: CopyablePosition): string {
  const lines = [
    formatSignedDecimal(p.lat, p.lon),
    `${formatDMS(p.lat, "lat")}, ${formatDMS(p.lon, "lon")}`,
    `${formatDDM(p.lat, "lat")}, ${formatDDM(p.lon, "lon")}`,
  ];
  const acc = accuracyLabel(p.accuracyM);
  if (acc) lines.push(`Accuracy ${acc}`);
  if (p.altitudeM !== null) {
    const va = accuracyLabel(p.altitudeAccuracyM);
    lines.push(`Altitude ${metresLabel(p.altitudeM)}${va ? ` ${va}` : ""}`);
  }
  lines.push(`GPS fix at ${fullDateTime(p.at)}`);
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Numbers: dialable, radio, or neither                                        */
/* -------------------------------------------------------------------------- */

/**
 * Plan §5.1: the data holds "VHF 142.800" beside "+33 4 50 53 16 89", so a
 * phone link built from every entry is a dead tap. Until the data carries a
 * `kind` field (phase 4), the string decides, and it decides conservatively:
 * only digits with an optional leading + and spaces or dashes become a link.
 */
export type ContactKind =
  | { kind: "dial"; tel: string }
  | { kind: "radio" }
  | { kind: "other" };

export function classifyNumber(raw: string): ContactKind {
  const s = raw.trim();
  if (/^\+?\d[\d\s-]*$/.test(s)) {
    const digits = s.replace(/[\s-]/g, "");
    return { kind: "dial", tel: digits };
  }
  if (/^(VHF|UHF|HF)\b/i.test(s) || /\bMHz\b/i.test(s)) return { kind: "radio" };
  return { kind: "other" };
}

/** `tel:+33450531689`, or null for anything that is not a phone number. */
export function telHref(raw: string): string | null {
  const c = classifyNumber(raw);
  return c.kind === "dial" ? `tel:${c.tel}` : null;
}

export interface SosNumber {
  number: string;
  label: string;
  note: string | null;
  contact: ContactKind;
  source: Source;
}

export type SosLookup =
  | {
      state: "record";
      mountainId: string;
      record: MountainRescueRecord;
      /** The big call button: the first dialable number, in the data's own order. */
      primary: SosNumber | null;
      /** Everything else, dialable or not, in the data's order. */
      others: SosNumber[];
      /** Plan §5.3: 112 stays visible as a labelled last resort when the record lacks it. */
      show112AsLastResort: boolean;
      /** Warnings about signal, lifted from wherever the data put them (plan §5.9). */
      signalWarnings: string[];
    }
  | { state: "none" };

/**
 * Plan §5.9: "no phone signal on the mountain" sits on Aconcagua's radio row,
 * and Tanzania's "do not consistently work" on its second number. Either would
 * otherwise appear under a call button far below the thing it warns about.
 */
const SIGNAL_WARNING = /no (phone|mobile) (signal|coverage)|do not consistently work/i;

export function isSignalWarning(note: string | null | undefined): boolean {
  return !!note && SIGNAL_WARNING.test(note);
}

function toSosNumber(n: EmergencyNumber): SosNumber {
  return {
    number: n.number,
    label: n.label,
    note: n.note ?? null,
    contact: classifyNumber(n.number),
    source: n.source,
  };
}

/**
 * Plan §5.6, CORRECTED order: the trip's mountain, then the destination country
 * — for which the slice holds no numbers yet (the country layer is phase 4) —
 * then 112 with its note. Never guessed from position.
 */
export function sosLookup(mountainId: string | null | undefined): SosLookup {
  const record = rescueFor(mountainId ?? undefined);
  if (!record || record.numbers.length === 0) return { state: "none" };
  const all = record.numbers.map(toSosNumber);
  const primaryIndex = all.findIndex((n) => n.contact.kind === "dial");
  const primary = primaryIndex >= 0 ? all[primaryIndex] : null;
  const others = all.filter((_, i) => i !== primaryIndex);
  // Plan §5.9 moved these onto the country and the record; the regex stays as a
  // net for anything still written on a row.
  const warnings = [
    ...new Set([
      ...(countryEmergency(record.countryCode)?.warnings ?? []),
      ...(record.warnings ?? []),
      ...all.map((n) => n.note).filter((t): t is string => isSignalWarning(t)),
    ]),
  ];
  return {
    state: "record",
    mountainId: record.mountainId,
    record,
    primary,
    others,
    show112AsLastResort: !all.some((n) => n.contact.kind === "dial" && n.contact.tel === INTERNATIONAL_112),
    signalWarnings: warnings,
  };
}

export { INTERNATIONAL_112, INTERNATIONAL_112_NOTE, NO_NUMBER_HEADING };

/* -------------------------------------------------------------------------- */
/* The age of a number (plan §5.2, §5.4)                                       */
/* -------------------------------------------------------------------------- */

/** "11 September 2026" from "2026-09-11". Null for anything that is not a real date. */
export function longDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${Number(m[3])} ${MONTHS[month - 1]} ${m[1]}`;
}

export interface NumberAge {
  sentence: string;
  /** Over a year since it was read: the line is drawn loud. The number never greys. */
  loud: boolean;
}

/**
 * The whole sentence, never a bare date. No record in the data has been
 * confirmed by anybody local, so every one is in the "unconfirmed" state.
 */
export function numberAge(source: Source, today: string): NumberAge {
  const date = longDate(source.checked) ?? source.checked;
  const where = source.kind === "issuer" ? `“${source.label}”` : `“${source.label}”, a secondary source,`;
  let sentence = `Read off ${where} on ${date}. Nobody who works in this country has confirmed it since.`;
  const loud = monthsBetween(source.checked, today) >= 12;
  if (loud) sentence += " That was over a year ago.";
  return { sentence, loud };
}

function monthsBetween(fromISO: string, toISO: string): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromISO);
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toISO);
  if (!a || !b) return 0;
  let months = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
  if (Number(b[3]) < Number(a[3])) months -= 1;
  return months;
}

/* -------------------------------------------------------------------------- */
/* The text-message row (plan §5.8)                                            */
/* -------------------------------------------------------------------------- */

export const SMS_HONESTY =
  "This opens your messaging app with the message ready. ICEFALL cannot send it, cannot send it later when a signal comes back, and cannot tell you whether it arrived. A text sometimes gets through where data does not — but if you close this without sending, nothing was sent.";

export function smsBody(p: CopyablePosition | null, placeName: string | null): string {
  const parts = ["SOS. I need help."];
  if (placeName) parts.push(`On ${placeName}.`);
  if (p) {
    const acc = accuracyLabel(p.accuracyM);
    parts.push(`My position: ${formatSignedDecimal(p.lat, p.lon)}${acc ? ` (${acc})` : ""}, GPS fix at ${fullDateTime(p.at)}.`);
    if (p.altitudeM !== null) parts.push(`Altitude ${metresLabel(p.altitudeM)}.`);
  } else {
    parts.push("My phone has no GPS position yet.");
  }
  return parts.join(" ");
}

/**
 * Android takes `sms:NUMBER?body=`. iPhones only honour the undocumented
 * `sms:NUMBER&body=` — which is why the row is never the only route (§5.8).
 */
export function smsHref(recipient: string | null, body: string, ios: boolean): string {
  const c = recipient ? classifyNumber(recipient) : null;
  const to = c && c.kind === "dial" ? c.tel : "";
  return `sms:${to}${ios ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

export function isIosUserAgent(ua: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS reports itself as a Mac.
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}
