/**
 * The offline implementation of `OperatorBackend`.
 *
 * Reached only when `VITE_ICEFALL_OFFLINE=1`. It satisfies the same seam every
 * screen already talks to, so no screen knows the difference — which is the
 * point of the seam existing at all.
 *
 * THREE RULES IT KEEPS.
 *
 *   1. NOTHING LEAVES THE MACHINE. No client is constructed, no fetch is made.
 *      Every read resolves from `fixtures.ts` synchronously and is wrapped in a
 *      resolved promise only because the interface is async.
 *
 *   2. WRITES ARE ACCEPTED, NEVER REFUSED. A demo on a plane must respond when
 *      it is clicked. Mutations land in the module-level store below and are
 *      lost on reload, which is the correct amount of persistence for data that
 *      is openly invented. The authorization refusals the real backend issues
 *      are not modelled here: offline there is one company, one signed-in admin
 *      and nothing to protect.
 *
 *   3. THE HONESTY RULES ARE NOT RELAXED. The derived figures below are worked
 *      out from the fixture rows exactly as the real backend works them out
 *      from real ones — funnels counted, medians over the rows that have
 *      stamps, `Unavailable` where there is nothing to divide by, and views
 *      still not counted, because nothing in the Icefall family emits a view
 *      event whether the laptop is on a plane or not.
 */

import type {
  AnalyticsSummary,
  DashboardSummary,
  DraftInput,
  MountainPerformance,
  NewProductInput,
  OperatorBackend,
  OperatorInsights,
  OwnerPerformance,
  ProductPerformance,
  SourceCount,
  SourceQuality,
  StageReach,
  TrendPoint,
  WriteResult,
} from "@/domain/adapter";
import type { Session } from "@/domain/authz";
import { formatDayShort, NOW } from "@/domain/dates";
import { demoListingViews } from "@/domain/demo";
import {
  conversionRate,
  estimatedGmv,
  measured,
  OPERATOR_NOTICES,
  unavailable,
  type Reading,
} from "@/domain/honesty";
import type {
  Booking,
  CompanyUser,
  ContentEntityType,
  ContentVersion,
  Conversation,
  ConversationNote,
  FunnelCounts,
  Lead,
  LeadNote,
  LeadStatus,
  Message,
  Product,
  ProductDeparture,
} from "@/domain/types";
import * as fx from "./fixtures";

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

const db = {
  users: fx.USERS.map((u) => ({ ...u })),
  company: { ...fx.COMPANY },
  mountains: [...fx.MOUNTAINS],
  access: [...fx.ACCESS],
  placements: [...fx.PLACEMENTS],
  products: fx.PRODUCTS.map((p) => ({ ...p })),
  departures: fx.DEPARTURES.map((d) => ({ ...d })),
  versions: fx.VERSIONS.map((v) => ({ ...v })),
  conversations: fx.CONVERSATIONS.map((c) => ({ ...c })),
  messages: [...fx.MESSAGES],
  notes: [...fx.NOTES],
  leads: fx.LEADS.map((l) => ({ ...l })),
  leadNotes: [...fx.LEAD_NOTES],
  bookings: [...fx.BOOKINGS],
  notifications: fx.NOTIFICATIONS.map((n) => ({ ...n })),
};

/** The demo identity. An admin, so no route in the portal is gated away. */
export const OFFLINE_SESSION: Session = {
  user: db.users.find((u) => u.id === fx.DEMO_USER_ID) ?? db.users[0]!,
};

let counter = 0;
const nextId = (prefix: string) => `${prefix}-off-${++counter}`;
const ok = <T>(value: T): WriteResult<T> => ({ ok: true, value });

/* -------------------------------------------------------------------------- */
/* Derivation — the same arithmetic the real backend does                     */
/* -------------------------------------------------------------------------- */

const icefallOnly = (leads: readonly Lead[]): Lead[] => leads.filter((l) => l.origin === "icefall");

function funnelFor(leads: readonly Lead[]): FunnelCounts {
  return {
    enquiries: leads.length,
    qualified: leads.filter((l) => l.qualifiedAt !== null).length,
    bookings: leads.filter((l) => l.bookedAt !== null).length,
  };
}

