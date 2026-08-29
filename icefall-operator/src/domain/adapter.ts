/**
 * THE SEAM.
 *
 * One interface between every screen in this portal and the shared ICEFALL
 * backend. Today it is satisfied by an in-memory implementation; when Session
 * 03's migration lands it is satisfied by Supabase queries and not a single
 * screen changes.
 *
 * Two properties make that swap safe:
 *
 *   - EVERY METHOD TAKES THE SESSION. There is no ambient "current company"
 *     baked into a module. The company scope is an argument at every call site,
 *     which is what lets the same authorization test drive both implementations.
 *   - NO METHOD CAN EXPRESS A CROSS-COMPANY READ. There is no `companyId`
 *     parameter to pass the wrong value into; the scope comes from the session.
 *     A whole category of leak is removed by the shape of the interface rather
 *     than guarded against inside it.
 *
 * Writes that would change public content do not exist here as direct mutations.
 * `saveDraft` and `submitForApproval` are the only routes to published fields,
 * because the publication boundary is the product (spec §8, §16).
 */

import type { Session } from "./authz";
import type {
  Booking,
  Company,
  CompanyMountain,
  CompanyUser,
  Conversation,
  ConversationNote,
  ContentEntityType,
  ContentVersion,
  FunnelCounts,
  Lead,
  LeadNote,
  LeadStatus,
  Message,
  Mountain,
  OperatorNotification,
  Product,
  ProductDeparture,
  ProductKind,
  Placement,
} from "./types";
import type { Reading } from "./honesty";

/** One day of counted activity. Views is absent — see `TrendSeriesData`. */
export interface TrendPoint {
  day: string;
  label: string;
  enquiries: number;
  qualified: number;
  bookings: number;
}

/**
 * One slice of the enquiries-by-source breakdown.
 *
 * `source` is the raw channel value on the lead — "website", "icefall-app",
 * "marketplace", "other" — and COUNTS ARE COUNTED, never seeded as totals: the
 * donut's segments must always sum to the same enquiry figure the tiles show,
 * because both are derived from the same rows.
 */
export interface SourceCount {
  source: string;
  count: number;
}

/** Everything the dashboard needs, in one read (spec §4). */
export interface DashboardSummary {
  newEnquiries: number;
  qualifiedLeads: number;
  bookings: number;
  pendingChanges: number;
  /** Unavailable until a TRUSTED emitter counts views. */
  views: Reading<number>;
  funnel: FunnelCounts;
  /** Enquiries in the window, by channel, for the source donut. */
  enquiriesBySource: SourceCount[];
  /** The same window, one period earlier, for the deltas on the tiles. */
  previous: FunnelCounts | null;
  rangeLabel: string;
  previousRangeLabel: string;
}

/** A product ranked by what ICEFALL actually measured about it. */
export interface ProductPerformance {
  productId: string;
  name: string;
  kind: string;
  enquiries: number;
  qualified: number;
  bookings: number;
  /** Unavailable for the same reason it is unavailable everywhere else. */
  views: Reading<number>;
  conversion: Reading<number>;
}

/** One row of the per-mountain table. The owner's "what mountain" question. */
export interface MountainPerformance {
  mountainId: string;
  name: string;
  products: number;
  enquiries: number;
  qualified: number;
  bookings: number;
  conversion: Reading<number>;
  views: Reading<number>;
  /** Reported booking value on confirmed/completed bookings for this mountain. */
  revenue: Reading<number>;
}

/** How far leads get, and where they stop. Counts of "reached this stage". */
export interface StageReach {
  stage: string;
  label: string;
  reached: number;
  /** Share of enquiries that got this far. Unavailable with no enquiries. */
  share: Reading<number>;
}

export interface LostReasonCount {
  reason: string;
  count: number;
}

/** A channel judged on what it BOOKS, not only what it sends. */
export interface SourceQuality {
  source: string;
  enquiries: number;
  qualified: number;
  bookings: number;
  conversion: Reading<number>;
}

