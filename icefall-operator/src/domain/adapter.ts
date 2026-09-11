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
  Activity,
  ActivityDirection,
  ActivityStatus,
  ActivityType,
  AuditEntityType,
  AuditEvent,
  AvailabilityStatus,
  Booking,
  BookingStatus,
  Channel,
  ChannelMessage,
  ChannelMessageStats,
  Company,
  CompanyMountain,
  CompanyTrek,
  CompanyUser,
  CommunicationPreferences,
  ConsentStatus,
  Contact,
  ContactGroup,
  Conversation,
  ConversationNote,
  ContentEntityType,
  ContentVersion,
  DepartureStatus,
  Document,
  DocumentType,
  FinancialEvent,
  FinancialEventSource,
  FinancialEventStatus,
  FinancialEventType,
  FunnelCounts,
  GuideResource,
  ItineraryDay,
  Lead,
  LeadNote,
  LeadStatus,
  Message,
  Mountain,
  OperatorNotification,
  Participant,
  ParticipantInformationField,
  ParticipantStatus,
  Post,
  PostComment,
  PostMedia,
  PreferredDates,
  Product,
  ProductDeparture,
  ProductKind,
  Placement,
  PromoVideo,
  Proposal,
  ProposalStatus,
  ProposalVersion,
  ReferralEvent,
  RequirementStatus,
  StoredCompanyRole,
  Supplier,
  SupplierStatus,
  SupplierType,
  Task,
  TaskStatus,
  TaskType,
  Trek,
  TripBrief,
} from "./types";
import type { Cents, Reading } from "./honesty";
import type { Quote } from "../money/model";
import type { DuplicateContactCandidate } from "./crm/contacts";

/**
 * An exact reporting range — both ends ISO `YYYY-MM-DD`, both INCLUSIVE.
 *
 * The owner asked for this by name (OP-02): "should have to be able to select
 * exact dates they want to see analytics from." §6af applies at this seam like
 * every other: an implementation must REFUSE an invalid or reversed range with
 * a reason rather than silently coercing it into something that runs.
 */
export interface AnalyticsRange {
  fromIso: string;
  toIso: string;
}

/**
 * What the analytics reads accept: the two named presets, or exact dates.
 *
 * ONE SIGNATURE, NO THIRD CODE PATH. Inside an implementation the presets are
 * DERIVED ranges — "week" is the 7 calendar days ending today, "month" the 30
 * — so a preset and a custom range run through the same arithmetic and cannot
 * drift apart. The string forms stay in the union so an implementation without
 * exact-date support (the frozen offline fixture) keeps compiling and keeps
 * serving the presets it always served.
 */
export type AnalyticsWindow = "week" | "month" | AnalyticsRange;

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
  /** Previous window, for the period-on-period comparison in spec §11. */
  previous: FunnelCounts | null;
  /**
   * The resolved window this summary was counted over — presets included, so
   * the screen labels the ACTUAL dates rather than restating the request.
   * Optional only because the frozen offline fixture predates it.
   */
  range?: AnalyticsRange;
  /**
   * The window `previous` was counted over: the SAME LENGTH, immediately
   * before `range`. Null exactly when `previous` is null — a window that held
   * nothing is not a comparison, and the "vs …" footnote must vanish with it.
   */
  previousRange?: AnalyticsRange | null;
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

/**
 * What an operator states when creating a post (OP-01, via S2).
 *
 * No `authorKind`, no `authorId`, no `companyId`: a post from this portal is
 * always the caller's own company's, and the scope comes from the session —
 * the same shape rule as every other write here. No `removedAt` either:
 * removal is Icefall's, and an input that could spell it would be a write path
 * the contract forbids.
 */
export interface NewPostInput {
  caption: string;
  media: PostMedia | null;
  /**
   * Set = the post is a STORY (S2: optional expiry = a story). Validated
   * against the app clock — an expiry already in the past is refused, with the
   * reason shown.
   */
  expiresAt?: string | null;
}

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

/**
 * What an operator states when opening a channel.
 *
 * No `companyId` — the scope is the session, like every other write here. No
 * `coverPath` either: a cover is an upload, and uploads go through the media
 * surface that already exists, not through the create call.
 */
export interface NewChannelInput {
  /** 1..60 after trimming, unique within the company. */
  name: string;
  /** ≤300 after trimming. Empty or omitted stores null, never "". */
  description?: string | null;
}

