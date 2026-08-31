/**
 * Row shapes, mirroring `icefall-supabase/migrations/*`.
 *
 * Hand-written rather than generated because no Supabase project exists to
 * generate from yet. When one does, replace this file with the generated types —
 * and note the lesson already recorded in this codebase: the generated
 * `Database` must be a `type` alias, never an `interface`, or every `rpc()` call
 * silently loses its typing.
 */

export type StaffRole = "super_admin" | "sales" | "operations" | "finance" | "support";

export interface StaffMember {
  profile_id: string;
  staff_role: StaffRole;
  active: boolean;
}

export type CompanyStatus = "prospect" | "onboarding" | "active" | "suspended" | "churned";
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected" | "suspended";

export interface Company {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  logo_path: string | null;
  description: string | null;
  countries: string[];
  regions: string[];
  status: CompanyStatus;
  verification_status: VerificationStatus;
  /**
   * TRUE only for a real, identifiable business. Keys the disclosure banner
   * (icefall-web's RealBusiness.tsx returns null when falsy), so DROPPING this
   * field in any row→Company mapping silently suppresses the notice — the
   * fixture-era bug that let a real operator render undisclosed. Never set
   * from a form or a draft; staff flip it deliberately or it stays false.
   */
  real_business: boolean;
  /** Set only by a real staff review. NULL renders as absent, never as a date. */
  documents_checked_at: string | null;
  documents_checked_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A placeable destination — a mountain OR a trek.
 *
 * Both carry five paid positions, which is why they share a table. The type is
 * still called `Mountain` because the table still is; renaming both is a
 * follow-up worth doing before anything is deployed.
 */
export interface Mountain {
  /** The slug itself — `mont-blanc`, `everest`. Not a uuid. */
  id: string;
  name: string;
  kind: "mountain" | "trek";
  range: string | null;
  region: string | null;
  country: string | null;
  /** A SUMMIT elevation. Always null on a trek — a route's high point is not a summit. */
  elevation_m: number | null;
  /** The high point of a route. Different claim from `elevation_m`. */
  max_altitude_m: number | null;
  duration_days_min: number | null;
  duration_days_max: number | null;
  distance_km: number | null;
  listed: boolean;
}

/** What an administrator set. `expired` is never stored — see `PlacementStatus`. */
export type PlacementStoredStatus = "reserved" | "active" | "cancelled";
/** What the `placement_status` view computes, including expiry. */
export type PlacementEffectiveStatus = PlacementStoredStatus | "expired";

export interface Placement {
  id: string;
  company_id: string;
  destination_id: string;
  /**
   * The expedition this paid position features.
   *
   * NULL means the company has bought the slot and not yet chosen what to put
   * in it — a real state, not a gap, and it renders as one.
   */
  product_id: string | null;
  slot_position: number;
  starts_on: string;
  ends_on: string;
  status: PlacementStoredStatus;
  price_cents: number | null;
  currency: string;
  changed_by: string | null;
  changed_at: string | null;
  change_reason: string | null;
}

export interface PlacementView extends Placement {
  effective_status: PlacementEffectiveStatus;
  /** True once the term has run out. A flag for a person — nothing acts on it. */
  needs_review: boolean;
  days_remaining: number;
}

export type ProductStatus = "draft" | "pending_review" | "live" | "archived";
export type PriceState = "known" | "on_request" | "unknown";
export type AvailabilityState = "available" | "limited" | "full" | "unknown";

export interface Product {
  id: string;
  company_id: string;
  kind: "expedition" | "trek";
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  /** NULL whenever `price_state` is not `known`. A constraint enforces it. */
  price_from_cents: number | null;
  price_state: PriceState;
  currency: string;
  duration_days_min: number | null;
  duration_days_max: number | null;
  season: string | null;
  difficulty: string | null;
  max_altitude_m: number | null;
  seats_available: number | null;
  availability_state: AvailabilityState;
  status: ProductStatus;
  live_at: string | null;
}

export type ContentVersionState =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "superseded";

export interface ContentVersion {
  id: string;
  entity_type: "company" | "product";
  entity_id: string;
  company_id: string;
  /** The CHANGED FIELDS ONLY — this is a patch, not a copy of the record. */
  payload: Record<string, unknown>;
  changed_fields: string[];
  base_snapshot: Record<string, unknown> | null;
  /** Advisory. `possible_contact_details` never blocks a submission. */
  flags: string[];
  state: ContentVersionState;
  submitted_by: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  decision_reason: string | null;
  applied_at: string | null;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  previous: Record<string, unknown> | null;
  next: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* The commercial layer                                                        */
/* -------------------------------------------------------------------------- */

export type LeadStatus =
  | "new" | "contacted" | "qualified" | "quoted" | "booked" | "lost" | "disputed";

export interface Lead {
  id: string;
  company_id: string;
  customer_id: string;
  thread_id: string | null;
  product_id: string | null;
  destination_id: string | null;
  status: LeadStatus;
  assigned_to: string | null;
  source_page: string | null;
  created_at: string;
  contacted_at: string | null;
  qualified_at: string | null;
  quoted_at: string | null;
  booked_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  booking_id: string | null;
}

/** `reported` is the only state carrying a figure. The others carry NULL. */
export type BookingValueStatus = "reported" | "pending" | "unknown";

export interface Booking {
  id: string;
  kind: "expedition" | "guide";
  lead_id: string | null;
  company_id: string | null;
  product_id: string | null;
  destination_id: string | null;
  customer_id: string | null;
  thread_id: string | null;
  value_cents: number | null;
  value_status: BookingValueStatus;
  currency: string;
  status: string;
  attribution_status: "icefall" | "disputed" | "external";
  guide_id: string | null;
  /** Money the company passes straight through (permits, park fees). Excluded
   * from every commission basis; 'unknown' is a reason, never a zero. */
  pass_through_cents: number | null;
  pass_through_state: "stated" | "none" | "unknown";
  booked_at: string;
  starts_on: string | null;
  completed_at: string | null;
}

export interface Commission {
  id: string;
  booking_id: string;
  kind: "referral" | "guide";
  /** Copied at conversion. Never looked up at read time. */
  rate_bps: number | null;
  fixed_fee_cents: number | null;
  basis_cents: number;
  amount_cents: number;
  currency: string;
  status: "accrued" | "invoiced" | "paid" | "disputed" | "waived";
  computed_at: string;
}

export type RevenueStream =
  | "placement" | "referral" | "guide_commission" | "subscription" | "other";

export interface RevenueRecord {
  id: string;
  stream: RevenueStream;
  company_id: string | null;
  destination_id: string | null;
  amount_cents: number;
  currency: string;
  status: "accrued" | "invoiced" | "collected" | "written_off";
  recognised_on: string;
}

export type DealStage =
  | "prospect" | "contacted" | "conversation" | "proposal" | "negotiation"
  | "won" | "onboarding" | "active" | "renewal" | "lost";

export interface Deal {
  id: string;
  company_id: string;
  title: string;
  stage: DealStage;
  estimated_value_cents: number | null;
  currency: string;
  /** Null unless a person set it. Never derived from the stage. */
  probability_pct: number | null;
  owner_id: string | null;
  expected_close_on: string | null;
  contract_ends_on: string | null;
  lost_reason: string | null;
}

export interface Task {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  entity_type: string | null;
  entity_id: string | null;
  company_id: string | null;
  desk: StaffRole | null;
  /** A person, once somebody assigns one. A desk is a queue; this is a name. */
  assigned_to: string | null;
  priority: "low" | "normal" | "high" | "critical";
  status: "open" | "in_progress" | "done" | "dismissed";
  due_on: string | null;
}

/* -------------------------------------------------------------------------- */
/* Entities the 23-page specification adds                                     */
/* -------------------------------------------------------------------------- */

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void" | "refunded";

export interface Invoice {
  id: string;
  number: string;
  company_id: string;
  /** What it is for. A placement fee and a referral fee are billed differently. */
  kind: "placement" | "referral" | "subscription" | "other";
  placement_id: string | null;
  amount_cents: number;
  currency: string;
  status: InvoiceStatus;
  issued_on: string;
  due_on: string;
  paid_on: string | null;
}

export interface Payment {
  id: string;
  invoice_id: string;
  company_id: string;
  amount_cents: number;
  currency: string;
  /** How ICEFALL was told it arrived. There is no processor — see the note in money.ts. */
  method: "bank_transfer" | "card" | "other";
  received_on: string;
  reference: string | null;
}

/**
 * The two waiting states are DELIBERATELY separate — "waiting on the customer"
 * and "waiting on the company" are the difference between "chase them" and
 * "chase us", and collapsing them once made the desk's working state invisible
 * (support contract §4).
 */
export type TicketStatus =
  | "open" | "investigating" | "waiting_on_customer" | "waiting_on_company" | "resolved" | "closed";

export type TicketType =
  | "account" | "booking" | "payment" | "content" | "operator"
  | "safety" | "technical" | "verification" | "listing" | "other";

/** Stamped at write time by open_support_ticket — never accepted from a client. */
export type RequesterKind = "athlete" | "guide" | "company" | "visitor" | "staff";
export type OriginApp = "phone_app" | "web" | "guide_app" | "operator_portal" | "crm";
export type TicketPriority = "low" | "medium" | "high" | "critical";

export interface Ticket {
  id: string;
  reference: string;
  subject: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  customer_id: string | null;
  company_id: string | null;
  lead_id: string | null;
  booking_id: string | null;
  assigned_to: string | null;
  /** The hat they wore when they wrote — see RequesterKind. On the row, no join. */
  requester_kind: RequesterKind;
  origin_app: OriginApp;
  origin_screen: string | null;
  /** Only a visitor carries these — a signed-in requester is already known. */
  requester_email: string | null;
  requester_name: string | null;
  /** The latest message's opening words, for the thread list. Null when none. */
  snippet: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string | null;
  body: string;
  /** A staff-only note. RLS keeps it off the requester's screen; the UI marks it. */
  internal: boolean;
  created_at: string;
}

/**
 * A support request from somebody with NO account — insert-only for the public,
 * readable by staff. Nothing here is a ticket yet, and no screen calls it one.
 */
export interface IntakeRequest {
  id: string;
  created_at: string;
  email: string;
  name: string | null;
  subject: string;
  body: string;
  origin_app: OriginApp;
  origin_screen: string | null;
  handled_at: string | null;
  ticket_id: string | null;
}

export type DocumentSubject = "company" | "guide";
export type DocumentState = "pending" | "checked" | "rejected" | "expired";

/**
 * A document ICEFALL has been sent, and what ICEFALL did with it.
 *
 * `checked` means a member of staff looked at the document. It does NOT mean the
 * issuing body was contacted, and no screen may imply that it was. `checked_on`
 * is null until somebody actually did it — there is no default and no backfill.
 */
export interface VerificationDocument {
  id: string;
  subject_type: DocumentSubject;
  subject_id: string;
  subject_name: string;
  kind: "insurance" | "business_registration" | "certification" | "licence" | "identity" | "other";
  label: string;
  state: DocumentState;
  issued_on: string | null;
  expires_on: string | null;
  checked_on: string | null;
  checked_by: string | null;
  note: string | null;
}

/** ICEFALL's own people. */
export interface StaffRecord {
  profile_id: string;
  name: string;
  email: string;
  staff_role: StaffRole;
  department: string;
  active: boolean;
  /** Requester kinds this person handles on the support desk. Empty = all. */
  support_scopes: RequesterKind[];
  joined_on: string;
}

/** A customer of the marketplace. */
export interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  country: string | null;
  joined_on: string;
  /** Null everywhere until a subscription product exists. Never "Free". */
  subscription: string | null;
  /** Null until ICEFALL measures activity. Never 0. */
  last_active_at: string | null;
  mountain_interests: string[];
  leads: number;
  bookings: number;
  status: "active" | "suspended";
}

export interface GuideRecord {
  id: string;
  name: string;
  based_in: string | null;
  mountains: string[];
  /**
   * LEGACY DEMO FIELD — the database no longer has this column at all
   * (20260831120000): checking is now a real, named, expiring record and the
   * state is DERIVED (`guide_credentials_state`), see GuideRow. This boolean
   * survives only for the flag-gated demo fixtures. The honest sentence
   * survives for a NEW reason: no longer "we cannot check" but "we read the
   * papers; the federation did not confirm them."
   */
  credentials_verified: boolean;
  documents_checked_on: string | null;
  leads: number;
  bookings: number;
  revenue_cents: number | null;
  listed: boolean;
}

/** The published rate card: what a position on a mountain costs per term. */
export interface PlacementPrice {
  destination_id: string;
  slot_position: number;
  price_cents: number;
  currency: string;
}

export interface CompanyMember {
  profile_id: string;
  name: string;
  company_role: "admin" | "sales";
  status: string;
}

export interface CompanyInvitation {
  id: string;
  email: string;
  company_role: "admin" | "sales";
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

/** A real guide profile row (self-created in the guide app), joined to a name. */
export interface GuideRow {
  id: string;
  name: string;
  headline: string | null;
  based_in: string | null;
  mountains: string[];
  specialities: string[];
  years_guiding: number | null;
  /**
   * DERIVED by the database (guide_credentials_state), never stored: an
   * expired document revokes the claim automatically. 'checked' means
   * "documents read by a named ICEFALL staff member" — never "verified guide".
   */
  credentials_state: "unchecked" | "checked" | "expired";
  credentials_checked_at: string | null;
  credentials_document_ref: string | null;
  credentials_expire_at: string | null;
  listed: boolean;
  created_at: string;
}

/**
 * An inbound enquiry (owner ruling 2026-08-31): lifecycle is TIMESTAMPS —
 * sent/seen/answered are derived from what was actually recorded, never a
 * status column.
 */
export interface Enquiry {
  id: string;
  created_at: string;
  sender_id: string | null;
  sender_kind: RequesterKind;
  sender_email: string | null;
  sender_name: string | null;
  origin_app: OriginApp;
  origin_screen: string | null;
  product_id: string | null;
  destination_id: string | null;
  company_id: string | null;
  /** The object's name AT THE TIME OF WRITING — survives object deletion. */
  object_label: string;
  body: string;
  seen_at: string | null;
  answered_at: string | null;
  answer: string | null;
  /** When ICEFALL deliberately passed this to the company it names (S4).
   * Set once, by a named staff member; the operator portal sees the row only
   * after this is stamped. The CRM remains the desk of record. */
  handed_off_at: string | null;
  handed_off_by: string | null;
}

/** The GREY mark's evidence (identity_checks): ICEFALL confirmed the person is
 * who they say. Established-or-not — no expiry, unlike credentials; the mark
 * itself is DERIVED (revoked_at null), never stored as a boolean. */
export interface IdentityCheck {
  profile_id: string;
  checked_by: string | null;
  checked_at: string;
  document_ref: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

/** A paid feed placement (S2). Its OWN table so a promoted row is labelled by
 * construction; targeting is by the audience's DECLARED goals only; premium
 * members are excluded from delivery by the reading apps. No forecasts. */
export interface PromotedPlacement {
  id: string;
  company_id: string;
  post_id: string | null;
  product_id: string | null;
  declared_goals: string[];
  /** targeted = goals naming the promoted thing; general = everyone non-premium. */
  audience_mode: "targeted" | "general";
  /** ISO-3166 alpha-2 focus countries; empty = worldwide. */
  countries: string[];
  /** Integer cents; the campaign total is days × daily, derived where shown. */
  daily_budget_cents: number | null;
  /** Destination photo path or the promoted post's own media. */
  creative_path: string | null;
  starts_on: string;
  ends_on: string;
  status: "draft" | "active" | "ended" | "suspended";
  created_by: string | null;
  created_at: string;
}

/** A user's report about a person, a thread or a post. `post_id` stays after
 * the post's deletion (set null on the target, the report survives) — the
 * deletion may be exactly what the report achieved. */
export interface ReportRow {
  id: string;
  reporter_id: string;
  subject_id: string | null;
  thread_id: string | null;
  post_id: string | null;
  reason: "spam" | "harassment" | "off_platform_payment" | "safety" | "impersonation" | "other";
  detail: string | null;
  created_at: string;
  status: "open" | "reviewing" | "closed";
}

/** What the customer accepted AT BOOKING TIME, pinned verbatim. Immutable. */
export interface BookingAgreement {
  id: string;
  booking_id: string;
  accepted_by: string;
  accepted_at: string;
  origin_app: OriginApp;
  terms_version: string;
  terms_text: string;
  cancellation_policy: string;
  disclosures: string[];
}
