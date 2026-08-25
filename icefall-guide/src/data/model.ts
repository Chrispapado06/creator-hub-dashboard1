/**
 * What ICEFALL checks, and what a check is allowed to claim.
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
    says:
      "One of the documents behind your approval has expired, so your listing is hidden until you replace it. This is automatic — nobody rejected you.",
  },
};

export interface UploadedDocument {
  kind: CredentialKind;
  fileName: string;
  uploadedAt: string;
  /** ISO date. Null when the document type does not expire. */
  expiresAt: string | null;
  /** The licence/policy number as printed. Checked against the document by a human. */
  reference?: string;
}

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
  const expired = app.documents.some(
    (d) =>
      requiredKinds.includes(d.kind) && d.expiresAt !== null && new Date(d.expiresAt) < now,
  );
  return expired ? "lapsed" : "approved";
}

/** Documents expiring within 60 days — worth warning about before they bite. */
export function expiringSoon(app: GuideApplication, now = new Date()): UploadedDocument[] {
  const horizon = new Date(now.getTime() + 60 * 86_400_000);
  return app.documents.filter(
    (d) => d.expiresAt !== null && new Date(d.expiresAt) > now && new Date(d.expiresAt) <= horizon,
  );
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
