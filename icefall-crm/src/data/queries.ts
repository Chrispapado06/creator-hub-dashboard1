import { supabase, isConfigured, NOT_CONFIGURED } from "@/lib/supabase";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import * as demo from "@/demo/dataset";
import { DEMO } from "@/offline/offline";
import { read as offlineRead, write as offlineWrite } from "@/offline/store";
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
  offlineValue?: () => T,
): Promise<Result<T>> {
  // THE AEROPLANE BRANCH, and it is separate from the demo branch above by
  // design. `SHOW_DEMO_DATA` is `import.meta.env.DEV` and collapses the demo
  // arrays to `[]` in a built bundle, so an offline build that relied on it
  // would be 23 empty screens. `DEMO` is a build-time constant, so with the
  // flag unset this line is dead code and the fixtures are dropped with it.
  if (DEMO && offlineValue) return ok(offlineValue());
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
    () => offlineRead.companies(),
  );

export const getCompany = (id: string) =>
  read<Company>(
    (db) => db.from("companies").select("*").eq("id", id).single(),
    () => demo.companies.find((c) => c.id === id) ?? demo.companies[0],
    () => offlineRead.company(id),
  );

export const listDestinations = () =>
  read<Mountain[]>((db) =>
    db.from("destinations").select("*").order("elevation_m", { ascending: false }),
    () => demo.destinations,
    () => offlineRead.destinations(),
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
    () => offlineRead.placements(),
  );

export const listPlacementsForDestination = (destinationId: string) =>
  read<PlacementView[]>((db) =>
    db.from("placement_status").select("*").eq("destination_id", destinationId).order("slot_position"),
    () => demo.placements.filter((p) => p.destination_id === destinationId),
    () => offlineRead.placementsFor(destinationId),
  );

export const listProducts = () =>
  read<Product[]>(
    (db) => db.from("products").select("*").order("name"),
    () => demo.products,
    () => offlineRead.products(),
  );

export const listPendingApprovals = () =>
  read<ContentVersion[]>((db) =>
    db.from("content_versions").select("*").eq("state", "pending").order("submitted_at", { ascending: true }),
    () => demo.contentVersions,
    () => offlineRead.pendingApprovals(),
  );

export const listAuditEvents = (limit = 200) =>
  read<AuditEvent[]>((db) =>
    db.from("audit_events").select("*").order("created_at", { ascending: false }).limit(limit),
    () => demo.auditEvents,
    // The demo branch ignores the limit; offline does not — the dashboard asks
    // for six and a list of two hundred under a "Recent activity" heading is a
    // different screen.
    () => offlineRead.auditEvents(limit),
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
 * An offline write. It applies to the in-memory store and ALWAYS succeeds —
 * it never throws and never returns an error state, because a demonstration
 * whose buttons answer "no database is configured" is not a demonstration. The
 * edit is lost on reload; the permanent banner is what keeps that honest.
 */
const offlineAck = (apply: () => void): Promise<Result<null>> => {
  apply();
  return Promise.resolve(ok<null>(null));
};
/** The same, for a write that hands something back. */
const offlineDone = <T,>(apply: () => T): Promise<Result<T>> => Promise.resolve(ok(apply()));

/**
 * NOTE THAT THERE IS NO `updatePlacement`.
 *
 * `authenticated` holds SELECT and nothing else on `placements`, staff included,
 * so a direct write would be refused anyway. Every mutation goes through one of
 * these, and each writes its own audit event in the same statement — which is
 * what makes the audit log complete rather than merely usually-complete.
 */
export const movePlacement = (placementId: string, slotPosition: number, reason: string) =>
  DEMO
    ? offlineAck(() => offlineWrite.movePlacement(placementId, slotPosition, reason))
    : call("move_placement", { p_placement_id: placementId, p_slot_position: slotPosition, p_reason: reason });

export const cancelPlacement = (placementId: string, reason: string) =>
  DEMO
    ? offlineAck(() => offlineWrite.cancelPlacement(placementId, reason))
    : call("cancel_placement", { p_placement_id: placementId, p_reason: reason });

export const approveContentVersion = (versionId: string, reason?: string) =>
  DEMO
    ? offlineAck(() => offlineWrite.decideContentVersion(versionId, "approved", reason ?? null))
    : call("approve_content_version", { p_version_id: versionId, p_reason: reason ?? null });

/**
 * The deliberate act for the disclosure flag — never part of an editor patch.
 * The function refuses an empty reason; the companies audit trigger records
 * the change itself, and this adds the sentence saying why.
 *
 * TO WHOEVER WIRES THE UI FOR THIS (there is none yet, deliberately): the
 * reason must be a required field the person actually types — no prefilled
 * default, no "Marked from the CRM" boilerplate. A mandatory field with a
 * default value is an optional field wearing a costume, and the whole point
 * of the reason is that a person wrote it about THIS company.
 */
export const setCompanyRealBusiness = (companyId: string, value: boolean, reason: string) =>
  DEMO
    ? offlineAck(() => offlineWrite.setCompanyRealBusiness(companyId, value, reason))
    : call("set_company_real_business", { p_company_id: companyId, p_value: value, p_reason: reason });

export const decideContentVersion = (
  versionId: string,
  decision: "rejected" | "changes_requested",
  reason: string,
) =>
  DEMO
    ? offlineAck(() => offlineWrite.decideContentVersion(versionId, decision, reason))
    : call("decide_content_version", { p_version_id: versionId, p_decision: decision, p_reason: reason });

/* -------------------------------------------------------------------------- */
/* The commercial layer                                                        */
/* -------------------------------------------------------------------------- */

import type { Booking, BookingAgreement, Commission, CompanyInvitation, CompanyMember, Deal, Enquiry, GuideRow, IdentityCheck, IntakeRequest, Lead, PromotedPlacement, ReportRow, RevenueRecord, Task, TicketMessage } from "./types";

export const listLeads = () =>
  read<Lead[]>((db) => db.from("leads").select("*").order("created_at", { ascending: false }), () => demo.leads, () => offlineRead.leads());

export const listBookings = () =>
  read<Booking[]>((db) => db.from("bookings").select("*").order("booked_at", { ascending: false }), () => demo.bookings, () => offlineRead.bookings());

export const listCommissions = () =>
  read<Commission[]>((db) => db.from("commissions").select("*").order("computed_at", { ascending: false }), () => demo.commissions, () => offlineRead.commissions());

export const listRevenue = () =>
  read<RevenueRecord[]>((db) =>
    db.from("revenue_records").select("*").order("recognised_on", { ascending: false }), () => demo.revenue, () => offlineRead.revenue());

export const listDeals = () =>
  read<Deal[]>((db) => db.from("deals").select("*").order("expected_close_on", { ascending: true }), () => demo.deals, () => offlineRead.deals());

export const listOpenTasks = () =>
  read<Task[]>((db) =>
    db.from("tasks").select("*").in("status", ["open", "in_progress"]).order("due_on", { ascending: true }), () => demo.tasks, () => offlineRead.tasks());

export const createDeal = async (d: {
  company_id: string;
  title: string;
  estimated_value_cents?: number | null;
  probability_pct?: number | null;
  expected_close_on?: string | null;
}): Promise<Result<null>> => {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const { error } = await supabase.from("deals").insert({
    company_id: d.company_id,
    title: d.title.trim(),
    stage: "prospect",
    estimated_value_cents: d.estimated_value_cents ?? null,
    probability_pct: d.probability_pct ?? null,
    expected_close_on: d.expected_close_on || null,
  });
  return error ? failed<null>(error.message) : ok(null);
};

/**
 * CR-05: a dragged pipeline card is a real stage change. Moving INTO `lost`
 * requires the reason (the CHECK refuses without one — collect it before the
 * write); moving out clears it. Won/lost stamp closed_at; reopening clears it.
 */
export const moveDeal = async (
  id: string,
  stage: Deal["stage"],
  lostReason?: string,
): Promise<Result<null>> => {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const closed = stage === "won" || stage === "lost";
  const { error } = await supabase
    .from("deals")
    .update({
      stage,
      lost_reason: stage === "lost" ? (lostReason?.trim() || null) : null,
      closed_at: closed ? new Date().toISOString() : null,
    })
    .eq("id", id);
  return error ? failed<null>(error.message) : ok(null);
};

/* ---- Tasks as assignments (CR-16): a name, a notification, a completion -- */

export const createTask = async (t: {
  title: string;
  detail?: string | null;
  assigned_to?: string | null;
  desk?: Task["desk"];
  priority?: Task["priority"];
  due_on?: string | null;
}): Promise<Result<null>> => {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const { error } = await supabase.from("tasks").insert({
    kind: "manual",
    title: t.title.trim(),
    detail: t.detail?.trim() || null,
    assigned_to: t.assigned_to ?? null,
    desk: t.desk ?? null,
    priority: t.priority ?? "normal",
    due_on: t.due_on || null,
  });
  return error ? failed<null>(error.message) : ok(null);
};

export const assignTask = async (id: string, profileId: string | null): Promise<Result<null>> => {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const { error } = await supabase.from("tasks").update({ assigned_to: profileId }).eq("id", id);
  return error ? failed<null>(error.message) : ok(null);
};

export const setTaskStatus = async (
  id: string,
  status: Task["status"],
  note?: string,
): Promise<Result<null>> => {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const done = status === "done" || status === "dismissed";
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("tasks")
    .update(
      done
        ? {
            status,
            resolved_at: new Date().toISOString(),
            resolved_by: auth.user?.id ?? null,
            resolution_note: note?.trim() || null,
          }
        : { status, resolved_at: null, resolved_by: null },
    )
    .eq("id", id);
  return error ? failed<null>(error.message) : ok(null);
};

/**
 * CR-18: unpaid invoices become sales-desk tasks. Idempotent by dedupe key —
 * one task per invoice ever, however often the button is pressed. Returns how
 * many were actually NEW, so the confirmation can say what happened rather
 * than restate the request.
 */
export const notifyUnpaidInvoices = async (
  rows: { id: string; title: string; detail: string; company_id: string; due_on: string | null }[],
): Promise<Result<number>> => {
  if (!isConfigured || !supabase) return unavailable<number>(NOT_CONFIGURED);
  if (rows.length === 0) return ok(0);
  const { data, error } = await supabase
    .from("tasks")
    .upsert(
      rows.map((r) => ({
        kind: "unpaid_invoice",
        title: r.title,
        detail: r.detail,
        entity_type: "invoice",
        entity_id: r.id,
        company_id: r.company_id,
        desk: "sales",
        priority: "high",
        due_on: r.due_on,
        dedupe_key: `unpaid_invoice:${r.id}`,
      })),
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return failed<number>(error.message);
  return ok(data?.length ?? 0);
};

/** Notifies. Never acts — it cannot reach `placements` at all. */
export const raiseExpiryTasks = () =>
  DEMO ? offlineAck(() => offlineWrite.raiseExpiryTasks()) : call("raise_expiry_tasks", {});

/* -------------------------------------------------------------------------- */
/* Company record writes — the approver's side of the boundary                */
/* -------------------------------------------------------------------------- */

/**
 * These write the `companies` table DIRECTLY, and that is the design, not a
 * shortcut. The RLS on `companies` (crm_foundation.sql) refuses operators and
 * admits staff sales/operations exactly because every operator-facing edit goes
 * through a content version and an ICEFALL approval — and THIS APP IS THE
 * APPROVER. Staff here are on the other side of that boundary: nothing is
 * queued, nothing is "submitted", the record simply changes and the audit is
 * the row's updated_at plus RLS's guarantee about who could have done it.
 *
 * Contrast `movePlacement` above: placements stay function-only because staff
 * hold no direct write there. Companies grant one. The difference is in the
 * migrations, on purpose.
 */
export interface CompanyIntake {
  name: string;
  slug: string;
  legal_name?: string | null;
  description?: string | null;
  countries?: string[];
  status?: Company["status"];
}

/** Staff-only sidecar (`company_internal`) — never visible to the operator. */
export interface CompanyIntakeInternal {
  source?: string | null;
  priority?: "low" | "normal" | "high";
  notes?: string | null;
}

/**
 * How many accounts exist — a COUNT of real rows, not a stat. The calculator
 * prefills from this at the owner's ruling (CR-07): "the total users need to be
 * automatic since the CRM knows the active signups and users". What the CRM
 * actually knows is REGISTERED accounts; monthly-active is measured nowhere,
 * and the calculator says that distinction out loud beside the number.
 */
export const countAccounts = async (): Promise<Result<number>> => {
  if (!isConfigured || !supabase) return unavailable<number>(NOT_CONFIGURED);
  const { count, error } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });
  if (error) return failed<number>(error.message);
  return ok(count ?? 0);
};

