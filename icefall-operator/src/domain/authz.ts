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

import { COMPANY_ROLES, STORED_COMPANY_ROLES } from "./types";
import type {
  CompanyMountain,
  CompanyRole,
  StoredCompanyRole,
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

/** Active, and holding one of these roles. The building block of the matrix. */
function roleIs(session: Session | null, ...roles: readonly CompanyRole[]): boolean {
  return isActive(session) && roles.includes(session!.user.role);
}

/**
 * Mirrors `is_company_admin(company_id)` for the caller's own company — the
 * database function, exactly: `company_role = 'admin'` and nothing else.
 */
export const isCompanyAdmin = (s: Session | null): boolean => hasRole(s, "admin");

/**
 * ADMIN POWERS — `admin` or `owner`.
 *
 * Why this exists beside `isCompanyAdmin`. The owner is now a role in the union
 * (brief §4) as well as a derived fact, and an owner must not hold FEWER powers
 * than the admins they appoint. But `is_company_admin()` in the live schema
 * tests `company_role = 'admin'` alone, so this predicate and that function are
 * not yet twins.
 *
 * TODAY THEY CANNOT DISAGREE: the check constraint refuses to store `owner`, so
 * no live row carries it and the two return the same answer for every row that
 * exists. The moment the constraint widens they CAN disagree, and the widening
 * migration must widen `is_company_admin()` in the same statement or the client
 * will offer an owner a button Postgres refuses. That requirement is written
 * into `icefall-sessions/requests/13-operator-six-roles.md` rather than left to
 * be noticed.
 */
export const isCompanyAdminTier = (s: Session | null): boolean => roleIs(s, "owner", "admin");

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
 * TWO WAYS TO BE THE OWNER, AND ONLY ONE OF THEM IS STORABLE TODAY.
 *
 * `CompanyRole` now carries `owner` as a value (brief §4), but the live check
 * constraint still refuses to store it — see `types.ts` and
 * `icefall-supabase/migrations/20260828100000_crm_foundation.sql:333`. So the
 * DERIVED reading below is not superseded by the new role; it is the only one
 * that works against the database as it stands, and it stays.
 *
 * `company_users.invited_by` is null on exactly one
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
  // The stored role, once the schema can hold it. Checked FIRST so that an
  // owner appointed by name is the owner whoever invited them.
  if (user.role === "owner") return true;
  // The derived reading, which is the only one any live row can satisfy today.
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
/* The six roles (brief §4) — the matrix                                      */
/* ========================================================================== */

/**
 * THE PERMISSION MATRIX, still one object of predicates and still not a config.
 *
 * `Permission` is `keyof typeof PERMISSIONS`, so the set of capabilities stays
 * a closed union the compiler checks: a screen cannot ask for a capability
 * nobody defined, and a capability cannot be deleted while a screen still asks
 * for it. That property is the reason this shape survived the widening — a
 * `Record<Role, Record<Capability, boolean>>` would have been a table anyone
 * could edit into a role this portal has never been tested against, which is
 * exactly the "enterprise permission builder" the spec rules out.
 *
 * WHAT CHANGED: each line now names the roles that hold it, instead of naming
 * one role predicate. WHAT DID NOT CHANGE: what `admin` and `sales` may do.
 * Every line below returns for those two exactly what it returned before —
 * this is a widening, and section 21 of the test suite asserts it line by line.
 * If you are editing this object, that is the invariant to keep.
 *
 * THE SIX, in one sentence each (brief §4):
 *
 *   owner              everything, including the things that commit or end the
 *                      company — billing, and deletion of its data.
 *   admin              everything operational; not the owner-only two.
 *   sales              leads, proposals, customers. No settings, no content.
 *   operations         departures, tasks, suppliers, rosters. No pricing
 *                      approval — a custom offer is a commitment, not a task.
 *   guide_coordinator  guides, assignments, availability; READ-ONLY on
 *                      anything commercial.
 *   finance_read_only  reads the commercial record and exports it. Writes
 *                      NOTHING — not a note, not an availability change.
 *
 * FOUR OF THOSE SIX CANNOT BE STORED YET. See `roleFromStored`. A capability
 * that only a new role holds is therefore unreachable in production today, and
 * saying so is the point of `unstorableRoles()`.
 */
export const PERMISSIONS = {
  editCompanyProfile: (s: Session | null) => isCompanyAdminTier(s),
  editProducts: (s: Session | null) => isCompanyAdminTier(s),
  uploadMedia: (s: Session | null) => isCompanyAdminTier(s),
  submitForApproval: (s: Session | null) => isCompanyAdminTier(s),
  manageStaff: (s: Session | null) => isCompanyAdminTier(s),

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

  /**
   * OWNER ONLY, AND NOTHING IN THIS PORTAL CALLS EITHER OF THEM.
   *
   * The brief gives the owner "everything including billing/deletion", so the
   * two are named here rather than left to be invented by whoever builds the
   * screen. No billing exists in ICEFALL — no processor, no subscription, no
   * price for the portal — and no delete-my-company path exists either.
   * Declaring the rule is honest; a Billing tab would not be. When either is
   * built it finds one answer waiting instead of a new one made on the day.
   */
  manageBilling: (s: Session | null) => isCompanyOwner(s),
  deleteCompanyData: (s: Session | null) => isCompanyOwner(s),

  /**
   * Read the commercial record OUT of ICEFALL — the one thing
   * `finance_read_only` exists to do that a plain reader does not.
   *
   * Also uncalled today: this portal has no export. Kept separate from
   * `viewAnalytics` because reading a figure on screen and carrying the
   * customer list into a spreadsheet are different acts, and the second is the
   * one an operator's own data-protection duty turns on.
   */
  exportCommercialData: (s: Session | null) => roleIs(s, "owner", "admin", "finance_read_only"),

  /* ---- reads: every role, including the two that write nothing ---------- */
  /** Everyone can READ the conversation. Only some may answer it. */
  viewInbox: (s: Session | null) => isActive(s),
  viewAnalytics: (s: Session | null) => isActive(s),
  /** Read-only catalogue, so anyone can answer a question about a trip. */
  viewProducts: (s: Session | null) => isActive(s),

  /* ---- writes ----------------------------------------------------------- */
  /**
   * A message the customer receives. NOT finance (writes nothing) and NOT the
   * guide coordinator, whose commercial reading is read-only by definition.
   */
  replyToCustomer: (s: Session | null) => roleIs(s, "owner", "admin", "sales", "operations"),
  /**
   * Internal, and a write. Everyone who runs part of the trip needs it; finance
   * does not get it, because "writes NOTHING" was stated as a boundary and a
   * note is the smallest thing that would quietly cross it.
   */
  addInternalNote: (s: Session | null) =>
    roleIs(s, "owner", "admin", "sales", "operations", "guide_coordinator"),
  /** The sales pipeline. Operations and guides do not move somebody's lead. */
  manageLeads: (s: Session | null) => roleIs(s, "owner", "admin", "sales"),
  /**
   * Availability is operational, not a marketing claim — which is why the two
   * operational roles hold it and finance does not.
   */
  setDepartureAvailability: (s: Session | null) =>
    roleIs(s, "owner", "admin", "sales", "operations", "guide_coordinator"),

  /* ---- the CRM operating system (brief §4–§6) --------------------------- */
  /*
   * THE COMPANY'S OWN RECORDS, gated by the six roles the brief describes:
   * sales owns customers and proposals, operations owns departures and
   * suppliers, the guide coordinator owns assignments, finance reads and
   * exports and WRITES NOTHING, and pricing approval belongs to the two roles
   * that may commit the company. Each line names its roles; none reuses a
   * neighbour's predicate, so a change to one cannot move another.
   *
   * These gate the MEMORY adapter today. No live table exists for any of
   * these entities, so there is no policy to mirror yet; when the schema lands
   * (`requests/17-operator-crm-operating-system-schema.md`) each line below is
   * the client half of a row-level policy and must match it one for one.
   */

  /** Customers, groups and the reviewable dedupe. Sales work; operations reads. */
  manageContacts: (s: Session | null) => roleIs(s, "owner", "admin", "sales"),
  /** Draft, version and send a proposal. NOT approve one — see the next line. */
  manageProposals: (s: Session | null) => roleIs(s, "owner", "admin", "sales"),
  /**
   * INTERNAL APPROVAL OF A PRICE. Owner and admin only: a proposal is a
   * commitment to a customer, and operations does not approve pricing (brief
   * §4). A proposal cannot be `sent` without this having happened.
   */
  approveProposals: (s: Session | null) => roleIs(s, "owner", "admin"),
  /**
   * The commercial record: booking status, due amounts, financial events.
   * `finance_read_only` READS these and holds `viewReports`/`exportData`
   * instead — the role is defined by writing nothing.
   */
  manageBookingsFinance: (s: Session | null) => roleIs(s, "owner", "admin"),
  /** Participants, their information statuses and documents. */
  manageParticipants: (s: Session | null) => roleIs(s, "owner", "admin", "sales", "operations"),
  /**
   * READ the two sensitive fields — medical and fitness — and the content of a
   * medical document. Brief §3.3: sensitive fields are permissioned and
   * separated from sales notes. Sales is deliberately absent: a salesperson
   * needs to know the paperwork is complete, not what it says. The ADAPTER
   * redacts for everyone else; a screen never decides this.
   */
  viewSensitiveParticipantData: (s: Session | null) => roleIs(s, "owner", "admin", "operations"),
  /** The operational side of a departure — status, name, meeting point, roster. */
  manageDepartures: (s: Session | null) => roleIs(s, "owner", "admin", "operations"),
  /** Operational tasks and guide assignments. The coordinator's own work. */
  manageTasks: (s: Session | null) => roleIs(s, "owner", "admin", "operations", "guide_coordinator"),
  manageSuppliers: (s: Session | null) => roleIs(s, "owner", "admin", "operations"),
  /** Read the CRM reports. Every active role, finance included — it is what finance is for. */
  viewReports: (s: Session | null) => isActive(s),
  /**
   * Carry the CRM record out of the portal. The brief's name for the power
   * `exportCommercialData` above already models; the two hold the SAME roles
   * and must keep doing so — one is the ICEFALL commercial scorecard, this one
   * is the company's own CRM data, and finance is the role both exist for.
   */
  exportData: (s: Session | null) => roleIs(s, "owner", "admin", "finance_read_only"),
  /** Connect an email, payments or accounting provider. Settings; sales does not touch them. */
  manageIntegrations: (s: Session | null) => roleIs(s, "owner", "admin"),

  /* ---- Phase 2 / Phase 3 operations records (`@/domain/ops`) ------------- */
  /*
   * The sibling records of the CRM entities: templates, ops detail on tasks,
   * guide availability, document requests, the referral lifecycle. Each line
   * names its roles. `finance_read_only` appears ONLY on the read; nothing it
   * holds here writes. The guide coordinator holds availability and nothing
   * commercial, as the role is defined.
   */
  /** Author and edit message templates. Comms are sales work; a rendered draft is gated separately (`replyToCustomer` / `addInternalNote`). */
  manageTemplates: (s: Session | null) => roleIs(s, "owner", "admin", "sales"),
  /** A guide's stated availability windows. The coordinator's own record. */
  manageGuideAvailability: (s: Session | null) => roleIs(s, "owner", "admin", "operations", "guide_coordinator"),
  /** Permits, transport legs, lodging, equipment and supplier confirmations on a task. */
  manageOpsRecords: (s: Session | null) => roleIs(s, "owner", "admin", "operations"),
  /** Request, receive and review participant documents. Medical ones ALSO need `viewSensitiveParticipantData`. */
  manageDocuments: (s: Session | null) => roleIs(s, "owner", "admin", "operations"),
  /** Read the derived data-quality report. Every active role — finance included; it is a read. */
  viewDataQuality: (s: Session | null) => isActive(s),
  /** Respond to an ICEFALL introduction and confirm a referred booking. The pipeline's owners. */
  acceptReferrals: (s: Session | null) => roleIs(s, "owner", "admin", "sales"),

  /* ---- field operations (brief §8 Phase 4, built as records — `@/domain/field`) ---- */
  /*
   * Equipment, rooming and dispatch are FIELD OPS: the two roles that run the
   * trip hold them, plus the owner. The guide coordinator assigns people, not
   * kit or vehicles. Nothing here forecasts and nothing here moves money.
   */
  manageEquipment: (s: Session | null) => roleIs(s, "owner", "admin", "operations"),
  manageRooming: (s: Session | null) => roleIs(s, "owner", "admin", "operations"),
  manageDispatch: (s: Session | null) => roleIs(s, "owner", "admin", "operations"),
  /**
   * THE GUIDE FEE LEDGER — what is owed and what the operator says they paid.
   * A commercial record, so owner and admin write it; `finance_read_only`
   * READS it through `viewGuideFees` and writes nothing, per the role's
   * definition. Recording "paid" here is a statement, not a payment.
   */
  manageGuideFees: (s: Session | null) => roleIs(s, "owner", "admin"),
  viewGuideFees: (s: Session | null) => roleIs(s, "owner", "admin", "finance_read_only"),
  /** Rules the operator WRITES for a trip's price. A commitment, so the two roles that may commit. */
  managePricingSchedules: (s: Session | null) => roleIs(s, "owner", "admin"),
  /** Operator-written, internal-only rule automations. Nothing they do sends. */
  manageAutomations: (s: Session | null) => roleIs(s, "owner", "admin"),
  /** A record of where a trip is distributed by hand. Sales keeps it; no integration exists. */
  manageChannelListings: (s: Session | null) => roleIs(s, "owner", "admin", "sales"),
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as readonly Permission[];

export function can(session: Session | null, permission: Permission): boolean {
  return PERMISSIONS[permission](session);
}

/* ========================================================================== */
/* Rule 3d — THE DEGRADATION RULE: six modelled, two storable                 */
/* ========================================================================== */

/**
 * THE FACT THIS WHOLE SECTION EXISTS FOR, quoted rather than paraphrased:
 *
 *   -- Two roles, deliberately. The operator portal is not an enterprise product
 *   -- and a configurable permission matrix is not wanted.
 *   company_role text not null check (company_role in ('admin', 'sales')),
 *
 *   icefall-supabase/migrations/20260828100000_crm_foundation.sql:331-333
 *
 * The matrix above models six roles because the owner chose six. The database
 * accepts two. Both are true at once, and the gap between them is not a bug to
 * be smoothed over in a helper — it is a schema change that has not happened,
 * owned by another session, requested in
 * `icefall-sessions/requests/13-operator-six-roles.md`.
 *
 * WHICH DIRECTION IS SAFE.
 *
 *   NARROWING IS SAFE. Reading a role as one that holds a SUBSET of its powers
 *   costs somebody a button. They ask a colleague, or they ask ICEFALL. The
 *   failure is visible, immediate and reversible.
 *
 *   WIDENING IS NOT. Reading an unknown or unstorable value as `admin` hands a
 *   stranger the company profile, the trip catalogue and the staff list. The
 *   failure is silent: nothing errors, nothing looks wrong, and the first
 *   evidence is a change nobody made. So no branch in this file, ever, may end
 *   `return "admin"`.
 *
 * AND — THE PART THAT IS EASY TO GET WRONG — THERE IS NO SAFE SUBSTITUTE AMONG
 * THE TWO STORABLE ROLES FOR THREE OF THE FOUR NEW ONES. `sales` is not a
 * narrowing of `operations`: it holds `manageLeads`, which operations is not
 * meant to have. It is emphatically not a narrowing of `finance_read_only`,
 * which is defined by writing nothing and would gain three writes. So storing
 * `sales` "for now" against a member the company means as finance is not a
 * degradation, it is a promotion.
 *
 * THE FOURTH, `owner`, IS THE EXCEPTION, and only because it holds everything:
 * every role narrows onto it trivially, so storing an owner as `admin` really
 * is a narrowing — which is exactly what this portal already does, since the
 * founding account is an `admin` row read as the owner through `invitedBy`.
 *
 * `isNarrowing()` below is not decoration: it is the check that separates those
 * two cases, and section 21 of the tests runs it over every pair.
 */

const ROLE_SET: ReadonlySet<string> = new Set<string>(COMPANY_ROLES);
const STORED_ROLE_SET: ReadonlySet<string> = new Set<string>(STORED_COMPANY_ROLES);

/** Is this one of the six the product models? */
export function isCompanyRole(value: unknown): value is CompanyRole {
  return typeof value === "string" && ROLE_SET.has(value);
}

/** Is this one of the two `company_users.company_role` will accept? */
export function isStorableRole(role: CompanyRole): role is StoredCompanyRole {
  return STORED_ROLE_SET.has(role);
}

/** The four the live check constraint refuses. Computed, never listed twice. */
export function unstorableRoles(): readonly CompanyRole[] {
  return COMPANY_ROLES.filter((r) => !isStorableRole(r));
}

/**
 * What came back from the database, read honestly.
 *
 * A DISCRIMINATED UNION AND NOT A `CompanyRole`, on purpose. A function that
 * returned a role would have to invent one for a value it did not recognise,
 * and there is no honest value to invent — which is precisely the "empty state
 * that looks like a measured zero" the honesty doctrine forbids, wearing
 * different clothes. Making the caller branch is the enforcement.
 *
 *   `ok`         the value is one of the six. `storable` says whether the live
 *                schema can hold it, so a caller can tell the difference
 *                between a role the product knows and a role the database
 *                agreed to. A role that is `ok` but not storable means the
 *                constraint has widened since this file was written, or the row
 *                did not come from `company_users` — either way it is readable,
 *                and honoured.
 *   `unreadable` the value is not one of the six. NOT an error to swallow and
 *                NOT a reason to fall back: the caller must refuse the session,
 *                and say which value it refused.
 */
export type RoleReading =
  | { readonly state: "ok"; readonly role: CompanyRole; readonly storable: boolean }
  | { readonly state: "unreadable"; readonly value: string; readonly reason: string };

export function roleFromStored(value: unknown): RoleReading {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      state: "unreadable",
      value: value === null ? "null" : value === undefined ? "undefined" : String(value),
      reason:
        "No role on the membership row. `company_users.company_role` is `not null`, so a row without one " +
        "did not come from that table — treat the member as having no access rather than guessing at one.",
    };
  }
  const v = value.trim();
  if (isCompanyRole(v)) {
    return { state: "ok", role: v, storable: isStorableRole(v) };
  }
  return {
    state: "unreadable",
    value: v,
    // Named, so whoever reads the log knows whether the schema moved or the
    // data is wrong. Note what this does NOT do: pick the nearest role.
    reason:
      `"${v}" is not one of the six roles this portal models ` +
      `(${COMPANY_ROLES.join(", ")}). It is not treated as an admin, a sales ` +
      `employee, or anything else — an unrecognised role grants nothing.`,
  };
}

