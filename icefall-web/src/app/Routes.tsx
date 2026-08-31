import { Route, Routes } from "react-router-dom";
import { DashboardShell } from "./DashboardShell";
import AppHome from "./Home";
import ExploreRedirect, { ExpeditionsPage, FindPage, MountainsPage } from "./Explore";
import MountainDetail from "./MountainDetail";
import Treks from "./Treks";
import TrekDetail from "./TrekDetail";
import Coach from "./Coach";
import Profile from "./Profile";
import Saved from "./Saved";
import Bookings from "./Bookings";
import Enquiries from "./Enquiries";
import Messages from "./Messages";
import GuidesPage from "./GuidesPage";
import GuideProfile from "./GuideProfile";
import SocialFeed from "./social/Feed";
import SocialLeaderboard from "./social/Leaderboard";
import SocialPeople from "./social/People";
import SocialGroups from "./social/Groups";
import Notifications from "./Notifications";
import Settings from "./Settings";
import CompanyPage from "./Company";
import TripPage from "./TripDetail";
import { Placeholder } from "./Placeholder";

/**
 * The web app's router, mounted under /app.
 *
 * Everything the phone app does EXCEPT recording an activity — there is no
 * tracker route here and there is not going to be one, because a climb logged
 * from a desk is a climb that did not happen.
 */
export default function AppRoutes() {
  return (
    <DashboardShell>
      <Routes>
        <Route index element={<AppHome />} />
        {/* Four routes where there used to be one page with a tab bar. */}
        <Route path="find" element={<FindPage />} />
        <Route path="mountains" element={<MountainsPage />} />
        <Route path="mountains/:id" element={<MountainDetail />} />
        {/* Social is its own section now, with four pages under it. */}
        <Route path="social" element={<SocialFeed />} />
        <Route path="social/leaderboard" element={<SocialLeaderboard />} />
        <Route path="social/people" element={<SocialPeople />} />
        <Route path="social/groups" element={<SocialGroups />} />
        <Route path="expeditions" element={<ExpeditionsPage />} />
        {/* Treks — the second commercial category, beside expeditions. */}
        <Route path="treks" element={<Treks />} />
        <Route path="trek/:id" element={<TrekDetail />} />
        {/* Old links, including ?tab=…, land on the right one. */}
        <Route path="explore" element={<ExploreRedirect />} />
        <Route path="coach" element={<Coach />} />
        <Route path="profile" element={<Profile />} />
        <Route path="saved" element={<Saved />} />
        <Route path="bookings" element={<Bookings />} />
        {/* What you asked, and its real state — see the note in Enquiries.tsx. */}
        <Route path="enquiries" element={<Enquiries />} />
        <Route path="messages" element={<Messages />} />
        <Route path="guides" element={<GuidesPage />} />
        <Route path="guides/:id" element={<GuideProfile />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
        <Route path="company/:id" element={<CompanyPage />} />
        <Route path="trip/:id" element={<TripPage />} />
        <Route path="*" element={<Placeholder title="Not here" what="nothing at this address" />} />
      </Routes>
    </DashboardShell>
  );
}