/* ---- Bookings & Products, names and commissions embedded ------------------ */

export interface BookingDetailed extends Booking {
  product_name: string | null;
  destination_name: string | null;
  destination_kind: "mountain" | "trek" | null;
  company_name: string | null;
  customer_name: string | null;
  guide_name: string | null;
  /** The stored commission rows — rate copied at conversion, never recomputed. */
  commissions: Pick<Commission, "kind" | "rate_bps" | "amount_cents" | "status">[];
}

/**
 * Display names, flat, merged client-side instead of profile-embeds.
 *
 * THE HISTORY, CORRECTED (31 Aug): the first diagnosis blamed a stale
 * PostgREST relationship cache. THE CACHE WAS FINE. The real error was ours:
 * `bookings.guide_id` references GUIDE_PROFILES, not profiles, so a hint
 * asking for a bookings↔profiles relationship through that constraint was
 * refused correctly (PGRST200). The Session that challenged the diagnosis was
 * right to; the probe that settled it tested each hint separately.
 *
 * The flat merge STAYS, now as a stated preference with one genuine
 * necessity: a guide's display name lives two hops away (guide_id →
 * guide_profiles.id = profiles.id), which a single embed cannot express —
 * and one lookup pattern across seven reads beats per-read embed hints that
 * a wrong assumption can quietly break.
 */
const profileNames = async (): Promise<Map<string, string>> => {
  const { data } = await supabase!.from("profiles").select("id, display_name");
  return new Map((data ?? []).map((p) => [p.id, p.display_name]));
};

/**
 * Two reads merged client-side ON PURPOSE: the profiles joins used PostgREST
 * FK-hint embeds first, and the live schema cache refused the relationship
 * even though the constraints exist (verified by name against the migrations).
 * A display name is not worth a dependency on a relationship cache being
 * fresh; profiles are readable outright, so the names are fetched flat and
 * stitched in here.
 */
export const listBookingsDetailed = async (): Promise<Result<BookingDetailed[]>> => {
  if (!isConfigured || !supabase) return unavailable(NOT_CONFIGURED);
  const [bookings, profiles] = await Promise.all([
    supabase
      .from("bookings")
      .select("*, products(name), destinations(name, kind), companies(name), commissions(kind, rate_bps, amount_cents, status)")
      .order("booked_at", { ascending: false }),
    profileNames(),
  ]);
  if (bookings.error) return failed(bookings.error.message);
  const name = profiles;
  return ok(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bookings.data ?? []).map((row: any): BookingDetailed => ({
      ...row,
      product_name: row.products?.name ?? null,
      destination_name: row.destinations?.name ?? null,
      destination_kind: row.destinations?.kind ?? null,
      company_name: row.companies?.name ?? null,
      customer_name: row.customer_id ? (name.get(row.customer_id) ?? null) : null,
      guide_name: row.guide_id ? (name.get(row.guide_id) ?? null) : null,
      commissions: row.commissions ?? [],
    })),
  );
};

/** Raw placement rows for product pages — deliberately not the status view. */
export const listPlacementRows = () =>
  read<
    {
      id: string;
      product_id: string | null;
      destination_id: string;
      slot_position: number;
      status: string;
      price_cents: number | null;
      starts_on: string;
      ends_on: string;
    }[]
  >((db) =>
    db
      .from("placements")
      .select("id, product_id, destination_id, slot_position, status, price_cents, starts_on, ends_on"),
  );

/* ---- Dashboard reads (CR-01) --------------------------------------------- */

/**
 * Head-only counts — real rows, no fabrication, no deltas. There is no prior
 * snapshot to compare against (§1's rule on the tiles), so the dashboard shows
 * figures without "vs last week" claims until a snapshot table exists.
 */
export const dashboardCounts = async (): Promise<
  Result<{ users: number; guides: number; companies: number; bookings: number }>
> => {
  if (!isConfigured || !supabase) return unavailable(NOT_CONFIGURED);
  const count = async (table: string) => {
    const { count: n, error } = await supabase!
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`${table}: ${error.message}`);
    return n ?? 0;
  };
  try {
    const [users, guides, companies, bookings] = await Promise.all([
      count("profiles"),
      count("guide_profiles"),
      count("companies"),
      count("bookings"),
    ]);
    return ok({ users, guides, companies, bookings });
  } catch (e) {
    return failed(e instanceof Error ? e.message : String(e));
  }
};

