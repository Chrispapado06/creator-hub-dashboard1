import { supabase } from "@/backend/client";
import { currentUserId } from "@/auth/account";

/**
 * WHAT ICEFALL HAS CHECKED — read from the database, derived by the database.
 *
 * `guide_profiles.credentials_verified` used to be a boolean pinned false by a
 * CHECK: the schema's way of saying "ICEFALL cannot check this, so the claim is
 * unstorable". Migration `20260831120000_guide_verification` replaced it with a
 * real record — who checked, when, against which document, and when that
 * document expires — and the owner has committed to actually checking.
 *
 * **THE STATE IS NOT COMPUTED HERE AND MUST NOT BE.** `guide_credentials_state`
 * is a PostgREST computed field returning `unchecked | checked | expired`,
 * evaluated server-side against `current_date`. Requested as
 * `select=…,state:guide_credentials_state`.
 *
 * Two reasons that placement matters, and the second is the one that bites:
 *
 *   1. **No client date parsing.** This app has already been bitten four times
 *      by `new Date("YYYY-MM-DD")` parsing as UTC midnight and shifting a day
 *      west of Greenwich — twice on expiry, once on a countdown, once on a badge
 *      that disagreed with the app's own lapse rule. A guide in California
 *      losing a day off the end of every certificate is not a rounding error; it
 *      is their listing going dark while their paperwork is valid. The comparison
 *      now happens in Postgres against a DATE column, in one place, for every
 *      app.
 *   2. **Every surface derives it identically.** A lapsed document revokes the
 *      claim on its own. Nothing has to remember to re-check.
 *
 * Verified live 2026-08-31 before this was written, rather than trusting the
 * report: `credentials_verified` now returns `42703 column does not exist`,
 * while `credentials_checked_at` and `guide_credentials_state` return `42501
 * permission denied` — they exist and RLS refuses them to a signed-out caller.
 * A nonsense column name returns 42703 as the control, which is what makes the
 * distinction mean anything.
 */

/** Exactly the vocabulary the database returns. No fourth value, no default. */
export type CredentialsState = "unchecked" | "checked" | "expired";

export interface CredentialsRecord {
  state: CredentialsState;
  /** ISO timestamp of the check, or null when unchecked. */
  checkedAt: string | null;
  /** What was read. Never rendered as a link — it is an internal reference. */
  documentRef: string | null;
  /** A DATE from the server. Rendered, never compared client-side. */
  expiresOn: string | null;
  /** The document genuinely has no expiry, as opposed to none being recorded. */
  noExpiry: boolean;
}

export type CredentialsReading =
  | { status: "record"; record: CredentialsRecord }
  /** Signed out, not a guide, offline, or the read failed. Each says which. */
  | { status: "unavailable"; reason: string };

const REASONS = {
  OFFLINE: "ICEFALL is not connected on this device, so your check cannot be read.",
  SIGNED_OUT: "Sign in to see what ICEFALL has checked.",
  /** NOT folded into "unchecked" — see below. */
  UNREADABLE:
    "ICEFALL could not read your verification just now. That is our side, not yours — nothing about your documents has changed.",
} as const;

/**
 * Reads the guide's own row.
 *
 * A FAILED READ IS NOT "UNCHECKED", and keeping them apart is the whole point of
 * returning a reason. "We looked and nobody has checked you" and "we could not
 * look" are different statements, and only one of them should be shown to a
 * guide whose listing depends on the answer. Folding the second into the first
 * would tell a checked guide they are unchecked because a request timed out.
 */
export async function readCredentials(): Promise<CredentialsReading> {
  if (!supabase) return { status: "unavailable", reason: REASONS.OFFLINE };

  const uid = await currentUserId();
  if (!uid) return { status: "unavailable", reason: REASONS.SIGNED_OUT };

  const { data, error } = await supabase
    .from("guide_profiles")
    .select(
      "credentials_checked_at,credentials_document_ref,credentials_expire_at,credentials_no_expiry,state:guide_credentials_state",
    )
    .eq("id", uid)
    .maybeSingle();

  if (error) return { status: "unavailable", reason: REASONS.UNREADABLE };
  if (!data) return { status: "unavailable", reason: REASONS.SIGNED_OUT };

  const row = data as {
    credentials_checked_at: string | null;
    credentials_document_ref: string | null;
    credentials_expire_at: string | null;
    credentials_no_expiry: boolean | null;
    state: string | null;
  };

  /**
   * The state is TAKEN, not inferred. If the server sent something this app does
   * not recognise, that is unreadable rather than a guess — a fourth value
   * silently collapsed into "unchecked" would hide a schema change behind a
   * plausible screen.
   */
  const state = row.state;
  if (state !== "unchecked" && state !== "checked" && state !== "expired") {
    return { status: "unavailable", reason: REASONS.UNREADABLE };
  }

  return {
    status: "record",
    record: {
      state,
      checkedAt: row.credentials_checked_at,
      documentRef: row.credentials_document_ref,
      expiresOn: row.credentials_expire_at,
      noExpiry: row.credentials_no_expiry === true,
    },
  };
}

/**
 * THE SENTENCE A CLIENT IS SHOWN, and the second clause is the whole liability.
 *
 * Owner wording, unchanged: *"Documents checked by ICEFALL on [date]. We have
 * not contacted the issuing association."*
 *
 * Dropping that second clause is the edit that looks like tidying. It is the
 * difference between "we read the papers" and "the federation vouches for this
 * person", and a client picks a guide on the strength of it and then follows
 * them onto a glacier. It must never be compressed to "Verified guide", and no
 * association's roundel may appear beside it — a trademark says that association
 * attested, and none has.
 */
export function credentialsSentence(r: CredentialsRecord): string {
  if (r.state === "unchecked" || !r.checkedAt) return "Not checked by ICEFALL.";
  const when = new Date(r.checkedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const base = `Documents checked by ICEFALL on ${when}. We have not contacted the issuing association.`;
  return r.state === "expired" ? `${base} The document behind that check has since expired.` : base;
}

/** How the expiry reads. Never a countdown — the server owns the comparison. */
export function expiryLine(r: CredentialsRecord): string | null {
  if (r.state === "unchecked") return null;
  if (r.noExpiry) return "The document ICEFALL read does not expire.";
  if (!r.expiresOn) return "No expiry is recorded against the document ICEFALL read.";
  const on = new Date(`${r.expiresOn}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return r.state === "expired" ? `Expired on ${on}.` : `Valid until ${on}.`;
}
