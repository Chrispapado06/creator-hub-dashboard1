/**
 * Routing and the sign-in gate.
 *
 * The 15 routes of spec §14, and one rule around all of them: no screen renders
 * without a session. There is no read-only public view of an operator's leads,
 * inbox or prices, so the gate is a redirect rather than a degraded page.
 */

import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "@/components/Shell";
import { OperatorProvider, useOperator } from "@/state/OperatorContext";
import { FieldBackendProvider } from "@/state/FieldBackendContext";
import { OfflineBanner } from "@/offline/OfflineBanner";
import { DEMO } from "@/offline/offline";
import { can, type Permission } from "@/domain/authz";
import Analytics from "@/screens/Analytics";
import Bookings, { BookingDetail } from "@/screens/Bookings";
import Expeditions from "@/screens/Expeditions";
import Finance from "@/screens/Finance";
import Reports from "@/screens/Reports";
import Notifications from "@/screens/Notifications";
import ParticipantDetail from "@/screens/ParticipantDetail";
import Participants from "@/screens/Participants";
import Treks from "@/screens/Treks";
import Channels, { ChannelDetail } from "@/screens/Channels";
import CompanyEditor from "@/screens/CompanyEditor";
import CompanyProfile from "@/screens/CompanyProfile";
import Communications from "@/screens/Communications";
import Conversation from "@/screens/Conversation";
import CustomerDetail from "@/screens/CustomerDetail";
import Customers from "@/screens/Customers";
import Dashboard from "@/screens/Dashboard";
import DataQuality from "@/screens/DataQuality";
import Integrations from "@/screens/Integrations";
import Departures from "@/screens/Departures";
import DocumentsScreen from "@/screens/Documents";
import DepartureWorkspace from "@/screens/DepartureWorkspace";
import DepartureOps from "@/screens/DepartureOps";
import Guides from "@/screens/Guides";
import SuppliersScreen from "@/screens/Suppliers";
import VehiclesScreen from "@/screens/Vehicles";
import Equipment from "@/screens/Equipment";
import Rooming from "@/screens/Rooming";
import Inbox from "@/screens/Inbox";
import LeadDetail from "@/screens/LeadDetail";
import Leads from "@/screens/Leads";
import MountainDetail from "@/screens/MountainDetail";
import MountainEditor from "@/screens/MountainEditor";
import Pipeline from "@/screens/Pipeline";
import Mountains from "@/screens/Mountains";
import ProductDetail from "@/screens/ProductDetail";
import ProductEditor from "@/screens/ProductEditor";
import ProductNew from "@/screens/ProductNew";
import ProductPreview from "@/screens/ProductPreview";
import Products from "@/screens/Products";
import Proposals from "@/screens/Proposals";
import Referrals from "@/screens/Referrals";
import ProposalEditor, { ProposalPreview } from "@/screens/ProposalEditor";
import Settings from "@/screens/Settings";
import SignIn from "@/screens/SignIn";
import Team from "@/screens/Team";
import Templates from "@/screens/Templates";
/* Phase 4 field-ops commercial records: the guide fee ledger, the operator's
   own pricing rules, the internal rule automations, and the manual record of
   where a trip is distributed. All four read the field seam. */
import GuideFees from "@/screens/GuideFees";
import PricingSchedules from "@/screens/PricingSchedules";
import Automations from "@/screens/Automations";
import ChannelListings from "@/screens/ChannelListings";

/**
 * A route a role may not open.
 *
 * Renders an explanation rather than a blank page or a silent redirect: a sales
 * employee who follows a link to the company profile should learn that content
 * is the admin's job, not think the portal is broken.
 */
