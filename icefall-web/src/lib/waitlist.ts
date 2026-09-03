import { OFFLINE } from "@/offline/offline";
import { offlineJoinWaitlist } from "@/offline/fixtures";

/**
 * The launch date — one constant, and everything on the page derives from it.
 *
 * A fixed UTC instant rather than a local one: the countdown has to tick toward
 * the same moment for a visitor in Nicosia and one in Denver, and "midnight" is
 * not a moment. The prose label ("October 12th") is generated from this same
 * value in UTC, so the headline and the clock can never disagree — change the
 * date here and both follow.
 */
export const LAUNCH_AT = new Date("2026-10-15T09:00:00Z");

const ORDINAL = (n: number) => {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
};

/** "October 12th" — the form used in the copy. */
export function launchLabel(date: Date = LAUNCH_AT): string {
  const month = date.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  const day = Number(date.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" }));
  return `${month} ${day}${ORDINAL(day)}`;
}

export type Remaining = { days: number; hours: number; minutes: number; seconds: number; done: boolean };

export function remainingUntil(target: Date, now: Date = new Date()): Remaining {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  const s = Math.floor(ms / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    done: false,
  };
}

/* -- signup ---------------------------------------------------------------- */

export type WaitlistSource = "hero" | "footer" | "header";

export type JoinResult =
  | { ok: true; already: boolean }
  | { ok: false; error: string };

/**
 * Validated here as well as on the server, for the same reason every form is:
 * the client check is for the person typing, the server check is the one that
 * counts. `api/_waitlist.mjs` holds the authoritative rule; this is the same
 * shape so the two do not disagree in front of a visitor.
 */
export const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;".]+\.[^\s@<>,;".]{2,}$/;

/**
 * The sentence shown beside the marketing checkbox — DEFINED ONCE, HERE.
 *
 * It is both rendered on the page and sent with the signup, so what is stored
 * as the record of consent is necessarily the same words the person read. Two
 * copies of this string — one in the markup, one in the payload — would drift
 * the first time the copy is edited, and the stored record would then describe
 * a sentence nobody was ever shown.
 *
 * Changing it is a real change: everyone who ticked the old box consented to
 * the OLD wording, which is why the old wording is stored on their row rather
 * than looked up from here.
 *
 * ── WHAT THIS SENTENCE DOES NOT COVER ───────────────────────────────────────
 *
 * The owner authored it and chose it over a wider variant that added "…plus
 * offers from expedition companies on ICEFALL". So this list may be emailed
 * about ICEFALL — it MAY NOT be emailed on behalf of an operator. Promoting a
 * partner to these addresses is a purpose they did not agree to and needs
 * fresh consent. Do not design a partner-offers campaign against this list.
 */
export const MARKETING_CONSENT_TEXT =
  "Email me occasional ICEFALL news and offers. Unsubscribe any time.";

export async function joinWaitlist(input: {
  email: string;
  name?: string;
  source: WaitlistSource;
  /**
   * Ticked the marketing box. OPTIONAL AND UNTICKED BY DEFAULT — joining the
   * waitlist must be possible without it, or the consent is bundled and is
   * therefore not consent at all.
   */
  consent?: boolean;
  /** Honeypot. Always sent empty by real people; bots fill it in. */
  company?: string;
}): Promise<JoinResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "Enter your email address." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That doesn't look like an email address." };

  /*
   * OFFLINE DEMO. Below the validation, above the network, and nowhere else.
   *
   * The signup is the one thing on this page that must still work with no
   * connection, and it is also the one that fails worst: with no API server the
   * dev proxy answers `{ok:false}` with a 200, so the branch below shows
   * "Something went wrong. Please try again." and the success card is never
   * reached. Offline the write is accepted into memory instead — a repeat
   * address still comes back `already: true`, so both success states are real
   * rather than one canned one.
   */
  if (OFFLINE) {
    return offlineJoinWaitlist({ email, name: input.name, source: input.source });
  }

  let res: Response;
  try {
    res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name: input.name?.trim() ?? "",
        source: input.source,
        consent: input.consent === true,
        // The wording travels with the tick, never reconstructed server-side.
        consentText: input.consent === true ? MARKETING_CONSENT_TEXT : "",
        company: input.company ?? "",
      }),
    });
  } catch {
    return { ok: false, error: "No connection. Check your network and try again." };
  }

  let data: { ok?: boolean; already?: boolean; error?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* a non-JSON body is a server fault, handled by the !ok branch below */
  }

  if (res.ok && data.ok) return { ok: true, already: Boolean(data.already) };
  return { ok: false, error: data.error || "Something went wrong. Please try again." };
}
