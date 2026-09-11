/**
 * The frame: navigation, identity, notifications.
 *
 * Built to the operator mockups. Navigation is filtered by role — a Sales
 * Employee is not shown a Company Profile link they would be refused at, because
 * the honest expression of a simple permission model is a nav that offers only
 * what the person can do, rather than one that offers everything and rejects
 * half of it.
 *
 * Expeditions and Treks are separate entries, as the mockups have them. They are
 * one table and one editor underneath — spec §7 treats them as distinct product
 * types sharing the same infrastructure — but an operator thinks about "my
 * expeditions" and "my treks" as two catalogues, and the nav follows the
 * operator rather than the schema.
 *
 * ── THE ICEFALL SECTION SPLIT ───────────────────────────────────────────────
 * The nav is TWO groups, and the division is a product claim rather than a
 * tidying-up. YOUR COMPANY is the operator's own CRM: their leads, their
 * pipeline, their trips, their bookings, their staff. It is theirs whether or
 * not ICEFALL exists, and it would keep working the day they stopped being
 * listed. ICEFALL is the marketplace RELATIONSHIP: the public presence ICEFALL
 * shows, the mountains they are listed on, and what ICEFALL sends them.
 *
 * Naming that boundary in the furniture is what stops the product reading as
 * "a marketplace dashboard with some CRM bolted on" — and it is what makes the
 * honest notices legible: an operator who knows which half of the workspace
 * they are in can tell "Icefall is not counting listing views yet" (a fact
 * about ICEFALL) from a figure about their own business.
 *
 * THIS IS GROUPING AND LABELLING, NOT RE-ROUTING. Every path below is the path
 * it already was. Customers and Departures are named in the section brief and
 * are deliberately ABSENT: neither module exists, and a nav entry pointing at
 * nothing is a promise the product does not keep. They slot into YOUR COMPANY
 * when they are built.
 */

import {
  BedDouble, Bell, Boxes, Building2, Bus, CalendarDays, ChartNoAxesColumn, ClipboardList, Columns3, Contact, FileChartColumn, FileText, Footprints, Handshake, History, LayoutDashboard, LayoutTemplate, LogOut,
  MessagesSquare, Mountain as MountainIcon, Package, PlugZap, Radio, Receipt, Settings as SettingsIcon, ShieldAlert,
  Truck, UserRoundCheck, Users, Wallet,
  HandCoins, Share2, Tags, Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { can, type Permission } from "@/domain/authz";
import { DEMO } from "@/offline/offline";
import { useAsync, useOperator, useReadFailures } from "@/state/OperatorContext";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: Permission;
  badge?: number;
}

interface NavGroup {
  /** The heading. Hidden, with its group, when the role can open none of it. */
  heading: string;
  /** One line saying what this half of the workspace IS. Optional by design. */
  note?: string;
  items: NavItem[];
}

/**
 * Initials, never a photograph.
 *
 * The mockups show avatar photos for staff and for customers. An invented face
 * attached to an invented name is a fabricated person, which the doctrine rules
 * out flatly — and a real climber's photograph is not ours to render in a
 * company's back office either.
 */
