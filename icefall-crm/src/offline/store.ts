/**
 * The offline session's memory. Only ever reached from behind `if (OFFLINE)`.
 *
 * WHY WRITES ARE ACCEPTED HERE RATHER THAN REFUSED. The offline build exists so
 * somebody can sit with the CRM for two hours and actually use it — reply to a
 * ticket, invite an operator, resolve a thing. A button that returns "no
 * database is configured" is a dead demo, so every write lands in these arrays
 * and the screen re-reads them exactly as it would re-read PostgREST.
 *
 * WHAT THAT IS NOT. It is not persistence and it never pretends to be: reload
 * the page and every edit is gone. The permanent banner is what stops that being
 * a lie — the whole screen already says the data is invented, so an edit that
 * survives ten minutes and not a refresh cannot be mistaken for a record.
 *
 * Reads hand back COPIES. A screen that mutated the array it was given would
 * quietly rewrite the fixture for every other screen, and the bug would look
 * like a rendering fault.
 */
import * as fx from "./fixtures";
import type {
  AuditEvent, Booking, Commission, Company, CompanyInvitation, CompanyMember,
  ContentVersion, CustomerRecord, Deal, GuideRecord, IntakeRequest, Invoice,
  Lead, Mountain, Payment, PlacementPrice, PlacementView, Product,
  RevenueRecord, StaffRecord, Task, Ticket, TicketMessage,
  VerificationDocument,
} from "@/data/types";

/** Who the offline build is signed in as. A real desk, so `may()` behaves. */
export const OFFLINE_IDENTITY = {
  profileId: "s1",
  displayName: "Alex Christofis",
  role: "super_admin" as const,
};

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

/* -------------------------------------------------------------------------- */
/* State                                                                       */
/* -------------------------------------------------------------------------- */

const state = {
  companies: [...fx.companies] as Company[],
  destinations: [...fx.destinations] as Mountain[],
  placements: [...fx.placements] as PlacementView[],
  placementPrices: [...fx.placementPrices] as PlacementPrice[],
  products: [...fx.products] as Product[],
  contentVersions: [...fx.contentVersions] as ContentVersion[],
  auditEvents: [...fx.auditEvents] as AuditEvent[],
  customers: [...fx.customers] as CustomerRecord[],
  leads: [...fx.leads] as Lead[],
  bookings: [...fx.bookings] as Booking[],
  commissions: [...fx.commissions] as Commission[],
  revenue: [...fx.revenue] as RevenueRecord[],
  deals: [...fx.deals] as Deal[],
  tasks: [...fx.tasks] as Task[],
  invoices: [...fx.invoices] as Invoice[],
  payments: [...fx.payments] as Payment[],
  tickets: [...fx.tickets] as Ticket[],
  ticketMessages: Object.fromEntries(
    Object.entries(fx.ticketMessages).map(([k, v]) => [k, [...v]]),
  ) as Record<string, TicketMessage[]>,
  intake: [...fx.intake] as IntakeRequest[],
  documents: [...fx.documents] as VerificationDocument[],
  staff: [...fx.staff] as StaffRecord[],
  guides: [...fx.guides] as GuideRecord[],
  companyMembers: { ...fx.companyMembers } as Record<string, CompanyMember[]>,
  companyInvitations: Object.fromEntries(
    Object.entries(fx.companyInvitations).map(([k, v]) => [k, [...v]]),
  ) as Record<string, CompanyInvitation[]>,
};

let seq = 1000;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