/** Every profile's country code (nullable) — aggregated client-side. Real
 * two-letter codes from set_my_location; a null is "not stated", never guessed. */
export const listCountryCodes = () =>
  read<{ country_code: string | null }[]>((db) =>
    db.from("profiles").select("country_code"),
  );

/** The dashboard's recent-bookings rows, names embedded. */
export const recentBookings = (limit = 5) =>
  read<
    {
      id: string;
      destination: string | null;
      company: string | null;
      value_cents: number | null;
      booked_at: string;
    }[]
  >((db) =>
    db
      .from("bookings")
      .select("id, value_cents, booked_at, destinations(name), companies(name)")
      .order("booked_at", { ascending: false })
      .limit(limit)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => ({
        error: r.error,
        data: r.data?.map((row: any) => ({
          id: row.id,
          destination: row.destinations?.name ?? null,
          company: row.companies?.name ?? null,
          value_cents: row.value_cents,
          booked_at: row.booked_at,
        })),
      })),
  );

/* ---- The inbound enquiry queue (CR-10 / enquiry contract) ---------------- */

export const listEnquiries = () =>
  read<Enquiry[]>((db) =>
    db
      .from("enquiries")
      .select("*")
      .order("created_at", { ascending: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(async (r: any) => {
        const names = r.error ? new Map<string, string>() : await profileNames();
        return {
          error: r.error,
          data: r.data?.map((row: any): Enquiry => ({
            ...row,
            sender_name: row.sender_name ?? (row.sender_id ? (names.get(row.sender_id) ?? null) : null),
          })),
        };
      }),
  );

export const markEnquirySeen = async (id: string): Promise<Result<null>> => {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failed<null>("Not signed in.");
  const { error } = await supabase
    .from("enquiries")
    .update({ seen_at: new Date().toISOString(), seen_by: auth.user.id })
    .eq("id", id)
    .is("seen_at", null); // set-once; the trigger refuses a re-date anyway
  return error ? failed<null>(error.message) : ok(null);
};

/** The answer is the record AND the delivery: a signed-in sender reads it off
 * their own row. It cannot be changed afterwards — the trigger sees to it. */
export const answerEnquiry = async (id: string, text: string): Promise<Result<null>> => {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failed<null>("Not signed in.");
  const { error } = await supabase
    .from("enquiries")
    .update({
      answered_at: new Date().toISOString(),
      answered_by: auth.user.id,
      answer: text.trim(),
      // seen_* stays untouched: if nobody pressed seen, answered-without-seen
      // is the honest record (and the set-once trigger would refuse a re-date).
    })
    .eq("id", id)
    .is("answered_at", null);
  return error ? failed<null>(error.message) : ok(null);
};

/** S4: pass an enquiry to the company it names. Stamped once, in the actor's
 * own name — the trigger refuses a company-less enquiry, a re-date, or a stamp
 * attributed to somebody else. After it, the company reads the row through
 * `operator_enquiries` (words, object, ICEFALL's answer — never the sender's
 * email); the desk keeps working the row as before. */
export const handOffEnquiry = async (id: string): Promise<Result<null>> => {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failed<null>("Not signed in.");
  const { error } = await supabase
    .from("enquiries")
    .update({ handed_off_at: new Date().toISOString(), handed_off_by: auth.user.id })
    .eq("id", id)
    .is("handed_off_at", null); // set-once; the trigger refuses a re-date anyway
  return error ? failed<null>(error.message) : ok(null);
};

/** CR-06: enquiries per destination — real lead rows, grouped client-side. */
export const listLeadDestinations = () =>
  read<{ destination_id: string | null }[]>((db) =>
    db
      .from("leads")
      .select("destination_id")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => ({ error: r.error, data: r.data })),
  );

/* ---- Guides (CR-13): real profiles, real approval, real sums ------------- */

export const listGuideProfiles = () =>
  read<GuideRow[]>((db) =>
    db
      .from("guide_profiles")
      // guide_credentials_state is a DB computed field — one derivation,
      // shared by every app, never a stored boolean that can go stale.
      // The embed names its FK: guide_verification added a SECOND relationship
      // to profiles (checked_by), so a bare profiles() embed is ambiguous
      // (PGRST201) the moment that migration is live — which it is.
      .select("*, state:guide_credentials_state, profiles!guide_profiles_id_fkey(display_name)")
      .order("created_at", { ascending: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => ({
        error: r.error,
        data: r.data?.map((row: any): GuideRow => ({
          id: row.id,
          name: row.profiles?.display_name ?? "Unnamed guide",
          headline: row.headline,
          based_in: row.based_in,
          mountains: row.mountains ?? [],
          specialities: row.specialities ?? [],
          years_guiding: row.years_guiding,
          credentials_state: row.state ?? "unchecked",
          credentials_checked_at: row.credentials_checked_at,
          credentials_document_ref: row.credentials_document_ref,
          credentials_expire_at: row.credentials_expire_at,
          listed: row.listed,
          created_at: row.created_at,
        })),
      })),
  );

/** Guide-stream commissions with the guide they belong to (via the booking). */
export const listGuideCommissions = () =>
  read<{ guide_id: string | null; amount_cents: number; status: Commission["status"] }[]>((db) =>
    db
      .from("commissions")
      .select("amount_cents, status, bookings(guide_id)")
      .eq("kind", "guide")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => ({
        error: r.error,
        data: r.data?.map((row: any) => ({
          guide_id: row.bookings?.guide_id ?? null,
          amount_cents: row.amount_cents,
          status: row.status,
        })),
      })),
  );

/** Bookings that carry a guide, for per-guide counts. */
export const listGuideBookings = () =>
  read<{ guide_id: string }[]>((db) =>
    db
      .from("bookings")
      .select("guide_id")
      .not("guide_id", "is", null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r: any) => ({ error: r.error, data: r.data })),
  );

/** The approval act. Staff-only, reason required, audited — all in the fn. */
/**
 * Recording a document check: operations desk only, the document named, the
 * expiry from the paper itself (or the explicit statement it has none). The
 * date travels as a DATE — Postgres refuses 2026-02-31 outright and parses
 * without timezone day-shift, so the lapsed-insurance parser bug (§6af)
 * cannot enter the record at the write path.
 */
export const recordGuideDocumentCheck = (
  guideId: string,
  documentRef: string,
  expiresAt: string | null,
  noExpiry: boolean,
) =>
  call("record_guide_document_check", {
    p_guide_id: guideId,
    p_document_ref: documentRef,
    p_expires_at: expiresAt,
    p_no_expiry: noExpiry,
  });

export const revokeGuideDocumentCheck = (guideId: string, reason: string) =>
  call("revoke_guide_document_check", { p_guide_id: guideId, p_reason: reason });

/* ---- The GREY mark (identity) — a separate fact from the gold flow ------- */

export const listIdentityChecks = () =>
  read<IdentityCheck[]>((db) =>
    db.from("identity_checks").select("*").order("checked_at", { ascending: false }));

/** Every profile, name and role only — the picker for recording a check.
 * Identity applies to ANY user, not only guides. */
export const listProfilesBasic = () =>
  read<{ id: string; display_name: string; role: string }[]>((db) =>
    db.from("profiles").select("id, display_name, role").order("display_name"));

export const recordIdentityCheck = (profileId: string, documentRef: string) =>
  call("record_identity_check", { p_profile_id: profileId, p_document_ref: documentRef });

/** Staff create a guide profile FOR a user (owner-ordered: the owner wants one
 * on their own account, to walk the guide app's real cold start). The row is
 * EXACTLY what a self-created one would be — unlisted, nothing checked, no
 * availability — because a pre-warmed profile would hide the surfaces that
 * most need eyes. The insert rides the existing policy (self or admin); the
 * audit event is written by hand since no definer function covers this act. */
export const createGuideProfileFor = async (profileId: string): Promise<Result<null>> => {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failed<null>("Not signed in.");
  const { error } = await supabase.from("guide_profiles").insert({ id: profileId });
  if (error) return failed<null>(error.message);
  const { error: auditErr } = await supabase.from("audit_events").insert({
    actor_id: auth.user.id,
    actor_role: "admin",
    action: "guide_profile.created_by_staff",
    entity_type: "guide_profile",
    entity_id: profileId,
    previous: null,
    next: { cold_start: true },
    company_id: null,
  });
  // The profile exists either way; a failed trace must be said, not swallowed.
  return auditErr ? failed<null>(`Profile created, but the audit trace failed: ${auditErr.message}`) : ok(null);
};

