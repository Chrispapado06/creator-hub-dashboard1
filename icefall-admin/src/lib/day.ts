/**
 * LOCAL DAYS, AND A SAFETY TEST THAT FAILS CLOSED.
 *
 * > **A safety test that cannot read its input must never answer "safe."**
 *
 * That line is Session 05's, and this file exists in its current shape because
 * the first version of it — written on 2026-08-29 to fix exactly this class of
 * bug — broke the rule while fixing it.
 *
 * THE HISTORY, because it is three mistakes deep and each one looked finished.
 *
 * 1. `Verification.tsx` decided whether a guide's document had lapsed with
 *    `new Date(d.expires) < new Date()`, where `d.expires` held a DISPLAY STRING
 *    ("31 Dec 2028"). Every certificate expired a day early, and on any engine
 *    that declined the non-standard format, `Invalid Date < now` is `false` —
 *    "not expired". Lapsed liability insurance rendered as valid.
 *
 * 2. So the values became ISO days and this helper was written. But `parseDay`
 *    still returned whatever `new Date` produced, so **the fail-open behaviour
 *    survived the fix**. Measured, not assumed: fed "31 Dec 2028", "02 Feb 2026",
 *    "", "2026/10/04" or "not a date", `hasExpired()` returned **false** for
 *    every one of them. The dangerous input — a genuinely expired certificate
 *    still in the old format — was among the ones it waved through.
 *
 * 3. And `2026-02-31`, a day that does not exist, rolled forward to 3 March
 *    rather than being rejected. JavaScript's date constructor normalises
 *    out-of-range parts silently.
 *
 * WHY THE COMPILER ENFORCES IT NOW RATHER THAN A REVIEWER. `parseDay` returns
 * `Date | null` — deliberately awkward, so no call site can drift back into
 * assuming a date came out. `expiryStatus` is the only thing screens should use,
 * and it makes the four outcomes exhaustive so a new one cannot be forgotten.
 *
 * THE FOUR OUTCOMES ARE NOT THREE. "We hold no expiry" and "we hold something we
 * cannot read" are different facts with **opposite remedies**, and collapsing
 * them is how a card ends up arguing with itself:
 *
 *   · no expiry recorded   → nothing to do; not every document has one.
 *   · unreadable           → ICEFALL's fault. Hide the listing, and say the data
 *                            is broken rather than accusing the holder of
 *                            letting their paperwork lapse.
 *   · expired              → the holder's to fix. Renew and resend.
 *   · valid                → with the days remaining, when that is knowable.
 *
 * Unreadable and expired both hide the listing — that is §6m, weaken the claim
 * and the remedy but never the safety behaviour. They must never share a
 * sentence, because one of them blames a professional for something that is our
 * bug.
 *
 * Ported from `icefall-guide/src/lib/day.ts`, whose author found defect 2 in
 * their own copy by testing it after this app's defect 1 was reported to them.
 * Constitution §6n.
 */

/** The last day is INCLUSIVE — a certificate expiring today has not expired. */
export type ExpiryStatus =
  | { kind: "none" }
  | { kind: "unreadable" }
  | { kind: "expired"; day: string }
  | { kind: "valid"; day: string; daysUntil: number };

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A calendar day string → local midnight on that day, or NULL if it is not one.
 *
 * Strict on purpose. It refuses anything that is not exactly `YYYY-MM-DD`, and
 * it rejects days that do not exist by checking the constructed date reports
 * back the same parts it was given — which is what catches `2026-02-31` instead
 * of quietly returning 3 March.
 */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = ISO_DAY.exec(value.trim());
  if (!m) return null;
  const [, ys, ms, ds] = m;
  const y = Number(ys);
  const mo = Number(ms);
  const d = Number(ds);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** An instant → local midnight of the day it falls in. */
export function startOfDay(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}

/**
 * The whole expiry decision, in one place, so no screen can make half of it.
 *
 * `null`/empty is "none". Anything present but unreadable is "unreadable", which
 * the caller must treat as lapsed — never as valid.
 */
export function expiryStatus(value: string | null | undefined, now: Date = new Date()): ExpiryStatus {
  if (value === null || value === undefined || value.trim() === "") return { kind: "none" };
  const day = parseDay(value);
  if (!day) return { kind: "unreadable" };
  const today = startOfDay(now);
  if (day < today) return { kind: "expired", day: value };
  return {
    kind: "valid",
    day: value,
    daysUntil: Math.round((day.getTime() - today.getTime()) / 86_400_000),
  };
}

/**
 * Has this expiry lapsed? TRUE when it cannot be read.
 *
 * The direction is the whole point — see the header. Prefer `expiryStatus` in a
 * screen, so the reader can be told which of the two happened.
 */
export function hasExpired(value: string | null | undefined, now: Date = new Date()): boolean {
  const s = expiryStatus(value, now);
  return s.kind === "expired" || s.kind === "unreadable";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2028-12-31" → "31 Dec 2028". NULL when the value is not a readable day.
 *
 * Null rather than echoing the raw string back: printing an unreadable value in
 * a slot that reads as a date is how "31 Dec 2028" looked authoritative enough
 * to survive three rounds of this bug.
 */
export function formatDay(value: string | null | undefined): string | null {
  const d = parseDay(value);
  if (!d) return null;
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
