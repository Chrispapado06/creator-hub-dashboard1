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
import { OfflineBanner } from "@/offline/OfflineBanner";
import { DEMO } from "@/offline/offline";
import { can, type Permission } from "@/domain/authz";
import Analytics from "@/screens/Analytics";
import Bookings from "@/screens/Bookings";
import Expeditions from "@/screens/Expeditions";
import Notifications from "@/screens/Notifications";
import Treks from "@/screens/Treks";
import Channels, { ChannelDetail } from "@/screens/Channels";
import CompanyEditor from "@/screens/CompanyEditor";
import CompanyProfile from "@/screens/CompanyProfile";
import Conversation from "@/screens/Conversation";
import Dashboard from "@/screens/Dashboard";
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
import Settings from "@/screens/Settings";
import SignIn from "@/screens/SignIn";
import Team from "@/screens/Team";

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
        <Route path="/operator/notifications" element={<Gate><Notifications /></Gate>} />

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

        {/* The same leads, seen as a board rather than a list. */}
        <Route
          path="/operator/pipeline"
          element={<Gate><RequirePermission permission="manageLeads"><Pipeline /></RequirePermission></Gate>}
        />

        <Route path="/operator/analytics" element={<Gate><Analytics /></Gate>} />
        <Route
          path="/operator/team"
          element={<Gate><RequirePermission permission="manageStaff"><Team /></RequirePermission></Gate>}
        />
        <Route path="/operator/settings" element={<Gate><Settings /></Gate>} />

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
      <Router />
    </OperatorProvider>
  );
}