/* -------------------------------------------------------------------------- */
/* Moderation — the queue, what it is about, and the acts it can take         */
/* -------------------------------------------------------------------------- */

/**
 * THE LIVE `reports` TABLE IS NOT THE MIGRATED ONE, AND THIS FILE ASKS RATHER
 * THAN ASSUMING.
 *
 * `20260903010000_block_and_report.sql` gives `reports` the columns that let it
 * say what it is about — `post_id`, `comment_id`, `group_message_id`,
 * `channel_message_id`, `message_id`, `subject_kind` — plus `handled_by`,
 * `handled_at` and `resolution`. Queried against the live database on 3 Sep
 * 2026, NONE of them exist: the migration is written and has not been pushed.
 *
 * So the read below MEASURES which table it is talking to instead of believing
 * one. The full column list is asked for first; PostgREST answers `42703` when
 * a column is missing, and only then is the legacy list asked for. Which of the
 * two came back travels to the screen, because "nothing is waiting" and "no
 * report about a post can even be FILED yet" render as the same empty queue and
 * are entirely different news. The phone app has been inserting `post_id` since
 * before that column existed, so every post report ever filed has failed at the
 * database and been kept on the reporter's device.
 */

export type ReportSubjectKind =
  | "profile" | "thread" | "post" | "comment"
  | "group_message" | "channel_message" | "message";

/** Which shape of `reports` answered. Measured, never assumed. */
export type ReportsSchema = "content_aware" | "legacy";

/**
 * A report as this queue needs it. `ReportRow` in `data/types.ts` is the older
 * shape and is deliberately left alone — it is the phone app's and the CRM's
 * shared vocabulary, and widening it would tell every other reader that columns
 * exist which, today, do not.
 */
export interface ModerationReport extends ReportRow {
  comment_id: string | null;
  group_message_id: string | null;
  channel_message_id: string | null;
  message_id: string | null;
  subject_kind: ReportSubjectKind | null;
  handled_by: string | null;
  handled_at: string | null;
  resolution: string | null;
}

export interface ReportsRead {
  rows: ModerationReport[];
  schema: ReportsSchema;
}

const REPORT_COLUMNS_LEGACY =
  "id, reporter_id, subject_id, thread_id, reason, detail, created_at, status";
const REPORT_COLUMNS_CONTENT =
  `${REPORT_COLUMNS_LEGACY}, post_id, comment_id, group_message_id, channel_message_id, ` +
  "message_id, subject_kind, handled_by, handled_at, resolution";

/**
 * Every column the type promises, filled in explicitly.
 *
 * A legacy row has no `post_id` key at all, and `undefined` under a field typed
 * `string | null` is a lie the compiler cannot see. Spreading the row would
 * carry that lie into every screen; naming the fields cannot.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asModerationReport = (row: any): ModerationReport => ({
  id: row.id,
  reporter_id: row.reporter_id,
  subject_id: row.subject_id ?? null,
  thread_id: row.thread_id ?? null,
  post_id: row.post_id ?? null,
  comment_id: row.comment_id ?? null,
  group_message_id: row.group_message_id ?? null,
  channel_message_id: row.channel_message_id ?? null,
  message_id: row.message_id ?? null,
  subject_kind: row.subject_kind ?? null,
  reason: row.reason,
  detail: row.detail ?? null,
  created_at: row.created_at,
  status: row.status,
  handled_by: row.handled_by ?? null,
  handled_at: row.handled_at ?? null,
  resolution: row.resolution ?? null,
});

/** PostgREST's answer when a column is not there. Anything else is a real fault
 *  and is reported as one — a database that is merely unreachable must never be
 *  mistaken for a database that is one migration behind. */
const missingColumn = (e: { code?: string; message?: string } | null): boolean =>
  !!e && (e.code === "42703" || /column .+ does not exist/i.test(e.message ?? ""));

export const listReports = async (): Promise<Result<ReportsRead>> => {
  if (!isConfigured || !supabase) return unavailable<ReportsRead>(NOT_CONFIGURED);
  const full = await supabase
    .from("reports")
    .select(REPORT_COLUMNS_CONTENT)
    .order("created_at", { ascending: false });
  if (!full.error)
    return ok<ReportsRead>({ rows: (full.data ?? []).map(asModerationReport), schema: "content_aware" });
  if (!missingColumn(full.error)) return failed<ReportsRead>(full.error.message);

  const legacy = await supabase
    .from("reports")
    .select(REPORT_COLUMNS_LEGACY)
    .order("created_at", { ascending: false });
  if (legacy.error) return failed<ReportsRead>(legacy.error.message);
  return ok<ReportsRead>({ rows: (legacy.data ?? []).map(asModerationReport), schema: "legacy" });
};

/* ---- What the desk may actually do, per kind of thing --------------------- */

/**
 * READ OFF `pg_policies` IN THE LIVE DATABASE ON 3 SEP 2026, not inferred from
 * the migration files. A queue that offers a button the database will refuse is
 * a queue that wastes a moderator's decision.
 *
 *   posts_select            … OR is_staff()                       → readable
 *   post_comments_select    EXISTS(posts p …) — and staff read
 *                           every post, so every comment           → readable
 *   channel_messages_select … OR is_staff()                       → readable
 *   messages_select         is_thread_participant OR is_admin()   → readable
 *   threads_select          … OR is_admin()                       → readable
 *   profiles_select         true                                  → readable
 *   group_messages_select   is_group_member(group_id)             → NOT readable
 *
 * The group-message line is the one that moves: `20260903010000` adds the staff
 * arm. Until it is pushed, a reported group message cannot be shown to the desk
 * at all, and this screen says that rather than rendering an empty card.
 */
export const deskCanRead = (kind: ReportSubjectKind, schema: ReportsSchema): boolean =>
  kind === "group_message" ? schema === "content_aware" : true;

/**
 * The same exercise for DELETE.
 *
 *   posts_delete            author OR company admin OR is_staff()  → removable
 *   post_comments_delete    author OR is_staff()                   → removable
 *   group_messages_delete   author OR founder — staff arm arrives with the
 *                           migration                              → after push
 *   channel_messages_delete company admin — staff arm likewise     → after push
 *   messages                NO delete policy and NO delete grant, for anybody.
 *                           A direct message cannot be removed by ICEFALL, and
 *                           that is deliberate: both people hold the record.
 *   threads, profiles       not content; nothing to remove.
 *
 * THE INFERENCE, STATED. The probe measures COLUMNS and this function reads a
 * POLICY off it. They are the same migration file, so in practice they arrive
 * together — but if that ever stops being true the delete simply fails and the
 * screen prints the database's own refusal. Nothing here silently assumes.
 */
export const deskCanRemove = (kind: ReportSubjectKind, schema: ReportsSchema): boolean =>
  kind === "post" || kind === "comment"
    ? true
    : kind === "group_message" || kind === "channel_message"
      ? schema === "content_aware"
      : false;

/* ---- The reported thing itself ------------------------------------------- */

/**
 * What was reported, fetched so a moderator is not deciding blind.
 *
 * One shape per kind, discriminated by the same seven words the database
 * stamps into `subject_kind`, so a screen cannot end up with an eighth.
 */
export type ReportedContent =
  | { kind: "post"; id: string; author_id: string; author_kind: string;
      company_id: string | null; body: string; media_path: string | null;
      expires_at: string | null; created_at: string }
  | { kind: "comment"; id: string; post_id: string; author_id: string;
      body: string; created_at: string }
  | { kind: "group_message"; id: string; group_id: string; group_name: string | null;
      author_id: string; body: string | null; media_path: string | null; created_at: string }
  | { kind: "channel_message"; id: string; channel_id: string; channel_name: string | null;
      company_id: string | null; author_id: string; body: string;
      media_path: string | null; created_at: string }
  | { kind: "message"; id: string; thread_id: string; author_id: string;
      body: string | null; message_kind: string; created_at: string }
  | { kind: "thread"; id: string; title: string | null; peak_name: string | null;
      thread_kind: string | null; created_at: string }
  | { kind: "profile"; id: string; display_name: string; username: string | null;
      role: string; created_at: string };