/**
 * Every capability a role holds, DERIVED by asking the matrix above rather than
 * restated beneath it. A second table would be a second answer, and the two
 * would disagree the first time somebody edited one.
 *
 * THE PROBE IS ACTIVE AND INVITED. `status: "active"` because a disabled user
 * holds nothing whatever their role, and this function is about the role.
 * `invitedBy` non-null because the OWNER ACCOUNT is derived from `invitedBy`
 * being null — probing with null would hand `createOffers` to every role and
 * make this a report on the account rather than the role. The `owner` ROLE
 * still reads as an owner account, which is correct: that is what the role is.
 */
function probeSession(role: CompanyRole): Session {
  return {
    user: {
      id: "role-probe",
      companyId: "role-probe",
      profileId: "role-probe",
      displayName: "role probe",
      email: "role-probe@example.invalid",
      role,
      status: "active",
      invitedBy: "role-probe-inviter",
      createdAt: "1970-01-01T00:00:00.000Z",
    },
  };
}

export function capabilitiesFor(role: CompanyRole): readonly Permission[] {
  const s = probeSession(role);
  return ALL_PERMISSIONS.filter((p) => can(s, p));
}

/**
 * Would reading a member as `to` instead of `from` only ever take powers away?
 *
 * The one question worth asking before any substitution — including the
 * substitution the two-role constraint invites. True means every capability
 * `to` holds, `from` holds as well. False means the swap would GRANT something,
 * and no amount of "just for now" makes that safe.
 */
