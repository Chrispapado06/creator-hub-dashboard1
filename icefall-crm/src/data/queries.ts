import { supabase, isConfigured, NOT_CONFIGURED } from "@/lib/supabase";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import * as demo from "@/demo/dataset";
import { failed, ok, unavailable, type Result } from "./result";
import type { Company, ContentVersion, Mountain, PlacementView, Product, AuditEvent } from "./types";

/**
 * Every read goes through here, and every one returns a `Result`.
 *
 * The wrapper exists so that "there is no database" is answered in ONE place
 * rather than by each screen deciding what an empty array means. A caller cannot
 * accidentally treat an unreachable database as an empty table, because it never
 * receives an array in that case.
 */
// `PromiseLike`, not `Promise`: a PostgREST query builder is a thenable that
// only executes when awaited, and typing it as a Promise rejects every caller.
type Read<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

/**
 * `demoValue` is what this read returns when there is no database and the demo
 * flag is on. It is NOT a fallback for a failed query: a real query that errors
 * still returns the error, because a CRM that quietly substitutes invented
 * revenue for an unreachable database is a CRM that lies to whoever is reading
 * it. The substitution happens only where the alternative is a blank screen.
 */
async function read<T>(
  fn: (db: NonNullable<typeof supabase>) => Read<T>,
  demoValue?: () => T,
): Promise<Result<T>> {
  if (!isConfigured || !supabase) {
    if (SHOW_DEMO_DATA && demoValue) return ok(demoValue());
    return unavailable<T>(NOT_CONFIGURED);
  }
  try {
    const { data, error } = await fn(supabase);
    if (error) return failed<T>(error.message);
    if (data === null) return failed<T>("The database returned nothing at all, which should not happen.");
    return ok(data);
  } catch (e) {
    return failed<T>(e instanceof Error ? e.message : String(e));
  }
}

export const listCompanies = () =>
  read<Company[]>((db) =>
    db.from("companies").select("*").order("name", { ascending: true }),
    () => demo.companies,
  );

export const getCompany = (id: string) =>
  read<Company>(
    (db) => db.from("companies").select("*").eq("id", id).single(),
    () => demo.companies.find((c) => c.id === id) ?? demo.companies[0],
  );

export const listDestinations = () =>
  read<Mountain[]>((db) =>
    db.from("destinations").select("*").order("elevation_m", { ascending: false }),
    () => demo.destinations,
  );

/**
 * Placements, read through the VIEW rather than the table.
 *
 * `placement_status` computes `effective_status` and `needs_review` at read
 * time. Nothing writes expiry back, so a placement that has run out still holds
 * its position until an administrator moves it — which is the behaviour the
 * specification requires and the reason this is a view.
 */
export const listPlacements = () =>
  read<PlacementView[]>((db) =>
    db.from("placement_status").select("*").order("destination_id").order("slot_position"),
    () => demo.placements,
  );

export const listPlacementsForDestination = (destinationId: string) =>
  read<PlacementView[]>((db) =>
    db.from("placement_status").select("*").eq("destination_id", destinationId).order("slot_position"),
    () => demo.placements.filter((p) => p.destination_id === destinationId),
  );

export const listProducts = () =>
  read<Product[]>((db) => db.from("products").select("*").order("name"), () => demo.products);

export const listPendingApprovals = () =>
  read<ContentVersion[]>((db) =>
    db.from("content_versions").select("*").eq("state", "pending").order("submitted_at", { ascending: true }),
    () => demo.contentVersions,
  );

export const listAuditEvents = (limit = 200) =>
  read<AuditEvent[]>((db) =>
    db.from("audit_events").select("*").order("created_at", { ascending: false }).limit(limit),
    () => demo.auditEvents,
  );

/* -------------------------------------------------------------------------- */
/* Writes — all of them through the audited functions                         */
/* -------------------------------------------------------------------------- */

async function call(fn: string, args: Record<string, unknown>): Promise<Result<null>> {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const { error } = await supabase.rpc(fn, args);
  return error ? failed<null>(error.message) : ok(null);
}

