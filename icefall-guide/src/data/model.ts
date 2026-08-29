/**
 * What ICEFALL checks, and what a check is allowed to claim.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A TRAP FOR WHOEVER MAPS THIS ONTO THE DATABASE. Read before writing a query.
 *
 * Two tables describe this app's "approved" state, and THEY USE DIFFERENT WORDS
 * FOR THE SAME IDEA, one join apart:
 *
 *     public.guide_certifications.state   'claimed' | 'document_checked' | 'rejected'
 *     public.verification_documents.state 'pending' | 'checked'          | 'rejected'
 *
 * `document_checked` and `checked` mean the same thing on either side of
 * `guide_certifications.document_id`. Comparing against the wrong one does not
 * error — it silently never matches, and a guide who really was checked is never
 * verified. Name the table wherever either word appears.
 *
 * `guide_profiles.credentials_verified` is NOT the target. It carries
 * `CHECK (credentials_verified = false)` and is pinned false on purpose; this
 * app's approved state maps onto `guide_certifications` plus
 * `verification_documents`, never onto that column.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * READ THIS BEFORE CHANGING ANY LABEL IN THIS FILE.
 *
 * Until now ICEFALL verified nothing and said so: every credential rendered as
 * CLAIMED, and the database refuses to store a true `credentials_verified`. This
 * app introduces a real review — a person at ICEFALL opens a document and makes
 * a decision — so "verified" starts to mean something. Exactly one thing:
 *
 *     A MEMBER OF ICEFALL STAFF LOOKED AT A DOCUMENT THIS GUIDE UPLOADED
 *     AND JUDGED IT GENUINE, ON A GIVEN DATE.
 *
 * That is NOT the issuing association confirming the licence is current, and it
 * is not a judgement that this person is safe to climb with. A client picks a
 * guide on the strength of that badge and then follows them onto a glacier, so
 * every surface says what was actually done and when — never a bare tick.
 *
 * TWO RULES FALL OUT OF THAT, AND BOTH ARE ENFORCED IN CODE BELOW:
 *
 *   1. APPROVAL EXPIRES. Insurance lapses and first-aid certificates run out.
 *      An approval granted in March against a certificate that expired in June
 *      is a false statement from July onwards, so `effectiveStatus()` derives
 *      the live state from document expiry rather than trusting the stored one.
 *
 *   2. REJECTION NEEDS A REASON THE GUIDE CAN ACT ON. Someone's livelihood is
 *      on the other side of this decision. "Rejected" alone is not a permitted
 *      state — see `Review.reason`.
 */

import { hasExpired, parseDay, startOfDay } from "@/lib/day";

export type CredentialKind =
  | "guiding-licence"
  | "first-aid"
  | "insurance"
  | "avalanche"
  | "identity";

export interface CredentialSpec {
  kind: CredentialKind;
  label: string;
  detail: string;
  required: boolean;
  /** Whether this document carries an expiry date that must be captured. */
  expires: boolean;
}

export const CREDENTIAL_SPECS: CredentialSpec[] = [
  {
    kind: "guiding-licence",
    label: "Guiding qualification",
    detail:
      "IFMGA/UIAGM carnet, a national association licence, or the single-discipline award you work under. Photograph both sides, with the number legible.",
    required: true,
    expires: true,
  },
  {
    kind: "first-aid",
    label: "First aid / wilderness medicine",
    detail: "Wilderness First Responder or equivalent. The certificate must show its expiry.",
    required: true,
    expires: true,
  },
  {
    kind: "insurance",
    label: "Professional liability insurance",
    detail: "Current certificate of insurance showing cover level and period.",
    required: true,
    expires: true,
  },
  {
    kind: "avalanche",
    label: "Avalanche training",
    detail: "Required only if you work on snow outside a controlled area.",
    required: false,
    expires: true,
  },
  {
    kind: "identity",
    label: "Photo identity",
    detail:
      "Passport or national ID, to confirm the name on the licence is yours. Held only for the check — not shown on your public profile.",
    required: true,
    expires: false,
  },
];

/* -------------------------------------------------------------------------- */

export type VerificationStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "changes_requested"
  | "rejected"
  | "lapsed";

export const STATUS_COPY: Record<
  VerificationStatus,
  { label: string; tone: "neutral" | "warn" | "ok" | "bad"; says: string }
> = {
  draft: {
    label: "Not submitted",
    tone: "neutral",
    says: "Your application is saved but has not been sent to us. Nothing is under review.",
  },
  submitted: {
    label: "Submitted",
    tone: "warn",
    says: "We have your documents. Nobody has looked at them yet — you are in the queue.",
  },
  in_review: {
    label: "In review",
    tone: "warn",
    says: "Someone at ICEFALL is reading your application now.",
  },
  approved: {
    label: "Documents checked",
    tone: "ok",
    says:
      "A member of ICEFALL staff has seen your documents and judged them genuine. That is what your badge says — it does not say we contacted your association, and it does not vouch for you on the mountain.",
  },
  changes_requested: {
    label: "Changes needed",
    tone: "warn",
    says: "We could not complete the check with what you sent. The reason is below — send the missing item and we will look again.",
  },
  rejected: {
    label: "Not approved",
    tone: "bad",
    says: "We were not able to approve this application. The reason is below.",
  },
  lapsed: {
    label: "Lapsed",
    tone: "bad",
    /**
     * Does NOT say "has expired". A listing also lapses when ICEFALL cannot read
     * a date it holds, which is our failure and not the guide's — asserting an
     * expiry there tells a professional their paperwork ran out when it may be
     * perfectly current. The card below names which document and which of the
     * two happened; this line must cover both without choosing.
     */
    says:
      "A document behind your approval is no longer valid, so your listing is hidden until it is sorted out. This is automatic — nobody rejected you. See below for which document and why.",
  },
};

