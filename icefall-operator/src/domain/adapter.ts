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
  CompanyTrek,
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
  Trek,
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
  /**
   * Records a person on the company's team list with status `invited`.
   *
   * IT DOES NOT DELIVER ANYTHING, AND THE NAME IS THE ONLY PART THAT SOUNDS
   * LIKE IT DOES. There is no mail sender configured in the ICEFALL Supabase
   * project and this app has no authentication, so there is nothing to send and
   * nowhere for a recipient to land. Any implementation of this interface that
   * starts actually mailing people must first satisfy the three security
   * properties written at the call site in `src/screens/Team.tsx` — the
   * invitation carries the identity, it is single-use/expiring/address-bound,
   * and the invitee cannot change the address on it.
   *
   * `companyId` is NOT part of `input` on purpose: an invite is always scoped
   * to the caller's own company, never aimed at another one.
   */
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

  /* ---- treks ----------------------------------------------------------- */
  /**
   * THE TREK SURFACE — the same two reads as the mountain one, for the other
   * noun. `getTreks` is Icefall's catalogue of routes; `getTrekAccess` is which
   * of them this company has been granted.
   *
   * THERE IS NO WRITE HERE, AND THAT IS NOT AN OVERSIGHT. It matches the
   * mountain surface exactly: `getAccess`, `getPlacements` and `getMountains`
   * are three reads and there is no `requestMountainAccess` either. An operator
   * cannot grant themselves a route, and this portal cannot yet deliver the
   * request to Icefall — so `Treks.tsx` says that in words rather than printing
   * "Request sent" over a method that does not exist. The write path is asked
   * for in `icefall-sessions/requests/09-company-treks-migration.md`.
   *
   * WHY THESE TWO ARE OPTIONAL WHERE THE MOUNTAIN PAIR IS NOT. A second
   * implementation of this seam — `src/offline/backend.ts`, the flight demo —
   * is owned and frozen by another session this phase, and a required member
   * would break it. Optional is therefore not a softening of the contract but
   * an honest statement of it: an implementation may not have a trek catalogue,
   * and the screen must tell the operator the catalogue is UNAVAILABLE rather
   * than draw an empty list, which would say Icefall has no treks. When the
   * trek tables land these become required, like the mountain pair.
   */
  getTreks?(): Promise<Trek[]>;
  /** The authorization boundary for routes. Scoped by session, like every read. */
  getTrekAccess?(session: Session): Promise<CompanyTrek[]>;

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
   *
   * THE PATCH TYPE IS THE ENFORCEMENT. Its keys are exactly
   * `DEPARTURE_DIRECT_FIELDS` in `types.ts` — the columns `authenticated` holds
   * an UPDATE grant on — so a date or a price cannot be smuggled through this
   * method by a caller that meant well. `spotsTotal` is here because the
   * constitution put it in that list: how many places a company runs is its own
   * logistics, the same kind of fact as how many are left.
   *
   * RETURNS THE STORED ROW, and callers must render THAT rather than what they
   * sent. An implementation that ignores part of the patch then shows as the
   * field failing to move, which is the truth, instead of the screen agreeing
   * with itself about a write that did not happen.
   */
  setDepartureAvailability(
    session: Session,
    departureId: string,
    patch: {
      availability?: ProductDeparture["availability"];
      spotsTotal?: number | null;
      spotsLeft?: number | null;
    },
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
  /**
   * A URL for a stored asset, or null when there is nothing to draw.
   *
   * Session-scoped like everything else here: an operator can resolve their own
   * company's assets and no one else's. The in-memory implementation returns a
   * path served by this app; the Supabase one will return a signed URL from the
   * private bucket. The CALLER never learns which, so no screen grows a
   * dependency on how storage works today.
   *
   * Returns null rather than a placeholder image path — a missing asset must
   * reach the UI as an absence it can fall back from, not as a picture of
   * nothing.
   */
  getMediaUrl(session: Session, mediaId: string | null): Promise<string | null>;
  getProductPerformance(session: Session): Promise<ProductPerformance[]>;
  /** Measured-only breakdowns: speed, drop-off, channel quality, mountains. */
  getInsights(session: Session, window: "week" | "month"): Promise<OperatorInsights>;
  getAnalytics(session: Session, window: "week" | "month"): Promise<AnalyticsSummary>;
  getNotifications(session: Session): Promise<OperatorNotification[]>;
  markNotificationRead(session: Session, id: string): Promise<void>;
}