/**
 * The editable fields of a channel. `archivedAt` is NOT among them: archiving
 * runs through `archiveChannel`, so "stop this channel" is one named act with
 * one reason rather than a timestamp any patch could set — or unset.
 */
export interface ChannelPatch {
  name?: string;
  description?: string | null;
}

/**
 * WHAT A CHANNEL MESSAGE PROMOTES, shaped so the invalid pair cannot be typed.
 *
 * The migration writes the rule as a constraint —
 * `channel_messages_departure_needs_product`: a departure requires a product.
 * This is that constraint at the type level. Because `departureId` only exists
 * INSIDE an object that already carries a `productId`, "a departure with no
 * product" is not a value this interface can hold, so it is never a refusal an
 * operator has to read: it is a sentence the caller cannot write.
 *
 * A promotion is a PRODUCT and optionally one of its departures. It is never
 * an offer — see the note on `ChannelMessage` in `types.ts` for why that is a
 * correctness rule and not a preference.
 */
export interface ChannelPromotion {
  productId: string;
  /** One departure OF THAT PRODUCT, or null for "the trip in general". */
  departureId?: string | null;
}

/**
 * What an operator states when sending to a channel.
 *
 * THERE IS NO `media` FIELD. Message media has no bucket — `operator-media` is
 * company-scoped and fine for a channel cover, but nothing yet holds a photo
 * that belongs to a message. A field here would be a write the storage layer
 * rejects, so the shape says text-plus-promotion, which is what actually ships.
 */
export interface NewChannelMessageInput {
  /** 1..2000 after trimming. */
  body: string;
  /** Omitted or null = this message promotes nothing. */
  promotion?: ChannelPromotion | null;
  /** Terms in the seller's own words, ≤300. NEVER a price — see `types.ts`. */
  promoNote?: string | null;
}


/* ========================================================================== */
/* THE CRM OPERATING SYSTEM — inputs (brief §4–§6)                            */
/* ========================================================================== */

/*
 * EVERY INPUT BELOW OMITS `companyId`, `id`, `createdAt`, `updatedAt` AND
 * `createdBy`: scope and authorship come from the session, exactly as for
 * every other write on this seam. An input that could name another company is
 * an input that could leak into one.
 *
 * Every field on these records is PRIVATE SURFACE (see the CRM block in
 * `types.ts`). No contact guard runs on any of them, by decision, not omission.
 */

/** Brief §4 Contact, minus the fields the adapter owns. */
export interface NewContactInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  language?: string | null;
  consentStatus?: ConsentStatus;
  /** Set only when `consentStatus` is `given`; the adapter refuses the pair otherwise. */
  marketingConsentAt?: string | null;
  communicationPreferences?: Partial<CommunicationPreferences>;
  /**
   * Link the new contact to an existing `Lead` (the brief's inquiry). The
   * lead must be the caller's own; `Lead.contactId` is set on success.
   */
  linkLeadId?: string | null;
}

export type ContactPatch = Partial<Omit<NewContactInput, "linkLeadId">>;

export interface NewContactGroupInput {
  name: string;
  leaderContactId: string;
  /** Must include the leader; the adapter adds them if omitted. */
  memberContactIds: string[];
}

export type ContactGroupPatch = Partial<NewContactGroupInput>;

/** Where an activity hangs. At least one of the three must be set. */
export interface ActivityRef {
  contactId?: string | null;
  /** A `Lead.id`. */
  inquiryId?: string | null;
  bookingId?: string | null;
}

export interface NewActivityInput extends ActivityRef {
  type: ActivityType;
  direction: ActivityDirection;
  /**
   * `sent` IS REFUSED HERE AND IN `setActivityStatus`. Nothing in this app can
   * send, so nothing in this app can have sent. Omit for `draft`.
   */
  status?: Exclude<ActivityStatus, "sent">;
  subject: string;
  bodyOrReference?: string | null;
  scheduledAt?: string | null;
}

export interface NewTaskInput {
  departureId?: string | null;
  type: TaskType;
  /** A `CompanyUser.id` on the caller's team, active. */
  assigneeId: string;
  supplierId?: string | null;
  title: string;
  description?: string | null;
  dueAt?: string | null;
}

export type TaskPatch = Partial<Omit<NewTaskInput, "type">>;

export interface TaskFilter {
  departureId?: string;
  assigneeId?: string;
  status?: TaskStatus;
}