/**
 * NOTE THAT THERE IS NO `updatePlacement`.
 *
 * `authenticated` holds SELECT and nothing else on `placements`, staff included,
 * so a direct write would be refused anyway. Every mutation goes through one of
 * these, and each writes its own audit event in the same statement — which is
 * what makes the audit log complete rather than merely usually-complete.
 */
export const movePlacement = (placementId: string, slotPosition: number, reason: string) =>
  call("move_placement", { p_placement_id: placementId, p_slot_position: slotPosition, p_reason: reason });

export const cancelPlacement = (placementId: string, reason: string) =>
  call("cancel_placement", { p_placement_id: placementId, p_reason: reason });

export const approveContentVersion = (versionId: string, reason?: string) =>
  call("approve_content_version", { p_version_id: versionId, p_reason: reason ?? null });

export const decideContentVersion = (
  versionId: string,
  decision: "rejected" | "changes_requested",
  reason: string,
) => call("decide_content_version", { p_version_id: versionId, p_decision: decision, p_reason: reason });

/* -------------------------------------------------------------------------- */
/* The commercial layer                                                        */
/* -------------------------------------------------------------------------- */

import type { Booking, Commission, Deal, Lead, RevenueRecord, Task } from "./types";

export const listLeads = () =>
  read<Lead[]>((db) => db.from("leads").select("*").order("created_at", { ascending: false }), () => demo.leads);

export const listBookings = () =>
  read<Booking[]>((db) => db.from("bookings").select("*").order("booked_at", { ascending: false }), () => demo.bookings);

export const listCommissions = () =>
  read<Commission[]>((db) => db.from("commissions").select("*").order("computed_at", { ascending: false }), () => demo.commissions);

export const listRevenue = () =>
  read<RevenueRecord[]>((db) =>
    db.from("revenue_records").select("*").order("recognised_on", { ascending: false }), () => demo.revenue);

export const listDeals = () =>
  read<Deal[]>((db) => db.from("deals").select("*").order("expected_close_on", { ascending: true }), () => demo.deals);

export const listOpenTasks = () =>
  read<Task[]>((db) =>
    db.from("tasks").select("*").in("status", ["open", "in_progress"]).order("due_on", { ascending: true }), () => demo.tasks);

/** Notifies. Never acts — it cannot reach `placements` at all. */
export const raiseExpiryTasks = () => call("raise_expiry_tasks", {});

/* -------------------------------------------------------------------------- */
/* Reads the 23-page specification adds                                        */
/* -------------------------------------------------------------------------- */

import type { CustomerRecord, GuideRecord, Invoice, Payment, PlacementPrice, StaffRecord, Ticket, VerificationDocument } from "./types";

/**
 * These tables do not exist in the schema yet — the audit found eight of them
 * missing. Until the migration lands, the real branch returns the honest
 * "no data" state and only the demo branch has anything to show. They are
 * written this way round on purpose: when the tables arrive, only the first
 * argument changes.
 */
const pending = <T,>(demoValue: () => T): Promise<Result<T>> =>
  Promise.resolve(
    SHOW_DEMO_DATA
      ? ok(demoValue())
      : unavailable<T>(
          "This module's tables are specified but not yet in the database. " +
            "Nothing is shown rather than something invented.",
        ),
  );

export const listInvoices = () => pending<Invoice[]>(() => demo.invoices);
export const listPayments = () => pending<Payment[]>(() => demo.payments);
export const listTickets = () => pending<Ticket[]>(() => demo.tickets);
export const listDocuments = () => pending<VerificationDocument[]>(() => demo.documents);
export const listStaff = () => pending<StaffRecord[]>(() => demo.staff);
export const listCustomers = () => pending<CustomerRecord[]>(() => demo.customers);
export const listGuides = () => pending<GuideRecord[]>(() => demo.guides);
export const listPlacementPrices = () => pending<PlacementPrice[]>(() => demo.placementPrices);