/** Every offline write logs itself, exactly as the audited functions do. */
function audit(action: string, entity_type: string, entity_id: string, next: Record<string, unknown> | null, reason: string | null, previous: Record<string, unknown> | null = null) {
  state.auditEvents.unshift({
    id: nextId("oa"),
    actor_id: OFFLINE_IDENTITY.profileId,
    actor_role: OFFLINE_IDENTITY.role,
    action, entity_type, entity_id, previous, next, reason,
    created_at: now(),
  });
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export const read = {
  companies: () => [...state.companies],
  company: (id: string) => state.companies.find((c) => c.id === id) ?? state.companies[0],
  destinations: () => [...state.destinations],
  placements: () => [...state.placements],
  placementsFor: (destinationId: string) =>
    state.placements.filter((p) => p.destination_id === destinationId),
  placementPrices: () => [...state.placementPrices],
  products: () => [...state.products],
  pendingApprovals: () => state.contentVersions.filter((v) => v.state === "pending"),
  auditEvents: (limit: number) => state.auditEvents.slice(0, limit),
  customers: () => [...state.customers],
  leads: () => [...state.leads],
  bookings: () => [...state.bookings],
  commissions: () => [...state.commissions],
  revenue: () => [...state.revenue],
  deals: () => [...state.deals],
  tasks: () => state.tasks.filter((t) => t.status === "open" || t.status === "in_progress"),
  invoices: () => [...state.invoices],
  payments: () => [...state.payments],
  tickets: () => [...state.tickets],
  ticket: (id: string) => state.tickets.find((t) => t.id === id) ?? state.tickets[0],
  ticketMessages: (ticketId: string) => [...(state.ticketMessages[ticketId] ?? [])],
  intake: () => [...state.intake],
  documents: () => [...state.documents],
  staff: () => [...state.staff],
  guides: () => [...state.guides],
  companyMembers: (companyId: string) => [...(state.companyMembers[companyId] ?? [])],
  companyInvitations: (companyId: string) => [...(state.companyInvitations[companyId] ?? [])],
};

/* -------------------------------------------------------------------------- */
/* Writes — every one of them succeeds, and none of them throws                */
/* -------------------------------------------------------------------------- */

export const write = {
  movePlacement(placementId: string, slotPosition: number, reason: string) {
    const p = state.placements.find((x) => x.id === placementId);
    if (!p) return;
    audit("placement.moved", "placement", placementId,
      { slot_position: slotPosition }, reason, { slot_position: p.slot_position });
    p.slot_position = slotPosition;
    p.changed_by = OFFLINE_IDENTITY.profileId;
    p.changed_at = now();
    p.change_reason = reason;
  },

  cancelPlacement(placementId: string, reason: string) {
    const p = state.placements.find((x) => x.id === placementId);
    if (!p) return;
    audit("placement.cancelled", "placement", placementId,
      { status: "cancelled" }, reason, { status: p.status });
    p.status = "cancelled";
    p.effective_status = "cancelled";
    p.needs_review = false;
    p.changed_by = OFFLINE_IDENTITY.profileId;
    p.changed_at = now();
    p.change_reason = reason;
  },

  decideContentVersion(versionId: string, decision: ContentVersion["state"], reason: string | null) {
    const v = state.contentVersions.find((x) => x.id === versionId);
    if (!v) return;
    v.state = decision;
    v.reviewed_by = OFFLINE_IDENTITY.profileId;
    v.reviewed_at = now();
    v.decision_reason = reason;
    v.applied_at = decision === "approved" ? now() : null;
    audit(`content.${decision}`, v.entity_type, v.entity_id, v.payload, reason);
  },

  setCompanyRealBusiness(companyId: string, value: boolean, reason: string) {
    const c = state.companies.find((x) => x.id === companyId);
    if (!c) return;
    audit("company.real_business_set", "company", companyId,
      { real_business: value }, reason, { real_business: c.real_business });
    c.real_business = value;
    c.updated_at = now();
  },

  createCompany(intake: {
    name: string; slug: string; legal_name?: string | null; description?: string | null;
    countries?: string[]; status?: Company["status"];
  }): Company {
    const company: Company = {
      id: nextId("company"),
      slug: intake.slug,
      name: intake.name,
      legal_name: intake.legal_name ?? null,
      logo_path: null,
      description: intake.description ?? null,
      countries: intake.countries ?? [],
      regions: [],
      status: intake.status ?? "prospect",
      verification_status: "unverified",
      // Defaults false and only a deliberate staff act may raise it — the same
      // rule the database holds. A create form that could set it is a create
      // form that could clear a real operator's disclosure.
      real_business: false,
      documents_checked_at: null,
      documents_checked_by: null,
      created_at: now(),
      updated_at: now(),
    };
    state.companies.push(company);
    state.companies.sort((a, b) => a.name.localeCompare(b.name));
    audit("company.created", "company", company.id, { name: company.name, slug: company.slug }, null);
    return company;
  },

  updateCompanyRecord(id: string, patch: Partial<Company>): Company {
    const c = state.companies.find((x) => x.id === id);
    if (!c) return state.companies[0];
    const previous: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as (keyof Company)[]) {
      previous[key] = c[key];
    }
    Object.assign(c, patch);
    c.updated_at = now();
    audit("company.updated", "company", id, patch as Record<string, unknown>, null, previous);
    return c;
  },

  inviteCompanyUser(companyId: string, email: string, role: "admin" | "sales") {
    const list = state.companyInvitations[companyId] ?? (state.companyInvitations[companyId] = []);
    const expires = new Date();
    expires.setDate(expires.getDate() + 14);
    list.unshift({
      id: nextId("oiv"),
      email: email.trim(),
      company_role: role,
      created_at: now(),
      expires_at: expires.toISOString(),
      accepted_at: null,
      revoked_at: null,
    });
    audit("invitation.created", "company", companyId, { email: email.trim(), company_role: role }, null);
  },

  revokeInvitation(invitationId: string, reason: string) {
    for (const list of Object.values(state.companyInvitations)) {
      const inv = list.find((i) => i.id === invitationId);
      if (inv) {
        inv.revoked_at = now();
        audit("invitation.revoked", "invitation", invitationId, { revoked_at: inv.revoked_at }, reason);
        return;
      }
    }
  },

  replyToTicket(ticketId: string, body: string, internal: boolean) {
    const list = state.ticketMessages[ticketId] ?? (state.ticketMessages[ticketId] = []);
    list.push({
      id: nextId("om"),
      ticket_id: ticketId,
      author_id: OFFLINE_IDENTITY.profileId,
      author_name: OFFLINE_IDENTITY.displayName,
      body: body.trim(),
      internal,
      created_at: now(),
    });
    const t = state.tickets.find((x) => x.id === ticketId);
    if (t) t.updated_at = now();
  },

  setTicketStatus(ticketId: string, status: Ticket["status"], resolution?: string) {
    const t = state.tickets.find((x) => x.id === ticketId);
    if (!t) return;
    audit("ticket.status_changed", "ticket", ticketId, { status }, resolution ?? null, { status: t.status });
    t.status = status;
    t.updated_at = now();
  },

  triageIntake(row: IntakeRequest): { id: string; reference: string } {
    const id = nextId("otk");
    const reference = `T-${20100 + seq}`;
    state.tickets.unshift({
      id,
      reference,
      subject: row.subject,
      type: "other",
      priority: "medium",
      status: "open",
      customer_id: null,
      company_id: null,
      lead_id: null,
      booking_id: null,
      assigned_to: null,
      requester_kind: "visitor",
      origin_app: row.origin_app,
      origin_screen: row.origin_screen,
      requester_email: row.email,
      requester_name: row.name, snippet: null,
      created_at: now(),
      updated_at: now(),
    });
    state.ticketMessages[id] = [
      {
        id: nextId("om"),
        ticket_id: id,
        author_id: "visitor",
        author_name: row.name,
        body: row.body,
        internal: false,
        created_at: row.created_at,
      },
    ];
    const original = state.intake.find((i) => i.id === row.id);
    if (original) {
      original.handled_at = now();
      original.ticket_id = id;
    }
    audit("ticket.opened_from_intake", "ticket", id, { reference, subject: row.subject }, null);
    return { id, reference };
  },

  /**
   * The expiry sweep NOTIFIES; it never acts. A placement past its term keeps
   * its position until a person moves it, offline exactly as in the database.
   */
  raiseExpiryTasks() {
    for (const p of state.placements) {
      if (p.effective_status !== "expired") continue;
      const exists = state.tasks.some((t) => t.kind === "placement_expired" && t.entity_id === p.id);
      if (exists) continue;
      state.tasks.unshift({
        id: nextId("ok"),
        kind: "placement_expired",
        title: `Position #${p.slot_position} on ${p.destination_id} has passed its term`,
        detail:
          "Raised by the expiry check. The company still holds this position and will continue to " +
          "until an administrator moves or cancels the placement. Nothing has changed automatically.",
        entity_type: "placement",
        entity_id: p.id,
        company_id: p.company_id,
        desk: "operations", assigned_to: null,
        priority: "critical",
        status: "open",
        due_on: today(),
      });
    }
  },
};
