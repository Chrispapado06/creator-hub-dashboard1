/**
 * In-memory implementation of `OperatorBackend`.
 *
 * This is a stand-in for the shared Supabase backend, not a toy. It enforces
 * every authorization rule the real one will, for one reason: the test suite in
 * `tests/authz.test.ts` runs against this implementation, and a test that passes
 * against a permissive fake proves nothing about the system it is standing in
 * for. When the migration lands, the same tests should be re-pointed at the
 * Supabase implementation and still pass.
 *
 * Mutations are applied to module-level arrays and survive navigation but not a
 * reload. That is the correct amount of persistence for a data layer that is
 * about to be deleted.
 */

import type { AnalyticsSummary, DashboardSummary, DraftInput, MountainPerformance, NewProductInput, OperatorBackend, OperatorInsights, OwnerPerformance, ProductPerformance, SourceCount, SourceQuality, StageReach, TrendPoint, WriteResult } from "../adapter";
import type { Session } from "../authz";
import { can, canEditVersion, canManageMountain, findContactDetailsIn, isCompanyAdmin, ownsCompany } from "../authz";
import { conversionRate, estimatedGmv, measured, OPERATOR_NOTICES, unavailable, type Reading } from "../honesty";
import { demoListingViews } from "../demo";
import { formatDayShort, NOW } from "../dates";
import type {
  Booking, Company, CompanyUser, Conversation, ConversationNote, ContentEntityType,
  ContentVersion, FunnelCounts, Lead, LeadNote, LeadStatus, Message, Mountain,
  Post, PromoVideo, Product, ProductDeparture, Trek,
} from "../types";
/*
 * The one import from outside the domain layer, and it is deliberate:
 * `youtubeIdFrom` is THE definition of what this app accepts as a YouTube
 * reference, written beside the field that collects it. A second, cleverer
 * copy here would be a second answer to the same question — the exact drift
 * `authz.ts`'s header warns about — so the backend consults the same function
 * the form does.
 */
import { youtubeIdFrom } from "@/editor/VideoField";
import * as seed from "./seed";

/**
 * Tags are trimmed, de-duplicated case-insensitively, capped and length-bound.
 * Two tags differing only in case are ONE tag — otherwise "Deposit" and
 * "deposit" split a pipeline filter in half and neither column is right.
 */
const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 24;

function normaliseTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Mutable store                                                              */
/* -------------------------------------------------------------------------- */

const db = {
  companies: [...seed.COMPANIES],
  users: [...seed.COMPANY_USERS],
  mountains: [...seed.MOUNTAINS],
  access: [...seed.COMPANY_MOUNTAINS],
  treks: [...seed.TREKS],
  trekAccess: [...seed.COMPANY_TREKS],
  placements: [...seed.PLACEMENTS],
  products: [...seed.PRODUCTS],
  departures: [...seed.DEPARTURES],
  versions: [...seed.VERSIONS],
  conversations: [...seed.CONVERSATIONS],
  messages: [...seed.MESSAGES],
  notes: [...seed.NOTES],
  leads: [...seed.LEADS],
  leadNotes: [...seed.LEAD_NOTES],
  bookings: [...seed.BOOKINGS],
  notifications: [...seed.NOTIFICATIONS],
  events: [...seed.EVENTS],
  media: [...seed.MEDIA_ASSETS],
  // Social (OP-01, via S2) — in-memory stand-ins for tables that are not live.
  posts: [...seed.POSTS],
  postComments: [...seed.POST_COMMENTS],
  follows: [...seed.FOLLOWS],
  promoVideos: [...seed.PROMO_VIDEOS],
};

/** Restores the seed. Used between tests so one cannot leak into the next. */
export function resetStore(): void {
  db.companies = [...seed.COMPANIES];
  db.users = [...seed.COMPANY_USERS];
  db.mountains = [...seed.MOUNTAINS];
  db.access = [...seed.COMPANY_MOUNTAINS];
  db.treks = [...seed.TREKS];
  db.trekAccess = [...seed.COMPANY_TREKS];
  db.placements = [...seed.PLACEMENTS];
  db.products = seed.PRODUCTS.map((p) => ({ ...p }));
  db.departures = seed.DEPARTURES.map((d) => ({ ...d }));
  db.versions = seed.VERSIONS.map((v) => ({ ...v }));
  db.conversations = seed.CONVERSATIONS.map((c) => ({ ...c }));
  db.messages = [...seed.MESSAGES];
  db.notes = [...seed.NOTES];
  db.leads = seed.LEADS.map((l) => ({ ...l }));
  db.leadNotes = [...seed.LEAD_NOTES];
  db.bookings = [...seed.BOOKINGS];
  db.notifications = seed.NOTIFICATIONS.map((n) => ({ ...n }));
  db.events = [...seed.EVENTS];
  db.media = [...seed.MEDIA_ASSETS];
  db.posts = seed.POSTS.map((p) => ({ ...p }));
  db.postComments = [...seed.POST_COMMENTS];
  db.follows = [...seed.FOLLOWS];
  db.promoVideos = seed.PROMO_VIDEOS.map((s) => ({ ...s }));
}

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

const deny = <T>(reason: string): WriteResult<T> => ({ ok: false, reason });
const ok = <T>(value: T): WriteResult<T> => ({ ok: true, value });

const DENY_OTHER_COMPANY = "That belongs to another company.";
const DENY_ROLE = "Only a Company Admin can change published content.";
const DENY_MOUNTAIN = "Icefall has not assigned that mountain to your company.";

/* -------------------------------------------------------------------------- */
/* Scoping helpers — the shape that prevents the leak                         */
/* -------------------------------------------------------------------------- */

/**
 * The only way anything in this file reads a collection.
 *
 * Written once and used everywhere so that "scoped to my company" is a single
 * decision rather than a line every method has to remember. A method that skips
 * it is conspicuous.
 */
function mine<T extends { companyId: string }>(session: Session, rows: readonly T[]): T[] {
  if (session.user.status !== "active") return [];
  return rows.filter((r) => r.companyId === session.user.companyId);
}

function myProduct(session: Session, productId: string): Product | null {
  const p = db.products.find((x) => x.id === productId) ?? null;
  return p && ownsCompany(session, p.companyId) ? p : null;
}