export interface ContentIndex {
  /** Keyed by `kind:id`. Present = the desk read it. */
  found: Map<string, ReportedContent>;
  /**
   * Why a whole kind is absent, when the reason is known — no read policy, or a
   * query that failed. A target that is in NEITHER map is a row the desk could
   * have read and the database did not return: it is gone, which usually means
   * somebody already deleted it. Those two must not share a sentence.
   */
  withheld: Map<ReportSubjectKind, string>;
}

export const contentKey = (kind: ReportSubjectKind, id: string) => `${kind}:${id}`;

const NO_READ_POLICY: Partial<Record<ReportSubjectKind, string>> = {
  group_message:
    "The moderation desk has no read policy on group messages until " +
    "20260903010000_block_and_report.sql is applied — only members of that group can see it. " +
    "ICEFALL cannot show you what was said, and cannot tell you whether it is still there.",
};

const chunked = <T,>(xs: T[], size = 150): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
};

/**
 * Fetch every reported thing in one pass — one query per KIND, not one per
 * report. Five reports about one post ask for that post once.
 *
 * Names of containers (the group, the channel) are looked up flat rather than
 * embedded, for the reason stated at `profileNames` above: a display name is
 * not worth a dependency on PostgREST's relationship cache. A container name
 * that fails to arrive costs a heading; the words are the evidence and they
 * come from the row itself.
 */
export const readReportedContent = async (
  targets: { kind: ReportSubjectKind; id: string }[],
  schema: ReportsSchema,
): Promise<Result<ContentIndex>> => {
  if (!isConfigured || !supabase) return unavailable<ContentIndex>(NOT_CONFIGURED);
  const db = supabase;
  const found = new Map<string, ReportedContent>();
  const withheld = new Map<ReportSubjectKind, string>();

  const idsOf = (k: ReportSubjectKind) =>
    Array.from(new Set(targets.filter((t) => t.kind === k).map((t) => t.id)));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gather = async (kind: ReportSubjectKind, table: string, columns: string): Promise<any[]> => {
    const ids = idsOf(kind);
    if (ids.length === 0) return [];
    if (!deskCanRead(kind, schema)) {
      withheld.set(kind, NO_READ_POLICY[kind] ?? "The desk has no read policy on this.");
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = [];
    for (const part of chunked(ids)) {
      const { data, error } = await db.from(table).select(columns).in("id", part);
      if (error) {
        withheld.set(kind, error.message);
        return [];
      }
      rows.push(...(data ?? []));
    }
    return rows;
  };

  /** Container names. A failure here is silent BY DESIGN — it costs a label,
   *  never a decision — so it returns an empty map rather than an error. */
  const namesFrom = async (table: string, ids: string[], extra = ""): Promise<Map<string, Record<string, unknown>>> => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    const out = new Map<string, Record<string, unknown>>();
    for (const part of chunked(unique)) {
      const { data } = await db.from(table).select(`id, name${extra}`).in("id", part);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of (data ?? []) as any[]) out.set(r.id, r);
    }
    return out;
  };

  try {
    const posts = await gather(
      "post", "posts",
      "id, author_id, author_kind, company_id, body, media_path, expires_at, created_at",
    );
    for (const p of posts)
      found.set(contentKey("post", p.id), {
        kind: "post", id: p.id, author_id: p.author_id, author_kind: p.author_kind,
        company_id: p.company_id ?? null, body: p.body, media_path: p.media_path ?? null,
        expires_at: p.expires_at ?? null, created_at: p.created_at,
      });

    const comments = await gather("comment", "post_comments", "id, post_id, author_id, body, created_at");
    for (const c of comments)
      found.set(contentKey("comment", c.id), {
        kind: "comment", id: c.id, post_id: c.post_id, author_id: c.author_id,
        body: c.body, created_at: c.created_at,
      });

    const groupMessages = await gather(
      "group_message", "group_messages", "id, group_id, author_id, body, media_path, created_at",
    );
    const groups = await namesFrom("groups", groupMessages.map((g) => g.group_id));
    for (const g of groupMessages)
      found.set(contentKey("group_message", g.id), {
        kind: "group_message", id: g.id, group_id: g.group_id,
        group_name: (groups.get(g.group_id)?.name as string | undefined) ?? null,
        author_id: g.author_id, body: g.body ?? null, media_path: g.media_path ?? null,
        created_at: g.created_at,
      });

    const channelMessages = await gather(
      "channel_message", "channel_messages", "id, channel_id, author_id, body, media_path, created_at",
    );
    const channels = await namesFrom("channels", channelMessages.map((c) => c.channel_id), ", company_id");
    for (const c of channelMessages)
      found.set(contentKey("channel_message", c.id), {
        kind: "channel_message", id: c.id, channel_id: c.channel_id,
        channel_name: (channels.get(c.channel_id)?.name as string | undefined) ?? null,
        company_id: (channels.get(c.channel_id)?.company_id as string | undefined) ?? null,
        author_id: c.author_id, body: c.body, media_path: c.media_path ?? null,
        created_at: c.created_at,
      });

    const messages = await gather("message", "messages", "id, thread_id, sender_id, body, kind, created_at");
    for (const m of messages)
      found.set(contentKey("message", m.id), {
        kind: "message", id: m.id, thread_id: m.thread_id, author_id: m.sender_id,
        body: m.body ?? null, message_kind: m.kind, created_at: m.created_at,
      });

    const threads = await gather("thread", "threads", "id, title, peak_name, kind, created_at");
    for (const t of threads)
      found.set(contentKey("thread", t.id), {
        kind: "thread", id: t.id, title: t.title ?? null, peak_name: t.peak_name ?? null,
        thread_kind: t.kind ?? null, created_at: t.created_at,
      });

    const people = await gather("profile", "profiles", "id, display_name, username, role, created_at");
    for (const p of people)
      found.set(contentKey("profile", p.id), {
        kind: "profile", id: p.id, display_name: p.display_name,
        username: p.username ?? null, role: p.role, created_at: p.created_at,
      });
  } catch (e) {
    return failed<ContentIndex>(e instanceof Error ? e.message : String(e));
  }

  return ok<ContentIndex>({ found, withheld });
};

/**
 * The conversation a reported thread — or a reported direct message — sits in.
 *
 * Fetched ON DEMAND, when a moderator opens that case, rather than with the
 * queue: a report about a conversation is rare and a conversation is long, and
 * reading every one of them up front would put other people's private messages
 * on a screen nobody asked to see them on.
 *
 * `total` is a real COUNT of the rows, alongside the handful returned, because
 * "the last fifteen messages" and "the whole conversation" are different claims
 * and a moderator reading an excerpt has to know which one they are holding.
 * If the count fails it stays null and the screen says the total is not known —
 * it is never quietly replaced by the number of rows on screen.
 */
export interface ThreadMessage {
  id: string;
  author_id: string;
  body: string | null;
  message_kind: string;
  created_at: string;
}

export interface ConversationRead {
  messages: ThreadMessage[];
  total: number | null;
}

export const readThreadMessages = async (
  threadId: string,
  limit = 15,
): Promise<Result<ConversationRead>> => {
  if (!isConfigured || !supabase) return unavailable<ConversationRead>(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, kind, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return failed<ConversationRead>(error.message);
  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("thread_id", threadId);
  return ok<ConversationRead>({
    // Newest first from the database so the LIMIT takes the recent end; reversed
    // here so a person reads it downwards, the way it was written.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: (data ?? []).map((m: any): ThreadMessage => ({
      id: m.id, author_id: m.sender_id, body: m.body ?? null,
      message_kind: m.kind, created_at: m.created_at,
    })).reverse(),
    total: count ?? null,
  });
};

/* ---- Acting on a case ----------------------------------------------------- */

/**
 * A CASE, not a report: five reports about one post are one decision, so every
 * act below takes the whole group and moves all of it together.
 */
export interface ReportCase {
  /**
   * What the case is about — or `null` when the thing it named has been deleted
   * and only the report survives, and when a legacy row names nothing at all.
   * The audit event then belongs to the REPORT rather than to a post whose id
   * nobody holds any more: filing it under a person's id with `entity_type:
   * 'post'` would put a record against an entity that does not exist.
   */
  subjectKind: ReportSubjectKind | null;
  /** The id of the thing reported; the first report's id when there is none. */
  subjectId: string;
  /** Every report in this case that is not already closed. */
  reportIds: string[];
  /** The statuses those reports carry right now, for the audit's `previous`. */
  statuses: string[];
  /** A phrase for the audit when the subject cannot be pointed at. */
  about?: string;
}