export interface OwnerPerformance {
  companyUserId: string;
  name: string;
  active: boolean;
  open: number;
  booked: number;
  /** Median hours to first reply, over the leads this person answered. */
  medianResponseHours: Reading<number>;
}

/**
 * The measured-only companion to `AnalyticsSummary`.
 *
 * Every field here is derived from stamps the pipeline actually writes —
 * `firstResponseAt`, `qualifiedAt`, `bookedAt`, `lostReason`. There is no view
 * data in it, because there is no view data. Medians are `Unavailable` rather
 * than 0 when nothing qualifies, for the usual reason: "no lead has been
 * answered yet" and "leads are answered instantly" are different statements.
 */
export interface OperatorInsights {
  /** Median hours from enquiry to first reply. */
  medianResponseHours: Reading<number>;
  /** Slowest reply in the window, so the median is not read as the worst case. */
  slowestResponseHours: Reading<number>;
  /** Enquiries still with no reply at all. A count, always real. */
  awaitingFirstReply: number;
  /** Median days from enquiry to booking. */
  medianDaysToBook: Reading<number>;
  stageReach: StageReach[];
  lostReasons: LostReasonCount[];
  sourceQuality: SourceQuality[];
  byMountain: MountainPerformance[];
  byOwner: OwnerPerformance[];
}

export interface AnalyticsSummary {
  views: Reading<number>;
  funnel: FunnelCounts;
  /** Enquiries in the window, by channel, for the source donut. */
  enquiriesBySource: SourceCount[];
  conversionRate: Reading<number>;
  estimatedGmv: Reading<number>;
  gmvExcludedCount: number;
  /** Previous window, for the week/month comparison in spec §11. */
  previous: FunnelCounts | null;
}

export interface DraftInput {
  entityType: ContentEntityType;
  entityId: string;
  /** Only the fields that changed. */
  payload: Record<string, unknown>;
  /**
   * The live values of those same fields when editing started.
   *
   * Not a version counter. At approval, if any of them has moved the change is
   * refused rather than applied over the top — which catches the case a counter
   * misses: ICEFALL editing a field directly while an operator's change to it
   * sits pending.
   */
  baseSnapshot: Record<string, unknown>;
}

export interface NewProductInput {
  kind: ProductKind;
  name: string;
  mountainId: string;
}

/**
 * The result of attempting a write.
 *
 * A discriminated union rather than a thrown error, because a refusal here is
 * usually a RULE being explained to an operator — "that mountain is not assigned
 * to you", "this is awaiting Icefall's review" — and the reason has to reach the
 * screen intact to be shown.
 */
export type WriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; conflict?: ContentVersion };

/** What an operator may state when adding a lead of their own. */
export interface NewLeadInput {
  customerName: string;
  productId: string | null;
  mountainId: string | null;
  /** How they reached the company — "Phone", "Referral", their own words. */
  source: string | null;
  tags?: string[];
  /** An opening note, saved as the lead's first note when non-empty. */
  note?: string;
}

export interface OperatorBackend {
  /* ---- identity -------------------------------------------------------- */
  signIn(email: string): Promise<Session | null>;
  listSignInIdentities(): Promise<CompanyUser[]>;

  /* ---- company --------------------------------------------------------- */
  getCompany(session: Session): Promise<Company | null>;
  getTeam(session: Session): Promise<CompanyUser[]>;
  setTeamMemberStatus(
    session: Session,
    companyUserId: string,
    status: CompanyUser["status"],
  ): Promise<WriteResult<CompanyUser>>;
  inviteTeamMember(
    session: Session,
    input: { displayName: string; email: string; role: CompanyUser["role"] },
  ): Promise<WriteResult<CompanyUser>>;

  /* ---- mountains ------------------------------------------------------- */
  /** The authorization boundary: which mountains this operator may edit. */
  getAccess(session: Session): Promise<CompanyMountain[]>;
  /** The paid slots. Read-only — there is no write method, deliberately. */
  getPlacements(session: Session): Promise<Placement[]>;
  getMountains(): Promise<Mountain[]>;

