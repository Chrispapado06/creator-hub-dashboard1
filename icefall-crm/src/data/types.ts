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
  value_cents: number | null;
  value_status: BookingValueStatus;
  currency: string;
  status: string;
  attribution_status: "icefall" | "disputed" | "external";
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

export type TicketStatus = "open" | "investigating" | "waiting" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "critical";

export interface Ticket {
  id: string;
  reference: string;
  subject: string;
  type: "booking" | "content" | "payment" | "operator" | "safety" | "technical" | "other";
  priority: TicketPriority;
  status: TicketStatus;
  customer_id: string | null;
  company_id: string | null;
  lead_id: string | null;
  booking_id: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
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
  /** Constrained to `false` in the database. ICEFALL verifies nothing yet. */
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
