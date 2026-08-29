import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Shell } from "@/components/Shell";
import { DemoBanner } from "@/components/DemoBanner";
import { Forbidden, Loading, Unavailable } from "@/components/states";
import { useSession } from "@/auth/session";
import { NOT_CONFIGURED } from "@/lib/supabase";

import SignIn from "@/screens/SignIn";
import Dashboard from "@/screens/Dashboard";
import Companies from "@/screens/Companies";
import CompanyDetail from "@/screens/CompanyDetail";
import Sales from "@/screens/Sales";
import MountainPlacements from "@/screens/MountainPlacements";
import PlacementDetail from "@/screens/PlacementDetail";
import Products from "@/screens/Products";
import Approvals from "@/screens/Approvals";
import Leads from "@/screens/Leads";
import LeadDetail from "@/screens/LeadDetail";
import Bookings from "@/screens/Bookings";
import Commissions from "@/screens/Commissions";
import Finance from "@/screens/Finance";
import Billing from "@/screens/Billing";
import Guides from "@/screens/Guides";
import UsersScreen from "@/screens/Users";
import Support from "@/screens/Support";
import Verification from "@/screens/Verification";
import Analytics from "@/screens/Analytics";
import Tasks from "@/screens/Tasks";
import ActivityLog from "@/screens/ActivityLog";
import Team from "@/screens/Team";
import SettingsScreen from "@/screens/Settings";

/**
 * ICEFALL Business — the internal CRM.
 *
 * Separate software from the athlete app and from the operator portal: its own
 * build, its own deploy, its own login. The only thing it shares is the
 * database. Nothing in here is bundled into what a customer downloads, which is
 * the point of keeping it apart — client lists, revenue, commission rates and
 * internal notes never travel to anyone's phone.
 *
 * Twenty-three routes, matching the specification. Two mountain routes sit
 * outside that list because the placement manager needs somewhere to work
 * per-mountain; they are reachable from Placements rather than the sidebar.
 */
export default function App() {
  const session = useSession();
  const { pathname } = useLocation();

  // `/sign-in` renders the sign-in screen whatever the session says. It sits
  // ABOVE the staff gate on purpose: somebody already signed in still needs a
  // way back to it, and in local development the demo session signs itself in,
  // so without this the screen would be unreachable in the one environment
  // where it can be looked at.
  if (pathname === "/sign-in") return <SignIn />;

  // The whole application is behind the staff gate, including the dashboard.
  // There is no public surface here at all.
  if (session.kind === "loading") {
    return (
      <Shell>
        <Loading what="your session" />
      </Shell>
    );
  }
  if (session.kind === "unconfigured") {
    return (
      <Shell>
        <Unavailable reason={NOT_CONFIGURED} />
      </Shell>
    );
  }
  // Signed out gets the sign-in screen, OUTSIDE the Shell — it has its own
  // full-page layout, and wrapping it in the staff chrome would show the
  // navigation of a CRM you have not been admitted to.
  if (session.kind === "signed_out") {
    return <SignIn />;
  }
  if (session.kind === "not_staff") {
    return (
      <Shell>
        <Forbidden reason="This account is not an ICEFALL staff account. Staff access is granted deliberately — signing up never confers it." />
      </Shell>
    );
  }

  return (
    <Shell>
      <DemoBanner />
      <Routes>
        {/* The old flat routes, kept as redirects rather than 404s. */}
        <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/revenue" element={<Navigate to="/admin/finance" replace />} />
        <Route path="/admin/audit" element={<Navigate to="/admin/activity" replace />} />
        {/* The separate mountain browser did the job Mountain Placements now
            does. Redirected rather than removed: both were linked from company
            and placement rows, and a dead link is worse than a redirect. */}
        <Route path="/admin/mountains" element={<Navigate to="/admin/placements" replace />} />
        <Route path="/admin/mountains/:id" element={<Navigate to="/admin/placements" replace />} />

        <Route path="/admin/dashboard" element={<Dashboard />} />
        <Route path="/admin/analytics" element={<Analytics />} />

        <Route path="/admin/companies" element={<Companies />} />
        <Route path="/admin/companies/:id" element={<CompanyDetail />} />
        <Route path="/admin/sales" element={<Sales />} />
        <Route path="/admin/placements" element={<MountainPlacements />} />
        <Route path="/admin/placements/:id" element={<PlacementDetail />} />
        <Route path="/admin/products" element={<Products />} />

        <Route path="/admin/approvals" element={<Approvals />} />
        <Route path="/admin/leads" element={<Leads />} />
        <Route path="/admin/leads/:id" element={<LeadDetail />} />
        <Route path="/admin/bookings" element={<Bookings />} />
        <Route path="/admin/commissions" element={<Commissions />} />

        <Route path="/admin/finance" element={<Finance />} />
        <Route path="/admin/billing" element={<Billing />} />

        <Route path="/admin/guides" element={<Guides />} />
        <Route path="/admin/users" element={<UsersScreen />} />

        <Route path="/admin/support" element={<Support />} />
        <Route path="/admin/verification" element={<Verification />} />
        <Route path="/admin/tasks" element={<Tasks />} />

        <Route path="/admin/activity" element={<ActivityLog />} />
        <Route path="/admin/team" element={<Team />} />
        <Route path="/admin/settings" element={<SettingsScreen />} />

        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Routes>
    </Shell>
  );
}