/** The audit log's own vocabulary for these entities — matched to what the
 *  database's delete triggers already write, so the log reads as one log. */
const AUDIT_ENTITY: Record<ReportSubjectKind, string> = {
  profile: "profile",
  thread: "thread",
  post: "post",
  comment: "post_comment",
  group_message: "group_message",
  channel_message: "channel_message",
  message: "message",
};

const REMOVABLE_TABLE: Partial<Record<ReportSubjectKind, string>> = {
  post: "posts",
  comment: "post_comments",
  group_message: "group_messages",
  channel_message: "channel_messages",
};

/** `reports_resolution_length` allows 1–2000 characters. */
const capped = (s: string) => s.trim().slice(0, 2000);

/**
 * The trace. Written by hand rather than by a definer function because there is
 * no audited function for moderation, and a queue whose actions leave no record
 * of who acted is the queue this screen replaced.
 *
 * `actor_role` is "admin" and that is READ OFF A POLICY, not guessed:
 * `audit_events_insert` demands `is_staff()`, and `is_staff()` demands
 * `profiles.role = 'admin'` as well as an active staff row — so an insert that
 * succeeds was made by an admin. It is the same word the database's own delete
 * triggers write via `my_role()::text`.
 */
const writeAudit = async (e: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  previous: Record<string, unknown> | null;
  next: Record<string, unknown> | null;
  reason: string | null;
  companyId?: string | null;
}): Promise<string | null> => {
  const { error } = await supabase!.from("audit_events").insert({
    actor_id: e.actorId,
    actor_role: "admin",
    action: e.action,
    entity_type: e.entityType,
    entity_id: e.entityId,
    previous: e.previous,
    next: e.next,
    reason: e.reason,
    company_id: e.companyId ?? null,
  });
  return error ? error.message : null;
};

const moveReportCase = async (
  c: ReportCase,
  status: ReportRow["status"],
  note: string | null,
  schema: ReportsSchema,
  action: string,
): Promise<Result<null>> => {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  if (c.reportIds.length === 0)
    return failed<null>("Every report in this case has already been closed. Reload the queue.");
  if (status === "closed" && (note ?? "").trim().length < 4)
    return failed<null>(
      "Closing a report needs a sentence saying why. On this database it is the only record of the decision.",
    );
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failed<null>("Not signed in.");

  const patch: Record<string, unknown> = { status };
  // `resolution` arrives with 20260903010000. On the legacy table the desk's
  // words are NOT lost — they go into the audit event below — but they cannot
  // be written onto the report row, and nothing here pretends otherwise.
  if (schema === "content_aware" && note) patch.resolution = capped(note);

  const { error } = await supabase.from("reports").update(patch).in("id", c.reportIds);
  if (error) return failed<null>(error.message);

  const auditErr = await writeAudit({
    actorId: auth.user.id,
    action,
    entityType: c.subjectKind ? AUDIT_ENTITY[c.subjectKind] : "report",
    entityId: c.subjectId,
    previous: { status: Array.from(new Set(c.statuses)).sort().join(" / "), reports: c.reportIds.length },
    next: { status, reports: c.reportIds.length, ...(c.about ? { about: c.about } : {}) },
    reason: note ? capped(note) : null,
  });
  return auditErr
    ? failed<null>(
        `The ${c.reportIds.length === 1 ? "report was" : "reports were"} moved to ${status}, ` +
          `but the audit trace failed: ${auditErr}. Record it by hand.`,
      )
    : ok(null);
};

/** Somebody has picked this case up. Says so to the rest of the desk. */
export const claimReportCase = (c: ReportCase, schema: ReportsSchema) =>
  moveReportCase(c, "reviewing", null, schema, "moderation.case_claimed");

/** A closed case reopened — a second look, recorded as one. */
export const reopenReportCase = (c: ReportCase, schema: ReportsSchema) =>
  moveReportCase(c, "reviewing", null, schema, "moderation.case_reopened");

/** Looked at, nothing to remove. The reason is the whole record of that call. */
export const dismissReportCase = (c: ReportCase, note: string, schema: ReportsSchema) =>
  moveReportCase(c, "closed", note, schema, "moderation.case_dismissed");

/**
 * REMOVAL. The act this queue existed without.
 *
 * ORDER MATTERS AND IS DELIBERATE. The row is deleted first, then the audit
 * event is written, then the reports are closed. Writing the audit first would
 * leave a log entry claiming a removal that a refused delete never performed —
 * a false record is worse than a missing one. Writing it after means the trace
 * can fail on its own, and when it does this returns the failure in words
 * rather than reporting success.
 *
 * `count` IS CHECKED, and that is not belt-and-braces. A DELETE that row-level
 * security refuses returns NO ERROR and removes nothing. Without the count this
 * function would report a removal that never happened, which is exactly the
 * class of lie the whole CRM is built to avoid.
 *
 * WHAT SURVIVES: the words. `content` is the row as the desk read it and goes
 * into the audit event's `previous`. (For posts and comments the database's own
 * `posts_delete_audit` trigger independently copies the whole row out — checked
 * live, 3 Sep 2026. The two message tables have no such trigger until
 * 20260903010000, so for those this insert is the only copy.)
 */
export const removeReportedContent = async (req: {
  content: ReportedContent;
  reportCase: ReportCase;
  reason: string;
  schema: ReportsSchema;
}): Promise<Result<null>> => {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const table = REMOVABLE_TABLE[req.content.kind];
  if (!table || !deskCanRemove(req.content.kind, req.schema))
    return failed<null>("ICEFALL cannot remove this kind of thing. Nothing was changed.");
  if (req.reason.trim().length < 4)
    return failed<null>("A removal is permanent, so it needs a reason. Nothing was changed.");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failed<null>("Not signed in.");

  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .eq("id", req.content.id);
  if (error) return failed<null>(error.message);
  if (!count)
    return failed<null>(
      "Nothing was removed. Either it had already gone, or the database refused the deletion for this " +
        "account. Reload the queue before deciding again — no report was closed.",
    );

  const companyId =
    req.content.kind === "post" || req.content.kind === "channel_message"
      ? req.content.company_id
      : null;

  const auditErr = await writeAudit({
    actorId: auth.user.id,
    action: "moderation.content_removed",
    entityType: AUDIT_ENTITY[req.content.kind],
    entityId: req.content.id,
    previous: { ...req.content },
    next: { removed: true, reports_closed: req.reportCase.reportIds.length },
    reason: capped(req.reason),
    companyId,
  });

  let closeErr: string | null = null;
  if (req.reportCase.reportIds.length > 0) {
    const patch: Record<string, unknown> = { status: "closed" };
    if (req.schema === "content_aware") patch.resolution = capped(`Content removed. ${req.reason}`);
    const { error: e2 } = await supabase.from("reports").update(patch).in("id", req.reportCase.reportIds);
    closeErr = e2 ? e2.message : null;
  }

  if (auditErr && closeErr)
    return failed<null>(
      `It was removed. Neither the audit trace (${auditErr}) nor the closing of its reports (${closeErr}) ` +
        "went through — both need doing by hand.",
    );
  if (auditErr)
    return failed<null>(
      `It was removed and its reports were closed, but the audit trace failed: ${auditErr}. ` +
        "Nothing records who did this — record it by hand.",
    );
  if (closeErr)
    return failed<null>(
      `It was removed and the act was recorded, but its reports are still open: ${closeErr}.`,
    );
  return ok(null);
};

/* ---- CR-17: promoted placements (S2) ------------------------------------- */

export const listPromotions = () =>
  read<PromotedPlacement[]>((db) =>
    db.from("promoted_placements").select("*").order("created_at", { ascending: false }));

/** A company's own posts — the promotable targets besides its products. */
export const listCompanyPosts = (companyId: string) =>
  read<{ id: string; body: string; created_at: string }[]>((db) =>
    db.from("posts").select("id, body, created_at").eq("company_id", companyId).order("created_at", { ascending: false }));

export const createPromotion = async (p: {
  companyId: string; postId: string | null; productId: string | null;
  audienceMode: "targeted" | "general"; countries: string[];
  dailyBudgetCents: number; creativePath: string | null;
  startsOn: string; endsOn: string;
}): Promise<Result<null>> => {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failed<null>("Not signed in.");
  const { error } = await supabase.from("promoted_placements").insert({
    company_id: p.companyId, post_id: p.postId, product_id: p.productId,
    audience_mode: p.audienceMode, countries: p.countries,
    daily_budget_cents: p.dailyBudgetCents, creative_path: p.creativePath,
    starts_on: p.startsOn, ends_on: p.endsOn,
    created_by: auth.user.id, // policy pins this to the caller
  });
  return error ? failed<null>(error.message) : ok(null);
};