/**
 * WHERE AN EXPIRY DATE CAME FROM, mirroring
 * `public.verification_documents.expiry_source`.
 *
 * The database makes this mandatory whenever a date is recorded
 * (`verification_documents_expiry_sourced`), and its migration gives the reason
 * in one sentence: *"ICEFALL must never assert a lapse date it inferred or was
 * merely told."*
 *
 * It matters here more than it does for a company, because in THIS app the date
 * is not decoration — `effectiveStatus()` hides a guide's listing on the
 * strength of it, and a hidden listing is lost income. So the app has to be able
 * to say which of two quite different things it did:
 *
 *   · `printed_on_document` — ICEFALL read the date off the certificate.
 *   · `stated_by_holder` — the guide told us, and nobody has seen it written.
 */
export type ExpirySource = "printed_on_document" | "stated_by_holder";

/**
 * An expiry, or the honest absence of one.
 *
 * A UNION RATHER THAN TWO NULLABLE FIELDS, deliberately — the same shape as
 * `BookingValue` elsewhere in this app, and for the same reason. A date without
 * a provenance is a date nobody can defend, so the type makes an unsourced one
 * impossible to construct rather than leaving it for a reviewer to catch. That
 * is the database's constraint expressed one layer up.
 *
 * `none` means NO EXPIRY IS RECORDED. It does not mean the document never
 * expires, and it must never render as "expired" or as "no expiry" — the
 * migration header is explicit on that point.
 */
export type RecordedExpiry =
  | { readonly status: "none" }
  | { readonly status: "recorded"; readonly on: string; readonly source: ExpirySource };

export interface UploadedDocument {
  kind: CredentialKind;
  fileName: string;
  uploadedAt: string;
  /** The expiry and where it came from, or the recorded absence of one. */
  expiry: RecordedExpiry;
  /** The licence/policy number as printed. Checked against the document by a human. */
  reference?: string;
}

/** The date itself, for the callers that only need to compare it. */
export const expiryDate = (d: UploadedDocument): string | null =>
  d.expiry.status === "recorded" ? d.expiry.on : null;

export interface Review {
  decidedAt: string;
  decidedBy: string;
  /**
   * Required on anything other than an approval. A person's income depends on
   * this decision; "no" without a reason they can act on is not acceptable.
   */
  reason?: string;
}

export interface GuideApplication {
  status: VerificationStatus;
  submittedAt: string | null;
  documents: UploadedDocument[];
  review?: Review;
}

/**
 * The status as it is TODAY, not as it was stored.
 *
 * An approval is only as good as the documents under it. If a required document
 * has expired, the guide is lapsed regardless of what the record says — the
 * badge would otherwise keep asserting a check that no longer holds.
 */
export function effectiveStatus(app: GuideApplication, now = new Date()): VerificationStatus {
  if (app.status !== "approved") return app.status;

  const requiredKinds = CREDENTIAL_SPECS.filter((s) => s.required).map((s) => s.kind);
  /**
   * `parseDay`, not `new Date`. An expiry is a date printed on a certificate,
   * and comparing it as UTC midnight would hide a guide's listing most of a day
   * early anywhere west of Greenwich — losing them a day of work off the end of
   * every document they hold. See `@/lib/day`.
   *
   * And the comparison is against the START of today, so a certificate expiring
   * TODAY is still valid today. It lapses tomorrow, which is what "expires on
   * the 4th" means to the person holding it.
   */
  /**
   * A SELF-REPORTED EXPIRY STILL LAPSES THE LISTING, and that is deliberate.
   *
   * The doctrine's rule is that self-reported can never OUTRANK recorded — not
   * that it counts for nothing. The two errors here are not symmetrical: hiding
   * a listing on a date the guide typed costs them some days of visibility,
   * which they can fix by sending the certificate. Leaving it visible costs a
   * client a guide whose liability cover may have run out, on glaciated ground.
   *
   * So the DECISION is the same for both sources. What differs is what the guide
   * is told about it and therefore what they can do — see
   * `GUIDE_NOTICES.expiryProvenance` and the lapse copy on the verification
   * screen. Provenance changes the remedy, not the safety margin.
   */
  const expired = app.documents.some(
    (d) =>
      requiredKinds.includes(d.kind) &&
      d.expiry.status === "recorded" &&
      hasExpired(d.expiry.on, now),
  );
  return expired ? "lapsed" : "approved";
}

/** Documents expiring within 60 days — worth warning about before they bite. */
export function expiringSoon(app: GuideApplication, now = new Date()): UploadedDocument[] {
  const today = startOfDay(now);
  const horizon = new Date(today.getTime() + 60 * 86_400_000);
  return app.documents.filter((d) => {
    const on = parseDay(expiryDate(d));
    // An unreadable date is already LAPSED, not "expiring soon" — it belongs in
    // the lapse path, which states what happened, not in a countdown.
    return on !== null && on >= today && on <= horizon;
  });
}

/** Only an approved, unlapsed guide is visible to athletes. */
export function canListPublicly(app: GuideApplication, now = new Date()): boolean {
  return effectiveStatus(app, now) === "approved";
}

/**
 * The sentence that appears beside an approved guide's name, everywhere.
 *
 * One function, so no screen can invent a shorter, more flattering phrasing.
 */
export function verificationSentence(app: GuideApplication, now = new Date()): string {
  const status = effectiveStatus(app, now);
  if (status !== "approved" || !app.review) {
    return "Not checked by ICEFALL.";
  }
  const when = new Date(app.review.decidedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `Documents checked by ICEFALL on ${when}. We have not contacted the issuing association.`;
}