function RequirePermission({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { session, restoring } = useOperator();
  if (restoring) return null;
  if (!session) return <Navigate to="/operator/sign-in" replace />;
  if (!can(session, permission)) {
    return (
      <div className="hairline rounded-card bg-surface px-4 py-10 text-center">
        <p className="text-[13.5px] font-medium text-ink">This section is for Company Admins</p>
        <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">
          Your account handles customer conversations and leads. Ask a Company Admin at your company if
          something here needs changing.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * The sign-in gate.
 *
 * `restoring` is checked FIRST and deliberately renders nothing rather than
 * redirecting. On a fresh page load the stored session is read asynchronously,
 * so a guard that redirects immediately sends every deep link to the dashboard —
 * and an operator following a notification to one conversation never arrives.
 */
function Gate({ children }: { children: React.ReactNode }) {
  const { session, restoring } = useOperator();
  if (restoring) return null;
  if (!session) return <Navigate to="/operator/sign-in" replace />;
  return <>{children}</>;
}

function Router() {
  return (
    <Routes>
      {/*
        The editor is FULL-BLEED and sits outside the portal shell, the way a
        theme editor takes over the screen. Its own three panes are the
        navigation; the sidebar beside them would be a fourth column competing
        for the same job.
      */}
      <Route
        path="/operator/company/edit"
        element={
          <Gate>
            <RequirePermission permission="editCompanyProfile">
              <CompanyEditor />
            </RequirePermission>
          </Gate>
        }
      />
      {/* The trip editor, same shape and for the same reason. */}
      <Route
        path="/operator/products/:id/edit"
        element={
          <Gate>
            <RequirePermission permission="editProducts">
              <ProductEditor />
            </RequirePermission>
          </Gate>
        }
      />
      {/*
        The mountain page editor, same shape again. It writes nothing — every
        part of a mountain block is set on the company or the trip — so it is
        gated on `editProducts`, the permission the mountain screens already
        use for their own edit controls, rather than a new one.
      */}
      <Route
        path="/operator/mountains/:id/edit"
        element={
          <Gate>
            <RequirePermission permission="editProducts">
              <MountainEditor />
            </RequirePermission>
          </Gate>
        }
      />
      <Route path="*" element={<Shelled />} />
    </Routes>
  );
}

function Shelled() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/operator/dashboard" replace />} />
        <Route path="/operator" element={<Navigate to="/operator/dashboard" replace />} />
        <Route path="/operator/sign-in" element={<SignIn />} />

        <Route path="/operator/dashboard" element={<Gate><Dashboard /></Gate>} />

        <Route
          path="/operator/company"
          element={<Gate><RequirePermission permission="editCompanyProfile"><CompanyProfile /></RequirePermission></Gate>}
        />

        {/*
          Channels — the company broadcasts, members listen. Gated on
          `editCompanyProfile` because a channel IS published company content:
          the same permission that publishes a post, and the same one
          `createChannel` and `postChannelMessage` check in the adapter, so the
          nav never offers a surface the backend would refuse at.
        */}
        <Route
          path="/operator/channels"
          element={<Gate><RequirePermission permission="editCompanyProfile"><Channels /></RequirePermission></Gate>}
        />
        <Route
          path="/operator/channels/:id"
          element={<Gate><RequirePermission permission="editCompanyProfile"><ChannelDetail /></RequirePermission></Gate>}
        />

        <Route path="/operator/mountains" element={<Gate><Mountains /></Gate>} />
        <Route path="/operator/mountains/:id" element={<Gate><MountainDetail /></Gate>} />

        {/* The mockups split the catalogue in the nav; one component underneath. */}
        <Route path="/operator/expeditions" element={<Gate><Expeditions /></Gate>} />
        <Route path="/operator/treks" element={<Gate><Treks /></Gate>} />
        <Route path="/operator/bookings" element={<Gate><Bookings /></Gate>} />
        {/*
          The commercial record and its ledger, per booking; Finance and Reports
          over all of them. All three are READS gated on `viewReports` (every
          active role, finance included); the write controls inside the booking
          page are gated separately on `manageBookingsFinance`, so a read-only
          role opens the page and finds no control rather than a refusal.
        */}
        <Route path="/operator/bookings/:id" element={<Gate><BookingDetail /></Gate>} />
        <Route
          path="/operator/finance"
          element={<Gate><RequirePermission permission="viewReports"><Finance /></RequirePermission></Gate>}
        />
        <Route
          path="/operator/reports"
          element={<Gate><RequirePermission permission="viewReports"><Reports /></RequirePermission></Gate>}
        />

        {/*
          Participants and readiness — the company's own record of who is
          going and how complete their information is (brief §5.7–5.8, §6.5).
          Gated on `manageParticipants`, the permission the adapter checks
          before it accepts a change to an information field. The two
          sensitive fields are redacted by the adapter, not by this route.
        */}
        <Route
          path="/operator/participants"
          element={<Gate><RequirePermission permission="manageParticipants"><Participants /></RequirePermission></Gate>}
        />
        <Route
          path="/operator/participants/:id"
          element={<Gate><RequirePermission permission="manageParticipants"><ParticipantDetail /></RequirePermission></Gate>}
        />

        {/*
          The cross-participant document register (brief §8 Phase 2.1–2.2).
          Gated on `manageParticipants` — the permission that reaches the
          documents at all. WRITING a request, receipt or review needs
          `manageDocuments`, which the screen checks per control and the
          adapter checks again; the two are deliberately different, so an
          operations reader can see the register without being able to move it.
        */}
        <Route
          path="/operator/documents"
          element={<Gate><RequirePermission permission="manageParticipants"><DocumentsScreen /></RequirePermission></Gate>}
        />

        {/*
          Departures — the operations workspace (brief §5.9 / §6.6). Gated on
          `manageDepartures`, the permission the adapter checks before it
          accepts a status, a roster or an operational detail, so the nav and
          the backend agree about who may open it. Reads the operational side
          of the same `ProductDeparture` rows the trip editor shows; the
          availability write stays the direct path, dates and price stay
          locked behind the versioned one.
        */}
        <Route
          path="/operator/departures"
          element={<Gate><RequirePermission permission="manageDepartures"><Departures /></RequirePermission></Gate>}
        />
        <Route
          path="/operator/departures/:id"
          element={<Gate><RequirePermission permission="manageDepartures"><DepartureWorkspace /></RequirePermission></Gate>}
        />
        {/*
          The operations record of one departure — permits, transport, lodging
          and equipment. Gated on `manageDepartures` like its parent: a sub-page
          of the workspace must not be reachable by a role the workspace itself
          turns away. Writing inside it needs `manageOpsRecords` on top.
        */}
        <Route
          path="/operator/departures/:id/ops"
          element={<Gate><RequirePermission permission="manageDepartures"><DepartureOps /></RequirePermission></Gate>}
        />

        {/*
          Guides and Suppliers — the company's own operational directories
          (brief §4, §5.11). Both are gated on `manageTasks`, the permission
          the adapter checks before it accepts a guide record or an operational
          task, so the guide coordinator reaches them and finance does not.
          The WRITES inside are gated separately and more narrowly:
          availability on `manageGuideAvailability`, supplier status on
          `manageSuppliers`.
        */}
        <Route
          path="/operator/guides"
          element={<Gate><RequirePermission permission="manageTasks"><Guides /></RequirePermission></Gate>}
        />
        <Route
          path="/operator/suppliers"
          element={<Gate><RequirePermission permission="manageTasks"><SuppliersScreen /></RequirePermission></Gate>}
        />

        {/*
          Vehicles — the fleet record and the dispatch board. Gated on
          `manageTasks` like the other operational directories, so the whole
          operations side reads it; the writes inside need `manageDispatch`,
          which is what the field adapter checks before it accepts a vehicle or
          a dispatch, and a role without it finds no control rather than a
          locked page.
        */}
        <Route
          path="/operator/vehicles"
          element={<Gate><RequirePermission permission="manageTasks"><VehiclesScreen /></RequirePermission></Gate>}
        />

        {/*
          Equipment and Rooming — the field-operations half of the company's own
          record (brief §8 Phase 4.1–4.2). Each takes the permission its own
          adapter checks before it accepts a write, so the screen and the seam
          agree about who may be here: a role that cannot manage kit does not get
          a disabled register, it gets no register.
        */}
        <Route
          path="/operator/equipment"
          element={<Gate><RequirePermission permission="manageEquipment"><Equipment /></RequirePermission></Gate>}
        />
        <Route
          path="/operator/rooming"
          element={<Gate><RequirePermission permission="manageRooming"><Rooming /></RequirePermission></Gate>}
        />

        <Route path="/operator/notifications" element={<Gate><Notifications /></Gate>} />

        {/*
          Referrals — Icefall's introductions and the operator's response to
          them. NO `RequirePermission`: reading the introduction record is open
          to every active role (the adapter's `listReferrals` checks nothing),
          and the three writes are gated inside the screen on `acceptReferrals`,
          which is also what the adapter checks. A role that may not respond
          finds no control rather than a locked page.
        */}
        <Route path="/operator/referrals" element={<Gate><Referrals /></Gate>} />

        {/* Spec §14's route, kept working: the combined catalogue. */}
        <Route path="/operator/products" element={<Gate><Products /></Gate>} />
        <Route
          path="/operator/products/new"
          element={<Gate><RequirePermission permission="editProducts"><ProductNew /></RequirePermission></Gate>}
        />
        <Route path="/operator/products/:id" element={<Gate><ProductDetail /></Gate>} />
        <Route path="/operator/products/:id/preview" element={<Gate><ProductPreview /></Gate>} />

        <Route path="/operator/inbox" element={<Gate><Inbox /></Gate>} />
        <Route path="/operator/inbox/:id" element={<Gate><Conversation /></Gate>} />

        <Route path="/operator/leads" element={<Gate><Leads /></Gate>} />
        <Route path="/operator/leads/:id" element={<Gate><LeadDetail /></Gate>} />

        {/*
          Customers — the company's own contact records and the 360 on each.
          Gated on `manageContacts`, the permission the adapter checks before it
          accepts a contact write; `finance_read_only`, operations and the guide
          coordinator hold no read permission for contacts in the closed union,
          so the route is not offered to them rather than opened and refused.
        */}
        <Route
          path="/operator/customers"
          element={<Gate><RequirePermission permission="manageContacts"><Customers /></RequirePermission></Gate>}
        />
        <Route
          path="/operator/customers/:id"
          element={<Gate><RequirePermission permission="manageContacts"><CustomerDetail /></RequirePermission></Gate>}
        />

        {/*
          Communications — the unified activity timeline across contacts,
          enquiries and bookings, and the drafts rendered from templates. It
          reads and writes the same contact timelines Customers does, so it
          takes the same permission the adapter checks on an activity write
          (`manageContacts`) rather than a looser one. NOTHING ON IT SENDS.
        */}
        <Route
          path="/operator/communications"
          element={<Gate><RequirePermission permission="manageContacts"><Communications /></RequirePermission></Gate>}
        />
        {/*
          Templates — the saved forms of words. Gated on `manageTemplates`, the
          permission the adapter checks on create and update; rendering a draft
          from one is gated separately, inside Communications, on
          `replyToCustomer` / `addInternalNote`.
        */}
        <Route
          path="/operator/templates"
          element={<Gate><RequirePermission permission="manageTemplates"><Templates /></RequirePermission></Gate>}
        />

        {/* The same leads, seen as a board rather than a list. */}
        <Route
          path="/operator/pipeline"
          element={<Gate><RequirePermission permission="manageLeads"><Pipeline /></RequirePermission></Gate>}
        />

        {/*
          Proposals — the company's own commercial offers, versioned (brief
          §5.5). Gated on `manageProposals`, the permission the adapter checks
          on every proposal write; approval is gated a second time, inside the
          screen, on `approveProposals`. The preview is the print-ready export
          and sits inside the shell: its own `@media print` rule hides the frame.
        */}
        <Route
          path="/operator/proposals"
          element={<Gate><RequirePermission permission="manageProposals"><Proposals /></RequirePermission></Gate>}
        />
        <Route
          path="/operator/proposals/new"
          element={<Gate><RequirePermission permission="manageProposals"><ProposalEditor /></RequirePermission></Gate>}
        />
        <Route
          path="/operator/proposals/:id"
          element={<Gate><RequirePermission permission="manageProposals"><ProposalEditor /></RequirePermission></Gate>}
        />
        <Route
          path="/operator/proposals/:id/preview"
          element={<Gate><RequirePermission permission="manageProposals"><ProposalPreview /></RequirePermission></Gate>}
        />

        <Route path="/operator/analytics" element={<Gate><Analytics /></Gate>} />
        <Route
          path="/operator/team"
          element={<Gate><RequirePermission permission="manageStaff"><Team /></RequirePermission></Gate>}
        />
        <Route path="/operator/settings" element={<Gate><Settings /></Gate>} />

        {/*
          Integrations — one row per capability, every one not connected, and no
          connect control anywhere (there is no `connectIntegration` method to
          call). Gated on `manageIntegrations`: the permission that WOULD own a
          connection, so the nav offers the section to exactly the roles whose
          question it answers, and sales is not shown a settings page about
          providers it does not touch.
        */}
        <Route
          path="/operator/integrations"
          element={<Gate><RequirePermission permission="manageIntegrations"><Integrations /></RequirePermission></Gate>}
        />
        {/*
          Data quality — the derived issues in the company's own records,
          recomputed on every open and stored nowhere. `viewDataQuality` is held
          by every active role (finance included) because it is a read.
        */}
        <Route
          path="/operator/data-quality"
          element={<Gate><RequirePermission permission="viewDataQuality"><DataQuality /></RequirePermission></Gate>}
        />

        {/*
          Guide fees — the ledger of what is owed and what the operator SAYS
          they paid. Gated on `viewGuideFees`, the READ the role
          `finance_read_only` exists for; the record, invoice and payment
          controls inside are gated separately on `manageGuideFees`, so finance
          opens the whole ledger and finds no write control rather than a
          refusal. Nothing on it moves money.
        */}
        <Route
          path="/operator/guide-fees"
          element={<Gate><RequirePermission permission="viewGuideFees"><GuideFees /></RequirePermission></Gate>}
        />
        {/*
          Pricing — the operator's own rules and the panel that applies them to
          a base price they type. The READ is open to every role that can see
          the catalogue (`viewProducts`, which is what the adapter's
          `listPricingSchedules` also declines to narrow); the editor inside is
          gated on `managePricingSchedules`, because a price is a commitment.
        */}
        <Route
          path="/operator/pricing"
          element={<Gate><RequirePermission permission="viewProducts"><PricingSchedules /></RequirePermission></Gate>}
        />
        {/*
          Automations — operator-written rules whose actions are all internal.
          Gated on `manageAutomations`, the permission the adapter checks before
          it accepts a rule or runs an evaluation.
        */}
        <Route
          path="/operator/automations"
          element={<Gate><RequirePermission permission="manageAutomations"><Automations /></RequirePermission></Gate>}
        />
        {/*
          Distribution — the manual record of where a trip is listed. Read on
          `viewProducts`; the editor inside needs `manageChannelListings`. No
          channel is connected and nothing syncs.
        */}
        <Route
          path="/operator/distribution"
          element={<Gate><RequirePermission permission="viewProducts"><ChannelListings /></RequirePermission></Gate>}
        />

        <Route path="*" element={<Navigate to="/operator/dashboard" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  return (
    <OperatorProvider>
      {/*
        Above every route and every overlay, and never dismissable. Offline the
        portal cannot measure anything it is showing, so it says so permanently
        rather than once. Renders nothing at all when the flag is unset.
      */}
      {DEMO && <OfflineBanner />}
      {/* Phase 4 field-ops seam, composed beside the main backend. It reads `useOperator()`, so it sits inside. */}
      <FieldBackendProvider>
        <Router />
      </FieldBackendProvider>
    </OperatorProvider>
  );
}