/** The audience arithmetic's raw facts: every profile's role and stated
 * country. Counted client-side so the reach number is exactly the rows. */
export const listAudienceFacts = () =>
  read<{ role: string; country_code: string | null }[]>((db) =>
    db.from("profiles").select("role, country_code"));

export const setPromotionStatus = async (
  id: string,
  status: PromotedPlacement["status"],
): Promise<Result<null>> => {
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const { error } = await supabase.from("promoted_placements").update({ status }).eq("id", id);
  return error ? failed<null>(error.message) : ok(null);
};

export const revokeIdentityCheck = (profileId: string, reason: string) =>
  call("revoke_identity_check", { p_profile_id: profileId, p_reason: reason });

/** The pinned agreement for one booking, or null — never back-filled. */
export const getBookingAgreement = async (
  bookingId: string,
): Promise<Result<BookingAgreement | null>> => {
  if (!isConfigured || !supabase) return unavailable(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from("booking_agreements")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) return failed(error.message);
  return ok(data as BookingAgreement | null);
};

export const setGuideListed = (guideId: string, value: boolean, reason: string) =>
  call("set_guide_listed", { p_guide_id: guideId, p_value: value, p_reason: reason });

/** CR-14: who handles whom on the desk. Super admin only; audited by the fn. */
export const setSupportScopes = (profileId: string, scopes: string[]) =>
  call("set_support_scopes", { p_profile_id: profileId, p_scopes: scopes });

/* ---- Company access: who can sign in, and who has been invited ---------- */

