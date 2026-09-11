/**
 * Settings, built to the mockup's left-nav layout — and widened this wave to
 * the brief's §6.7 list: company details, integrations, the audit log, data
 * export, retention and verification records.
 *
 * The mockup's sub-nav lists Account, Notifications, Security, Preferences,
 * Users & Roles, Integrations, Billing. Only the panes that actually exist are
 * kept — Security/Preferences have no real backing and a pane of dead switches
 * would be worse than no pane.
 *
 * Several sections are deliberately not what a generic settings screen shows,
 * and all for the same honesty reason ("make these real or show a truthful
 * unavailable state" — brief §6.7):
 *
 *   COMPANY DETAILS is largely read-only. Spec §13 puts the company record, the
 *   first admin login and access resets in ICEFALL's hands. The brief's legal
 *   name, timezone and default currency have NO FIELD on the company record and
 *   NO WRITE on the seam, so the controls exist, the save says exactly that,
 *   and nothing pretends to persist.
 *
 *   INTEGRATIONS is a list of "Not connected" rows and nothing else. There is
 *   no provider behind any of them and no connect flow, so no button opens
 *   one — a connect form for a provider that cannot be connected is the false
 *   success state brief §4 forbids.
 *
 *   BILLING has no card form and no card on file, because THERE IS NO PAYMENT
 *   PROCESSOR ANYWHERE IN ICEFALL and no money has ever moved. A displayed card
 *   is a fabricated payment record. The section states the real position instead.
 *
 *   ACCOUNT's "Update" / "Update password" / "Delete account" controls have no
 *   backend methods behind them in the local demo — so each one says exactly
 *   that instead of flashing a fake success. Deletion in particular walks the
 *   mockup's type-the-company-name confirmation and then STOPS: closing an
 *   operator account is done by Icefall, because leads, bookings and customer
 *   conversations are a commercial record.
 *
 *   VERIFICATION never renders "verified" without a reviewer and a time. The
 *   company record has a document-check date and no verification status; the
 *   guide record has a status and no reviewer. Both are shown as what they are.
 *
 * APPEARANCE (OP-09) lives in the Account pane rather than reviving the
 * mockup's Preferences entry. A whole sub-nav section holding one switch reads
 * as a section with the rest of its switches missing, and the mockup's other
 * Preferences rows are exactly the dead switches the paragraph above refuses to
 * draw. It is the one control on this screen that takes effect immediately and
 * survives a reload, so it is the one that does not need a Notice explaining
 * that nothing happened.
 */

import { useMemo, useState } from "react";
import {
  Archive, Bell, Building2, CreditCard, Download, Monitor, Moon, Plug, ScrollText, ShieldCheck, Sun, UserRound, Users,
} from "lucide-react";
import {
  Button, Card, Field, LockedNotice, Notice, PageHeader, Pagination, Pill, inputClass,
} from "@/components/ui";
import { Listbox } from "@/components/controls";
import { can, isOwnerAccount } from "@/domain/authz";
import { CRM_NOTICES } from "@/domain/crm";
import { OPERATOR_NOTICES } from "@/domain/honesty";
import { formatDay, TODAY } from "@/domain/dates";
import { REDACTED, type AuditEvent, type Booking, type CompanyRole, type Contact, type GuideResource, type Lead, type Participant, type Proposal, type VerificationStatus } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";
import { useTheme, type ThemeChoice } from "@/state/theme";
import { downloadCsv } from "./Finance";
import { FINANCIAL_EVENT_CSV_HEADER, financialEventRow, toCsv } from "./financeLedger";

type Section =
  | "account"
  | "company"
  | "notifications"
  | "team"
  | "integrations"
  | "audit"
  | "export"
  | "retention"
  | "verification"
  | "billing";

const SECTIONS: { key: Section; label: string; icon: typeof Building2 }[] = [
  { key: "account", label: "Account", icon: UserRound },
  { key: "company", label: "Company details", icon: Building2 },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "team", label: "Users & roles", icon: Users },
  { key: "integrations", label: "Integrations", icon: Plug },
  { key: "audit", label: "Audit log", icon: ScrollText },
  { key: "export", label: "Data export", icon: Download },
  { key: "retention", label: "Retention & deletion", icon: Archive },
  { key: "verification", label: "Verification records", icon: ShieldCheck },
  { key: "billing", label: "Billing", icon: CreditCard },
];

/** Every role gets a label — the six of brief §4, never a raw enum on screen. */
const ROLE_LABEL: Record<CompanyRole, string> = {
  owner: "Account owner",
  admin: "Company Admin",
  sales: "Sales Employee",
  operations: "Operations",
  guide_coordinator: "Guide coordinator",
  finance_read_only: "Finance (read only)",
};

type Loaded<T> = T | null | undefined;

