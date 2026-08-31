/**
 * What ICEFALL may say about a guide's certification, derived from the record.
 *
 * OWNER RULING, 2026-08-31 (`icefall-sessions/08-TRUST-RECORDS-CONTRACT.md`):
 * ICEFALL will read guides' certification documents and record that it did.
 * **That is all it will say.** It is not an attestation by IFMGA, UIAGM or any
 * national association, and nothing in this app may imply one.
 *
 * ── THE SENTENCE, AND WHY IT MUST NOT BE IMPROVED ───────────────────────────
 *
 * *"Documents checked by ICEFALL on [date]. We have not contacted the issuing
 * association."*
 *
 * The second half is not throat-clearing. **The gap between "we read the
 * papers" and "the federation confirmed them" is the whole of ICEFALL's
 * exposure**, and it is the difference a climber is actually relying on when
 * they decide whom to follow onto a glacier. Anyone who shortens this to
 * "Verified guide" has removed the only part that limits the claim.
 *
 * ── WHY THIS IS A DERIVATION AND NOT A FLAG ─────────────────────────────────
 *
 * There is deliberately no `verified` boolean here. The state is computed from
 * the record every time it is displayed, so:
 *
 *   · an expired certificate stops the claim on its own, with nobody having to
 *     remember to clear a flag; and
 *   · a record that is incoherent — checked, but with no checker or no date —
 *     cannot render as checked, because the shape will not permit it.
 *
 * **THIS PROJECT HAS ALREADY SHIPPED THE OPPOSITE.** An admin screen compared
 * display strings like `"31 Dec 2028"`, parsed them a day early, and treated
 * anything it could not parse as *not* expired — so **lapsed insurance rendered
 * as valid.** A safety check that fails open is worse than no check at all,
 * because it is trusted. Hence the rule below.
 *
 * ── FAIL CLOSED ─────────────────────────────────────────────────────────────
 *
 * An expiry that is missing, non-ISO, or not a real calendar day is treated as
 * NOT CHECKED, never as valid. The cost of that is a guide whose live
 * certificate briefly reads as unchecked. The cost of the other direction is a
 * climber trusting a lapsed one.
 *
 * `parseInstant` below carries the full argument, including the version of this
 * file that claimed to fail closed and did not.
 */

/**
 * One check, as `guide_profiles` will hold it once Session 03's migration lands.
 *
 * Every field is required together: a verification with no named checker is an
 * anonymous assertion, and one with no date cannot be aged. The record is
 * absent (`null`) until a real check exists for that specific guide — which,
 * today, is every guide.
 */
export interface GuideVerificationRecord {
  /** The staff member who read the documents. Never a system account. */
  checkedBy: string;
  /** ISO instant the check happened. */
  checkedAt: string;
  /** Which document was read. */
  documentRef: string;
  /** The certificate's OWN expiry, from the document itself. */
  expiresAt: string;
}

export type GuideVerificationState =
  | { kind: "unchecked" }
  | { kind: "checked"; checkedAt: Date; expiresAt: Date }
  | { kind: "expired"; expiredAt: Date };

/**
 * STRICT ISO-8601 ONLY. Anything else is null, and therefore fails closed.
 *
 * THE FIRST VERSION OF THIS FUNCTION REPRODUCED THE BUG IT WAS WRITTEN TO
 * PREVENT, and only a test caught it. It was `new Date(iso)` guarded by
 * `Number.isFinite(getTime())` — which looks like validation and is not.
 * `new Date("31 Dec 2028")` **succeeds**: V8 accepts a pile of non-ISO formats,
 * so the exact display string from the original incident parsed cleanly, landed
 * in the future, and rendered an expired certificate as CHECKED. The comment
 * above it claimed it failed closed. It did not.
 *
 * The danger is not that a bad string throws — it is that a lenient parser
 * returns a **plausible** date. `"31 Dec 2028"` parses; `"12/31/2028"` and
 * `"31/12/2028"` both parse and mean different days depending on the engine's
 * mood. That ambiguity is precisely how the original bug read a date "a day
 * early".
 *
 * So the shape is checked before the value: `YYYY-MM-DD` optionally followed by
 * a time, and the parsed date must round-trip to the same calendar day it
 * claimed — which rejects `2026-02-31`, a string that satisfies the pattern and
 * silently becomes 3 March.
 */
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = ISO_INSTANT.exec(iso.trim());
  if (!m) return null;

  const d = new Date(iso.trim());
  if (!Number.isFinite(d.getTime())) return null;

  // Round-trip the calendar day. `2026-02-31` matches the pattern and parses to
  // 3 March; a certificate expiring on a date that does not exist is not a date
  // this function will vouch for.
  const [, y, mo, day] = m;
  const utc = new Date(`${y}-${mo}-${day}T00:00:00Z`);
  if (
    utc.getUTCFullYear() !== Number(y) ||
    utc.getUTCMonth() + 1 !== Number(mo) ||
    utc.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return d;
}

export function verificationState(
  record: GuideVerificationRecord | null | undefined,
  now: Date = new Date(),
): GuideVerificationState {
  if (!record) return { kind: "unchecked" };

  const checkedAt = parseInstant(record.checkedAt);
  const expiresAt = parseInstant(record.expiresAt);

  // A check with no readable date, or no named checker, is not a check.
  if (!checkedAt || !record.checkedBy.trim()) return { kind: "unchecked" };

  // FAIL CLOSED: no readable expiry means the claim stops, not that it stands.
  if (!expiresAt) return { kind: "unchecked" };

  if (expiresAt.getTime() <= now.getTime()) return { kind: "expired", expiredAt: expiresAt };

  return { kind: "checked", checkedAt, expiresAt };
}

const DAY = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * The one sentence, per state. Rendered verbatim — do not paraphrase per screen.
 *
 * `unchecked` is what every guide reads today, because no check exists yet.
 */
export function verificationSentence(state: GuideVerificationState): string {
  switch (state.kind) {
    case "checked":
      return `Documents checked by ICEFALL on ${DAY(state.checkedAt)}. We have not contacted the issuing association.`;
    case "expired":
      // Names the lapse rather than falling silent: "no longer current" is a
      // different statement from "never checked", and the climber needs which.
      return `The certificate ICEFALL checked expired on ${DAY(state.expiredAt)}. It is not current, and ICEFALL has not seen a replacement.`;
    case "unchecked":
      return "Claimed by the guide. ICEFALL has not checked it.";
  }
}

/** Short form for a card, where the full sentence will not fit. */
export function verificationLabel(state: GuideVerificationState): string {
  switch (state.kind) {
    case "checked":
      return "Documents checked";
    case "expired":
      return "Certificate expired";
    case "unchecked":
      return "Not checked";
  }
}