export const listCompanyMembers = (companyId: string) =>
  read<CompanyMember[]>((db) =>
    db
      .from("company_users")
      .select("profile_id, company_role, status")
      .eq("company_id", companyId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(async (r: any) => {
        const names = r.error ? new Map<string, string>() : await profileNames();
        return {
        error: r.error,
        data: r.data?.map((row: any): CompanyMember => ({
          profile_id: row.profile_id,
          name: names.get(row.profile_id) ?? "Unnamed account",
          company_role: row.company_role,
          status: row.status,
        })),
        };
      }),
    undefined,
    () => offlineRead.companyMembers(companyId),
  );

export const listCompanyInvitations = (companyId: string) =>
  read<CompanyInvitation[]>((db) =>
    db
      .from("invitations")
      .select("id, email, company_role, created_at, expires_at, accepted_at, revoked_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    undefined,
    () => offlineRead.companyInvitations(companyId),
  );

/**
 * Creates the invitation ROW. NOTHING SENDS AN EMAIL — no part of ICEFALL sends
 * mail yet — so the UI that calls this must tell the person to pass the address
 * on themselves, or the invitation waits forever for a signup that never comes.
 */
export const inviteCompanyUser = (companyId: string, email: string, role: "admin" | "sales") =>
  DEMO
    ? offlineAck(() => offlineWrite.inviteCompanyUser(companyId, email, role))
    : call("invite_company_user", { p_company_id: companyId, p_email: email.trim(), p_company_role: role });

export const revokeInvitation = (invitationId: string, reason: string) =>
  DEMO
    ? offlineAck(() => offlineWrite.revokeInvitation(invitationId, reason))
    : call("revoke_invitation", { p_invitation_id: invitationId, p_reason: reason });

export const createCompany = async (
  intake: CompanyIntake,
  internal?: CompanyIntakeInternal,
): Promise<Result<Company>> => {
  if (DEMO) return offlineDone(() => offlineWrite.createCompany(intake));
  if (!isConfigured || !supabase) return unavailable<Company>(NOT_CONFIGURED);
  // Copied field by field, never spread — the same rule as the preview
  // protocol's "never spread the draft". `real_business` is deliberately NOT
  // here and not in CompanyIntake: it defaults to false in the database and
  // only a deliberate staff act may raise it. A create form that could pass it
  // is a create form that could clear a real operator's disclosure.
  const { data, error } = await supabase
    .from("companies")
    .insert({
      name: intake.name,
      slug: intake.slug,
      legal_name: intake.legal_name ?? null,
      description: intake.description ?? null,
      countries: intake.countries ?? [],
      status: intake.status ?? "prospect",
    })
    .select("*")
    .single();
  if (error) return failed<Company>(error.message);
  const company = data as Company;

  // The internal sidecar is a SECOND row on purpose (RLS is row-level, so the
  // staff-only half lives in a table operators have no policy on at all). If
  // this half fails the company still exists — say that rather than pretending
  // the whole create failed.
  if (internal && (internal.source || internal.notes || internal.priority)) {
    const { error: e2 } = await supabase
      .from("company_internal")
      .insert({ company_id: company.id, ...internal });
    if (e2)
      return failed<Company>(
        `The company was created, but its internal notes were not saved: ${e2.message}. Add them from the record.`,
      );
  }
  return ok(company);
};

/**
 * The editable set is the Pick below, and `real_business` is OUTSIDE it on
 * purpose — the disclosure flag is not page content. Flipping it is a separate,
 * deliberate act with its own confirmation, not something an editor patch may
 * carry incidentally.
 */
export const updateCompanyRecord = async (
  id: string,
  patch: Partial<Pick<Company, "name" | "legal_name" | "description" | "countries" | "regions">>,
): Promise<Result<Company>> => {
  if (DEMO) return offlineDone(() => offlineWrite.updateCompanyRecord(id, patch));
  if (!isConfigured || !supabase) return unavailable<Company>(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from("companies")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return failed<Company>(error.message);
  return ok(data as Company);
};

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
const pending = <T,>(demoValue: () => T, offlineValue?: () => T): Promise<Result<T>> =>
  DEMO && offlineValue
    ? Promise.resolve(ok(offlineValue()))
    : Promise.resolve(
    SHOW_DEMO_DATA
      ? ok(demoValue())
      : unavailable<T>(
          "This module's tables are specified but not yet in the database. " +
            "Nothing is shown rather than something invented.",
        ),
  );

/* These five now read their REAL tables (they existed all along — the audit's
 * "missing" list went stale when crm_finance and crm_trust_support landed and
 * nobody switched the reads). Each maps the database row into the screen's
 * type; vocab differences are translated here, in one place, and every field
 * the schema cannot supply is mapped to an honest null, never invented. */

const invoiceStatus = (s: string): Invoice["status"] =>
  s === "issued" || s === "part_paid" ? "sent" : (s as Invoice["status"]);

export const listInvoices = () =>
  read<Invoice[]>(
    (db) =>
      db
        .from("invoices")
        .select("*, invoice_lines(source_type, placement_id)")
        .order("issued_on", { ascending: false })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((r: any) => ({
          error: r.error,
          data: r.data?.map((row: any): Invoice => ({
            id: row.id,
            number: row.number,
            company_id: row.company_id,
            kind:
              row.invoice_lines?.[0]?.source_type === "placement" ? "placement"
              : row.invoice_lines?.[0]?.source_type === "commission" ? "referral"
              : "other",
            placement_id: row.invoice_lines?.[0]?.placement_id ?? null,
            amount_cents: row.total_cents,
            currency: row.currency,
            status: invoiceStatus(row.status),
            issued_on: row.issued_on,
            due_on: row.due_on,
            paid_on: null, // not stored on the invoice; the payments ledger says when
          })),
        })),
    () => demo.invoices,
    () => offlineRead.invoices(),
  );

export const listPayments = () =>
  read<Payment[]>(
    (db) => db.from("payments").select("*").order("received_on", { ascending: false }),
    () => demo.payments,
    () => offlineRead.payments(),
  );

export const listTickets = () =>
  read<Ticket[]>(
    (db) =>
      db
        .from("support_tickets")
        .select("*, support_ticket_messages(body, internal, created_at)")
        .order("opened_at", { ascending: false })
        .order("created_at", { ascending: false, foreignTable: "support_ticket_messages" })
        .limit(1, { foreignTable: "support_ticket_messages" })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(async (r: any) => {
          const names = r.error ? new Map<string, string>() : await profileNames();
          return {
            error: r.error,
            // Two translations this mapping DELIBERATELY does not make (support
            // contract §4): `account` stays `account`, and the two waiting
            // states stay separate.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: r.data?.map((row: any) => mapTicket(row, names)),
          };
        }),
    () => demo.tickets,
    () => offlineRead.tickets(),
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapTicket = (row: any, names?: Map<string, string>): Ticket => ({
  id: row.id,
  reference: row.reference,
  subject: row.subject,
  type: row.type,
  priority: row.priority === "normal" ? "medium" : row.priority,
  status: row.status,
  customer_id: row.requester_id,
  company_id: row.company_id,
  lead_id: row.lead_id,
  booking_id: row.booking_id,
  assigned_to: row.assigned_to,
  requester_kind: row.requester_kind,
  origin_app: row.origin_app,
  origin_screen: row.origin_screen || null,
  requester_email: row.requester_email ?? null,
  // A visitor's stored name first; otherwise the signed-in requester's real
  // display name from their profile. "App user · Phone app" with no name reads
  // as broken on the first cross-app journey the owner looks at.
  requester_name:
    row.requester_name ?? (row.requester_id ? (names?.get(row.requester_id) ?? null) : null),
  snippet: row.support_ticket_messages?.[0]
    ? (row.support_ticket_messages[0].internal ? "[internal note] " : "") +
      row.support_ticket_messages[0].body
    : null,
  created_at: row.opened_at,
  updated_at: row.updated_at ?? row.opened_at,
});

export const getTicket = (id: string) =>
  read<Ticket>(
    (db) =>
      db
        .from("support_tickets")
        .select("*")
        .eq("id", id)
        .single()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(async (r: any) => {
          const names = r.error ? new Map<string, string>() : await profileNames();
          return { error: r.error, data: r.data ? mapTicket(r.data, names) : null };
        }),
    () => demo.tickets.find((t) => t.id === id) ?? demo.tickets[0],
    () => offlineRead.ticket(id),
  );

export const listTicketMessages = (ticketId: string) =>
  read<TicketMessage[]>(
    (db) =>
      db
        .from("support_ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(async (r: any) => {
          const names = r.error ? new Map<string, string>() : await profileNames();
          return {
          error: r.error,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: r.data?.map((row: any): TicketMessage => ({
            id: row.id,
            ticket_id: row.ticket_id,
            author_id: row.author_id,
            author_name: names.get(row.author_id) ?? null,
            body: row.body,
            internal: row.internal,
            created_at: row.created_at,
          })),
          };
        }),
    () => [],
    // Offline a ticket opens onto an actual conversation. An empty thread is a
    // legitimate live state and a useless demonstration one — the whole screen
    // is the reply, the internal note and the styling that separates them.
    () => offlineRead.ticketMessages(ticketId),
  );

/**
 * A staff reply, or with `internal: true` a private note the requester can
 * never read (RLS enforces it; the UI marks it anyway). The author is the
 * signed-in session — a reply always carries the name of the person who wrote it.
 */
export const replyToTicket = async (
  ticketId: string,
  body: string,
  internal: boolean,
): Promise<Result<null>> => {
  if (DEMO) return offlineAck(() => offlineWrite.replyToTicket(ticketId, body, internal));
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failed<null>("Not signed in.");
  const { error } = await supabase
    .from("support_ticket_messages")
    .insert({ ticket_id: ticketId, author_id: auth.user.id, body: body.trim(), internal });
  return error ? failed<null>(error.message) : ok(null);
};

/**
 * Resolving or closing REQUIRES a resolution — the status CHECK refuses to
 * close a ticket without one, so the caller must collect the sentence first.
 */
export const setTicketStatus = async (
  ticketId: string,
  status: Ticket["status"],
  resolution?: string,
): Promise<Result<null>> => {
  if (DEMO) return offlineAck(() => offlineWrite.setTicketStatus(ticketId, status, resolution));
  if (!isConfigured || !supabase) return unavailable<null>(NOT_CONFIGURED);
  const done = status === "resolved" || status === "closed";
  const { error } = await supabase
    .from("support_tickets")
    .update(
      done
        ? { status, resolution: resolution?.trim() || null, resolved_at: new Date().toISOString() }
        : { status, resolved_at: null },
    )
    .eq("id", ticketId);
  return error ? failed<null>(error.message) : ok(null);
};

/** The visitor queue. Requests, not tickets — nothing here is a ticket yet. */
export const listIntake = () =>
  read<IntakeRequest[]>((db) =>
    db.from("support_intake").select("*").order("created_at", { ascending: false }),
    undefined,
    () => offlineRead.intake(),
  );

/**
 * Turn an intake request into a real ticket. Two writes: the ticket (stamped
 * `visitor`, carrying the email the answer must go to) and the intake row's
 * handled marker. If the second fails the first still happened — the message
 * says so instead of pretending the whole act failed.
 */
export const triageIntake = async (
  intake: IntakeRequest,
): Promise<Result<{ id: string; reference: string }>> => {
  if (DEMO) return offlineDone(() => offlineWrite.triageIntake(intake));
  if (!isConfigured || !supabase) return unavailable<{ id: string; reference: string }>(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      subject: intake.subject,
      type: "other",
      priority: "normal",
      status: "open",
      requester_kind: "visitor",
      requester_email: intake.email,
      requester_name: intake.name,
      origin_app: intake.origin_app,
      origin_screen: intake.origin_screen,
    })
    .select("id, reference")
    .single();
  if (error) return failed<{ id: string; reference: string }>(error.message);
  const { error: e2 } = await supabase
    .from("support_intake")
    .update({ handled_at: new Date().toISOString(), ticket_id: data.id })
    .eq("id", intake.id);
  if (e2)
    return failed<{ id: string; reference: string }>(
      `Ticket ${data.reference} was created, but the intake row could not be marked handled: ${e2.message}. It will still show in the queue.`,
    );
  return ok({ id: data.id, reference: data.reference });
};

export const listDocuments = () =>
  read<VerificationDocument[]>(
    (db) =>
      db
        .from("verification_documents")
        .select("*, companies(name)")
        .order("created_at", { ascending: false })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(async (r: any) => {
          const names = r.error ? new Map<string, string>() : await profileNames();
          return {
          error: r.error,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: r.data?.map((row: any): VerificationDocument => ({
            id: row.id,
            subject_type: row.company_id ? "company" : "guide",
            subject_id: row.company_id ?? row.guide_profile_id ?? "",
            subject_name: row.companies?.name ?? "Guide",
            kind: row.document_type,
            label: row.label,
            // "expired" is DERIVED from the printed date, never stored — a
            // stored expiry flag is a value that goes stale the day it matters.
            state:
              row.state === "pending" && row.expires_on && row.expires_on < new Date().toISOString().slice(0, 10)
                ? "expired"
                : row.state,
            issued_on: row.issued_on,
            expires_on: row.expires_on,
            checked_on: row.checked_at ? row.checked_at.slice(0, 10) : null,
            checked_by: row.checked_by ? (names.get(row.checked_by) ?? "a staff reviewer") : null,
            note: row.note === "seed:fill" ? null : row.note,
          })),
          };
        }),
    () => demo.documents,
    () => offlineRead.documents(),
  );

export const listStaff = () =>
  read<StaffRecord[]>(
    (db) =>
      db
        .from("staff_members")
        .select("*")
        .order("created_at", { ascending: true })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(async (r: any) => {
          const names = r.error ? new Map<string, string>() : await profileNames();
          return {
          error: r.error,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: r.data?.map((row: any): StaffRecord => ({
            profile_id: row.profile_id,
            name: names.get(row.profile_id) ?? "ICEFALL staff",
            // The schema holds no email (it lives in auth, which the client
            // cannot read). Empty string renders as absent, never invented.
            email: "",
            staff_role: row.staff_role,
            department: row.department ?? "",
            active: row.active,
            support_scopes: row.support_scopes ?? [],
            joined_on: row.created_at,
          })),
          };
        }),
    () => demo.staff,
    () => offlineRead.staff(),
  );
/* Customers and guides are PEOPLE. Their tables exist (profiles,
 * guide_profiles) but every row requires a real login, and this project's
 * standing ruling (crm_seed.sql) is that we do not fabricate auth users. So
 * these two stay on the flag-gated demonstration path — visibly fictional in
 * development, honestly absent in a real build — until real people sign up. */
export const listCustomers = () =>
  pending<CustomerRecord[]>(() => demo.customers, () => offlineRead.customers());
export const listGuides = () => pending<GuideRecord[]>(() => demo.guides, () => offlineRead.guides());
export const listPlacementPrices = () =>
  pending<PlacementPrice[]>(() => demo.placementPrices, () => offlineRead.placementPrices());