export default function Settings() {
  const { company } = useOperator();
  const [section, setSection] = useState<Section>("account");

  return (
    <>
      <PageHeader title="Settings" detail="Your account, your company's details, and the record of what this workspace holds." />

      <div className="grid gap-4 lg:grid-cols-[210px_1fr]">
        <Card className="h-fit p-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`mb-0.5 flex w-full items-center gap-2.5 rounded-tile px-3 py-2 text-left text-[12.5px] transition-colors ${
                  active ? "bg-azure-soft font-medium text-azure-ink" : "text-muted hover:bg-raised hover:text-ink"
                }`}
              >
                <Icon size={14} className="shrink-0" aria-hidden />
                {s.label}
              </button>
            );
          })}
        </Card>

        <div>
          {section === "account" && <AccountPane />}
          {section === "company" && <CompanyDetailsPane />}

          {section === "notifications" && (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-ink">Notifications</h2>
              <p className="mt-1 text-[12.5px] text-muted">
                What Icefall tells you about, and where it appears.
              </p>
              <ul className="mt-4 space-y-2.5">
                {[
                  "A new customer enquiry",
                  "A new message on an existing conversation",
                  "A lead assigned to you",
                  "A booking recorded",
                  "Content approved, rejected, or returned with changes",
                  "A placement approaching its end date",
                ].map((x) => (
                  <li key={x} className="flex items-center justify-between rounded-tile bg-canvas px-3 py-2.5">
                    <span className="text-[12.5px] text-ink">{x}</span>
                    <span className="text-[11.5px] text-muted">In the portal</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line-soft pt-3 text-[11.5px] leading-snug text-muted">
                Email delivery is not connected yet. Rather than show a switch that does nothing, this says so
                — everything above appears in your Notifications tab today.
              </p>
            </Card>
          )}

          {section === "team" && (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-ink">Users &amp; roles</h2>
              <p className="mt-1 text-[12.5px] text-muted">
                Staff are managed on their own screen, where you can see roles and status together.
              </p>
              <div className="mt-4">
                <a href="/operator/team">
                  <Button variant="primary">Open team</Button>
                </a>
              </div>
            </Card>
          )}

          {section === "integrations" && <IntegrationsPane />}
          {section === "audit" && <AuditPane />}
          {section === "export" && <ExportPane />}
          {section === "retention" && <RetentionPane />}
          {section === "verification" && <VerificationPane />}

          {section === "billing" && (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold text-ink">Billing</h2>
              {/*
                No card form, no card on file, no invoice table. There is no
                payment processor in ICEFALL and no money has ever moved through
                it; a displayed card or a fabricated invoice history would be a
                payment record that does not exist.
              */}
              <div className="mt-4">
                <Notice>
                  <strong className="font-semibold text-ink">There is no billing in this portal.</strong>{" "}
                  Placement and referral arrangements are agreed with your Icefall contact directly, and
                  invoices come from them. Icefall does not hold your card details, and this screen will not
                  ask for them.
                </Notice>
              </div>
              <p className="mt-4 text-[11.5px] leading-snug text-muted">
                If you are expecting an invoice or want to discuss a placement, reply to your Icefall contact.
                {" "}What Icefall has invoiced as commission against your bookings is on the Finance screen.
              </p>
              {company && (
                <p className="mt-2 text-[11.5px] leading-snug text-faint">
                  Billing settings, when they exist, will be for the account owner alone — nothing here calls that permission yet.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/* ---- Company details ---------------------------------------------------- */

const TIMEZONE_OPTIONS = [
  "Asia/Kathmandu", "Asia/Karachi", "Asia/Dushanbe", "Asia/Bishkek", "Asia/Almaty",
  "Europe/Oslo", "Europe/Zurich", "Europe/Paris", "Europe/Madrid", "Europe/London",
  "America/Anchorage", "America/Denver", "America/Santiago", "America/Argentina/Mendoza",
  "Africa/Nairobi", "Africa/Dar_es_Salaam", "Pacific/Auckland",
].map((z) => ({ value: z, label: z }));

const CURRENCY_OPTIONS = ["EUR", "USD", "GBP", "CHF", "NOK", "NPR", "PKR", "CLP", "ARS", "TZS", "NZD"].map((c) => ({ value: c, label: c }));

/**
 * The brief's Organization fields (legal/trading name, country, timezone,
 * default currency). The company record holds `name`, `country` and `city`
 * and no more; the seam has no method that writes any of these. So the fields
 * are real controls that hold a value while the page is open, and the save
 * says precisely what did not happen — the truthful unavailable state, not a
 * spinner and a tick.
 */
function CompanyDetailsPane() {
  const session = useSession();
  const { company } = useOperator();
  const [legalName, setLegalName] = useState("");
  const [timezone, setTimezone] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const mayEdit = can(session, "editCompanyProfile");

  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Company details</h2>
      <p className="mt-1 text-[12.5px] text-muted">
        Who you are on paper, and the defaults your records use.
      </p>
      <div className="mt-4 grid max-w-xl gap-4">
        <Field label="Trading name" hint="Set by Icefall. Ask your contact to change it.">
          <input className={inputClass} value={company?.name ?? ""} disabled readOnly />
        </Field>
        <Field label="Legal name" hint="Not stored on your company record yet — see the note below.">
          <input className={inputClass} value={legalName} disabled={!mayEdit} onChange={(e) => setLegalName(e.target.value)} placeholder="Registered company name" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Country" hint="Set by Icefall.">
            <input className={inputClass} value={company?.country ?? ""} disabled readOnly />
          </Field>
          <Field label="Based in" hint="Set by Icefall.">
            <input className={inputClass} value={company?.city ?? ""} disabled readOnly />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Listbox label="Timezone" value={timezone} options={TIMEZONE_OPTIONS} placeholder="Not set" onChange={setTimezone} disabled={!mayEdit} />
            <p className="mt-1 text-[11.5px] leading-snug text-muted">Timestamps are stored in UTC. A timezone would decide how they are shown.</p>
          </div>
          <div>
            <Listbox label="Default currency" value={currency} options={CURRENCY_OPTIONS} placeholder="Not set" onChange={setCurrency} disabled={!mayEdit} />
            <p className="mt-1 text-[11.5px] leading-snug text-muted">Every proposal and booking states its own currency regardless.</p>
          </div>
        </div>
        <Field label="Documents">
          <div className="text-[12.5px] text-muted">
            {OPERATOR_NOTICES.documentsChecked(
              company?.documentsCheckedAt ? formatDay(company.documentsCheckedAt.slice(0, 10)) : null,
            ) ?? "Icefall has not recorded a document check for your company."}
          </div>
        </Field>
      </div>
      {msg && (
        <div className="mt-4">
          <Notice>{msg}</Notice>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
        {mayEdit ? (
          <Button
            variant="primary"
            onClick={() =>
              setMsg(
                "Nothing was saved. Your company record has no legal-name, timezone or default-currency field yet, and this portal has no method to write one — they are part of the pending CRM schema request. Greyed fields belong to Icefall.",
              )
            }
          >
            Save changes
          </Button>
        ) : (
          <span className="text-[11.5px] text-muted">Company details are edited by the owner and Company Admins.</span>
        )}
      </div>
    </Card>
  );
}

/* ---- Integrations ------------------------------------------------------- */

/**
 * Brief §4 Integration Connection: capability + provider + status +
 * last_verified_at. Every row is `not_connected` because nothing is connected,
 * and there is no connect button because there is nothing to connect to. A
 * status that is always the same word is still a status, and rendering it is
 * how the operator learns which parts of their workflow this CRM does not yet
 * reach.
 */
const INTEGRATIONS: { capability: string; what: string }[] = [
  { capability: "Email", what: "Sending and logging email. Until connected, nothing here can be marked sent." },
  { capability: "Calendar", what: "Departure dates and tasks in your calendar." },
  { capability: "Payments", what: "A provider reporting receipts into the ledger. Until connected, every receipt is entered by a person and says so." },
  { capability: "Accounting", what: "Invoices and receipts flowing to your books. CSV export is the route today." },
  { capability: "Waivers", what: "E-signed waivers arriving as documents." },
  { capability: "Storage", what: "A private store for participant documents. References are paths; nothing here holds a public link." },
];

function IntegrationsPane() {
  const session = useSession();
  const mayManage = can(session, "manageIntegrations");
  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Integrations</h2>
      <p className="mt-1 text-[12.5px] text-muted">
        Each connection this CRM could make, and whether it has. None has.
      </p>
      <div className="mt-4">
        {INTEGRATIONS.map((i, idx) => (
          <div key={i.capability} className={`flex flex-wrap items-start justify-between gap-3 py-3 ${idx > 0 ? "border-t border-line-soft" : ""}`}>
            <div className="min-w-0 max-w-xl">
              <div className="text-[12.5px] font-medium text-ink">{i.capability}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-muted">{i.what}</div>
            </div>
            <div className="flex items-center gap-3 text-[11.5px] text-faint">
              <span>Provider: none</span>
              <span>Last verified: never</span>
              <Pill>Not connected</Pill>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-line-soft pt-3 text-[11.5px] leading-snug text-muted">
        {mayManage
          ? "There is no connect flow here yet: no provider adapter exists behind any row, so a connect button would open a form that cannot succeed. When one exists it will appear on its row, and its failures will be shown rather than hidden."
          : "Connecting a provider is for the owner and Company Admins. Nothing is connected today."}
      </p>
    </Card>
  );
}

/* ---- Audit log ---------------------------------------------------------- */

const AUDIT_PAGE = 15;

/** Time of day from a UTC ISO stamp, so two events on one day keep their order visibly. */
const timeOf = (iso: string) => iso.slice(11, 16);

function AuditPane() {
  const session = useSession();
  const { backend, revision } = useOperator();
  const team = useAsync(() => backend.getTeam(session), [session, revision], []);
  const events = useAsync<Loaded<AuditEvent[]>>(
    () => (backend.listAuditEvents ? backend.listAuditEvents(session) : Promise.resolve(null)),
    [session, revision],
    undefined,
  );
  const [entityType, setEntityType] = useState<string>("all");
  const [page, setPage] = useState(1);

  const types = useMemo(() => [...new Set((events ?? []).map((e) => e.entityType))].sort(), [events]);
  const filtered = (events ?? []).filter((e) => entityType === "all" || e.entityType === entityType);
  const pageCount = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE));
  const current = Math.min(page, pageCount);
  const shown = filtered.slice((current - 1) * AUDIT_PAGE, current * AUDIT_PAGE);
  const actor = (id: string) => team.find((u) => u.id === id)?.displayName ?? id;
  const changed = (e: AuditEvent) => Object.keys(e.afterSnapshotOrDiff ?? e.beforeSnapshotOrDiff ?? {});

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">Audit log</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            One line per change to your records — who, what, when. Newest first. Sensitive values are recorded as
            changed, never as what they changed to.
          </p>
        </div>
        {events && events.length > 0 && (
          <div className="w-[220px]">
            <Listbox
              label="Entity"
              value={entityType}
              options={[{ value: "all", label: "All entities" }, ...types.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))]}
              onChange={(v) => {
                setEntityType(v);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      {events === undefined ? (
        <p className="mt-4 text-[12.5px] text-faint">Loading…</p>
      ) : events === null ? (
        <div className="mt-4">
          <Notice>{CRM_NOTICES.NOT_CONNECTED}</Notice>
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-[12.5px] text-muted">No audit event recorded{entityType === "all" ? "" : " for this entity"}.</p>
      ) : (
        <>
          <p className="mt-3 text-[11.5px] text-faint">
            {filtered.length} event{filtered.length === 1 ? "" : "s"} · page {current} of {pageCount}
          </p>
          <div className="mt-2 -mx-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12px]">
              <thead>
                <tr className="border-b border-line">
                  {["When", "Who", "Entity", "Action", "Fields"].map((h) => (
                    <th key={h} className="lbl px-5 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id} className="border-t border-line-soft align-top">
                    <td className="tnum px-5 py-2 whitespace-nowrap text-muted">{formatDay(e.createdAt.slice(0, 10))} {timeOf(e.createdAt)}</td>
                    <td className="px-5 py-2 text-ink">{actor(e.actorId)}</td>
                    <td className="px-5 py-2 text-muted">
                      <span className="text-ink">{e.entityType.replace(/_/g, " ")}</span>
                      <span className="ml-1.5 text-faint">{e.entityId}</span>
                    </td>
                    <td className="px-5 py-2 text-ink">{e.action.replace(/_/g, " ")}</td>
                    <td className="px-5 py-2 text-faint">
                      {changed(e).length === 0
                        ? "—"
                        : e.action === "created"
                          ? `${changed(e).length} fields recorded`
                          : changed(e).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={current} pageCount={pageCount} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

/* ---- Data export -------------------------------------------------------- */

/**
 * The CSV bundle, one file per dataset, gated on `exportData`. Amounts stay
 * in integer minor units; a redacted participant field exports as the word
 * `forbidden`, because the export is read by the same role that could not
 * read the field on screen.
 */
function ExportPane() {
  const session = useSession();
  const { backend, revision } = useOperator();
  const mayExport = can(session, "exportData");
  const team = useAsync(() => backend.getTeam(session), [session, revision], []);
  const bookings = useAsync(() => backend.getBookings(session), [session, revision], []);
  const leads = useAsync(() => backend.getLeads(session), [session, revision], []);
  const contacts = useAsync<Loaded<Contact[]>>(() => (backend.listContacts ? backend.listContacts(session) : Promise.resolve(null)), [session, revision], undefined);
  const events = useAsync<Loaded<import("@/domain/types").FinancialEvent[]>>(() => (backend.listFinancialEvents ? backend.listFinancialEvents(session) : Promise.resolve(null)), [session, revision], undefined);
  const proposals = useAsync<Loaded<Proposal[]>>(() => (backend.listProposals ? backend.listProposals(session) : Promise.resolve(null)), [session, revision], undefined);
  const participants = useAsync<Loaded<Participant[]>>(() => (backend.listParticipants ? backend.listParticipants(session) : Promise.resolve(null)), [session, revision], undefined);
  const audit = useAsync<Loaded<AuditEvent[]>>(() => (backend.listAuditEvents ? backend.listAuditEvents(session) : Promise.resolve(null)), [session, revision], undefined);
  const [done, setDone] = useState<string | null>(null);

  const stamp = TODAY;
  const datasets: { name: string; rows: Loaded<number>; run: () => void }[] = [
    {
      name: "Bookings",
      rows: bookings.length,
      run: () =>
        downloadCsv(
          `bookings-${stamp}.csv`,
          toCsv(
            ["id", "status", "lead_id", "proposal_id", "departure_id", "primary_contact_id", "product_id", "mountain_id", "currency", "quoted_total_minor", "deposit_due_minor", "balance_due_minor", "deposit_due_at", "balance_due_at", "external_reference", "payment_provider_reference", "value_status", "value_minor", "booked_at", "starts_on"],
            bookings.map((b: Booking) => [
              b.id, b.status, b.leadId, b.proposalId ?? null, b.departureId ?? null, b.primaryContactId ?? null, b.productId, b.mountainId, b.currency,
              b.quotedTotalMinor ?? null, b.depositDueMinor ?? null, b.balanceDueMinor ?? null, b.depositDueAt ?? null, b.balanceDueAt ?? null,
              b.externalReference ?? null, b.paymentProviderReference ?? null, b.value.status, b.value.status === "reported" ? b.value.cents : null, b.bookedAt, b.startsOn,
            ]),
          ),
        ),
    },
    {
      name: "Financial events",
      rows: events === undefined ? undefined : events === null ? null : events.length,
      run: () => events && downloadCsv(`financial-events-${stamp}.csv`, toCsv(FINANCIAL_EVENT_CSV_HEADER, events.map((e) => financialEventRow(e, team, contacts ?? [])))),
    },
    {
      name: "Leads",
      rows: leads.length,
      run: () =>
        downloadCsv(
          `leads-${stamp}.csv`,
          toCsv(
            ["id", "customer_name", "contact_id", "status", "origin", "source", "owner_id", "product_id", "mountain_id", "booking_id", "tags", "created_at", "first_response_at", "qualified_at", "quoted_at", "booked_at", "lost_at", "lost_reason"],
            leads.map((l: Lead) => [l.id, l.customerName, l.contactId ?? null, l.status, l.origin, l.source, l.ownerId, l.productId, l.mountainId, l.bookingId, l.tags.join("; "), l.createdAt, l.firstResponseAt, l.qualifiedAt, l.quotedAt, l.bookedAt, l.lostAt, l.lostReason]),
          ),
        ),
    },
    {
      name: "Contacts",
      rows: contacts === undefined ? undefined : contacts === null ? null : contacts.length,
      run: () =>
        contacts &&
        downloadCsv(
          `contacts-${stamp}.csv`,
          toCsv(
            ["id", "first_name", "last_name", "email", "phone", "country", "language", "consent_status", "marketing_consent_at", "preferred_channel", "do_not_contact", "created_at", "updated_at"],
            contacts.map((c) => [c.id, c.firstName, c.lastName, c.email, c.phone, c.country, c.language, c.consentStatus, c.marketingConsentAt, c.communicationPreferences.preferredChannel, String(c.communicationPreferences.doNotContact), c.createdAt, c.updatedAt]),
          ),
        ),
    },
    {
      name: "Proposals",
      rows: proposals === undefined ? undefined : proposals === null ? null : proposals.length,
      run: () =>
        proposals &&
        downloadCsv(
          `proposals-${stamp}.csv`,
          toCsv(
            ["id", "inquiry_id", "trip_brief_id", "status", "currency", "total_minor", "deposit_minor", "balance_minor", "valid_until", "approved_by", "approved_at", "created_by", "created_at", "updated_at"],
            proposals.map((p) => [p.id, p.inquiryId, p.tripBriefId, p.status, p.currency, p.totalMinor, p.depositMinor, p.balanceMinor, p.validUntil, p.approvedBy, p.approvedAt, p.createdBy, p.createdAt, p.updatedAt]),
          ),
        ),
    },
    {
      name: "Participants",
      rows: participants === undefined ? undefined : participants === null ? null : participants.length,
      run: () =>
        participants &&
        downloadCsv(
          `participants-${stamp}.csv`,
          toCsv(
            ["id", "contact_id", "inquiry_id", "proposal_id", "status", "emergency_contact", "insurance", "waiver", "identity_document", "experience", "fitness", "medical", "consent", "retention_until", "created_at", "updated_at"],
            participants.map((p) => [
              p.id, p.contactId, p.inquiryId, p.proposalId, p.status, p.emergencyContactStatus, p.insuranceStatus, p.waiverStatus, p.identityDocumentStatus, p.experienceInformationStatus,
              p.fitnessInformationStatus === REDACTED ? "forbidden" : p.fitnessInformationStatus,
              p.medicalInformationStatus === REDACTED ? "forbidden" : p.medicalInformationStatus,
              p.consentStatus, p.retentionUntil, p.createdAt, p.updatedAt,
            ]),
          ),
        ),
    },
    {
      name: "Audit log",
      rows: audit === undefined ? undefined : audit === null ? null : audit.length,
      run: () =>
        audit &&
        downloadCsv(
          `audit-log-${stamp}.csv`,
          toCsv(
            ["id", "actor_id", "entity_type", "entity_id", "action", "before", "after", "created_at"],
            audit.map((e) => [e.id, e.actorId, e.entityType, e.entityId, e.action, e.beforeSnapshotOrDiff ? JSON.stringify(e.beforeSnapshotOrDiff) : null, e.afterSnapshotOrDiff ? JSON.stringify(e.afterSnapshotOrDiff) : null, e.createdAt]),
          ),
        ),
    },
  ];

  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Data export</h2>
      <p className="mt-1 text-[12.5px] text-muted">
        Your records as CSV, one file per dataset. Amounts are integer minor units; timestamps are UTC.
      </p>
      {!mayExport ? (
        <div className="mt-4">
          <LockedNotice>
            Exporting the record is for the account owner, Company Admins and the finance role. Your role reads the
            screens and does not carry the data out.
          </LockedNotice>
        </div>
      ) : (
        <>
          <div className="mt-4">
            {datasets.map((d, i) => (
              <div key={d.name} className={`flex flex-wrap items-center justify-between gap-3 py-2.5 ${i > 0 ? "border-t border-line-soft" : ""}`}>
                <div className="text-[12.5px] text-ink">
                  {d.name}
                  <span className="ml-2 text-[11.5px] text-faint">
                    {d.rows === undefined ? "loading" : d.rows === null ? "not connected" : `${d.rows} row${d.rows === 1 ? "" : "s"}`}
                  </span>
                </div>
                {d.rows === null ? (
                  <span className="text-[11.5px] text-muted">{CRM_NOTICES.NOT_CONNECTED}</span>
                ) : (
                  <Button
                    disabled={d.rows === undefined}
                    onClick={() => {
                      d.run();
                      setDone(`${d.name} downloaded as CSV.`);
                    }}
                  >
                    <Download size={13} aria-hidden /> CSV
                  </Button>
                )}
              </div>
            ))}
          </div>
          {done && (
            <div className="mt-3">
              <Notice>{done}</Notice>
            </div>
          )}
          <p className="mt-4 border-t border-line-soft pt-3 text-[11.5px] leading-snug text-muted">
            Contacts and participants are personal data your company is responsible for once they leave this
            portal. An export is not yet written to the audit log — the seam has no method for it.
          </p>
        </>
      )}
    </Card>
  );
}

/* ---- Retention & deletion ------------------------------------------------ */

function RetentionPane() {
  const session = useSession();
  const { backend, revision } = useOperator();
  const participants = useAsync<Loaded<Participant[]>>(
    () => (backend.listParticipants ? backend.listParticipants(session) : Promise.resolve(null)),
    [session, revision],
    undefined,
  );
  const withDate = (participants ?? []).filter((p) => p.retentionUntil !== null);
  const dates = withDate.map((p) => p.retentionUntil!).sort();
  const withoutDate = (participants ?? []).length - withDate.length;
  const mayDelete = can(session, "deleteCompanyData");

  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Retention &amp; deletion</h2>
      <p className="mt-1 text-[12.5px] text-muted">What this workspace keeps, for how long, and who can remove it.</p>

      <div className="mt-4 space-y-3 text-[12.5px] leading-relaxed text-ink">
        <div className="rounded-tile bg-canvas px-3 py-2.5">
          <div className="lbl">Retention window</div>
          <p className="mt-1">
            <span className="font-medium">Not configured.</span> Your company record carries no retention policy, so
            no window applies across the board. Each participant record carries its own retention date, set when
            the record was made, and that is the only retention statement this portal holds.
          </p>
        </div>
        <div className="rounded-tile bg-canvas px-3 py-2.5">
          <div className="lbl">Participant retention dates</div>
          {participants === undefined ? (
            <p className="mt-1 text-faint">Loading…</p>
          ) : participants === null ? (
            <p className="mt-1 text-muted">{CRM_NOTICES.NOT_CONNECTED}</p>
          ) : participants.length === 0 ? (
            <p className="mt-1 text-muted">No participant records.</p>
          ) : (
            <p className="mt-1">
              <span className="tnum font-medium">{withDate.length}</span> of {participants.length} participant records carry a retention date
              {dates.length > 0 && (
                <>
                  {" "}— earliest <span className="tnum">{formatDay(dates[0])}</span>, latest <span className="tnum">{formatDay(dates[dates.length - 1])}</span>
                </>
              )}
              . {withoutDate > 0 ? `${withoutDate} ${withoutDate === 1 ? "has" : "have"} none.` : ""}{" "}
              <span className="text-muted">Nothing deletes on these dates yet; they are recorded so the duty is visible.</span>
            </p>
          )}
        </div>
        <div className="rounded-tile bg-canvas px-3 py-2.5">
          <div className="lbl">Deletion</div>
          <p className="mt-1">
            Nothing in this portal deletes a commercial record. Leads, bookings, proposals and conversations are
            history and are kept; a person is removed from a trip by cancelling their participant record, which stays
            on file with its audit trail. Deleting the company's data is a power held by the account owner alone
            {mayDelete ? " — that is you —" : ""} and no screen calls it yet: the request goes to your Icefall
            contact, who performs it.
          </p>
        </div>
        <div className="rounded-tile bg-canvas px-3 py-2.5">
          <div className="lbl">Sensitive data</div>
          <p className="mt-1">
            Medical and fitness information is read by the owner, admins and operations only; the audit log records
            that such a field changed and never what it became. Documents are stored as references to a private
            store — never a public link.
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ---- Verification records ------------------------------------------------ */

const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  not_submitted: "Not submitted",
  in_review: "In review",
  verified: "Verified",
  expired: "Expired",
  rejected: "Rejected",
};

/**
 * NEVER "verified" WITHOUT A REVIEWER AND A TIME. The guide record carries a
 * status and no reviewer fields, so even a `verified` value — which nothing in
 * this app can write — would render here as unreviewed. The company record
 * carries a document-check date and no verification status at all; a check is
 * stated as a check.
 */
function verificationWords(status: VerificationStatus, reviewedBy: string | null, reviewedAt: string | null): { label: string; note: string } {
  if (status === "verified") {
    if (reviewedBy && reviewedAt) return { label: "Verified", note: `Reviewed by ${reviewedBy} on ${formatDay(reviewedAt.slice(0, 10))}.` };
    return { label: "Verified — unreviewed", note: "The record says verified but names no reviewer and no time, so it is not treated as verified here." };
  }
  return { label: VERIFICATION_LABEL[status], note: status === "not_submitted" ? "No verification has been submitted. Qualifications on file are the guide's own statement." : "Reviewer and time: not recorded on this record." };
}

function VerificationPane() {
  const session = useSession();
  const { backend, company, revision } = useOperator();
  const guides = useAsync<Loaded<GuideResource[]>>(
    () => (backend.listGuideResources ? backend.listGuideResources(session) : Promise.resolve(null)),
    [session, revision],
    undefined,
  );

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-[14px] font-semibold text-ink">Company verification</h2>
        <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink">Verification status</span>
            <Pill>Not submitted</Pill>
            <span className="text-muted">
              Your company record carries no verification status field, and no reviewer or review time — so nothing here is
              shown as verified.
            </span>
          </div>
          <p className="text-muted">
            {OPERATOR_NOTICES.documentsChecked(company?.documentsCheckedAt ? formatDay(company.documentsCheckedAt.slice(0, 10)) : null) ??
              "Icefall has not recorded a document check for your company."}{" "}
            A document check is Icefall stating it looked at your papers; it is not a verification by the issuing body.
          </p>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-[14px] font-semibold text-ink">Guide verification</h2>
        <p className="mt-1 text-[12.5px] text-muted">{CRM_NOTICES.QUALIFICATION_UNVERIFIED}</p>
        {guides === undefined ? (
          <p className="mt-4 text-[12.5px] text-faint">Loading…</p>
        ) : guides === null ? (
          <div className="mt-4">
            <Notice>{CRM_NOTICES.NOT_CONNECTED}</Notice>
          </div>
        ) : guides.length === 0 ? (
          <p className="mt-4 text-[12.5px] text-muted">No guide on record.</p>
        ) : (
          <div className="mt-4">
            {guides.map((g, i) => {
              const words = verificationWords(g.verificationStatus, null, null);
              return (
                <div key={g.id} className={`flex flex-wrap items-start justify-between gap-3 py-3 ${i > 0 ? "border-t border-line-soft" : ""}`}>
                  <div className="min-w-0 max-w-xl">
                    <div className="text-[12.5px] font-medium text-ink">{g.role}</div>
                    <div className="mt-0.5 text-[11.5px] leading-snug text-muted">{words.note}</div>
                    <div className="mt-0.5 text-[11.5px] text-faint">Insurance paperwork: {g.insuranceStatus.replace(/_/g, " ")} · availability: {g.availabilityStatus.replace(/_/g, " ")}</div>
                  </div>
                  <Pill>{words.label}</Pill>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---- the Account pane -------------------------------------------------- */

/**
 * Two columns per the mockup: Account information on the left, Change password
 * on the right, and the Danger zone underneath. None of the three writes exists
 * on the backend seam yet, so every submit answers with the truth in a grey
 * Notice rather than a fake success.
 */
function AccountPane() {
  const session = useSession();
  const { company } = useOperator();

  const [fullName, setFullName] = useState(session.user.displayName);
  const [email, setEmail] = useState(session.user.email);
  const [accountMsg, setAccountMsg] = useState<string | null>(null);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState<{ tone: "neutral" | "rejected"; text: string } | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const submitPassword = () => {
    if (pw.next !== pw.confirm) {
      setPwMsg({ tone: "rejected", text: "The new passwords do not match. Nothing was changed." });
      return;
    }
    setPwMsg({
      tone: "neutral",
      text:
        "Password changes are not wired up in this local demo — nothing was changed. " +
        "Ask your Icefall contact for a reset link; nobody at Icefall can see or set your password.",
    });
    setPw({ current: "", next: "", confirm: "" });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold text-ink">Account information</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Full name">
              <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Email">
              <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Role" hint="Roles are set by your Company Admin and Icefall.">
              <input
                className={inputClass}
                value={isOwnerAccount(session.user) ? ROLE_LABEL.owner : ROLE_LABEL[session.user.role]}
                disabled
                readOnly
              />
            </Field>
          </div>
          {accountMsg && (
            <div className="mt-4">
              <Notice>{accountMsg}</Notice>
            </div>
          )}
          <div className="mt-5 border-t border-line-soft pt-4">
            <Button
              variant="primary"
              onClick={() =>
                setAccountMsg(
                  "Saving account details is not wired up in this local demo — nothing was changed. " +
                    "Icefall holds the account record; ask your contact to update it.",
                )
              }
            >
              Update
            </Button>
          </div>
        </Card>

        <Card className="h-fit p-5">
          <h2 className="text-[14px] font-semibold text-ink">Change password</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                className={inputClass}
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              />
            </Field>
          </div>
          {pwMsg && (
            <div className="mt-4">
              <Notice tone={pwMsg.tone === "rejected" ? "rejected" : "neutral"}>{pwMsg.text}</Notice>
            </div>
          )}
          <div className="mt-5 border-t border-line-soft pt-4">
            <Button
              variant="primary"
              disabled={!pw.current || !pw.next || !pw.confirm}
              onClick={submitPassword}
            >
              Update password
            </Button>
          </div>
        </Card>
      </div>

      <AppearanceCard />

      <Card className="p-5">
        <div className="lbl text-rejected">Danger zone</div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-[12.5px] leading-snug text-muted">
            <span className="font-medium text-ink">Delete your account</span> — this action cannot be undone.
            All your data will be permanently deleted.
          </p>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Delete account
          </Button>
        </div>
      </Card>

      {confirmOpen && (
        <DeleteConfirmDialog companyName={company?.name ?? "your company"} onClose={() => setConfirmOpen(false)} />
      )}
    </div>
  );
}

/* ---- Appearance (OP-09) ------------------------------------------------ */

const THEME_OPTIONS: { key: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "system", label: "System", icon: Monitor },
];

/**
 * A segmented control, and the only writing setting on this screen that works.
 *
 * It is a `radiogroup` rather than three buttons: the three are mutually
 * exclusive and a screen reader should say "Light, 1 of 3" instead of reading
 * out three unrelated controls, one of which happens to look pressed.
 *
 * The line under it states the resolved theme when the choice is System, so
 * "System" never leaves the operator guessing which one they are looking at.
 */
function AppearanceCard() {
  const { choice, resolved, setChoice } = useTheme();

  return (
    <Card className="p-5">
      <h2 className="text-[14px] font-semibold text-ink">Appearance</h2>
      <p className="mt-1 text-[12.5px] text-muted">
        How this portal looks on this device. It is remembered in this browser and applies to you only —
        nobody else at your company is affected.
      </p>

      <div className="mt-4">
        <div className="lbl mb-1.5" id="theme-label">
          Theme
        </div>
        <div
          role="radiogroup"
          aria-labelledby="theme-label"
          className="hairline inline-flex gap-0.5 rounded-tile bg-canvas p-0.5"
        >
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = choice === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setChoice(option.key)}
                className={`flex items-center gap-1.5 rounded-tile px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  active ? "bg-azure text-canvas" : "text-muted hover:bg-raised hover:text-ink"
                }`}
              >
                <Icon size={14} className="shrink-0" aria-hidden />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-[11.5px] leading-snug text-muted">
        {choice === "system"
          ? `Following this device — currently ${resolved}. It changes with your system setting while the portal is open.`
          : "Choose System to follow your device's light and dark setting instead."}
      </p>

      {/*
        Stated rather than left as a surprise. The preview panes reproduce the
        athlete app and the Icefall website, which are dark products; they do
        not follow this setting because what a climber sees does not change
        when an operator changes their own portal's colours.
      */}
      <p className="mt-2 border-t border-line-soft pt-3 text-[11.5px] leading-snug text-muted">
        Previews of your listing stay dark in both themes — they show the app and website as a climber sees
        them, not as you have set this portal.
      </p>
    </Card>
  );
}

/**
 * The mockup's confirmation: type the company name, then confirm. What confirm
 * does is tell the truth — closing an operator account is performed by Icefall,
 * because leads, bookings and customer conversations have to be preserved as a
 * commercial record, and a self-service delete button is how that record gets
 * destroyed by accident. No destructive local action exists behind this dialog.
 *
 * The overlay is `bg-scrim`, not `bg-ink/30`: `ink` is near-white in the dark
 * theme, so a scrim mixed from the text colour inverts into a white veil there.
 */
function DeleteConfirmDialog({ companyName, onClose }: { companyName: string; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [stopped, setStopped] = useState(false);
  const matches = typed.trim() === companyName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Delete account"
      onClick={onClose}
    >
      {/* Card takes no onClick; the wrapper stops the overlay's close-on-click. */}
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
      <Card className="p-5">
        {stopped ? (
          <>
            <h2 className="text-[14px] font-semibold text-ink">Deletion is handled by Icefall</h2>
            <div className="mt-3">
              <LockedNotice>
                Nothing has been deleted. Closing an operator account is performed by Icefall, not from this
                portal — your leads, bookings and customer conversations are preserved as a commercial record.
                Reply to your Icefall contact to close the account.
              </LockedNotice>
            </div>
            <div className="mt-4 border-t border-line-soft pt-3">
              <Button onClick={onClose}>Close</Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-[14px] font-semibold text-ink">Delete account</h2>
            <p className="mt-1.5 text-[12.5px] leading-snug text-muted">
              This action cannot be undone. To continue, type{" "}
              <span className="font-medium text-ink">{companyName}</span> below.
            </p>
            <div className="mt-4">
              <input
                className={inputClass}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={companyName}
                aria-label={`Type ${companyName} to confirm`}
              />
            </div>
            <div className="mt-4 flex gap-2 border-t border-line-soft pt-4">
              <Button variant="danger" disabled={!matches} onClick={() => setStopped(true)}>
                Delete account
              </Button>
              <Button variant="quiet" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Card>
      </div>
    </div>
  );
}