function myConversation(session: Session, id: string): Conversation | null {
  const c = db.conversations.find((x) => x.id === id) ?? null;
  return c && ownsCompany(session, c.companyId) ? c : null;
}

function myLead(session: Session, id: string): Lead | null {
  const l = db.leads.find((x) => x.id === id) ?? null;
  return l && ownsCompany(session, l.companyId) ? l : null;
}

/**
 * The company's own posts. `mine()` cannot serve here because the S2 `posts`
 * table has no `companyId` column — the company IS the author, so ownership is
 * `authorKind === "company" && authorId === my company`, checked through the
 * same `ownsCompany` predicate as everything else. A post authored by a
 * profile or a guide is never an operator's, whatever its id happens to match.
 */
function myPosts(session: Session): Post[] {
  return db.posts.filter(
    (p) => p.authorKind === "company" && ownsCompany(session, p.authorId),
  );
}

function myPost(session: Session, postId: string): Post | null {
  const p = db.posts.find((x) => x.id === postId) ?? null;
  return p && p.authorKind === "company" && ownsCompany(session, p.authorId) ? p : null;
}

/* -------------------------------------------------------------------------- */
/* Implementation                                                             */
/* -------------------------------------------------------------------------- */

export const memoryBackend: OperatorBackend = {
  /* ---- identity -------------------------------------------------------- */

  async signIn(email) {
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return null;
    // A disabled user does not get a session at all (spec §18).
    if (user.status === "disabled") return null;
    return { user };
  },

  async listSignInIdentities() {
    return db.users.filter((u) => u.status !== "disabled");
  },

  /* ---- company --------------------------------------------------------- */

  async getCompany(session) {
    const c: Company | undefined = db.companies.find((x) => x.id === session.user.companyId);
    return c && ownsCompany(session, c.id) ? c : null;
  },

  async getTeam(session) {
    return mine(session, db.users);
  },

  async setTeamMemberStatus(session, companyUserId, status) {
    if (!can(session, "manageStaff")) return deny(DENY_ROLE);
    const u = db.users.find((x) => x.id === companyUserId);
    if (!u || !ownsCompany(session, u.companyId)) return deny(DENY_OTHER_COMPANY);
    if (u.id === session.user.id) return deny("You cannot disable your own account.");
    const updated: CompanyUser = { ...u, status };
    db.users = db.users.map((x) => (x.id === u.id ? updated : x));
    return ok(updated);
  },

  /**
   * Writes the row and stops. No mail is dispatched here and none is queued for
   * anyone else to dispatch — there is no mail sender in the project and no
   * auth in this app, and a queue nobody drains is the silent failure the
   * screen's copy exists to prevent. See `src/screens/Team.tsx`.
   */
  async inviteTeamMember(session, input) {
    if (!can(session, "manageStaff")) return deny(DENY_ROLE);
    if (db.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
      return deny("Someone with that email address already has an account.");
    }
    const user: CompanyUser = {
      id: nextId("cu"),
      // Scope comes from the session, never from the caller — an invite cannot
      // be aimed at another company.
      companyId: session.user.companyId,
      profileId: nextId("u"),
      displayName: input.displayName.trim(),
      email: input.email.trim(),
      role: input.role,
      status: "invited",
      invitedBy: session.user.id,
      createdAt: NOW,
    };
    db.users = [...db.users, user];
    return ok(user);
  },

  /* ---- mountains ------------------------------------------------------- */

  async getAccess(session) {
    return mine(session, db.access);
  },

  async getPlacements(session) {
    return mine(session, db.placements);
  },

  async getMountains(): Promise<Mountain[]> {
    return db.mountains;
  },

  /* ---- treks ----------------------------------------------------------- */

  /**
   * Icefall's catalogue of routes. Not scoped — a catalogue is public to every
   * signed-in operator, exactly as `getMountains` is; what is scoped is which
   * of them a company may work, which is the next method.
   */
  async getTreks(): Promise<Trek[]> {
    return db.treks;
  },

  /**
   * The trek authorization boundary, scoped by session like every other read.
   * There is no companyId parameter to pass the wrong value into.
   */
  async getTrekAccess(session) {
    return mine(session, db.trekAccess);
  },

  /* ---- products -------------------------------------------------------- */

  async getProducts(session) {
    return mine(session, db.products);
  },

  async getProduct(session, productId) {
    return myProduct(session, productId);
  },

  async createProduct(session, input: NewProductInput) {
    if (!can(session, "editProducts")) return deny(DENY_ROLE);
    if (!canManageMountain(session, db.access, input.mountainId)) return deny(DENY_MOUNTAIN);
    const name = input.name.trim();
    if (!name) return deny("Give the trip a name.");
    const product: Product = {
      id: nextId("p"),
      companyId: session.user.companyId,
      kind: input.kind,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      // A new product starts as a DRAFT. Nothing an operator creates is public
      // on creation — the publication boundary applies to new records too.
      status: "draft",
      description: null,
      durationDays: null,
      difficulty: null,
      maxAltitudeM: null,
      priceFromCents: null,
      priceToCents: null,
      currency: "EUR",
      seasonality: null,
      itinerary: [],
      equipment: [],
      inclusions: [],
      exclusions: [],
      faq: [],
      mountainIds: [input.mountainId],
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    db.products = [...db.products, product];
    return ok(product);
  },

  async getDepartures(session, productId) {
    if (!myProduct(session, productId)) return [];
    return db.departures.filter((d) => d.productId === productId);
  },

  async setDepartureAvailability(session, departureId, patch) {
    const d = db.departures.find((x) => x.id === departureId);
    if (!d) return deny("That departure no longer exists.");
    if (!myProduct(session, d.productId)) return deny(DENY_OTHER_COMPANY);
    // Both roles may do this. It is an operational fact, not a marketing claim,
    // and a sales employee finding out a trip is full should be able to say so.
    if (!can(session, "manageLeads")) return deny("Your account is not active.");
    // `undefined` is "not in this patch"; `null` is the operator SAYING they do
    // not state a figure. The two must not collapse — a null that became a 0
    // would publish "sold out" on a trip with places on it.
    const updated: ProductDeparture = {
      ...d,
      availability: patch.availability ?? d.availability,
      spotsTotal: patch.spotsTotal === undefined ? d.spotsTotal : patch.spotsTotal,
      spotsLeft: patch.spotsLeft === undefined ? d.spotsLeft : patch.spotsLeft,
    };
    db.departures = db.departures.map((x) => (x.id === d.id ? updated : x));
    return ok(updated);
  },

  /* ---- the publication boundary ---------------------------------------- */

  async getVersions(session, entityType?: ContentEntityType) {
    const rows = mine(session, db.versions);
    return entityType ? rows.filter((v) => v.entityType === entityType) : rows;
  },

  async getDraftFor(session, entityType, entityId) {
    return (
      mine(session, db.versions).find(
        (v) =>
          v.entityType === entityType &&
          v.entityId === entityId &&
          (v.state === "draft" || v.state === "changes_requested"),
      ) ?? null
    );
  },

  async saveDraft(session, input: DraftInput) {
    if (!can(session, "editProducts")) return deny(DENY_ROLE);

    // The entity has to be the operator's own before anything else is checked.
    if (input.entityType === "product") {
      if (!myProduct(session, input.entityId)) return deny(DENY_OTHER_COMPANY);
    } else if (input.entityType === "company") {
      if (!ownsCompany(session, input.entityId)) return deny(DENY_OTHER_COMPANY);
    }

    const existing = db.versions.find(
      (v) =>
        v.entityType === input.entityType &&
        v.entityId === input.entityId &&
        v.companyId === session.user.companyId &&
        (v.state === "draft" || v.state === "changes_requested"),
    );

    if (existing) {
      const updated: ContentVersion = {
        ...existing,
        payload: { ...existing.payload, ...input.payload },
        updatedAt: NOW,
      };
      db.versions = db.versions.map((v) => (v.id === existing.id ? updated : v));
      return ok(updated);
    }

    const version: ContentVersion = {
      id: nextId("cv"),
      entityType: input.entityType,
      entityId: input.entityId,
      companyId: session.user.companyId,
      baseSnapshot: input.baseSnapshot,
      changedFields: Object.keys(input.payload),
      flags: [],
      payload: input.payload,
      state: "draft",
      submittedBy: null,
      submittedAt: null,
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    db.versions = [...db.versions, version];
    return ok(version);
  },

  async submitForApproval(session, versionId) {
    const v = db.versions.find((x) => x.id === versionId);
    if (!v) return deny("That draft no longer exists.");
    if (!canEditVersion(session, v)) {
      return deny(
        v.state === "pending"
          ? "This edit is already with Icefall for review."
          : DENY_OTHER_COMPANY,
      );
    }

    // Spec §18: one pending submission per entity, so two edits cannot race and
    // silently lose one. The operator is told, not overruled.
    const alreadyPending = db.versions.find(
      (x) =>
        x.entityType === v.entityType &&
        x.entityId === v.entityId &&
        x.state === "pending" &&
        x.id !== v.id,
    );
    if (alreadyPending) {
      return {
        ok: false,
        reason:
          "Another change to this item is already with Icefall. Your draft is saved — it can be submitted once that one is decided.",
        conflict: alreadyPending,
      };
    }

    // Spec §2 and §5: no customer escape routes in public-facing content. Caught
    // here rather than by a reviewer a week later.
    const textFields: Record<string, string | null | undefined> = {};
    for (const [k, val] of Object.entries(v.payload)) {
      if (typeof val === "string") textFields[k] = val;
    }
    const contact = findContactDetailsIn(textFields);
    const fields = Object.keys(contact);
    if (fields.length) {
      const labels = [...new Set(Object.values(contact).flat().map((f) => f.label))];
      return deny(
        `This edit contains ${labels.join(" and ")}. ${OPERATOR_NOTICES.NO_CONTACT_DETAILS}`,
      );
    }

    const updated: ContentVersion = {
      ...v,
      state: "pending",
      submittedBy: session.user.id,
      submittedAt: NOW,
      updatedAt: NOW,
    };
    db.versions = db.versions.map((x) => (x.id === v.id ? updated : x));
    return ok(updated);
  },

  async withdrawSubmission(session, versionId) {
    const v = db.versions.find((x) => x.id === versionId);
    if (!v) return deny("That submission no longer exists.");
    if (!ownsCompany(session, v.companyId) || !isCompanyAdmin(session)) return deny(DENY_OTHER_COMPANY);
    if (v.state !== "pending") return deny("Only a submission awaiting review can be withdrawn.");
    const updated: ContentVersion = { ...v, state: "draft", submittedAt: null, submittedBy: null, updatedAt: NOW };
    db.versions = db.versions.map((x) => (x.id === v.id ? updated : x));
    return ok(updated);
  },

  /* ---- inbox ----------------------------------------------------------- */

  async getConversations(session) {
    return mine(session, db.conversations).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  },

  async getConversation(session, id) {
    return myConversation(session, id);
  },

  async getMessages(session, conversationId) {
    if (!myConversation(session, conversationId)) return [];
    return db.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async sendMessage(session, conversationId, body) {
    const c = myConversation(session, conversationId);
    if (!c) return deny(DENY_OTHER_COMPANY);
    if (!can(session, "replyToCustomer")) return deny("Your account is not active.");
    const text = body.trim();
    if (!text) return deny("Write a message first.");

    // The same rule as published content, for the same reason: a reply that
    // moves the conversation to WhatsApp takes the booking with it, and the
    // operator loses the attribution as surely as ICEFALL does.
    const contact = findContactDetailsIn({ body: text });
    if (contact.body) {
      return deny(
        `That reply contains ${contact.body.map((f) => f.label).join(" and ")}. ${OPERATOR_NOTICES.NO_CONTACT_DETAILS}`,
      );
    }

    const message: Message = {
      id: nextId("m"),
      conversationId,
      senderId: session.user.profileId,
      senderName: session.user.displayName,
      fromCompany: true,
      body: text,
      createdAt: NOW,
    };
    db.messages = [...db.messages, message];
    db.conversations = db.conversations.map((x) =>
      x.id === conversationId ? { ...x, lastMessageAt: NOW, unread: false } : x,
    );

    // Spec §10: replying is what "Contacted" means. Recorded rather than left to
    // the operator to remember, so the pipeline reflects what actually happened.
    if (c.leadId) {
      db.leads = db.leads.map((l) =>
        l.id === c.leadId && l.status === "new"
          ? { ...l, status: "contacted" as LeadStatus, firstResponseAt: NOW }
          : l,
      );
    }
    return ok(message);
  },

  async markConversationRead(session, conversationId) {
    if (!myConversation(session, conversationId)) return;
    db.conversations = db.conversations.map((c) =>
      c.id === conversationId ? { ...c, unread: false } : c,
    );
  },

  async getNotes(session, conversationId) {
    if (!myConversation(session, conversationId)) return [];
    return db.notes.filter((n) => n.conversationId === conversationId);
  },

  async addNote(session, conversationId, body) {
    const c = myConversation(session, conversationId);
    if (!c) return deny(DENY_OTHER_COMPANY);
    const text = body.trim();
    if (!text) return deny("Write a note first.");
    const note: ConversationNote = {
      id: nextId("n"),
      conversationId,
      companyId: session.user.companyId,
      authorId: session.user.profileId,
      authorName: session.user.displayName,
      body: text,
      createdAt: NOW,
    };
    db.notes = [...db.notes, note];
    return ok(note);
  },

  /* ---- leads ----------------------------------------------------------- */

  async getLeads(session) {
    return mine(session, db.leads).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getLead(session, id) {
    return myLead(session, id);
  },

  async setLeadStatus(session, leadId, status, lostReason) {
    const l = myLead(session, leadId);
    if (!l) return deny(DENY_OTHER_COMPANY);
    if (!can(session, "manageLeads")) return deny("Your account is not active.");
    const stamp: Partial<Lead> = {};
    if (status === "contacted" && !l.firstResponseAt) stamp.firstResponseAt = NOW;
    if (status === "qualified" && !l.qualifiedAt) stamp.qualifiedAt = NOW;
    if (status === "quoted" && !l.quotedAt) stamp.quotedAt = NOW;
    if (status === "booked" && !l.bookedAt) stamp.bookedAt = NOW;
    if (status === "lost") {
      stamp.lostAt = NOW;
      stamp.lostReason = lostReason?.trim() || null;
    }
    const updated: Lead = { ...l, ...stamp, status };
    db.leads = db.leads.map((x) => (x.id === l.id ? updated : x));

    /**
     * Marking a lead Booked records a booking WITHOUT A VALUE.
     *
     * Spec §18. The operator has told us a customer booked; they have not told
     * us what it was worth, and inventing 0 would understate their own revenue
     * in the one screen they use to judge whether ICEFALL is working.
     */
    if (status === "booked" && !l.bookingId) {
      const booking: Booking = {
        id: nextId("b"),
        leadId: l.id,
        companyId: l.companyId,
        productId: l.productId,
        mountainId: l.mountainId,
        status: "confirmed" as const,
        value: { status: "pending" },
        currency: "EUR",
        bookedAt: NOW,
        startsOn: null,
        referralPctAtBooking: null,
      };
      db.bookings = [...db.bookings, booking];
      db.leads = db.leads.map((x) => (x.id === l.id ? { ...updated, bookingId: booking.id } : x));
    }
    return ok(db.leads.find((x) => x.id === l.id)!);
  },

  async assignLead(session, leadId, companyUserId) {
    const l = myLead(session, leadId);
    if (!l) return deny(DENY_OTHER_COMPANY);
    if (companyUserId) {
      const u = db.users.find((x) => x.id === companyUserId);
      if (!u || !ownsCompany(session, u.companyId)) return deny("That person is not on your team.");
      if (u.status !== "active") return deny("That account is not active.");
    }
    const updated: Lead = { ...l, ownerId: companyUserId };
    db.leads = db.leads.map((x) => (x.id === l.id ? updated : x));
    return ok(updated);
  },

  /**
   * A lead the company got themselves.
   *
   * `origin: "company"` is HARD-CODED, not taken from the input — the caller
   * has no way to spell "icefall" here, so no UI mistake and no future
   * refactor can quietly promote a self-added lead into ICEFALL's numbers.
   * `conversationId` stays null: there is no ICEFALL thread, and inventing one
   * would put a customer message box on a customer ICEFALL cannot reach.
   */
  async createLead(session, input) {
    if (!can(session, "manageLeads")) return deny("Your account is not active.");
    const name = input.customerName.trim();
    if (!name) return deny("Give the customer a name.");

    if (Object.keys(findContactDetailsIn({ customerName: name })).length > 0) {
      return deny(OPERATOR_NOTICES.NO_CONTACT_DETAILS);
    }

    if (input.productId) {
      const p = db.products.find((x) => x.id === input.productId);
      if (!p || !ownsCompany(session, p.companyId)) return deny("That trip is not yours.");
    }
    if (input.mountainId && !canManageMountain(session, db.access, input.mountainId)) {
      return deny("You are not listed on that mountain.");
    }

    const lead: Lead = {
      id: nextId("l"),
      companyId: session.user.companyId,
      customerId: nextId("cu-own"),
      customerName: name,
      conversationId: null,
      productId: input.productId,
      mountainId:
        input.mountainId ??
        (input.productId
          ? (db.products.find((x) => x.id === input.productId)?.mountainIds[0] ?? null)
          : null),
      status: "new",
      origin: "company",
      tags: normaliseTags(input.tags ?? []),
      ownerId: session.user.id,
      bookingId: null,
      source: input.source?.trim() || null,
      createdAt: NOW,
      firstResponseAt: null,
      qualifiedAt: null,
      quotedAt: null,
      bookedAt: null,
      lostAt: null,
      lostReason: null,
    };
    db.leads = [...db.leads, lead];

    const note = input.note?.trim();
    if (note) {
      db.leadNotes = [
        ...db.leadNotes,
        {
          id: nextId("ln"),
          leadId: lead.id,
          authorId: session.user.profileId,
          authorName: session.user.displayName,
          body: note,
          createdAt: NOW,
        },
      ];
    }
    return ok(lead);
  },

  async setLeadTags(session, leadId, tags) {
    const l = myLead(session, leadId);
    if (!l) return deny(DENY_OTHER_COMPANY);
    if (!can(session, "manageLeads")) return deny("Your account is not active.");
    /*
     * A tag is a label, not a message. It is refused the same contact-detail
     * check the rest of the app applies, because "call me 07…" typed into a
     * tag is the same escape route as typing it into a note.
     */
    const cleaned = normaliseTags(tags);
    const hits = findContactDetailsIn(Object.fromEntries(cleaned.map((t, i) => [`tag${i}`, t])));
    if (Object.keys(hits).length > 0) return deny(OPERATOR_NOTICES.NO_CONTACT_DETAILS);
    const updated: Lead = { ...l, tags: cleaned };
    db.leads = db.leads.map((x) => (x.id === l.id ? updated : x));
    return ok(updated);
  },

  async getLeadNotes(session, leadId) {
    if (!myLead(session, leadId)) return [];
    return db.leadNotes.filter((n) => n.leadId === leadId);
  },

  async addLeadNote(session, leadId, body) {
    if (!myLead(session, leadId)) return deny(DENY_OTHER_COMPANY);
    const text = body.trim();
    if (!text) return deny("Write a note first.");
    const note: LeadNote = {
      id: nextId("ln"),
      leadId,
      authorId: session.user.profileId,
      authorName: session.user.displayName,
      body: text,
      createdAt: NOW,
    };
    db.leadNotes = [...db.leadNotes, note];
    return ok(note);
  },

  async getBookings(session) {
    return mine(session, db.bookings);
  },

  /* ---- social (OP-01, via S2) ------------------------------------------ */
  /*
   * THE S2 TABLES ARE NOT LIVE. These methods run against the in-memory rows
   * above, in the contract's exact shapes, so the Supabase implementation is a
   * repoint — the route `leads.tags` took. See the block comment on the
   * interface in `../adapter.ts`.
   */

  /**
   * Newest first — the feed is strictly chronological, and so is the
   * company's own view of it. Removed posts and expired stories are RETURNED,
   * not filtered: the operator is owed the removal reason, and story expiry is
   * derived from the app clock by the screen, never resolved by dropping rows.
   */
  async getPosts(session) {
    return myPosts(session).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createPost(session, input) {
    // Posting IS publishing company content — same permission as the profile.
    if (!can(session, "editCompanyProfile")) return deny(DENY_ROLE);

    const caption = input.caption.trim();
    if (!caption) return deny("Write a caption first.");

    /*
     * A caption is OPERATOR-AUTHORED PUBLIC TEXT, and there is no reviewer
     * between it and a climber's feed — a post is public the moment this
     * method succeeds. So the contact-details rule is BLOCKING here, exactly
     * as it is for a customer reply and for the same reason: advisory would
     * mean not enforced.
     */
    const contact = findContactDetailsIn({ caption });
    if (contact.caption) {
      return deny(
        `That caption contains ${contact.caption.map((f) => f.label).join(" and ")}. ${OPERATOR_NOTICES.NO_CONTACT_DETAILS}`,
      );
    }

    /*
     * A STORY IS A POST WITH AN EXPIRY. The expiry is checked against the app
     * clock (`NOW`, the fixed constant — never `new Date()`): a story that is
     * already over cannot be published, because publishing it would create a
     * row every feed immediately hides, which is a write that lies.
     */
    if (input.expiresAt) {
      const t = Date.parse(input.expiresAt);
      if (Number.isNaN(t)) return deny("That story expiry is not a valid time.");
      if (t <= Date.parse(NOW)) {
        return deny("A story's expiry is already in the past. Pick a time after now, or post it without an expiry.");
      }
    }

    // A media reference must be real, and must be the company's to use.
    const media = input.media;
    if (media) {
      if (media.source === "asset") {
        const asset = db.media.find((m) => m.id === media.mediaId);
        if (!asset || !ownsCompany(session, asset.companyId)) return deny(DENY_OTHER_COMPANY);
        if (asset.state !== "approved") {
          return deny("That image has not been approved by Icefall yet, so it cannot appear in a public post.");
        }
      } else if (media.source === "peak") {
        if (!db.mountains.some((m) => m.id === media.mountainId)) {
          return deny("That mountain is not in Icefall's catalogue.");
        }
      } else if (!db.treks.some((t) => t.id === media.trekId)) {
        return deny("That route is not in Icefall's catalogue.");
      }
    }

    const post: Post = {
      id: nextId("po"),
      authorKind: "company",
      // Scope from the session, never the caller — a post cannot be authored
      // onto another company.
      authorId: session.user.companyId,
      caption,
      media: input.media,
      expiresAt: input.expiresAt ?? null,
      createdAt: NOW,
      // Public on creation; removable by Icefall later. No pending state,
      // because nothing reviews one — moderation is the CRM's queue (CR-17).
      removedAt: null,
      removedReason: null,
    };
    db.posts = [...db.posts, post];
    return ok(post);
  },

  async deletePost(session, postId) {
    const p = myPost(session, postId);
    if (!p) return deny(DENY_OTHER_COMPANY);
    if (!can(session, "editCompanyProfile")) return deny(DENY_ROLE);
    /*
     * THE REMOVAL RECORD SURVIVES. A post Icefall removed is a moderation
     * fact about this company, and letting the company delete the row would
     * let it erase the trail. The refusal carries the standing reason.
     */
    if (p.removedAt !== null) {
      return deny(
        "Icefall removed this post, and the removal record stays. If you believe the decision is wrong, take it up with your Icefall contact.",
      );
    }
    db.posts = db.posts.filter((x) => x.id !== p.id);
    db.postComments = db.postComments.filter((c) => c.postId !== p.id);
    return ok(p);
  },

  async getPostComments(session, postId) {
    if (!myPost(session, postId)) return [];
    return db.postComments
      .filter((c) => c.postId === postId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  /**
   * COUNTED from `follows` rows — real arithmetic over the seeded demo world,
   * never a stored total and never a literal in a component. `measured`
   * because counting rows we hold is a measurement; when no one follows, zero
   * IS the honest figure, unlike the view counts nothing emits.
   */
  async getFollowerCount(session) {
    return measured(mine(session, db.follows).length);
  },

  /**
   * The SOCIAL surface's slot (OP-01) — not `Company.video`, which decision
   * #15 removed and which stays removed. See `PromoVideoSlot` in `types.ts`.
   */
  async getPromoVideo(session): Promise<PromoVideo> {
    const slot = db.promoVideos.find((s) => ownsCompany(session, s.companyId));
    // "No video" is a state, not an error — the closed union's explicit none.
    return slot?.video ?? { source: "none" };
  },

  async setPromoVideo(session, input) {
    if (!can(session, "editCompanyProfile")) return deny(DENY_ROLE);

    const cleared: PromoVideo = { source: "none" };
    if (input === null || input.trim() === "") {
      // Clearing is allowed, and is a choice the record can represent.
      db.promoVideos = db.promoVideos.filter((s) => s.companyId !== session.user.companyId);
      return ok(cleared);
    }

    // The same definition the form field uses — see the import note above.
    const id = youtubeIdFrom(input);
    if (!id) {
      return deny("That is not a YouTube link or video id. Paste the watch link, the share link, or the id itself.");
    }

    const video: PromoVideo = { source: "youtube", youtubeId: id };
    const existing = db.promoVideos.find((s) => s.companyId === session.user.companyId);
    db.promoVideos = existing
      ? db.promoVideos.map((s) => (s.companyId === session.user.companyId ? { ...s, video } : s))
      : [...db.promoVideos, { companyId: session.user.companyId, video }];
    return ok(video);
  },

  /* ---- dashboard and analytics ----------------------------------------- */

  async getDashboard(session): Promise<DashboardSummary> {
    const leads = mine(session, db.leads);
    const conversations = mine(session, db.conversations);
    const versions = mine(session, db.versions);
    const scored = icefallOnly(leads);
    const current = scored.filter((l) => l.createdAt.slice(0, 10) >= "2026-08-01");
    const prior = scored.filter(
      (l) => l.createdAt.slice(0, 10) >= "2026-07-01" && l.createdAt.slice(0, 10) < "2026-08-01",
    );
    const priorFunnel = funnelFor(prior);
    return {
      newEnquiries: conversations.filter((c) => c.unread).length,
      qualifiedLeads: scored.filter((l) => l.status === "qualified").length,
      bookings: icefallBookings(session).length,
      pendingChanges: versions.filter((v) => v.state === "pending" || v.state === "draft").length,
      views: viewsReading(session),
      funnel: funnelFor(current),
      enquiriesBySource: bySource(current),
      // Null rather than zeroes when the earlier window holds nothing: "no
      // change" and "nothing to compare against" are different statements, and
      // a delta computed against nothing is not a delta.
      previous: priorFunnel.enquiries + priorFunnel.qualified + priorFunnel.bookings > 0 ? priorFunnel : null,
      rangeLabel: "1 – 28 Aug 2026",
      previousRangeLabel: "1 – 31 Jul 2026",
    };
  },

  /**
   * Daily counts for the Performance Overview chart.
   *
   * Three series, not the mockup's four. Views is absent because nothing
   * measures it — and a line on a chart is a stronger claim than a number in a
   * tile, since its shape implies a trend somebody could act on.
   */
  async getTrend(session, days): Promise<TrendPoint[]> {
    const leads = mine(session, db.leads);
    const end = Date.parse(`${NOW.slice(0, 10)}T00:00:00Z`);
    const out: TrendPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
      const on = (iso: string | null) => iso !== null && iso.slice(0, 10) === d;
      out.push({
        day: d,
        label: formatDayShort(d),
        enquiries: leads.filter((l) => on(l.createdAt)).length,
        qualified: leads.filter((l) => on(l.qualifiedAt)).length,
        bookings: leads.filter((l) => on(l.bookedAt)).length,
      });
    }
    return out;
  },

  /**
   * The dev-server path for an asset this company owns.
   *
   * Only `approved` assets resolve. A pending or rejected mark must not appear
   * on a preview of the published page — that preview's whole job is to show
   * what a climber sees, and a climber never sees an unapproved asset.
   */
  async getMediaUrl(session, mediaId) {
    if (!mediaId) return null;
    const asset = db.media.find((m) => m.id === mediaId);
    if (!asset || !ownsCompany(session, asset.companyId)) return null;
    if (asset.state !== "approved") return null;
    // The seed's storagePath is `<company>/<owner>/<file>`; this app serves the
    // file itself from /img/companies. The Supabase implementation signs the
    // storagePath instead — same method, same contract, different mechanism.
    const file = asset.storagePath.split("/").pop();
    return file ? `/img/companies/${file}` : null;
  },

  async getProductPerformance(session): Promise<ProductPerformance[]> {
    const leads = mine(session, db.leads);
    return mine(session, db.products)
      .map((p) => {
        const forProduct = leads.filter((l) => l.productId === p.id);
        const bookings = forProduct.filter((l) => l.bookedAt !== null).length;
        return {
          productId: p.id,
          name: p.name,
          kind: p.kind,
          enquiries: forProduct.length,
          qualified: forProduct.filter((l) => l.qualifiedAt !== null).length,
          bookings,
          // Demo-flagged (owner decision 18); the honest absence when off.
          views: listingViews(p.id, forProduct.length, session),
          conversion: conversionRate(bookings, forProduct.length),
        };
      })
      // Ranked by enquiries, because that is what we can count. The mockup ranks
      // by views; ranking by a figure we do not have would be an invented order.
      .sort((a, b) => b.enquiries - a.enquiries);
  },

  /**
   * Everything on this method is MEASURED. No views, no estimates.
   *
   * It reads the stamps the pipeline writes — when a lead arrived, when it was
   * first answered, when it qualified, when it booked, why it was lost — and
   * reports medians over the rows that actually have them. A median over an
   * empty set is `Unavailable`, never 0.
   *
   * Company-origin leads are INCLUDED here, unlike the scorecard: this screen
   * is the operator judging their own sales work, and their own referrals are
   * part of that. The two ICEFALL-attribution figures stay in `getAnalytics`.
   */
  async getInsights(session, window): Promise<OperatorInsights> {
    const cutoff = window === "week" ? "2026-08-21" : "2026-07-28";
    const leads = mine(session, db.leads).filter((l) => l.createdAt.slice(0, 10) >= cutoff);
    const products = mine(session, db.products);
    const bookings = mine(session, db.bookings);

    /* ---- speed -------------------------------------------------------- */
    const responseHours = leads
      .filter((l) => l.firstResponseAt !== null)
      .map((l) => hoursBetween(l.createdAt, l.firstResponseAt!));
    const daysToBook = leads
      .filter((l) => l.bookedAt !== null)
      .map((l) => hoursBetween(l.createdAt, l.bookedAt!) / 24);

    /* ---- drop-off ------------------------------------------------------ */
    const total = leads.length;
    const reachedCounts: readonly [string, string, number][] = [
      ["enquired", "Enquired", total],
      ["contacted", "Replied to", leads.filter((l) => l.firstResponseAt !== null).length],
      ["qualified", "Interested", leads.filter((l) => l.qualifiedAt !== null).length],
      ["quoted", "Quoted", leads.filter((l) => l.quotedAt !== null).length],
      ["booked", "Booked", leads.filter((l) => l.bookedAt !== null).length],
    ];
    const stageReach: StageReach[] = reachedCounts.map(([stage, label, reached]) => ({
      stage,
      label,
      reached,
      share: total > 0 ? measured(reached / total) : unavailable(OPERATOR_NOTICES.NO_LEADS_IN_WINDOW),
    }));

    /* ---- why they go --------------------------------------------------- */
    const lostTally = new Map<string, number>();
    for (const l of leads) {
      if (l.status !== "lost") continue;
      // A lost lead with no reason recorded is its own honest category. It is
      // NOT folded into "other", because "we did not write it down" is a fact
      // about the company's process and worth seeing.
      const reason = l.lostReason?.trim() || "No reason recorded";
      lostTally.set(reason, (lostTally.get(reason) ?? 0) + 1);
    }
    const lostReasons = [...lostTally.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

    /* ---- channel quality ----------------------------------------------- */
    const sourceTally = new Map<string, { e: number; q: number; b: number }>();
    for (const l of leads) {
      const key = l.source ?? "Not recorded";
      const row = sourceTally.get(key) ?? { e: 0, q: 0, b: 0 };
      row.e += 1;
      if (l.qualifiedAt !== null) row.q += 1;
      if (l.bookedAt !== null) row.b += 1;
      sourceTally.set(key, row);
    }
    const sourceQuality: SourceQuality[] = [...sourceTally.entries()]
      .map(([source, r]) => ({
        source,
        enquiries: r.e,
        qualified: r.q,
        bookings: r.b,
        conversion: conversionRate(r.b, r.e),
      }))
      .sort((a, b) => b.enquiries - a.enquiries || a.source.localeCompare(b.source));

    /* ---- mountains ------------------------------------------------------ */
    const myMountainIds = db.access
      .filter((a) => ownsCompany(session, a.companyId) && a.status === "active")
      .map((a) => a.mountainId);
    const byMountain: MountainPerformance[] = myMountainIds
      .map((id) => {
        const m = db.mountains.find((x) => x.id === id);
        const forMountain = leads.filter((l) => l.mountainId === id);
        /*
         * BOOKED COUNTS BOOKINGS, NOT LEADS THAT ONCE PASSED THROUGH BOOKED.
         *
         * The first version counted leads carrying a `bookedAt` stamp, which
         * put a cancelled booking in a column headed "Booked" and sat it next
         * to a revenue figure drawn from a different set entirely — so one row
         * could read "Booked 1" beside "Nothing booked in this period yet".
         * Both numbers were defensible alone and together they were nonsense.
         * Booked and Revenue now come from the same rows.
         *
         * Cancelled is excluded: a cancellation is not a booking a company has.
         */
        const live = bookings.filter((b) => b.mountainId === id && b.status !== "cancelled");
        const confirmed = live.filter((b) => b.status === "confirmed" || b.status === "completed");
        const withValue = confirmed.filter((b) => b.value.status === "reported");
        const reported = withValue.reduce(
          (sum, b) => sum + (b.value.status === "reported" ? b.value.cents : 0),
          0,
        );
        const revenue =
          withValue.length > 0
            ? measured(reported)
            : confirmed.length > 0
              ? unavailable(OPERATOR_NOTICES.BOOKING_VALUE_NOT_REPORTED)
              : live.length > 0
                ? unavailable(OPERATOR_NOTICES.bookingsNotConfirmed(live.length))
                : unavailable(OPERATOR_NOTICES.NO_BOOKINGS_YET);
        return {
          mountainId: id,
          name: m?.name ?? id,
          products: products.filter((p) => p.mountainIds.includes(id)).length,
          enquiries: forMountain.length,
          qualified: forMountain.filter((l) => l.qualifiedAt !== null).length,
          bookings: live.length,
          conversion: conversionRate(live.length, forMountain.length),
          views: listingViews(`mountain:${id}`, forMountain.length, session),
          revenue,
        };
      })
      .sort((a, b) => b.enquiries - a.enquiries || a.name.localeCompare(b.name));

    /* ---- the team ------------------------------------------------------- */
    const byOwner: OwnerPerformance[] = mine(session, db.users)
      .map((u) => {
        const theirs = leads.filter((l) => l.ownerId === u.id);
        const answered = theirs
          .filter((l) => l.firstResponseAt !== null)
          .map((l) => hoursBetween(l.createdAt, l.firstResponseAt!));
        return {
          companyUserId: u.id,
          name: u.displayName,
          active: u.status === "active",
          open: theirs.filter((l) => l.status !== "booked" && l.status !== "lost").length,
          booked: theirs.filter((l) => l.bookedAt !== null).length,
          medianResponseHours:
            answered.length > 0
              ? measured(median(answered))
              : unavailable(OPERATOR_NOTICES.NO_REPLIES_YET),
        };
      })
      .sort((a, b) => b.booked - a.booked || b.open - a.open);

    return {
      medianResponseHours:
        responseHours.length > 0
          ? measured(median(responseHours))
          : unavailable(OPERATOR_NOTICES.NO_REPLIES_YET),
      slowestResponseHours:
        responseHours.length > 0
          ? measured(Math.max(...responseHours))
          : unavailable(OPERATOR_NOTICES.NO_REPLIES_YET),
      awaitingFirstReply: leads.filter((l) => l.firstResponseAt === null && l.status !== "lost").length,
      medianDaysToBook:
        daysToBook.length > 0
          ? measured(median(daysToBook))
          : unavailable(OPERATOR_NOTICES.NO_BOOKINGS_YET),
      stageReach,
      lostReasons,
      sourceQuality,
      byMountain,
      byOwner,
    };
  },

  async getAnalytics(session, window): Promise<AnalyticsSummary> {
    const leads = mine(session, db.leads);
    const cutoff = window === "week" ? "2026-08-21" : "2026-07-28";
    const priorCutoff = window === "week" ? "2026-08-14" : "2026-06-28";

    const scored = icefallOnly(leads);
    const inWindow = scored.filter((l) => l.createdAt.slice(0, 10) >= cutoff);
    const current = funnelFor(inWindow);
    const prior = funnelFor(
      scored.filter((l) => l.createdAt.slice(0, 10) >= priorCutoff && l.createdAt.slice(0, 10) < cutoff),
    );
    /*
     * Revenue counts CONFIRMED and COMPLETED bookings only. A cancelled
     * booking's value is not revenue, and a pending one is not revenue YET —
     * summing either would state earnings the company does not have.
     */
    const gmv = estimatedGmv(
      icefallBookings(session)
        .filter((b) => b.status === "confirmed" || b.status === "completed")
        .map((b) => b.value),
    );

    return {
      views: viewsReading(session),
      funnel: current,
      enquiriesBySource: bySource(inWindow),
      conversionRate: conversionRate(current.bookings, current.enquiries),
      estimatedGmv: gmv.total,
      gmvExcludedCount: gmv.excluded,
      previous: prior.enquiries + prior.qualified + prior.bookings > 0 ? prior : null,
    };
  },

  /* ---- notifications --------------------------------------------------- */

  async getNotifications(session) {
    return db.notifications
      .filter((n) => n.companyUserId === session.user.id && ownsCompany(session, n.companyId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async markNotificationRead(session, id) {
    db.notifications = db.notifications.map((n) =>
      n.id === id && n.companyUserId === session.user.id ? { ...n, readAt: NOW } : n,
    );
  },
};

/* -------------------------------------------------------------------------- */
/* Measurement                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Enquiries by channel, COUNTED from the same rows every other figure on the
 * screen is counted from — so the donut's segments always sum to the enquiry
 * tile. A lead with no recorded source is grouped under "other" rather than
 * dropped, because dropping it would make the segments quietly disagree with
 * the total.
 */
function bySource(leads: readonly Lead[]): SourceCount[] {
  const counts = new Map<string, number>();
  for (const l of leads) {
    const key = l.source ?? "other";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

/**
 * THE SCORECARD COUNTS ICEFALL'S WORK ONLY.
 *
 * Dashboard and Analytics exist to answer one question — "is ICEFALL earning
 * its keep" — so a lead the operator typed in themselves must not appear in
 * them. Letting a busy month of referrals lift the ICEFALL enquiry count would
 * flatter us with the company's own effort, which is the exact failure the
 * honesty doctrine is for. The pipeline screen shows everything; these do not.
 */
function hoursBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 3_600_000;
}

/** True median — the average of the middle two on an even count. */
function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/**
 * Views for one listing.
 *
 * There is no view instrumentation anywhere in the ICEFALL family, so this is
 * the demo figure or nothing — never a zero, which would read as "nobody
 * looked" rather than "we are not counting".
 */
function listingViews(id: string, enquiries: number, session: Session): Reading<number> {
  const demo = demoListingViews(id, enquiries);
  return demo === null ? viewsReading(session) : measured(demo);
}

function icefallBookings(session: Session) {
  const own = new Set(
    mine(session, db.leads).filter((l) => l.origin === "company").map((l) => l.id),
  );
  // A booking with no lead predates this split and stays ICEFALL's, as it was.
  return mine(session, db.bookings).filter((b) => !b.leadId || !own.has(b.leadId));
}

function icefallOnly(leads: readonly Lead[]): Lead[] {
  return leads.filter((l) => l.origin === "icefall");
}

function funnelFor(leads: readonly Lead[]): FunnelCounts {
  const reached = (l: Lead, stage: "qualified" | "booked") =>
    stage === "qualified" ? l.qualifiedAt !== null : l.bookedAt !== null;
  return {
    enquiries: leads.length,
    qualified: leads.filter((l) => reached(l, "qualified")).length,
    bookings: leads.filter((l) => reached(l, "booked")).length,
  };
}

/**
 * Views, honestly.
 *
 * Counts real `listing_view` events and returns `Unavailable` when there are
 * none — because there is no instrumentation anywhere in the ICEFALL family
 * emitting them, so zero rows means "not measured", not "nobody looked".
 *
 * The distinction is the whole point. An operator deciding whether paid
 * placement is worth renewing would read a zero as an audience measurement and
 * conclude ICEFALL sends them nobody. That would be a decision made on a number
 * we invented, which is the same failure as an athlete reading a fabricated
 * readiness score.
 *
 * When the consumer apps start emitting these events this function needs no
 * change: it will simply start returning a figure.
 */
function viewsReading(session: Session) {
  const mineOnly = db.events.filter(
    (e) => e.companyId === session.user.companyId && e.eventType === "listing_view",
  );
  /**
   * ONLY SERVER-EMITTED ROWS COUNT.
   *
   * A `client` row is written with the public anon key, so the company this
   * figure flatters could write its own. Counting those would put a number an
   * operator can inflate on the screen they use to justify renewing — which is
   * the fabricated-metric failure wearing a measurement's clothes.
   *
   * Client rows are fine for product analytics, where being roughly right is
   * enough and nobody is spending money on the answer. This is not that screen.
   */
  const trusted = mineOnly.filter((e) => e.source === "server");
  if (trusted.length > 0) return measured(trusted.length);
  return unavailable(
    mineOnly.length > 0
      ? OPERATOR_NOTICES.VIEWS_CLIENT_ONLY
      : OPERATOR_NOTICES.VIEWS_NOT_COUNTED,
  );
}

export { db as __store };