export interface NewTripBriefInput {
  /** A `Lead.id` — the caller's own. */
  inquiryId: string;
  /** A `Mountain.id`. Defaults to the lead's `mountainId` when omitted. */
  objectiveId?: string | null;
  preferredDates?: Partial<PreferredDates>;
  flexibilitySummary?: string | null;
  groupSummary?: string | null;
  experienceSummary?: string | null;
  operatorAssumptions?: string | null;
  requirementsToConfirm?: string[];
  internalNotes?: string | null;
}

export type TripBriefPatch = Partial<Omit<NewTripBriefInput, "inquiryId">>;

/**
 * A proposal and its FIRST version, created together — a proposal with no
 * version is a header with nothing behind it.
 */
export interface NewProposalInput {
  /** A `Lead.id` — the caller's own. */
  inquiryId: string;
  tripBriefId?: string | null;
  /** ISO 4217. Required — never assumed. */
  currency: string;
  totalMinor: Cents;
  depositMinor: Cents;
  balanceMinor: Cents;
  /** A LOCAL day, `YYYY-MM-DD`. */
  validUntil?: string | null;
  cancellationPolicyReference?: string | null;
  version: NewProposalVersionContent;
}

/** The header fields a DRAFT or IN-REVIEW proposal may still change in place. */
export interface ProposalPatch {
  tripBriefId?: string | null;
  currency?: string;
  totalMinor?: Cents;
  depositMinor?: Cents;
  balanceMinor?: Cents;
  validUntil?: string | null;
  cancellationPolicyReference?: string | null;
}

/** What a version SAYS. The number and the author are the adapter's. */
export interface NewProposalVersionContent {
  itineraryContent?: ItineraryDay[];
  inclusions?: string[];
  exclusions?: string[];
  requirements?: string[];
  /** The shared `Quote` from `src/money/model.ts`. */
  pricingSnapshot?: Quote | null;
  changeSummary?: string | null;
}

/**
 * A NEW VERSION on an existing proposal, with any header change that goes with
 * it. Header money moves WITH the version so the snapshot and the header agree
 * in the same write; on a committed (sent or later) proposal this is the ONLY
 * way to change anything, and the proposal returns to `draft` unapproved.
 */
export interface NewProposalVersionInput extends NewProposalVersionContent {
  /** Required from version 2 onwards — say what changed and why. */
  changeSummary: string;
  header?: ProposalPatch;
}

export interface ProposalFilter {
  inquiryId?: string;
  status?: ProposalStatus;
}

/** Brief §4 Booking commercial fields the operator may set. Status has its own method. */
export interface BookingCommercialPatch {
  proposalId?: string | null;
  departureId?: string | null;
  primaryContactId?: string | null;
  quotedTotalMinor?: Cents | null;
  depositDueMinor?: Cents | null;
  balanceDueMinor?: Cents | null;
  depositDueAt?: string | null;
  balanceDueAt?: string | null;
  externalReference?: string | null;
  /*
   * NO `paymentProviderReference` HERE. No provider is connected; the field
   * is written by a provider adapter that does not exist, never by a person.
   */
}

export interface NewFinancialEventInput {
  bookingId: string;
  type: FinancialEventType;
  /**
   * `confirmed` is refused unless `source` is a provider or an operator
   * confirmation. Omit for `draft`.
   */
  status?: FinancialEventStatus;
  amountMinor: Cents | null;
  currency: string;
  source: FinancialEventSource;
  externalReference?: string | null;
  effectiveAt?: string | null;
}

export interface NewParticipantInput {
  contactId: string;
  inquiryId?: string | null;
  proposalId?: string | null;
  /** Only `lead` or `invited` at creation; the rest is derived or later. */
  status?: Extract<ParticipantStatus, "lead" | "invited">;
  retentionUntil?: string | null;
}

export interface ParticipantFilter {
  /** Participants on this departure's roster. */
  departureId?: string;
  inquiryId?: string;
  status?: ParticipantStatus;
}

export interface NewDocumentInput {
  participantId: string;
  type: DocumentType;
  status?: RequirementStatus;
  expiresAt?: string | null;
  /** A path in a private store. NEVER a URL. */
  storageReference?: string | null;
  consentReference?: string | null;
}

/** `reviewedBy` / `reviewedAt` are stamped by the adapter when status becomes `reviewed`. */
export interface DocumentPatch {
  status?: RequirementStatus;
  expiresAt?: string | null;
  storageReference?: string | null;
  consentReference?: string | null;
}

