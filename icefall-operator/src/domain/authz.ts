/**
 * AUTHORIZATION — what an operator may touch.
 *
 * WHERE THIS IS REALLY ENFORCED: not here. In the shipped schema these are
 * database privileges and row-level security —
 * `is_company_member()`, `is_company_admin()` and
 * `company_may_edit_mountain(company_id, mountain_id)` are SECURITY DEFINER
 * functions the policies call, and 62 attack tests cover them.
 *
 * So what is this file for? Two things, and neither is "the security model":
 *
 *   1. It stops the UI OFFERING an action the database would refuse. A button
 *      that produces "permission denied" is a worse experience than a button
 *      that is not there, and a sales employee should not see a link to a screen
 *      that will turn them away.
 *   2. It is the in-memory backend's implementation of the same rules, so the
 *      test suite exercises real logic rather than a permissive fake.
 *
 * The predicates below deliberately mirror the database functions ONE FOR ONE
 * and add nothing. Session 03's warning is right: a second, cleverer definition
 * in the client is a second answer to the same question, and the two will
 * disagree eventually. If a rule needs to change it changes in the migration,
 * and this file follows.
 *
 * Everything defaults to DENY. A missing record is not permission.
 */

import type {
  CompanyMountain,
  CompanyRole,
  CompanyUser,
  ContentVersion,
  ContentVersionState,
  Product,
} from "./types";

/** The signed-in operator. Null grants nothing. */
export interface Session {
  user: CompanyUser;
}

/* ========================================================================== */
/* Rule 1 — your own company, and nothing else                                */
/* ========================================================================== */

/**
 * Mirrors `is_company_member(company_id)`.
 *
 * The single most important predicate in this system: a leak here shows one
 * expedition company another's leads, prices and customer conversations — their
 * competitor's commercial position, taken from us.
 */
export function ownsCompany(session: Session | null, companyId: string | null | undefined): boolean {
  if (!session || !companyId) return false;
  if (session.user.status !== "active") return false;
  return session.user.companyId === companyId;
}

/**
 * A disabled user keeps their history and loses their access (spec §18:
 * "operator is removed: retain historical leads, bookings, conversations").
 * Deletion would destroy the company's own commercial record; disabling is the
 * removal mechanism.
 */
export function isActive(session: Session | null): boolean {
  return !!session && session.user.status === "active";
}

export function hasRole(session: Session | null, role: CompanyRole): boolean {
  return isActive(session) && session!.user.role === role;
}

/** Mirrors `is_company_admin(company_id)` for the caller's own company. */
export const isCompanyAdmin = (s: Session | null): boolean => hasRole(s, "admin");

/* ========================================================================== */
/* Rule 2 — only the mountains ICEFALL assigned                               */
/* ========================================================================== */

/**
 * Mirrors `company_may_edit_mountain(company_id, mountain_id)` — membership AND
 * an active mountain assignment, both halves.
 *
 * REQUIRES `status === "active"` on the `company_mountains` row. That is what
 * makes spec §18's "operator loses access to a mountain" work: historical
 * products and leads stay readable because reads are scoped by company, while
 * every new edit against that mountain stops the moment access is suspended or
 * ended.
 *
 * Note what it does NOT consult: placement. A placement expiring does not touch
 * a company's right to edit its own trips — that was the whole reason Session 03
 * split the two tables, and consulting the wrong one here would silently
 * reintroduce the bug.
 */
export function canManageMountain(
  session: Session | null,
  access: readonly CompanyMountain[],
  mountainId: string,
): boolean {
  if (!isActive(session)) return false;
  return access.some(
    (a) => a.companyId === session!.user.companyId && a.mountainId === mountainId && a.status === "active",
  );
}

/** Mountains this operator may currently attach products to. */
export function manageableMountainIds(
  session: Session | null,
  access: readonly CompanyMountain[],
): string[] {
  if (!isActive(session)) return [];
  return access
    .filter((a) => a.companyId === session!.user.companyId && a.status === "active")
    .map((a) => a.mountainId);
}