export function Monogram({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-pill bg-elevated font-medium text-muted"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { session, company, backend, signOut, revision, loadError } = useOperator();
  const readFailures = useReadFailures();
  const location = useLocation();

  const conversations = useAsync(
    () => (session ? backend.getConversations(session) : Promise.resolve([])),
    [session, revision],
    [],
  );
  const notifications = useAsync(
    () => (session ? backend.getNotifications(session) : Promise.resolve([])),
    [session, revision],
    [],
  );

  if (!session) return <>{children}</>;

  const unread = conversations.filter((c) => c.unread).length;
  const unreadNotifications = notifications.filter((n) => n.readAt === null).length;

  const groups: NavGroup[] = [
    {
      heading: "Your company",
      items: [
        { to: "/operator/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "viewAnalytics" },
        { to: "/operator/leads", label: "Leads & Messages", icon: MessagesSquare, permission: "manageLeads", badge: unread },
        { to: "/operator/pipeline", label: "Pipeline", icon: Columns3, permission: "manageLeads" },
        /* The company's own commercial offers, versioned. Sales work — `manageProposals`. */
        { to: "/operator/proposals", label: "Proposals", icon: FileText, permission: "manageProposals" },
        // The company's own customer records — the private CRM half of the workspace.
        { to: "/operator/customers", label: "Customers", icon: Contact, permission: "manageContacts" },
        /*
         * The unified activity timeline, and the saved forms of words it draws
         * on. Both sit in YOUR COMPANY because both are the operator's own
         * record: nothing here reaches ICEFALL, and nothing here sends.
         */
        { to: "/operator/communications", label: "Communications", icon: History, permission: "manageContacts" },
        { to: "/operator/templates", label: "Templates", icon: LayoutTemplate, permission: "manageTemplates" },
        { to: "/operator/expeditions", label: "Expeditions", icon: Package, permission: "viewProducts" },
        { to: "/operator/treks", label: "Treks", icon: Footprints, permission: "viewProducts" },
        { to: "/operator/bookings", label: "Bookings", icon: Receipt, permission: "viewAnalytics" },
        /*
         * Finance and Reports are READS of the company's own record, so both
         * take `viewReports` — the permission every active role holds, finance
         * included, and the one the brief names for reports. Finance is NOT
         * gated on `manageBookingsFinance`: that is the WRITE permission, and
         * gating the screen on it would hide the ledger from the very role
         * (`finance_read_only`) that exists to read it. The write controls sit
         * inside the booking page behind `manageBookingsFinance`; the export
         * sits behind `exportData`.
         */
        { to: "/operator/finance", label: "Finance", icon: Wallet, permission: "viewReports" },
        { to: "/operator/reports", label: "Reports", icon: FileChartColumn, permission: "viewReports" },
        /* The company's own roster record: who is going, and how complete their information is. */
        { to: "/operator/participants", label: "Participants", icon: ClipboardList, permission: "manageParticipants" },
        /*
         * The cross-participant document register. Gated on
         * `manageParticipants` — the permission that reaches the documents at
         * all — while the request, receipt and review controls inside it need
         * `manageDocuments`. A reader who cannot write still needs the list.
         */
        { to: "/operator/documents", label: "Documents", icon: FileText, permission: "manageParticipants" },
        /* The operations workspace: each departure's roster, tasks and status. Held by the roles the adapter lets write it. */
        { to: "/operator/departures", label: "Departures", icon: CalendarDays, permission: "manageDepartures" },
        /* The two operational directories: who you send up, and who you buy from. */
        { to: "/operator/guides", label: "Guides", icon: UserRoundCheck, permission: "manageTasks" },
        { to: "/operator/suppliers", label: "Suppliers", icon: Truck, permission: "manageTasks" },
        /* The fleet record and the dispatch board — the company's own vehicles, nothing tracked. */
        { to: "/operator/vehicles", label: "Vehicles", icon: Bus, permission: "manageTasks" },
        /* The kit register and the bed list — the field half of the same record.
           Each takes the permission its own adapter checks before it accepts a
           write, so the nav never offers a screen the backend would refuse at. */
        { to: "/operator/equipment", label: "Equipment", icon: Boxes, permission: "manageEquipment" },
        { to: "/operator/rooming", label: "Rooming", icon: BedDouble, permission: "manageRooming" },
        /*
         * The commercial half of the field records. Guide fees takes
         * `viewGuideFees` — the READ finance holds — because the ledger is what
         * that role exists to read; its write controls are gated separately.
         * Pricing and Distribution take `viewProducts`, the read their adapter
         * methods decline to narrow, and gate their editors inside on
         * `managePricingSchedules` / `manageChannelListings`. Automations takes
         * `manageAutomations`: everything on that screen is a write or a run.
         */
        { to: "/operator/guide-fees", label: "Guide fees", icon: HandCoins, permission: "viewGuideFees" },
        { to: "/operator/pricing", label: "Pricing", icon: Tags, permission: "viewProducts" },
        { to: "/operator/automations", label: "Automations", icon: Workflow, permission: "manageAutomations" },
        { to: "/operator/distribution", label: "Distribution", icon: Share2, permission: "viewProducts" },
        { to: "/operator/team", label: "Team", icon: Users, permission: "manageStaff" },
        /* The derived issues in the company's own records — a read every active role holds. */
        { to: "/operator/data-quality", label: "Data quality", icon: ShieldAlert, permission: "viewDataQuality" },
        /* What is connected to the company's own systems: nothing, and what each would need. */
        { to: "/operator/integrations", label: "Integrations", icon: PlugZap, permission: "manageIntegrations" },
        { to: "/operator/settings", label: "Settings", icon: SettingsIcon, permission: "viewInbox" },
      ],
    },
    {
      heading: "Icefall",
      note: "Your relationship with Icefall — the presence it shows, the mountains you are listed on, and what it sends you. Everything above is yours either way.",
      items: [
        { to: "/operator/company", label: "Company Profile", icon: Building2, permission: "editCompanyProfile" },
        { to: "/operator/mountains", label: "My Mountains", icon: MountainIcon, permission: "viewProducts" },
        // A channel is published company content, so it sits under the profile and
        // takes the same permission the adapter checks before it accepts one.
        { to: "/operator/channels", label: "Channels", icon: Radio, permission: "editCompanyProfile" },
        { to: "/operator/analytics", label: "Analytics", icon: ChartNoAxesColumn, permission: "viewAnalytics" },
        /* Icefall's introductions and what this company did with each one. A
           READ every active role holds — `viewInbox`, the same permission
           Notifications takes — because the three writes are gated inside the
           screen on `acceptReferrals`, exactly as the adapter gates them. */
        { to: "/operator/referrals", label: "Referrals", icon: Handshake, permission: "viewInbox" },
        { to: "/operator/notifications", label: "Notifications", icon: Bell, permission: "viewInbox", badge: unreadNotifications },
      ],
    },
  ];

  /* Filtered ONCE, so a heading cannot survive the group it labels. A "Icefall"
     heading over nothing reads as a section that failed to load. */
  const visible = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => can(session, i.permission)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-[212px] shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M2 20 L9 6 L13 13 L16 9 L22 20 Z" fill="currentColor" className="text-ink" />
            </svg>
            <span className="text-[13px] font-medium tracking-[0.18em] text-ink">ICEFALL</span>
          </div>
          <div className="lbl mt-2" style={{ letterSpacing: "0.22em" }}>Operator</div>
          {/*
            A NAME, A WAIT, OR A REASON — never a dash standing in for all three.
            On the live backend this read THROWS rather than returning null, so
            "—" would be the same glyph for "still loading", "read failed" and
            "no company row", and an operator would have no way to tell which
            workspace they are looking at.
          */}
          {company ? (
            <div className="ser mt-3 truncate text-[15px] text-muted" title={company.name}>
              {company.name}
            </div>
          ) : loadError ? (
            <div className="mt-3 text-[11.5px] leading-snug text-muted" title={loadError}>
              Company name unavailable
            </div>
          ) : (
            <div className="mt-3 text-[11.5px] text-faint">Loading…</div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {visible.map((group, gi) => (
            <div key={group.heading} className={gi === 0 ? "" : "mt-5 border-t border-line pt-4"}>
              <div className="lbl px-3">{group.heading}</div>
              {group.note && (
                <p className="mt-1 px-3 text-[10.5px] leading-[1.45] text-faint">{group.note}</p>
              )}
              <div className="mt-1.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname.startsWith(item.to);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={`relative mb-0.5 flex items-center gap-3 rounded-tile px-3 py-2.5 text-[12.5px] transition-colors ${
                        active
                          ? "bg-raised font-medium text-ink"
                          : "text-muted hover:bg-raised hover:text-ink"
                      }`}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute top-1/2 left-0 h-[17px] w-[2px] -translate-y-1/2 rounded-pill bg-azure"
                        />
                      )}
                      <Icon size={15.5} className="shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge ? (
                        <span className="tnum rounded-pill bg-azure px-1.5 py-0.5 text-[10px] font-semibold text-canvas">
                          {item.badge}
                        </span>
                      ) : null}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2.5 border-t border-line px-4 py-3.5">
          <Monogram name={session.user.displayName} size={30} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-ink">{session.user.displayName}</div>
            {/* The mockup's label. `admin` is the schema's word; the person is an Operator. */}
            <div className="text-[11px] text-faint">{session.user.role === "admin" ? "Operator" : "Sales"}</div>
          </div>
          {/*
            NOT DRAWN WHEN IT CANNOT ACT.

            `signOut` returns immediately under DEMO (OperatorContext) — and
            correctly so: the session is seeded at start-up, there is no sign-in
            screen to return to, and clearing it would strand the reader on a
            dead end. But DEMO is the build that is deployed, so what the
            operator saw was a Sign out control that did nothing at all when
            pressed. A control that silently declines is worse than an absent
            one: the reader concludes they are signed out when they are not.

            So the button renders only in a build where signing out signs you
            out. This is a render decision taken from the same flag the action
            reads, so the two cannot drift apart.
          */}
          {!DEMO && (
            <button onClick={signOut} title="Sign out" className="text-faint hover:text-ink">
              <LogOut size={14} aria-hidden />
            </button>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/*
          AN EMPTY SCREEN MUST NEVER BE ABLE TO MEAN TWO THINGS.

          Every list on every screen reads through `useAsync`, which keeps its
          initial value — usually `[]` — when a read throws. Without this banner
          a company whose reads are ALL FAILING looks exactly like a company
          with no data yet, and the operator has no way to tell. That is the
          confusion this product exists to prevent, so it is stated once, above
          everything, and it names the reason rather than saying "error".
        */}
        {readFailures.length > 0 && (
          <div className="border-b border-rejected/30 bg-rejected-soft px-7 py-2.5">
            <p className="text-[12.5px] leading-snug text-rejected">
              <span className="font-semibold">
                {readFailures.length === 1
                  ? "A read failed, so what is missing below is not necessarily absent."
                  : `${readFailures.length} reads failed, so what is missing below is not necessarily absent.`}
              </span>{" "}
              An empty list here may mean the data could not be fetched, not that you have none.
            </p>
            <ul className="mt-1 space-y-0.5">
              {readFailures.map((r) => (
                <li key={r} className="text-[11.5px] leading-snug text-muted">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
        <main className="mx-auto max-w-[1180px] px-7 py-7">{children}</main>
      </div>
    </div>
  );
}
