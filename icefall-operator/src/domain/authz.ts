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
  CompanyTrek,
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
/* Rule 2b — and only the trek routes ICEFALL assigned                        */
/* ========================================================================== */

/**
 * The same rule as `canManageMountain`, for the other noun, and DELIBERATELY A
 * SEPARATE PREDICATE rather than a clever generalisation of it.
 *
 * A route and a peak are granted on different commercial conversations and can
 * be suspended independently; one predicate over a merged access list would
 * make those two lifecycles share a fate. The two functions being near-identical
 * is the point — they mirror two database functions that are also near-identical,
 * `company_may_edit_trek(company_id, trek_id)` beside
 * `company_may_edit_mountain(company_id, mountain_id)`.
 *
 * REQUIRES `status === "active"`, for the reason the mountain one does: a
 * suspended or ended grant keeps the company's history readable and stops every
 * new edit against that route.
 *
 * THE SQL SIDE OF THIS DOES NOT EXIST YET. `company_treks` is proposed in
 * `icefall-sessions/requests/09-company-treks-migration.md` and has not been
 * applied to the live database. Until it is, this predicate is enforced only by
 * the in-memory backend and by the UI it keeps honest — which is why nothing in
 * this app offers a trek WRITE for it to guard.
 */
export function canManageTrek(
  session: Session | null,
  access: readonly CompanyTrek[],
  trekId: string,
): boolean {
  if (!isActive(session)) return false;
  return access.some(
    (a) => a.companyId === session!.user.companyId && a.trekId === trekId && a.status === "active",
  );
}

/** Routes this operator may currently work. */
export function manageableTrekIds(
  session: Session | null,
  access: readonly CompanyTrek[],
): string[] {
  if (!isActive(session)) return [];
  return access
    .filter((a) => a.companyId === session!.user.companyId && a.status === "active")
    .map((a) => a.trekId);
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
/* Rule 3b — the owner account, which is DERIVED and not a third role         */
/* ========================================================================== */

/**
 * THE OWNER ACCOUNT — "Super Admin" in the owner's words.
 *
 * `CompanyRole` still has exactly two values and this file did not add a third.
 * The reasoning in `types.ts` has not changed: a third value would have to be
 * written by the invite path, stored by a schema that has no room for it, and
 * understood by every screen that switches on the role — three places to
 * disagree, for a distinction the data already carries.
 *
 * Because it does carry it. `company_users.invited_by` is null on exactly one
 * account per company: the one ICEFALL created when the company was taken on.
 * Everybody else was invited by somebody. So the founding account is not a new
 * fact to be stored — it is a fact already recorded, read here instead of
 * duplicated.
 *
 * WHAT THIS IS NOT. There is no `is_owner()` in the database to mirror, so this
 * predicate has no server-side twin, and the header's rule about not inventing
 * a second definition applies with full force: use it to LABEL, to EXPLAIN, and
 * to gate a permission the backend does not yet implement at all. Do not use it
 * to guard an existing write — `setTeamMemberStatus` is enforced as
 * `manageStaff` in the schema, and a client that pretended otherwise would be
 * describing a rule nobody enforces. `icefall-sessions/requests/11-operator-super-admin-and-grants.md`
 * asks the schema owner for the stored tier that would fix that.
 */
export function isOwnerAccount(user: CompanyUser): boolean {
  return user.role === "admin" && user.invitedBy === null;
}

/** The signed-in operator is their company's founding account. */
export function isCompanyOwner(session: Session | null): boolean {
  return isActive(session) && isOwnerAccount(session!.user);
}

/**
 * Permissions the owner account may hand to another member.
 *
 * A closed list, deliberately: this is not the enterprise permission builder
 * the spec rules out. It is the short set of things the owner said the top
 * account should be able to pass on, and it grows one entry at a time, by hand.
 */
export const GRANTABLE_PERMISSIONS = ["createOffers"] as const;

export type GrantablePermission = (typeof GRANTABLE_PERMISSIONS)[number];

/**
 * What has actually been granted to a member — TODAY, ALWAYS NOTHING.
 *
 * A grant has to be stored somewhere to survive a page reload, and there is
 * nowhere: `company_users` has no grants column, and `OperatorBackend` exposes
 * no method that writes one. Rather than build a grant screen that forgets
 * every grant the moment it is made, this returns the empty set and the Team
 * screen says plainly that handing the permission on is not available yet.
 *
 * This is the ONE function that changes when the column lands. It takes the
 * user rather than the session so a screen can state the position for every
 * member of the team, not only the person reading it.
 */
export function grantedPermissions(user: CompanyUser): readonly GrantablePermission[] {
  void user;
  return [];
}

export function hasGrant(session: Session | null, permission: GrantablePermission): boolean {
  return isActive(session) && grantedPermissions(session!.user).includes(permission);
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

  /**
   * Create a custom offer for one customer — a price this company will honour,
   * quoted outside the published range.
   *
   * OWNER ACCOUNT ONLY, plus anyone the owner has been given the offer to.
   * Deliberately NOT `isCompanyAdmin`: every other line in this block already
   * meant "Company Admin", and quietly adding a commitment-to-a-customer power
   * to that word would change what every existing admin may do without anyone
   * deciding it. The owner asked for the top account to hold this and to be
   * able to pass it on; that is what this says, and no more.
   *
   * Nothing calls it yet — the offer builder is OP-05's, not this session's.
   * It is here so that when it is built there is one answer to who may use it,
   * in the file that already holds every other answer.
   */
  createOffers: (s: Session | null) => isCompanyOwner(s) || hasGrant(s, "createOffers"),

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