  /* ---- products -------------------------------------------------------- */
  getProducts(session: Session): Promise<Product[]>;
  getProduct(session: Session, productId: string): Promise<Product | null>;
  createProduct(session: Session, input: NewProductInput): Promise<WriteResult<Product>>;
  getDepartures(session: Session, productId: string): Promise<ProductDeparture[]>;
  /**
   * Direct write — availability and spots only.
   *
   * Availability is a fact about the operator's own logistics and going stale
   * hurts the climber who enquires on a sold-out trip. Price and dates are not
   * in this method's type and are staff-only in the schema.
   */
  setDepartureAvailability(
    session: Session,
    departureId: string,
    patch: { availability?: ProductDeparture["availability"]; spotsLeft?: number | null },
  ): Promise<WriteResult<ProductDeparture>>;

  /* ---- the publication boundary ---------------------------------------- */
  getVersions(session: Session, entityType?: ContentEntityType): Promise<ContentVersion[]>;
  getDraftFor(
    session: Session,
    entityType: ContentEntityType,
    entityId: string,
  ): Promise<ContentVersion | null>;
  saveDraft(session: Session, input: DraftInput): Promise<WriteResult<ContentVersion>>;
  submitForApproval(session: Session, versionId: string): Promise<WriteResult<ContentVersion>>;
  withdrawSubmission(session: Session, versionId: string): Promise<WriteResult<ContentVersion>>;

  /* ---- inbox ----------------------------------------------------------- */
  getConversations(session: Session): Promise<Conversation[]>;
  getConversation(session: Session, id: string): Promise<Conversation | null>;
  getMessages(session: Session, conversationId: string): Promise<Message[]>;
  sendMessage(session: Session, conversationId: string, body: string): Promise<WriteResult<Message>>;
  markConversationRead(session: Session, conversationId: string): Promise<void>;
  getNotes(session: Session, conversationId: string): Promise<ConversationNote[]>;
  addNote(
    session: Session,
    conversationId: string,
    body: string,
  ): Promise<WriteResult<ConversationNote>>;

  /* ---- leads ----------------------------------------------------------- */
  getLeads(session: Session): Promise<Lead[]>;
  getLead(session: Session, id: string): Promise<Lead | null>;
  setLeadStatus(
    session: Session,
    leadId: string,
    status: LeadStatus,
    lostReason?: string,
  ): Promise<WriteResult<Lead>>;
  assignLead(session: Session, leadId: string, companyUserId: string | null): Promise<WriteResult<Lead>>;
  /**
   * Record a lead the company got themselves — a phone call, a referral.
   *
   * Always stored with `origin: "company"`; the caller cannot ask for
   * `"icefall"`, because a lead ICEFALL delivered is one ICEFALL recorded.
   */
  createLead(session: Session, input: NewLeadInput): Promise<WriteResult<Lead>>;
  setLeadTags(session: Session, leadId: string, tags: string[]): Promise<WriteResult<Lead>>;
  getLeadNotes(session: Session, leadId: string): Promise<LeadNote[]>;
  addLeadNote(session: Session, leadId: string, body: string): Promise<WriteResult<LeadNote>>;
  getBookings(session: Session): Promise<Booking[]>;

  /* ---- dashboard, analytics, notifications ----------------------------- */
  getDashboard(session: Session): Promise<DashboardSummary>;
  getTrend(session: Session, days: number): Promise<TrendPoint[]>;
  getProductPerformance(session: Session): Promise<ProductPerformance[]>;
  /** Measured-only breakdowns: speed, drop-off, channel quality, mountains. */
  getInsights(session: Session, window: "week" | "month"): Promise<OperatorInsights>;
  getAnalytics(session: Session, window: "week" | "month"): Promise<AnalyticsSummary>;
  getNotifications(session: Session): Promise<OperatorNotification[]>;
  markNotificationRead(session: Session, id: string): Promise<void>;
}