/** The operational fields of a departure — `DEPARTURE_OPERATIONS_FIELDS`. */
export interface DepartureOperationsPatch {
  status?: DepartureStatus;
  name?: string | null;
  capacity?: number | null;
  meetingPoint?: string | null;
  internalNotes?: string | null;
  proposalId?: string | null;
}

export interface NewSupplierInput {
  name: string;
  type: SupplierType;
  country?: string | null;
  contactDetails?: string | null;
  contractReference?: string | null;
  status?: SupplierStatus;
}

export type SupplierPatch = Partial<Omit<NewSupplierInput, "status">>;

export interface NewGuideResourceInput {
  profileIdOrExternalContactId: string;
  role: string;
  qualificationsReference?: string | null;
  insuranceStatus?: RequirementStatus;
  availabilityStatus?: AvailabilityStatus;
  contactPreferences?: string | null;
  /*
   * NO `verificationStatus`. Every guide is created `not_submitted`, and no
   * method on this seam raises it to `verified` — the operator is not the
   * verifying party.
   */
}

export type GuideResourcePatch = Partial<NewGuideResourceInput>;

export interface AuditFilter {
  entityType?: AuditEntityType;
  entityId?: string;
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
  /**
   * ROLE IS `StoredCompanyRole`, NOT `CompanyRole`, AND THAT IS DELIBERATE.
   *
   * The product models six roles (brief §4); `company_users.company_role` still
   * accepts two — `check (company_role in ('admin', 'sales'))`,
   * `icefall-supabase/migrations/20260828100000_crm_foundation.sql:333`. An
   * invite ends as a row in that table, so offering the other four here would
   * be offering an invitation the database refuses. Narrowing the parameter
   * makes that a compile error today rather than a write failure later, and it
   * widens by itself the moment `StoredCompanyRole` widens.
   */
  inviteTeamMember(
    session: Session,
    input: { displayName: string; email: string; role: StoredCompanyRole },
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

  /* ---- social (OP-01, via S2) ------------------------------------------ */
  /*
   * THE S2 TABLES ARE NOT LIVE. Every method in this block runs against the
   * in-memory adapter today, in shapes that mirror the S2 contract
   * (`icefall-sessions/10-BUILD-OUT-PLAN.md`) exactly, so the Supabase
   * implementation is a repoint of these declarations and not a rewrite — the
   * same route `leads.tags` took.
   *
   * OPTIONAL for the reason `getTreks` is optional and no other: a second
   * implementation of this seam — `src/offline/backend.ts`, the flight demo —
   * is owned and frozen by another session, and a required member would break
   * it. A screen finding these absent says the social surface is UNAVAILABLE,
   * it does not draw an empty feed. When the S2 tables land these become
   * required.
   *
   * All session-scoped to the caller's OWN company. There is no companyId
   * parameter anywhere, so a cross-company read cannot be expressed.
   */

  /**
   * The company's own posts, newest first — stories, removed posts and all.
   * A removed post is returned WITH its `removedReason`, because the operator
   * is owed the reason; whether a story has expired is derived from the app
   * clock by the caller, not filtered away here.
   */
  getPosts?(session: Session): Promise<Post[]>;
  /**
   * Publishes a post — public the moment it succeeds, no review step, because
   * none exists (moderation is the CRM's queue, after the fact). The caption
   * is operator-authored public text and runs the same
   * `guardContactDetails("published", …)` guard as every other ICEFALL-facing
   * field; a story expiry in the past is refused.
   * Every refusal reason is shown verbatim.
   */
  createPost?(session: Session, input: NewPostInput): Promise<WriteResult<Post>>;
  /**
   * Deletes the company's own post. A post REMOVED BY ICEFALL cannot be
   * deleted over — the removal record survives, so the moderation trail cannot
   * be tidied away by the company it concerns.
   */
  deletePost?(session: Session, postId: string): Promise<WriteResult<Post>>;
  /** Climbers' comments under one of the company's own posts. Read-only here. */
  getPostComments?(session: Session, postId: string): Promise<PostComment[]>;
  /**
   * How many people follow this company — COUNTED from `follows` rows, never
   * stored as a total. A `Reading` so an implementation with no follow data
   * can say so instead of shipping a zero that reads as "nobody".
   */
  getFollowerCount?(session: Session): Promise<Reading<number>>;
  /**
   * The promotional-video slot on the company's SOCIAL surface (OP-01) — not
   * `Company.video`, which owner decision #15 removed and which stays removed.
   * See the reconciliation note on `PromoVideoSlot` in `types.ts`.
   */
  getPromoVideo?(session: Session): Promise<PromoVideo>;
  /**
   * Sets or clears the slot. `input` is whatever the operator pasted — a watch
   * URL, share link, embed URL or bare id — resolved through the existing
   * `youtubeIdFrom` validation; anything it cannot resolve is refused with the
   * reason. Null or empty clears the slot back to `{ source: "none" }`.
   */
  setPromoVideo?(session: Session, input: string | null): Promise<WriteResult<PromoVideo>>;

  /* ---- channels -------------------------------------------------------- */
  /*
   * A COMPANY BROADCASTS; MEMBERS LISTEN. The owner's model, in their words:
   * "like on instagram when creators create channels".
   *
   * These mirror `20260902180000_company_channels.sql`, which is written and
   * NOT PUSHED — everything runs against the in-memory adapter today so the
   * swap is a repoint, the route `leads.tags` took. Optional for the reason
   * `getPosts` is optional and no other: `src/offline/backend.ts` is frozen by
   * another session and a required member would break it. A screen finding
   * these absent says channels are UNAVAILABLE; it does not draw an empty one.
   *
   * SESSION-SCOPED, ALL OF THEM. There is no `companyId` parameter anywhere, so
   * a cross-company read cannot be expressed.
   *
   * READ THE ABSENCES. There is no method to reply, no method to comment, no
   * method to add a member, no method to edit a message, and no method to
   * delete a channel. Each one is a rule the database enforces, and adding any
   * of them here would put the UI ahead of what the backend will accept.
   */

  /**
   * The company's own channels, ARCHIVED ONES INCLUDED and marked as such
   * (`archivedAt`). Filtering them away here would hide a channel that people
   * joined and can still read, which is precisely the disappearance archiving
   * exists to prevent.
   */
  getChannels?(session: Session): Promise<Channel[]>;
  /**
   * Opens a channel. Admin only — the same permission that publishes company
   * content, because a channel IS published company content.
   *
   * Both the name and the description run the contact guard on the
   * `"published"` surface, and blockingly. A channel is promotional text pointed straight at climbers
   * with no reviewer in between, so it is exactly where a phone number gets
   * smuggled — and a channel NAME is read far more often than its description.
   */
  createChannel?(session: Session, input: NewChannelInput): Promise<WriteResult<Channel>>;
  /** Renames or re-describes a channel. Same guards as creating one. */
  updateChannel?(
    session: Session,
    channelId: string,
    patch: ChannelPatch,
  ): Promise<WriteResult<Channel>>;
  /**
   * Stamps `archivedAt`: no new messages, still readable by everyone who
   * joined.
   *
   * THERE IS NO `deleteChannel`, AND THERE NEVER WILL BE. Members joined
   * something. A company that could delete a channel could make the thing
   * people opted into disappear from under them, along with every promotional
   * claim it ever made in there. Archive is the whole lifecycle; the absence of
   * a delete method is the enforcement.
   */
  archiveChannel?(session: Session, channelId: string): Promise<WriteResult<Channel>>;

  /** One channel's messages, NEWEST FIRST. */
  getChannelMessages?(session: Session, channelId: string): Promise<ChannelMessage[]>;
  /**
   * Sends to a channel. Admin only — this is the ONLY write path onto
   * `channel_messages`, and it is where "members cannot reply" actually lives.
   *
   * Refuses on an archived channel, with the reason. Runs the contact-details
   * guard over BOTH `body` and `promoNote`. A promoted product must be the
   * caller's OWN — a company promoting another company's trip is a cross-tenant
   * leak wearing a compliment — and a promoted departure must belong to that
   * product.
   */
  postChannelMessage?(
    session: Session,
    channelId: string,
    input: NewChannelMessageInput,
  ): Promise<WriteResult<ChannelMessage>>;
  /**
   * Deletes one of the company's own messages.
   *
   * THERE IS NO `updateChannelMessage`, DELIBERATELY. The table has no UPDATE
   * policy, matching `posts`: a promotional claim is stood behind or deleted.
   * Silent edits after people have read it — and after the view count accrued
   * against the old words — is how a feed becomes a liability. Delete and
   * repost is the honest correction, because it resets the count with the text.
   */
  deleteChannelMessage?(session: Session, messageId: string): Promise<WriteResult<ChannelMessage>>;
  /**
   * HOW MANY PEOPLE OPENED EACH MESSAGE, AND NOT ONE THING MORE.
   *
   * This is the feature the owner asked for, and rule 3 of the contract is why
   * it returns what it returns. The count comes from `channel_message_stats`,
   * an aggregate view; the company cannot read the `channel_message_views` rows
   * underneath it. A company learning that a named climber opened a named
   * promotional offer at a named time is surveillance, not analytics, and
   * nobody joining a channel expects it.
   *
   * So the return type carries a message id and a number. No profile id, no
   * name, no timestamp — not because a screen would misuse them, but so that a
   * screen COULD not: build no "who viewed" list, no expandable row, no hover
   * card, and if someone adds one anyway there is no identity in this data for
   * it to show. A count must not become an affordance.
   *
   * Every message in the channel appears, including ones with zero views. A
   * counted zero is a fact and renders as "0 views".
   */
  getChannelMessageStats?(session: Session, channelId: string): Promise<ChannelMessageStats[]>;
  /**
   * How many people have joined — a count the company legitimately sees,
   * because people joined it themselves and know they did.
   *
   * NO METHOD RETURNS MEMBER IDENTITIES. Do not add one. The same rule as the
   * view count, for the same reason, and it also runs the other way: a company
   * CANNOT ADD MEMBERS either, so there is no invite, no add-member and no
   * import here. An audience the company assembled is a mailing list nobody
   * consented to.
   *
   * A `Reading` for the reason `getFollowerCount` is one: an implementation
   * with no membership data should say so rather than ship a zero that reads
   * as "nobody joined".
   */
  getChannelMemberCount?(session: Session, channelId: string): Promise<Reading<number>>;

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
  /**
   * Daily counts over an EXACT range, for the Overview chart when the operator
   * has picked their own dates. Optional for the reason `getTreks` is optional:
   * the frozen offline fixture cannot serve exact dates, and a screen finding
   * this absent offers the presets only rather than mislabelling preset data
   * with custom dates. Same strictness as the other range reads: an invalid or
   * reversed range is refused with a reason.
   */
  getTrendRange?(session: Session, range: AnalyticsRange): Promise<TrendPoint[]>;
  getProductPerformance(session: Session): Promise<ProductPerformance[]>;
  /** Measured-only breakdowns: speed, drop-off, channel quality, mountains. */
  getInsights(session: Session, window: AnalyticsWindow): Promise<OperatorInsights>;
  getAnalytics(session: Session, window: AnalyticsWindow): Promise<AnalyticsSummary>;
  getNotifications(session: Session): Promise<OperatorNotification[]>;
  markNotificationRead(session: Session, id: string): Promise<void>;

  /* ---- THE CRM OPERATING SYSTEM (brief §4–§6) --------------------------- */
  /*
   * THE COMPANY'S OWN RECORDS. Contacts, activities, tasks, trip briefs,
   * proposals, the commercial record, participants, departures' operational
   * side, suppliers, guides, ICEFALL referrals and the audit trail.
   *
   * ALL OPTIONAL, for exactly the reason `getTreks` and `getPosts` are: two
   * other implementations of this seam — `src/offline/backend.ts` and
   * `src/backend/supabaseBackend.ts` — are frozen this wave, and NO LIVE TABLE
   * EXISTS for any of these entities (asked for in
   * `icefall-sessions/requests/17-operator-crm-operating-system-schema.md`).
   * A screen finding a method absent renders `CRM_NOTICES.NOT_CONNECTED` from
   * `@/domain/crm` — it does not draw an empty list, because an empty list
   * says "you have no customers". When the tables land these become required.
   *
   * SESSION-SCOPED, EVERY ONE. No `companyId` parameter anywhere.
   *
   * EVERY MUTATING METHOD WRITES AN `AuditEvent`. `listAuditEvents` is how a
   * screen shows the trail; nothing here deletes one.
   */

  /* -- Contacts -- */
  listContacts?(session: Session): Promise<Contact[]>;
  getContact?(session: Session, contactId: string): Promise<Contact | null>;
  createContact?(session: Session, input: NewContactInput): Promise<WriteResult<Contact>>;
  updateContact?(session: Session, contactId: string, patch: ContactPatch): Promise<WriteResult<Contact>>;
  /**
   * Candidates that LOOK LIKE `draft`, for a person to review. Never merges;
   * an empty list means nothing matched by email, phone or full name — not
   * that no duplicate exists.
   */
  findDuplicateContacts?(session: Session, draft: { firstName: string; lastName: string; email?: string | null; phone?: string | null }): Promise<DuplicateContactCandidate[]>;
  /**
   * EXPLICIT AND AUDITED. Every reference to `dropId` — leads, participants,
   * activities, groups, bookings — is repointed at `keepId`, and the dropped
   * row's stripped snapshot is kept in the audit event. Refuses two ids that
   * are the same, or either that is not the caller's.
   */
  mergeContacts?(session: Session, keepId: string, dropId: string): Promise<WriteResult<Contact>>;
  listContactGroups?(session: Session): Promise<ContactGroup[]>;
  createContactGroup?(session: Session, input: NewContactGroupInput): Promise<WriteResult<ContactGroup>>;
  updateContactGroup?(session: Session, groupId: string, patch: ContactGroupPatch): Promise<WriteResult<ContactGroup>>;

  /* -- Communication / Activity -- */
  /** The timeline for a contact, an inquiry or a booking — newest first. */
  listActivitiesFor?(session: Session, ref: ActivityRef): Promise<Activity[]>;
  /** `status: "sent"` is refused — see `Activity` in `types.ts`. */
  createActivity?(session: Session, input: NewActivityInput): Promise<WriteResult<Activity>>;
  /** Likewise refuses `sent`. */
  setActivityStatus?(session: Session, activityId: string, status: ActivityStatus): Promise<WriteResult<Activity>>;

  /* -- Tasks -- */
  listTasks?(session: Session, filter?: TaskFilter): Promise<Task[]>;
  createTask?(session: Session, input: NewTaskInput): Promise<WriteResult<Task>>;
  updateTask?(session: Session, taskId: string, patch: TaskPatch): Promise<WriteResult<Task>>;
  /** `completed` stamps `completedAt`; anything else clears it. */
  setTaskStatus?(session: Session, taskId: string, status: TaskStatus): Promise<WriteResult<Task>>;

  /* -- Trip briefs -- */
  getTripBriefForInquiry?(session: Session, inquiryId: string): Promise<TripBrief | null>;
  createTripBrief?(session: Session, input: NewTripBriefInput): Promise<WriteResult<TripBrief>>;
  updateTripBrief?(session: Session, tripBriefId: string, patch: TripBriefPatch): Promise<WriteResult<TripBrief>>;

  /* -- Proposals -- */
  listProposals?(session: Session, filter?: ProposalFilter): Promise<Proposal[]>;
  getProposal?(session: Session, proposalId: string): Promise<Proposal | null>;
  /** Creates the proposal AND version 1. `deposit + balance === total` or refused. */
  createProposal?(session: Session, input: NewProposalInput): Promise<WriteResult<Proposal>>;
  /** Header edit — DRAFT / INTERNAL_REVIEW ONLY. A sent proposal is refused; use `createProposalVersion`. */
  updateProposal?(session: Session, proposalId: string, patch: ProposalPatch): Promise<WriteResult<Proposal>>;
  /**
   * Internal approval — `approveProposals` (owner/admin). Stamps
   * `approvedBy`/`approvedAt`. Required before `sent`.
   */
  approveProposal?(session: Session, proposalId: string): Promise<WriteResult<Proposal>>;
  /**
   * Status moves per `PROPOSAL_TRANSITIONS` in `@/domain/crm`. `sent` is
   * refused without `approvedBy`, with the reason.
   */
  setProposalStatus?(session: Session, proposalId: string, status: ProposalStatus): Promise<WriteResult<Proposal>>;
  /** Every version, oldest first. Which is current is derived — `currentVersion()`. */
  listProposalVersions?(session: Session, proposalId: string): Promise<ProposalVersion[]>;
  /**
   * APPENDS a version. On a committed proposal this is the only edit path:
   * the prior version is untouched (superseded by derivation), the approval
   * is cleared and the status returns to `draft`.
   */
  createProposalVersion?(session: Session, proposalId: string, input: NewProposalVersionInput): Promise<WriteResult<ProposalVersion>>;

  /* -- The commercial record -- */
  getBooking?(session: Session, bookingId: string): Promise<Booking | null>;
  /** The brief's commercial fields. `paymentProviderReference` is not settable. */
  updateBookingCommercial?(session: Session, bookingId: string, patch: BookingCommercialPatch): Promise<WriteResult<Booking>>;
  /**
   * `paid` requires CONFIRMED received events adding up to the quoted total;
   * `refunded` requires a confirmed `refund_issued`. A status is never proof
   * of money — the events are what carry the source.
   */
  setBookingStatus?(session: Session, bookingId: string, status: BookingStatus): Promise<WriteResult<Booking>>;
  /** All of the company's events, or one booking's. Oldest first. */
  listFinancialEvents?(session: Session, bookingId?: string): Promise<FinancialEvent[]>;
  createFinancialEvent?(session: Session, input: NewFinancialEventInput): Promise<WriteResult<FinancialEvent>>;
  /** `confirmed` is refused unless the event's source is a provider or an operator confirmation. */
  setFinancialEventStatus?(session: Session, eventId: string, status: FinancialEventStatus): Promise<WriteResult<FinancialEvent>>;

  /* -- Participants and documents -- */
  /**
   * REDACTED AT THE ADAPTER for a caller without `viewSensitiveParticipantData`:
   * `fitnessInformationStatus` and `medicalInformationStatus` come back as
   * `REDACTED`. A screen renders that as hidden-from-role, never as blank.
   */
  listParticipants?(session: Session, filter?: ParticipantFilter): Promise<Participant[]>;
  getParticipant?(session: Session, participantId: string): Promise<Participant | null>;
  createParticipant?(session: Session, input: NewParticipantInput): Promise<WriteResult<Participant>>;
  /**
   * Moves ONE information field and re-derives `status`. Writing a sensitive
   * field requires `viewSensitiveParticipantData` as well as
   * `manageParticipants` — you cannot set what you may not read.
   */
  setParticipantFieldStatus?(session: Session, participantId: string, field: ParticipantInformationField, status: RequirementStatus): Promise<WriteResult<Participant>>;
  /**
   * Lifecycle only: `lead`, `invited`, `completed`, `cancelled`. The three
   * derived statuses are REFUSED — see `DERIVED_PARTICIPANT_STATUSES`.
   */
  setParticipantStatus?(session: Session, participantId: string, status: ParticipantStatus): Promise<WriteResult<Participant>>;
  /** A medical document is redacted (status and reference) without the sensitive permission. */
  listDocumentsFor?(session: Session, participantId: string): Promise<Document[]>;
  createDocument?(session: Session, input: NewDocumentInput): Promise<WriteResult<Document>>;
  /** `reviewed` stamps `reviewedBy`/`reviewedAt` from the session. Also moves the matching participant field. */
  updateDocument?(session: Session, documentId: string, patch: DocumentPatch): Promise<WriteResult<Document>>;

  /* -- Departures, the operational side -- */
  /** Every departure across the company's products — the operations list. */
  listDepartures?(session: Session): Promise<ProductDeparture[]>;
  getDeparture?(session: Session, departureId: string): Promise<ProductDeparture | null>;
  /**
   * THE THIRD WRITE GROUP — `DEPARTURE_OPERATIONS_FIELDS` only. Dates and
   * price still go through a version; availability still goes through
   * `setDepartureAvailability`. Nothing here can touch either.
   */
  updateDepartureOperations?(session: Session, departureId: string, patch: DepartureOperationsPatch): Promise<WriteResult<ProductDeparture>>;
  /** Replaces the roster. Every id must be the company's own participant; refused past `capacity`. */
  setDepartureRoster?(session: Session, departureId: string, participantIds: string[]): Promise<WriteResult<ProductDeparture>>;

  /* -- Suppliers and guides -- */
  listSuppliers?(session: Session): Promise<Supplier[]>;
  createSupplier?(session: Session, input: NewSupplierInput): Promise<WriteResult<Supplier>>;
  updateSupplier?(session: Session, supplierId: string, patch: SupplierPatch): Promise<WriteResult<Supplier>>;
  setSupplierStatus?(session: Session, supplierId: string, status: SupplierStatus): Promise<WriteResult<Supplier>>;
  listGuideResources?(session: Session): Promise<GuideResource[]>;
  /** Always `verificationStatus: "not_submitted"`. */
  createGuideResource?(session: Session, input: NewGuideResourceInput): Promise<WriteResult<GuideResource>>;
  updateGuideResource?(session: Session, guideId: string, patch: GuideResourcePatch): Promise<WriteResult<GuideResource>>;

  /* -- The ICEFALL section -- */
  /** Read-only. ICEFALL writes these; no booking or commission follows from one. */
  listReferralEvents?(session: Session): Promise<ReferralEvent[]>;

  /* -- Audit -- */
  /** Newest first. */
  listAuditEvents?(session: Session, filter?: AuditFilter): Promise<AuditEvent[]>;
}