export function isNarrowing(from: CompanyRole, to: CompanyRole): boolean {
  const held = new Set<Permission>(capabilitiesFor(from));
  return capabilitiesFor(to).every((p) => held.has(p));
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
  if (!isCompanyAdminTier(session)) return false;
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
  if (!isCompanyAdminTier(session)) return false;
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
  if (!isCompanyAdminTier(session)) return false;
  return canManageMountain(session, access, mountainId);
}

/* ========================================================================== */
/* Rule 5 — customer communication stays inside ICEFALL                       */
/* ========================================================================== */

/**
 * MOVED, AND NARROWED. The guard now lives in `./contactGuard`, which splits
 * the rule across two explicitly named surfaces:
 *
 *   PUBLISHED / ICEFALL-FACING — guard on. Product and company content,
 *   channel names and messages, post captions, offers sent to a climber, lead
 *   tags: text somebody outside the operator's company will read.
 *
 *   PRIVATE CRM — guard off. A contact's own phone, email and address,
 *   emergency contacts, participant records, internal notes, supplier details:
 *   text only that one company will ever read.
 *
 * The rule protects ICEFALL's commercial relationship — an enquiry that leaves
 * the platform stops being attributable, and the operator loses the record of
 * where their booking came from just as surely as ICEFALL does. It was never
 * protecting private customer data from the company that owns it. A CRM that
 * cannot store a customer's phone number is not a CRM.
 *
 * `guardContactDetails(surface, fields)` makes the call site NAME which of the
 * two it is, with no default, so the distinction cannot be lost in a refactor.
 * The reasoning in full is in the header of `contactGuard.ts`.
 *
 * Re-exported here because every consumer already imports it from `authz`, and
 * because a permission boundary belongs beside the other permission boundaries.
 */
export {
  CONTACT_FLAG,
  PRIVATE_TO_THIS_COMPANY,
  PUBLISHED_TO_CLIMBERS,
  blocksForContactDetails,
  findContactDetails,
  guardContactDetails,
  hasContactDetails,
} from "./contactGuard";
export type { ContactDetailFinding, ContactDetailFindings, ContactSurface } from "./contactGuard";
