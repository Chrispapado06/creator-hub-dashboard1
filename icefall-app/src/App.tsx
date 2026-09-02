import { Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";

import { PhoneShell } from "@/components/layout/PhoneShell";
import { TabBar } from "@/components/layout/TabBar";
import { IcefallMark } from "@/components/ui/IcefallMark";
import { Button } from "@/components/ui/primitives";
import { useSessionState } from "@/auth/session";
import { useApp } from "@/state/AppState";
import { DEMO } from "@/offline/offline";
import { OfflineRouteGuard } from "@/offline/OfflineRouteGuard";

import Splash from "@/screens/Splash";
import Home from "@/screens/Home";

// Everything past the first paint is split, following the sibling apps' pattern.
const Onboarding = lazy(() => import("@/screens/Onboarding"));
const Messages = lazy(() => import("@/screens/chat/Messages"));
const ChatThread = lazy(() => import("@/screens/chat/Thread"));
const BookGuide = lazy(() => import("@/screens/booking/BookGuide"));
const BookPayment = lazy(() => import("@/screens/booking/Payment"));
const BookReview = lazy(() => import("@/screens/booking/Review"));
const CoachHome = lazy(() => import("@/screens/coach/CoachHome"));
const CoachPlan = lazy(() => import("@/screens/coach/CoachPlan"));
const CoachProgress = lazy(() => import("@/screens/coach/CoachProgress"));
const ReadinessScreen = lazy(() => import("@/screens/coach/ReadinessScreen"));
const RecoveryScreen = lazy(() => import("@/screens/coach/RecoveryScreen"));
const SessionDetail = lazy(() => import("@/screens/coach/SessionDetail"));
const CheckIn = lazy(() => import("@/screens/coach/CheckIn"));

const Welcome = lazy(() => import("@/screens/auth/Auth").then((m) => ({ default: m.Welcome })));
const CreateAccount = lazy(() =>
  import("@/screens/auth/Auth").then((m) => ({ default: m.CreateAccount })),
);
const SignUp = lazy(() => import("@/screens/auth/Auth").then((m) => ({ default: m.SignUp })));
const ChooseHandle = lazy(() =>
  import("@/screens/auth/Handle").then((m) => ({ default: m.ChooseHandle })),
);
const AuthCallback = lazy(() =>
  import("@/screens/auth/Callback").then((m) => ({ default: m.AuthCallback })),
);
const NewPassword = lazy(() =>
  import("@/screens/auth/NewPassword").then((m) => ({ default: m.NewPassword })),
);
const SignIn = lazy(() => import("@/screens/auth/Auth").then((m) => ({ default: m.SignIn })));
const ForgotPassword = lazy(() =>
  import("@/screens/auth/Auth").then((m) => ({ default: m.ForgotPassword })),
);
const TrialStart = lazy(() =>
  import("@/screens/auth/Trial").then((m) => ({ default: m.TrialStart })),
);
const Paywall = lazy(() => import("@/screens/auth/Trial").then((m) => ({ default: m.Paywall })));
const ReadinessTest = lazy(() => import("@/screens/growth/ReadinessTest"));
const ReadinessResult = lazy(() => import("@/screens/growth/ReadinessResult"));
const ActivityHistory = lazy(() => import("@/screens/ActivityHistory"));
const Search = lazy(() => import("@/screens/Search"));
const RoutesScreen = lazy(() => import("@/screens/routes/Routes"));
const RouteDetail = lazy(() => import("@/screens/routes/RouteDetail"));
const Social = lazy(() => import("@/screens/explore/Social"));
const SettingsSection = lazy(() => import("@/screens/settings/Sections"));
const Badges = lazy(() => import("@/screens/settings/Badges"));
const PublicProfile = lazy(() => import("@/screens/PublicProfile"));
const PostDetail = lazy(() => import("@/screens/social/PostDetail"));
const ActivityReplay = lazy(() => import("@/screens/tracker/ActivityReplay"));
const ActivityAnalysis = lazy(() => import("@/screens/tracker/ActivityAnalysis"));
const ProApplication = lazy(() => import("@/screens/settings/Application"));
const TrailDetail = lazy(() => import("@/screens/routes/TrailDetail"));
const ActivitySelect = lazy(() => import("@/screens/tracker/ActivitySelect"));
const LiveTracker = lazy(() => import("@/screens/tracker/LiveTracker"));
const ActivityComplete = lazy(() => import("@/screens/tracker/ActivityComplete"));
const ShareActivity = lazy(() => import("@/screens/tracker/ShareActivity"));
const ActivitySummary = lazy(() => import("@/screens/ActivitySummary"));
const Health = lazy(() => import("@/screens/Health"));
const Settings = lazy(() => import("@/screens/settings/Settings"));
const Goals = lazy(() => import("@/screens/Goals"));
const GoalDetail = lazy(() => import("@/screens/Goals").then((m) => ({ default: m.GoalDetail })));
const ComposeEnquiry = lazy(() =>
  import("@/screens/Inbox").then((m) => ({ default: m.ComposeEnquiry })),
);
const CoachLayout = lazy(() => import("@/screens/CoachLayout"));
const CoachChat = lazy(() => import("@/screens/CoachChat"));
const Training = lazy(() => import("@/screens/Training"));
const Nutrition = lazy(() => import("@/screens/Nutrition"));
const ExploreLayout = lazy(() => import("@/screens/ExploreLayout"));
const Mountains = lazy(() => import("@/screens/Mountains"));
const TreksScreen = lazy(() => import("@/screens/treks/Treks"));
const TrekDetail = lazy(() => import("@/screens/treks/TrekDetail"));
const MountainDetail = lazy(() =>
  import("@/screens/Mountains").then((m) => ({ default: m.MountainDetail })),
);
const PeakDetail = lazy(() => import("@/screens/PeakDetail"));
const Expeditions = lazy(() => import("@/screens/Expeditions"));
const ExpeditionDetail = lazy(() =>
  import("@/screens/Expeditions").then((m) => ({ default: m.ExpeditionDetail })),
);
const Events = lazy(() => import("@/screens/Events"));
const EventDetail = lazy(() =>
  import("@/screens/Events").then((m) => ({ default: m.EventDetail })),
);
const Gear = lazy(() => import("@/screens/Gear"));
const GearDetail = lazy(() => import("@/screens/Gear").then((m) => ({ default: m.GearDetail })));
const Private = lazy(() => import("@/screens/Private"));
const Profile = lazy(() => import("@/screens/Profile"));
const SavedTrails = lazy(() => import("@/screens/SavedTrails"));
const Notifications = lazy(() => import("@/screens/Notifications"));

// Expedition network (climbers), distinct from the commercial trips above.
const CrewExpeditions = lazy(() => import("@/screens/explore/Expeditions"));
const CreateExpedition = lazy(() => import("@/screens/explore/CreateExpedition"));
const AthleteProfile = lazy(() => import("@/screens/explore/AthleteProfile"));
const OperatorProfile = lazy(() => import("@/screens/explore/OperatorProfile"));
const TripDetail = lazy(() => import("@/screens/explore/TripDetail"));
const ExploreHub = lazy(() => import("@/screens/explore/ExploreHub"));
const Groups = lazy(() => import("@/screens/explore/Groups"));
const GroupWorkspace = lazy(() => import("@/screens/explore/GroupWorkspace"));
const Guides = lazy(() => import("@/screens/guides/Guides"));
const GuideProfile = lazy(() => import("@/screens/guides/GuideProfile"));
const GuideRequest = lazy(() => import("@/screens/guides/GuideRequest"));
const GuideThread = lazy(() => import("@/screens/guides/GuideThread"));
const GuideDashboard = lazy(() => import("@/screens/guides/GuideDashboard"));

// Mountain intelligence
const CommandCentre = lazy(() => import("@/screens/mountain/CommandCentre"));
const Conditions = lazy(() => import("@/screens/mountain/Conditions"));
const MountainChecklist = lazy(() => import("@/screens/mountain/Checklist"));
const Benchmark = lazy(() => import("@/screens/mountain/Benchmark"));

// Growth
const Pricing = lazy(() => import("@/screens/growth/Pricing"));
const ShareReadiness = lazy(() => import("@/screens/growth/ShareReadiness"));

function PageLoader() {
  return (
    <div className="grid h-full place-items-center">
      <motion.div
        animate={{ opacity: [0.25, 0.7, 0.25] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <IcefallMark className="h-6 text-mist" />
      </motion.div>
    </div>
  );
}

/**
 * The five-tab shell. Content crossfades on navigation; the tab bar never
 * moves, which is what makes the app feel like one place.
 */
/**
 * THE SHELL GATE — an account is required, ruled by the owner 2026-09-02.
 *
 * This used to check `onboarded` alone, which is a LOCAL flag: anyone could set
 * it by walking the onboarding questions, and the splash offered "Explore
 * without an account" as a third door that did exactly that. So the whole app
 * was reachable with no account at all, while every screen was being written to
 * handle a signed-out visitor honestly. Two different products, half-built each.
 *
 * The owner's ruling: an account is required. So the gate now asks for a real
 * SESSION, and the guest door is gone from Auth.tsx.
 *
 * DEMO BUILDS ARE THE DELIBERATE EXCEPTION. The Vercel links the owner shares
 * are `VITE_ICEFALL_DEMO=1`, and the offline bundle is the same flag — neither
 * has a Supabase session and neither should. Gating them would break the one
 * way anybody outside the team sees this app. `DEMO` is a build-time constant,
 * so this branch folds away entirely in a production bundle.
 *
 * `session === undefined` means "not yet known", which is NOT "signed out" —
 * redirecting during the first async check would bounce a signed-in person to
 * the splash on every cold start. It holds instead.
 */
function AppShell() {
  const { pathname } = useLocation();
  const { onboarded } = useApp();
  const session = useSessionState();

  if (!DEMO) {
    if (session === undefined) return <PageLoader />;
    if (session === null) return <Navigate to="/" replace />;
  }
  if (!onboarded) return <Navigate to="/" replace />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <motion.main
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Outlet />
      </motion.main>
      <TabBar />
    </div>
  );
}

function NotFound() {
  return (
    <div className="grid h-full place-items-center px-8 text-center">
      <div>
        <IcefallMark className="mx-auto h-8 text-mist-dim" />
        <h1 className="mt-6 text-[20px] font-light text-snow">Off route</h1>
        <p className="mt-2 text-[13px] text-mist">This path doesn't lead anywhere.</p>
        <Button asChild variant="secondary" className="mt-6">
          <a href="/home">Return to base</a>
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <PhoneShell>
      {/* No-op unless the build is the offline demo. See @/offline/OfflineRouteGuard. */}
      <OfflineRouteGuard />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Offline the athlete is already on the device and already
              onboarded, so the root URL opens the app rather than holding on
              the splash for 2.6 s and then deciding the same thing. */}
          <Route path="/" element={DEMO ? <Navigate to="/home" replace /> : <Splash />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/auth/create" element={<CreateAccount />} />
          <Route path="/auth/signup" element={<SignUp />} />
          <Route path="/auth/signin" element={<SignIn />} />
          <Route path="/auth/forgot" element={<ForgotPassword />} />
          {/*
            Both the email and the social paths converge here. A session whose
            profile has no username is the same state however it was reached, so
            one screen covers both rather than two flows drifting apart.
          */}
          <Route path="/auth/handle" element={<ChooseHandle />} />
          {/* Where Google, Apple and Microsoft send the browser back to. */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          {/* Where a password-reset link lands. A recovery link signs you in;
              this is where you actually change the password. */}
          <Route path="/auth/new-password" element={<NewPassword />} />
          {/* Full-bleed, outside AppShell: they reserve no space for the TabBar. */}
          <Route path="/trial" element={<TrialStart />} />
          <Route path="/subscribe" element={<Paywall />} />
          {/* Free, account-free top of the funnel — outside AppShell. */}
          <Route path="/readiness-test" element={<ReadinessTest />} />
          <Route path="/readiness-result" element={<ReadinessResult />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/share/readiness" element={<ShareReadiness />} />
          <Route path="/onboarding" element={<Onboarding />} />
          {/* Full-bleed: once you're starting an activity, the tab bar gets out
              of the way — and its raised Start control can't collide with the
              screen's own primary action. */}
          <Route path="/activity/select" element={<ActivitySelect />} />
          <Route path="/activity/live/:typeId" element={<LiveTracker />} />
          <Route path="/activity/complete/:id" element={<ActivityComplete />} />
          <Route path="/activity/live" element={<Navigate to="/activity/select" replace />} />

          <Route element={<AppShell />}>
            <Route path="/home" element={<Home />} />

            <Route path="/activity" element={<ActivityHistory />} />
            <Route path="/search" element={<Search />} />
            <Route path="/activity/:id" element={<ActivitySummary />} />
            <Route path="/activity/:id/share" element={<ShareActivity />} />
            <Route path="/activity/:id/replay" element={<ActivityReplay />} />
            <Route path="/activity/:id/analysis" element={<ActivityAnalysis />} />
            <Route path="/health" element={<Health />} />
            {/* A shared profile card. Carries its contents in the fragment, so
                it opens with no account and nothing reaches a server. */}
            <Route path="/p" element={<PublicProfile />} />
            <Route path="/social/post/:id" element={<PostDetail />} />
            <Route path="/operator/:id" element={<OperatorProfile />} />
            <Route path="/operator/:id/trip/:tripId" element={<TripDetail />} />

            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/professional/:kind" element={<ProApplication />} />
            <Route path="/settings/badges" element={<Badges />} />
            <Route path="/settings/:section" element={<SettingsSection />} />

            <Route path="/goals" element={<Goals />} />
            <Route path="/goals/:id" element={<GoalDetail />} />
            {/* Guides live under Explore; these keep old links alive. */}
            <Route path="/guides" element={<Navigate to="/explore/guides" replace />} />
            <Route path="/guides/:id" element={<Navigate to="/explore/guides" replace />} />
            <Route path="/mountain/:goalId" element={<CommandCentre />} />
            <Route path="/mountain/:goalId/conditions" element={<Conditions />} />
            <Route path="/mountain/:goalId/checklist" element={<MountainChecklist />} />
            <Route path="/mountain/:goalId/benchmark" element={<Benchmark />} />
            {/* `new` before `:id` — otherwise the compose route is read as a thread id. */}
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/:id" element={<ChatThread />} />
            <Route path="/book" element={<BookGuide />} />
            <Route path="/book/payment" element={<BookPayment />} />
            <Route path="/book/review" element={<BookReview />} />
            {/* Messages replaced Enquiries. Old links are redirected rather
                than broken — an athlete may have one open, and the compose flow
                is still reached as /inbox/new from operator cards. */}
            <Route path="/inbox" element={<Navigate to="/messages" replace />} />
            <Route path="/inbox/new" element={<ComposeEnquiry />} />
            <Route path="/messages/new" element={<ComposeEnquiry />} />
            <Route path="/inbox/:id" element={<RedirectThread />} />

            <Route path="/coach" element={<CoachLayout />}>
              {/* Chat is the landing surface — the Coach is a conversation
                  first. Today keeps its own path so both are one tap apart, and
                  /coach/chat stays valid for links already pointing at it. */}
              <Route index element={<CoachChat />} />
              <Route path="chat" element={<CoachChat />} />
              <Route path="today" element={<CoachHome />} />
              <Route path="plan" element={<CoachPlan />} />
              <Route path="progress" element={<CoachProgress />} />
              <Route path="readiness" element={<ReadinessScreen />} />
              <Route path="recovery" element={<RecoveryScreen />} />
              <Route path="check-in" element={<CheckIn />} />
              <Route path="session/:date" element={<SessionDetail />} />
              <Route path="training" element={<Training />} />
              <Route path="nutrition" element={<Nutrition />} />
            </Route>

            <Route path="/explore" element={<ExploreLayout />}>
              {/* Explore opens on Find — the search is the point of the section. */}
              <Route index element={<Navigate to="/explore/routes" replace />} />
              <Route path="hub" element={<ExploreHub />} />
              <Route path="routes" element={<RoutesScreen />} />
              <Route path="social" element={<Social />} />
              <Route path="route/:id" element={<RouteDetail />} />
              <Route path="trail/:id" element={<TrailDetail />} />
              <Route path="mountains" element={<Mountains />} />
              {/* Treks sit beside expeditions, not inside them — a walk to a
                  mountain and a climb of it are different products. */}
              <Route path="treks" element={<TreksScreen />} />
              <Route path="trek/:id" element={<TrekDetail />} />
              <Route path="groups" element={<Groups />} />
              <Route path="groups/new" element={<CreateExpedition />} />
              <Route path="groups/:id" element={<GroupWorkspace />} />
              <Route path="mountain/:id" element={<MountainDetail />} />
              <Route path="peak/:id" element={<PeakDetail />} />
              <Route path="expeditions" element={<Expeditions />} />
              <Route path="expeditions/:id" element={<ExpeditionDetail />} />
              {/* The connect flow is not built (and cannot honestly be against
                  the local, empty `network/` directory), so it still lands on
                  the people list rather than 404ing.

                  `people/:id` USED TO BE REDIRECTED HERE TOO, and correctly:
                  `AthleteProfile` read local state, so with no server it
                  resolved every id but the phone owner's to nobody. Supabase is
                  live now, `profiles` holds real accounts and `profiles_select`
                  is `to authenticated using (true)` — so that redirect became
                  the only thing standing between a people-search result and the
                  person it found. It is gone; the declaration below is the one
                  that resolves. */}
              <Route path="people/:id/connect" element={<Navigate to="/explore/social?tab=people" replace />} />
              <Route path="crew" element={<Navigate to="/explore/groups" replace />} />
              <Route path="crew/new" element={<Navigate to="/explore/groups/new" replace />} />
              {/* Merged into Social; the old path still resolves. */}
              <Route path="people" element={<Navigate to="/explore/social" replace />} />
              <Route path="people/:id" element={<AthleteProfile />} />
              {/* Static before dynamic so :id cannot swallow them. */}
              <Route path="guides" element={<Guides />} />
              <Route path="guides/dashboard" element={<GuideDashboard />} />
              <Route path="guides/thread/:id" element={<GuideThread />} />
              <Route path="guides/:id" element={<GuideProfile />} />
              <Route path="guides/:id/request" element={<GuideRequest />} />
              {/* Guided trips from third-party operators — renamed from
                  /explore/expeditions, which now means your own climbing group. */}
              <Route path="trips" element={<Navigate to="/explore/expeditions" replace />} />

              <Route path="events" element={<Events />} />
              <Route path="events/:id" element={<EventDetail />} />
              {/* /explore/community was an obsolete second Community screen —
                  unlinked from anywhere in the app, carrying invented athletes
                  and member counts with no demo notice on them. The live feed is
                  /explore/social. Anything still pointing here lands there. */}
              <Route path="community" element={<Navigate to="/explore/social" replace />} />
            </Route>

            <Route path="/gear" element={<Gear />} />
            <Route path="/gear/:id" element={<GearDetail />} />
            <Route path="/private" element={<Private />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/saved" element={<SavedTrails />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </PhoneShell>
  );
}

/** Old enquiry-thread links keep working after Messages replaced Enquiries. */
function RedirectThread() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/messages/${id}` : "/messages"} replace />;
}