/** Counted from the same rows as the tiles, so the donut always sums to them. */
function bySource(leads: readonly Lead[]): SourceCount[] {
  const counts = new Map<string, number>();
  for (const l of leads) counts.set(l.source ?? "other", (counts.get(l.source ?? "other") ?? 0) + 1);
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

const hoursBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 3_600_000;

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/**
 * Views, and why there are none.
 *
 * Offline changes nothing about this: no surface in the Icefall family emits a
 * listing-view event, so the honest answer is the sentence, not a zero. The
 * demo figure the owner asked for is applied at the display layer by
 * `domain/demo.ts`, exactly as it is online.
 */
const viewsReading = (): Reading<number> => unavailable(OPERATOR_NOTICES.VIEWS_NOT_COUNTED);

function listingViews(id: string, enquiries: number): Reading<number> {
  const demo = demoListingViews(id, enquiries);
  return demo === null ? viewsReading() : measured(demo);
}

/** Bookings that are Icefall's — a lead the company typed in is not ours. */
function icefallBookings(): Booking[] {
  const own = new Set(db.leads.filter((l) => l.origin === "company").map((l) => l.id));
  return db.bookings.filter((b) => !b.leadId || !own.has(b.leadId));
}

/* -------------------------------------------------------------------------- */
/* The backend                                                                */
/* -------------------------------------------------------------------------- */

export const offlineBackend: OperatorBackend = {
  /* ---- identity -------------------------------------------------------- */

  async signIn() {
    // There is one identity offline and it is already signed in. This never
    // returns null, so nothing can bounce the demo to a sign-in screen.
    return OFFLINE_SESSION;
  },

  async listSignInIdentities() {
    return db.users.filter((u) => u.status !== "disabled");
  },

  /* ---- company --------------------------------------------------------- */

  async getCompany() {
    return db.company;
  },

  async getTeam() {
    return db.users;
  },

  async setTeamMemberStatus(_session, companyUserId, status) {
    const u = db.users.find((x) => x.id === companyUserId);
    if (!u) return ok(db.users[0]!);
    const updated: CompanyUser = { ...u, status };
    db.users = db.users.map((x) => (x.id === u.id ? updated : x));
    return ok(updated);
  },

  async inviteTeamMember(_session, input) {
    const user: CompanyUser = {
      id: nextId("cu"),
      companyId: fx.CO,
      profileId: nextId("u"),
      displayName: input.displayName.trim() || "New teammate",
      email: input.email.trim(),
      role: input.role,
      status: "invited",
      invitedBy: OFFLINE_SESSION.user.id,
      createdAt: NOW,
    };
    db.users = [...db.users, user];
    return ok(user);
  },

  /* ---- mountains ------------------------------------------------------- */

  async getAccess() {
    return db.access;
  },

  async getPlacements() {
    return db.placements;
  },

  async getMountains() {
    return db.mountains;
  },

  /* ---- products -------------------------------------------------------- */

  async getProducts() {
    return db.products;
  },

  async getProduct(_session, productId) {
    return db.products.find((p) => p.id === productId) ?? null;
  },

  async createProduct(_session, input: NewProductInput) {
    const name = input.name.trim() || "Untitled trip";
    const product: Product = {
      id: nextId("p"),
      companyId: fx.CO,
      kind: input.kind,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
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

  async getDepartures(_session, productId) {
    return db.departures.filter((d) => d.productId === productId);
  },

  async setDepartureAvailability(_session, departureId, patch) {
    const d = db.departures.find((x) => x.id === departureId);
    if (!d) return ok(db.departures[0]!);
    const updated: ProductDeparture = {
      ...d,
      availability: patch.availability ?? d.availability,
      spotsLeft: patch.spotsLeft === undefined ? d.spotsLeft : patch.spotsLeft,
    };
    db.departures = db.departures.map((x) => (x.id === d.id ? updated : x));
    return ok(updated);
  },

  /* ---- the publication boundary ---------------------------------------- */

  async getVersions(_session, entityType?: ContentEntityType) {
    return entityType ? db.versions.filter((v) => v.entityType === entityType) : db.versions;
  },

  async getDraftFor(_session, entityType, entityId) {
    return (
      db.versions.find(
        (v) =>
          v.entityType === entityType &&
          v.entityId === entityId &&
          (v.state === "draft" || v.state === "changes_requested"),
      ) ?? null
    );
  },

  async saveDraft(_session, input: DraftInput) {
    const existing = db.versions.find(
      (v) =>
        v.entityType === input.entityType &&
        v.entityId === input.entityId &&
        (v.state === "draft" || v.state === "changes_requested"),
    );
    if (existing) {
      const updated: ContentVersion = {
        ...existing,
        payload: { ...existing.payload, ...input.payload },
        changedFields: [...new Set([...existing.changedFields, ...Object.keys(input.payload)])],
        updatedAt: NOW,
      };
      db.versions = db.versions.map((v) => (v.id === existing.id ? updated : v));
      return ok(updated);
    }
    const version: ContentVersion = {
      id: nextId("cv"),
      entityType: input.entityType,
      entityId: input.entityId,
      companyId: fx.CO,
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

  async submitForApproval(_session, versionId) {
    const v = db.versions.find((x) => x.id === versionId);
    if (!v) return ok(db.versions[0]!);
    const updated: ContentVersion = {
      ...v,
      state: "pending",
      submittedBy: OFFLINE_SESSION.user.id,
      submittedAt: NOW,
      updatedAt: NOW,
    };
    db.versions = db.versions.map((x) => (x.id === v.id ? updated : x));
    return ok(updated);
  },

  async withdrawSubmission(_session, versionId) {
    const v = db.versions.find((x) => x.id === versionId);
    if (!v) return ok(db.versions[0]!);
    const updated: ContentVersion = {
      ...v,
      state: "draft",
      submittedAt: null,
      submittedBy: null,
      updatedAt: NOW,
    };
    db.versions = db.versions.map((x) => (x.id === v.id ? updated : x));
    return ok(updated);
  },

  /* ---- inbox ----------------------------------------------------------- */

  async getConversations() {
    return [...db.conversations].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  },

  async getConversation(_session, id) {
    return db.conversations.find((c) => c.id === id) ?? null;
  },

  async getMessages(_session, conversationId) {
    return db.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async sendMessage(_session, conversationId, body) {
    const text = body.trim();
    const message: Message = {
      id: nextId("m"),
      conversationId,
      senderId: OFFLINE_SESSION.user.profileId,
      senderName: OFFLINE_SESSION.user.displayName,
      fromCompany: true,
      body: text,
      createdAt: NOW,
    };
    db.messages = [...db.messages, message];
    const conversation: Conversation | undefined = db.conversations.find((c) => c.id === conversationId);
    db.conversations = db.conversations.map((c) =>
      c.id === conversationId ? { ...c, lastMessageAt: NOW, unread: false } : c,
    );
    // Replying is what "Contacted" means, here as everywhere else.
    if (conversation?.leadId) {
      db.leads = db.leads.map((l) =>
        l.id === conversation.leadId && l.status === "new"
          ? { ...l, status: "contacted" as LeadStatus, firstResponseAt: NOW }
          : l,
      );
    }
    return ok(message);
  },

  async markConversationRead(_session, conversationId) {
    db.conversations = db.conversations.map((c) =>
      c.id === conversationId ? { ...c, unread: false } : c,
    );
  },

  async getNotes(_session, conversationId) {
    return db.notes.filter((n) => n.conversationId === conversationId);
  },

  async addNote(_session, conversationId, body) {
    const note: ConversationNote = {
      id: nextId("n"),
      conversationId,
      companyId: fx.CO,
      authorId: OFFLINE_SESSION.user.profileId,
      authorName: OFFLINE_SESSION.user.displayName,
      body: body.trim(),
      createdAt: NOW,
    };
    db.notes = [...db.notes, note];
    return ok(note);
  },

  /* ---- leads ----------------------------------------------------------- */

  async getLeads() {
    return [...db.leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getLead(_session, id) {
    return db.leads.find((l) => l.id === id) ?? null;
  },

  async setLeadStatus(_session, leadId, status, lostReason) {
    const l = db.leads.find((x) => x.id === leadId);
    if (!l) return ok(db.leads[0]!);
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

    // A booking with NO VALUE: the operator has said a customer booked, not
    // what it was worth, and inventing a figure would misstate their revenue.
    if (status === "booked" && !l.bookingId) {
      const booking: Booking = {
        id: nextId("bk"),
        leadId: l.id,
        companyId: fx.CO,
        productId: l.productId,
        mountainId: l.mountainId,
        status: "confirmed",
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

  async assignLead(_session, leadId, companyUserId) {
    const l = db.leads.find((x) => x.id === leadId);
    if (!l) return ok(db.leads[0]!);
    const updated: Lead = { ...l, ownerId: companyUserId };
    db.leads = db.leads.map((x) => (x.id === l.id ? updated : x));
    return ok(updated);
  },

  async createLead(_session, input) {
    const lead: Lead = {
      id: nextId("l"),
      companyId: fx.CO,
      customerId: nextId("cust"),
      customerName: input.customerName.trim() || "New enquiry",
      conversationId: null,
      productId: input.productId,
      mountainId:
        input.mountainId ??
        (input.productId
          ? (db.products.find((p) => p.id === input.productId)?.mountainIds[0] ?? null)
          : null),
      status: "new",
      // Hard-coded, as in the real backend: a lead the company recorded is
      // never allowed to count as one Icefall delivered.
      origin: "company",
      tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 8),
      ownerId: OFFLINE_SESSION.user.id,
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
          authorId: OFFLINE_SESSION.user.profileId,
          authorName: OFFLINE_SESSION.user.displayName,
          body: note,
          createdAt: NOW,
        },
      ];
    }
    return ok(lead);
  },

  async setLeadTags(_session, leadId, tags) {
    const l = db.leads.find((x) => x.id === leadId);
    if (!l) return ok(db.leads[0]!);
    const cleaned: string[] = [];
    const seen = new Set<string>();
    for (const raw of tags) {
      const t = raw.trim().replace(/\s+/g, " ").slice(0, 24);
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      cleaned.push(t);
      if (cleaned.length >= 8) break;
    }
    const updated: Lead = { ...l, tags: cleaned };
    db.leads = db.leads.map((x) => (x.id === l.id ? updated : x));
    return ok(updated);
  },

  async getLeadNotes(_session, leadId) {
    return db.leadNotes.filter((n) => n.leadId === leadId);
  },

  async addLeadNote(_session, leadId, body) {
    const note: LeadNote = {
      id: nextId("ln"),
      leadId,
      authorId: OFFLINE_SESSION.user.profileId,
      authorName: OFFLINE_SESSION.user.displayName,
      body: body.trim(),
      createdAt: NOW,
    };
    db.leadNotes = [...db.leadNotes, note];
    return ok(note);
  },

  async getBookings() {
    return db.bookings;
  },

  /* ---- dashboard, analytics, notifications ----------------------------- */

  async getDashboard(): Promise<DashboardSummary> {
    const scored = icefallOnly(db.leads);
    const current = scored.filter((l) => l.createdAt.slice(0, 10) >= "2026-08-01");
    const prior = scored.filter(
      (l) => l.createdAt.slice(0, 10) >= "2026-07-01" && l.createdAt.slice(0, 10) < "2026-08-01",
    );
    const priorFunnel = funnelFor(prior);
    return {
      newEnquiries: db.conversations.filter((c) => c.unread).length,
      qualifiedLeads: scored.filter((l) => l.status === "qualified").length,
      bookings: icefallBookings().length,
      pendingChanges: db.versions.filter((v) => v.state === "pending" || v.state === "draft").length,
      views: viewsReading(),
      funnel: funnelFor(current),
      enquiriesBySource: bySource(current),
      previous:
        priorFunnel.enquiries + priorFunnel.qualified + priorFunnel.bookings > 0 ? priorFunnel : null,
      rangeLabel: "1 – 28 Aug 2026",
      previousRangeLabel: "1 – 31 Jul 2026",
    };
  },

  async getTrend(_session, days): Promise<TrendPoint[]> {
    const end = Date.parse(`${NOW.slice(0, 10)}T00:00:00Z`);
    const out: TrendPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
      const on = (iso: string | null) => iso !== null && iso.slice(0, 10) === d;
      out.push({
        day: d,
        label: formatDayShort(d),
        enquiries: db.leads.filter((l) => on(l.createdAt)).length,
        qualified: db.leads.filter((l) => on(l.qualifiedAt)).length,
        bookings: db.leads.filter((l) => on(l.bookedAt)).length,
      });
    }
    return out;
  },

  /**
   * Null, always.
   *
   * The offline company has no mark on record — no artwork was invented for a
   * company that does not exist — so every surface that draws a logo falls
   * through to the initials it was built to fall through to.
   */
  async getMediaUrl() {
    return null;
  },

  async getProductPerformance(): Promise<ProductPerformance[]> {
    return db.products
      .map((p) => {
        const forProduct = db.leads.filter((l) => l.productId === p.id);
        const bookings = forProduct.filter((l) => l.bookedAt !== null).length;
        return {
          productId: p.id,
          name: p.name,
          kind: p.kind,
          enquiries: forProduct.length,
          qualified: forProduct.filter((l) => l.qualifiedAt !== null).length,
          bookings,
          views: listingViews(p.id, forProduct.length),
          conversion: conversionRate(bookings, forProduct.length),
        };
      })
      .sort((a, b) => b.enquiries - a.enquiries);
  },

  async getInsights(_session, window): Promise<OperatorInsights> {
    const cutoff = window === "week" ? "2026-08-21" : "2026-07-28";
    const leads = db.leads.filter((l) => l.createdAt.slice(0, 10) >= cutoff);

    const responseHours = leads
      .filter((l) => l.firstResponseAt !== null)
      .map((l) => hoursBetween(l.createdAt, l.firstResponseAt!));
    const daysToBook = leads
      .filter((l) => l.bookedAt !== null)
      .map((l) => hoursBetween(l.createdAt, l.bookedAt!) / 24);

    const total = leads.length;
    const reached: readonly [string, string, number][] = [
      ["enquired", "Enquired", total],
      ["contacted", "Replied to", leads.filter((l) => l.firstResponseAt !== null).length],
      ["qualified", "Interested", leads.filter((l) => l.qualifiedAt !== null).length],
      ["quoted", "Quoted", leads.filter((l) => l.quotedAt !== null).length],
      ["booked", "Booked", leads.filter((l) => l.bookedAt !== null).length],
    ];
    const stageReach: StageReach[] = reached.map(([stage, label, count]) => ({
      stage,
      label,
      reached: count,
      share: total > 0 ? measured(count / total) : unavailable(OPERATOR_NOTICES.NO_LEADS_IN_WINDOW),
    }));

    const lostTally = new Map<string, number>();
    for (const l of leads) {
      if (l.status !== "lost") continue;
      const reason = l.lostReason?.trim() || "No reason recorded";
      lostTally.set(reason, (lostTally.get(reason) ?? 0) + 1);
    }
    const lostReasons = [...lostTally.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

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

    const byMountain: MountainPerformance[] = db.access
      .filter((a) => a.status === "active")
      .map((a) => {
        const id = a.mountainId;
        const m = db.mountains.find((x) => x.id === id);
        const forMountain = leads.filter((l) => l.mountainId === id);
        // Booked and Revenue come from the SAME rows, so one column can never
        // contradict the other. A cancellation is not a booking a company has.
        const live = db.bookings.filter((b) => b.mountainId === id && b.status !== "cancelled");
        const confirmed = live.filter((b) => b.status === "confirmed" || b.status === "completed");
        const withValue = confirmed.filter((b) => b.value.status === "reported");
        const reportedTotal = withValue.reduce(
          (sum, b) => sum + (b.value.status === "reported" ? b.value.cents : 0),
          0,
        );
        const revenue: Reading<number> =
          withValue.length > 0
            ? measured(reportedTotal)
            : confirmed.length > 0
              ? unavailable(OPERATOR_NOTICES.BOOKING_VALUE_NOT_REPORTED)
              : live.length > 0
                ? unavailable(OPERATOR_NOTICES.bookingsNotConfirmed(live.length))
                : unavailable(OPERATOR_NOTICES.NO_BOOKINGS_YET);
        return {
          mountainId: id,
          name: m?.name ?? id,
          products: db.products.filter((p) => p.mountainIds.includes(id)).length,
          enquiries: forMountain.length,
          qualified: forMountain.filter((l) => l.qualifiedAt !== null).length,
          bookings: live.length,
          conversion: conversionRate(live.length, forMountain.length),
          views: listingViews(`mountain:${id}`, forMountain.length),
          revenue,
        };
      })
      .sort((a, b) => b.enquiries - a.enquiries || a.name.localeCompare(b.name));

    const byOwner: OwnerPerformance[] = db.users
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

  async getAnalytics(_session, window): Promise<AnalyticsSummary> {
    const cutoff = window === "week" ? "2026-08-21" : "2026-07-28";
    const priorCutoff = window === "week" ? "2026-08-14" : "2026-06-28";
    const scored = icefallOnly(db.leads);
    const inWindow = scored.filter((l) => l.createdAt.slice(0, 10) >= cutoff);
    const current = funnelFor(inWindow);
    const prior = funnelFor(
      scored.filter(
        (l) => l.createdAt.slice(0, 10) >= priorCutoff && l.createdAt.slice(0, 10) < cutoff,
      ),
    );
    // Confirmed and completed only. A cancelled booking's value is not revenue
    // and a pending one is not revenue yet.
    const gmv = estimatedGmv(
      icefallBookings()
        .filter((b) => b.status === "confirmed" || b.status === "completed")
        .map((b) => b.value),
    );
    return {
      views: viewsReading(),
      funnel: current,
      enquiriesBySource: bySource(inWindow),
      conversionRate: conversionRate(current.bookings, current.enquiries),
      estimatedGmv: gmv.total,
      gmvExcludedCount: gmv.excluded,
      previous: prior.enquiries + prior.qualified + prior.bookings > 0 ? prior : null,
    };
  },

  async getNotifications() {
    return [...db.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async markNotificationRead(_session, id) {
    db.notifications = db.notifications.map((n) => (n.id === id ? { ...n, readAt: NOW } : n));
  },
};