/* ========================================================================== */
/* Rule 3 — placement is not the operator's to move                           */
/* ========================================================================== */

/**
 * Always false. Every operator, every role, every mountain, always.
 *
 * In the shipped schema this is stronger than a policy: `authenticated` holds
 * SELECT ONLY on `placements` — ICEFALL staff included — and all four write
 * paths are functions that record an audit event in the same statement. A policy
 * can permit a write but cannot compel the writer to log it, which is why the
 * grant was taken away entirely rather than narrowed.
 *
 * A function rather than a constant so it reads as the rule it is at the point
 * of decision, and so the tests assert against the same thing the UI consults.
 * If a future requirement wants an operator to influence placement, it does not
 * belong here — it belongs in a conversation with ICEFALL, which is the point.
 */
export function canEditPlacement(): false {
  return false;
}

/* ========================================================================== */
/* The two roles (spec §3)                                                    */
/* ========================================================================== */

/**
 * Company Admin owns content and setup; Sales owns conversations and follow-up.
 * That is the whole matrix — a switch, not a configurable permission set,
 * because the spec is explicit that operators must not get an enterprise
 * permission builder.
 */
export const PERMISSIONS = {
  editCompanyProfile: (s: Session | null) => isCompanyAdmin(s),
  editProducts: (s: Session | null) => isCompanyAdmin(s),
  uploadMedia: (s: Session | null) => isCompanyAdmin(s),
  submitForApproval: (s: Session | null) => isCompanyAdmin(s),
  manageStaff: (s: Session | null) => isCompanyAdmin(s),

  /* Both roles. Sales exists to do these. */
  viewInbox: (s: Session | null) => isActive(s),
  replyToCustomer: (s: Session | null) => isActive(s),
  addInternalNote: (s: Session | null) => isActive(s),
  manageLeads: (s: Session | null) => isActive(s),
  viewAnalytics: (s: Session | null) => isActive(s),
  /** Read-only catalogue, so sales can answer a question about a trip. */
  viewProducts: (s: Session | null) => isActive(s),
  /** Availability is operational, not a marketing claim. Both roles. */
  setDepartureAvailability: (s: Session | null) => isActive(s),
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function can(session: Session | null, permission: Permission): boolean {
  return PERMISSIONS[permission](session);
}

/* ========================================================================== */
/* Rule 4 — nothing goes live without approval                                */
/* ========================================================================== */

const EDITABLE_VERSION_STATES: readonly ContentVersionState[] = ["draft", "changes_requested"];

export function isEditableState(state: ContentVersionState): boolean {
  return EDITABLE_VERSION_STATES.includes(state);
}

/**
 * A pending submission is out of the operator's hands until ICEFALL rules on it
 * (spec §8). An operator who could keep editing after submitting would be
 * changing what the reviewer is looking at mid-review.
 *
 * `changes_requested` IS editable — that state exists to hand the work back.
 */
export function canEditVersion(session: Session | null, version: ContentVersion): boolean {
  if (!ownsCompany(session, version.companyId)) return false;
  if (!isCompanyAdmin(session)) return false;
  return isEditableState(version.state);
}

/**
 * Direct write, or a version?
 *
 * Mirrors the UPDATE policy's `USING` clause on `products`, which matches only
 * `status = 'draft'`. While a trip is a draft the operator edits the row itself;
 * once it is live or in review every write is refused and the only route is a
 * ContentVersion. Screens branch on this rather than re-deriving it.
 */
export function canEditProductDirectly(session: Session | null, product: Product): boolean {
  if (!ownsCompany(session, product.companyId)) return false;
  if (!isCompanyAdmin(session)) return false;
  return product.status === "draft";
}

/**
 * A product may only be attached to a mountain the company actively holds.
 *
 * Both halves are load-bearing: the product must be the operator's own, and the
 * mountain must be assigned. Either alone lets an operator list a trip on a
 * mountain ICEFALL never sold them.
 */
export function canAttachProductToMountain(
  session: Session | null,
  product: Product,
  access: readonly CompanyMountain[],
  mountainId: string,
): boolean {
  if (!ownsCompany(session, product.companyId)) return false;
  if (!isCompanyAdmin(session)) return false;
  return canManageMountain(session, access, mountainId);
}

/* ========================================================================== */
/* Rule 5 — customer communication stays inside ICEFALL                       */
/* ========================================================================== */

/**
 * Spec §2 and §5: no phone numbers, email addresses, messaging handles or direct
 * booking links in public-facing operator content.
 *
 * The purpose is not censorship — an enquiry that leaves the platform stops
 * being attributable, and the operator loses the record of where their booking
 * came from just as surely as ICEFALL does.
 *
 * TWO DIFFERENT ENFORCEMENTS, AND THE DIFFERENCE IS DELIBERATE:
 *
 *   PUBLISHED CONTENT — ADVISORY. The database's own
 *   `looks_like_contact_details()` sets a flag on the version and the Approval
 *   Center surfaces it; it does not refuse the submission. Session 03's argument
 *   is right: a regex that blocks teaches operators to evade it, and "call the
 *   hut on arrival to confirm beds" is not a violation. A human sees it before
 *   anything is published, so advisory is enough.
 *
 *   A REPLY TO A CUSTOMER — BLOCKING. There is no reviewer between an operator's
 *   message and the climber reading it. The escape happens immediately and
 *   cannot be recalled, so this is the only point at which the rule can be
 *   enforced at all. Advisory here would mean not enforced.
 *
 * The matcher over-catches on purpose. A false positive costs one rephrase; a
 * miss publishes a customer escape route.
 */
const CONTACT_PATTERNS: readonly { readonly label: string; readonly re: RegExp }[] = [
  { label: "an email address", re: /[\w.+-]+@[\w-]+\.[\w.]{2,}/i },
  // +977 1 4410 xxx, (0)20 7946 0000, 555-0143 — seven or more digits with the
  // usual separators, which is a phone number and almost never anything else.
  { label: "a phone number", re: /(?:\+|\(0\)|\b00)?[\d][\d\s().-]{6,}\d/ },
  { label: "a WhatsApp or Telegram handle", re: /\b(?:wa\.me|whatsapp|t\.me|telegram|viber|wechat|signal)\b/i },
  { label: "a website or booking link", re: /\b(?:https?:\/\/|www\.)\S+/i },
  { label: "a website or booking link", re: /\b[\w-]+\.(?:com|net|org|io|co|travel|np|ch|fr)\b/i },
  { label: "a social handle", re: /(?:^|\s)@[\w.]{2,}/ },
];

export interface ContactDetailFinding {
  label: string;
  excerpt: string;
}

/** Every pattern found, so the operator is told all of them at once. */
export function findContactDetails(text: string | null | undefined): ContactDetailFinding[] {
  if (!text) return [];
  const found: ContactDetailFinding[] = [];
  const seen = new Set<string>();
  for (const { label, re } of CONTACT_PATTERNS) {
    const m = text.match(re);
    if (m && !seen.has(label)) {
      seen.add(label);
      found.push({ label, excerpt: m[0].trim().slice(0, 48) });
    }
  }
  return found;
}

export const hasContactDetails = (text: string | null | undefined): boolean =>
  findContactDetails(text).length > 0;

/** Checks a whole record's free-text fields in one pass. */
export function findContactDetailsIn(
  fields: Readonly<Record<string, string | null | undefined>>,
): Record<string, ContactDetailFinding[]> {
  const out: Record<string, ContactDetailFinding[]> = {};
  for (const [key, value] of Object.entries(fields)) {
    const hits = findContactDetails(value);
    if (hits.length) out[key] = hits;
  }
  return out;
}

/** The flag name the schema sets on a version. Advisory, surfaced in review. */
export const CONTACT_FLAG = "possible_contact_details";
