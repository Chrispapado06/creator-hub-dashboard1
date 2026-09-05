import { Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";

import { AppTopBar } from "@/components/layout/AppTopBar";
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
/* The five Coach tabs, to the owner's designs of 2026-09-04. `CoachProgress`
   is the OLD progress screen — totals, load, records, the review — which now
   lives behind the new Progress tab as its activity history. The old Plan and
   Fuel screens survive the same way, wrapped as detail views in
   `coach/details.tsx`. */
const CoachToday = lazy(() => import("@/screens/coach/Today"));
const CoachPlanTab = lazy(() => import("@/screens/coach/Plan"));
const CoachFuel = lazy(() => import("@/screens/coach/Fuel"));
const CoachProgressTab = lazy(() => import("@/screens/coach/Progress"));
const CoachProgress = lazy(() => import("@/screens/coach/CoachProgress"));
const FuelDetails = lazy(() =>
  import("@/screens/coach/details").then((m) => ({ default: m.FuelDetails })),
);
const PlanCalendar = lazy(() =>
  import("@/screens/coach/details").then((m) => ({ default: m.PlanCalendar })),
);
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
const Social = lazy(() => import("@/screens/social/Social"));
const SettingsSection = lazy(() => import("@/screens/settings/Sections"));
const Badges = lazy(() => import("@/screens/settings/Badges"));
const HealthSources = lazy(() => import("@/screens/settings/HealthSources"));
const PublicProfile = lazy(() => import("@/screens/PublicProfile"));
const PostDetail = lazy(() => import("@/screens/social/PostDetail"));
const HouseRulesScreen = lazy(() => import("@/screens/social/HouseRulesScreen"));
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
const ExploreMap = lazy(() => import("@/screens/explore/ExploreMap"));
/* `Groups` IS NOT LAZY-LOADED HERE ANY MORE. It has no route of its own: it is
   the Groups sub-tab of `screens/social/Social.tsx`, which imports it itself,
   and `/explore/groups` now redirects to `/social?tab=groups`. It renders no
   header, so mounted at a route of its own it borrowed whatever layout it sat
   under — which under `/explore` said "Explore". */
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
      {/* The top bar, on every screen that has the bottom navigation (owner,
          2026-09-04). It clears the notch, so everything below it must not:
          `--screen-safe-top: 0px` on the content wrapper is what stops the
          layouts and `Screen` clearing it a second time. See `AppTopBar`. */}
      <AppTopBar />
      {/*
        `key={pathname}` IS ALSO THE SCROLL RESET, and that is a second reason
        to keep it rather than an accident worth tidying away.

        Keying on the path remounts the whole screen on every navigation, so the
        `Screen` container the next screen scrolls in is a NEW element and
        starts at the top. Verified by measurement on 4 Sep 2026 rather than
        assumed: scrolled to 600 on /coach/progress, navigated to /coach/today,
        and the container that arrived was a different node at scrollTop 0.

        Drop the key and a navigation that keeps the same route element — one
        guide's profile to another guide's profile, `/explore/guides/a` to
        `/explore/guides/b` — would hold the previous screen's scroll offset,
        which on those pages is the offset that hides the disclosures. If this
        key is ever removed for a transition, `Screen` needs an explicit
        scroll-to-top on pathname change in the same edit. `scroll.test.ts`
        fails if the key goes without one.

        It also means NOTHING RESTORES SCROLL POSITION ON BACK, anywhere in the
        app — measured, not assumed. That is a deliberate consequence, not an
        omission to fix by accident.
      */}
      <motion.main
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="flex min-h-0 flex-1 flex-col"
        /* The bar above has cleared the notch. Screens read
           `var(--screen-safe-top, env(...))`, so zeroing it here is what keeps
           the inset counted once. */
        style={{ "--screen-safe-top": "0px" } as React.CSSProperties}
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
          {/* OUTSIDE AppShell DELIBERATELY, and this is the whole point of the
              route. A removal notice carries this URL, and the person who opens
              it is the least likely person in the app to have a live session in
              that browser: it arrives by email, is read days later, sometimes by
              somebody whose account is the thing under dispute. Inside the shell
              they would be redirected to the splash and the notice would become
              unanswerable. The path is stable forever — links in notices already
              sent point at it — and every rule is an anchor beneath it,
              /house-rules#human-remains. See @/social/houseRules.ts. */}
          <Route path="/house-rules" element={<HouseRulesScreen />} />
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
            {/*
                SOCIAL IS A TOP-LEVEL DESTINATION, not a tab of Explore.

                The owner, 2026-09-03: "when you click on social, i dont want it
                to be shown on explore anymore." It had a slot in the bottom tab
                bar while still rendering inside `ExploreLayout`, so tapping it
                produced a screen titled "Explore", with a back chevron and two
                stacked tab rows. Inside `AppShell`, so it keeps the tab bar;
                outside `/explore`, so it keeps nothing else of it.

                Above `/social/post/:id` for readability only — the two paths are
                distinct and neither can shadow the other. The sub-tab lives in
                the query string (`?tab=people`), which is why the redirect below
                cannot be a plain `<Navigate to="/social">`. */}
            <Route path="/social" element={<Social />} />
            <Route path="/social/post/:id" element={<PostDetail />} />
            {/*
                SOCIAL'S OWN SCREENS, MOVED OUT OF `/explore` ON 2026-09-03.

                A climber's profile, the create-a-group form and a group's
                workspace are what you open from the People and Groups sub-tabs.
                Declared under `/explore` they rendered inside `ExploreLayout`,
                so the most ordinary thing a user does on Social — tap a person,
                tap a group — put them back on a screen titled "Explore", under
                a FIND/EXPEDITIONS/GUIDES tab row, with a back chevron to the
                Explore hub. That is the owner's complaint one tap deeper.

                NO SHARED `/social` LAYOUT, and that is the considered answer
                rather than an omission. Each of these three already draws its
                own chrome: `AthleteProfile` has a cover band with its own back
                chevron, `GroupWorkspace` and `CreateExpedition` each render a
                `ScreenHeader` with a title of their own. Under `ExploreLayout`
                they were double-headed — two titles, two chevrons. A `SocialLayout`
                would rebuild exactly that mistake in a new place. They are flat
                routes under `AppShell`, keeping the bottom tab bar and nothing
                else, which is precisely how `/social/post/:id` above already
                works.

                THE CHEVRONS GO BACK IN HISTORY, not to a fixed screen, because
                each of these is reached from several places: a profile from the
                People tab, from the feed, from the leaderboard, from search and
                from a notification; a workspace from Discover, from My Groups
                and from the create flow. `/social/groups/new` is the one
                exception — it is only ever reached from the Groups list, so its
                chevron names that list rather than guessing. */}
            <Route path="/social/people/:id" element={<AthleteProfile />} />
            {/* THE CONNECT FLOW IS NOT BUILT, and cannot honestly be against an
                empty `network/` directory, so it lands on the people list
                rather than 404ing. It has a `/social` path only so that no
                screen of Social's has to build an `/explore` URL; the
                `/explore` twin below is kept for links already in the wild.
                `AthleteCard` in `explore/People.tsx` is the one control that
                points here, and that card renders only when
                `DISCOVERABLE_ATHLETES` is non-empty — which it is forbidden to
                be until a real directory exists. */}
            <Route path="/social/people/:id/connect" element={<SocialTabRedirect tab="people" />} />
            {/* Static before dynamic for the reader; the router ranks them
                that way regardless. */}
            <Route path="/social/groups" element={<SocialTabRedirect tab="groups" />} />
            <Route path="/social/groups/new" element={<CreateExpedition />} />
            <Route path="/social/groups/:id" element={<GroupWorkspace />} />

            {/*
                THE OLD `/explore` PATHS. Deep links are in the wild — a shared
                profile URL, a bookmark, an old build's service worker — so
                every one of them still arrives.

                EVERY REDIRECT CARRIES THE QUERY STRING, because on these paths
                the query string is the destination: `?tab=…` picks Social's
                sub-tab, `?create=1` opens the create-a-group flow and
                `?peak=Denali` pre-fills the new-expedition form. A plain
                `<Navigate to="/social" replace />` resolves to exactly `/social`
                and drops all of it — see `SocialRedirect` below.

                DECLARED HERE, OUTSIDE THE `/explore` ROUTE BLOCK, so they never
                mount `ExploreLayout`. Nested under it, a cold load of an old
                link would render the Explore header for a frame before the
                redirect fired. Nothing is ambiguous: each of these paths is
                declared exactly once in this file, and `/explore` has no
                catch-all child that could also claim them. */}
            <Route path="/explore/social" element={<SocialRedirect />} />
            {/* `/explore/community` was an obsolete second Community screen,
                unlinked from anywhere, carrying invented athletes with no demo
                notice. The live feed is Social's. */}
            <Route path="/explore/community" element={<SocialRedirect />} />
            <Route path="/explore/people" element={<SocialTabRedirect tab="people" />} />
            {/* The connect flow is not built (and cannot honestly be against an
                empty `network/` directory), so it lands on the people list
                rather than 404ing. Ranked above `people/:id` by the router
                because it is the more specific pattern. */}
            <Route path="/explore/people/:id/connect" element={<SocialTabRedirect tab="people" />} />
            <Route path="/explore/people/:id" element={<LegacyPersonRedirect />} />
            <Route path="/explore/groups" element={<SocialTabRedirect tab="groups" />} />
            <Route path="/explore/groups/new" element={<LegacySocialRedirect to="/social/groups/new" />} />
            <Route path="/explore/groups/:id" element={<LegacyGroupRedirect />} />
            {/* `crew` was the name before `groups`. Pointed at the real
                destination, not at another redirect — a chain would flash a
                second navigation and is one more thing to keep true. */}
            <Route path="/explore/crew" element={<SocialTabRedirect tab="groups" />} />
            <Route path="/explore/crew/new" element={<LegacySocialRedirect to="/social/groups/new" />} />
            <Route path="/operator/:id" element={<OperatorProfile />} />
            <Route path="/operator/:id/trip/:tripId" element={<TripDetail />} />

            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/professional/:kind" element={<ProApplication />} />
            <Route path="/settings/badges" element={<Badges />} />
            {/* Above `:section`, which is a catch-all and would swallow it. */}
            <Route path="/settings/health-sources" element={<HealthSources />} />
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
              {/* TODAY IS THE LANDING SURFACE — the owner's redesign brief says
                  "Chat should not open first". /coach/chat stays valid for
                  every link already pointing at it. The two old screens keep
                  their paths as detail views behind the tabs that replaced
                  them, so nothing linking to /coach/nutrition or expecting the
                  full calendar lands on a missing page. */}
              <Route index element={<CoachToday />} />
              <Route path="today" element={<CoachToday />} />
              <Route path="chat" element={<CoachChat />} />
              <Route path="plan" element={<CoachPlanTab />} />
              <Route path="plan/calendar" element={<PlanCalendar />} />
              <Route path="fuel" element={<CoachFuel />} />
              <Route path="progress" element={<CoachProgressTab />} />
              <Route path="progress/history" element={<CoachProgress />} />
              <Route path="readiness" element={<ReadinessScreen />} />
              <Route path="recovery" element={<RecoveryScreen />} />
              <Route path="check-in" element={<CheckIn />} />
              <Route path="session/:date" element={<SessionDetail />} />
              <Route path="training" element={<Training />} />
              <Route path="nutrition" element={<FuelDetails />} />
            </Route>

            <Route path="/explore" element={<ExploreLayout />}>
              {/* EXPLORE OPENS ON THE HUB — the owner's Explore design of
                  2026-09-04 IS this section's front page.

                  It used to redirect to Find, from when the hub was a side page
                  reached by a back chevron. That left the redesign unreachable
                  from the tab bar: tapping EXPLORE landed on the old search
                  screen, and nothing in the navigation pointed at `/explore/hub`
                  at all. The owner reported it as "new explore doesnt work",
                  which is exactly what it looked like.

                  A redirect rather than rendering `ExploreHub` here directly:
                  `ExploreLayout` decides whether to draw its header and tab
                  strip by testing `pathname === "/explore/hub"`, so the hub
                  rendered at `/explore` would arrive with the strip stacked
                  above it — the doubled-navigation bug that moved Social out of
                  this section in the first place. Find is still one tap away,
                  in the strip and on the hub's own discovery card. */}
              <Route index element={<Navigate to="/explore/hub" replace />} />
              <Route path="hub" element={<ExploreHub />} />
              {/* The hub's map button and its "Map view" link both land here.
                  Real pins on real coordinates — the curated mountains and the
                  athlete's own saved objectives — and nothing else, because
                  nothing else has a position ICEFALL actually holds. */}
              <Route path="map" element={<ExploreMap />} />
              <Route path="routes" element={<RoutesScreen />} />
              <Route path="route/:id" element={<RouteDetail />} />
              <Route path="trail/:id" element={<TrailDetail />} />
              <Route path="mountains" element={<Mountains />} />
              {/* Treks sit beside expeditions, not inside them — a walk to a
                  mountain and a climb of it are different products. */}
              <Route path="treks" element={<TreksScreen />} />
              <Route path="trek/:id" element={<TrekDetail />} />
              <Route path="mountain/:id" element={<MountainDetail />} />
              <Route path="peak/:id" element={<PeakDetail />} />
              <Route path="expeditions" element={<Expeditions />} />
              <Route path="expeditions/:id" element={<ExpeditionDetail />} />
              {/* PEOPLE, GROUPS AND CREW USED TO BE DECLARED HERE. They are
                  Social's screens, so they are declared under `/social` now and
                  the old paths are redirects — see the legacy block beside the
                  `/social` routes above. They are declared THERE rather than
                  here on purpose: a `<Navigate>` nested under this route mounts
                  `ExploreLayout` for a frame before it fires, so a cold load of
                  an old link would flash the word "Explore" on its way out of
                  Explore — the exact thing the move was for. */}
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

/**
 * `/explore/social` after Social left Explore — AND THE QUERY STRING WITH IT.
 *
 * Social's sub-tab is a search param, not a path segment: `?tab=people`,
 * `?tab=groups&create=1`. `<Navigate to="/social" replace />` would resolve to
 * exactly `/social`, silently discarding the search — every legacy People link
 * would open the feed, and the create-group deep link would open nothing. React
 * Router does not carry search params across a redirect for you, so this reads
 * the current one and puts it back on.
 */
function SocialRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/social${search}`} replace />;
}

/**
 * An old path that landed on a Social SUB-TAB — `/explore/people`,
 * `/explore/groups`, `/explore/crew`.
 *
 * The sub-tab is a query param, so this cannot append: `/explore/groups?create=1`
 * has to arrive as `/social?create=1&tab=groups` with BOTH params intact, or
 * the create-a-group deep link opens the feed and creates nothing. So the
 * incoming search is parsed, `tab` is set on it, and the rest rides along.
 */
function SocialTabRedirect({ tab }: { tab: "people" | "groups" }) {
  const { search } = useLocation();
  const next = new URLSearchParams(search);
  next.set("tab", tab);
  return <Navigate to={`/social?${next.toString()}`} replace />;
}

/** An old path with no params of its own — the search string rides along. */
function LegacySocialRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

/** `/explore/people/:id` → `/social/people/:id`. `useParams` hands back a
    decoded segment, so it is encoded again on the way out — a handle is a
    legal id here and handles can carry characters a URL cannot. */
function LegacyPersonRedirect() {
  const { id } = useParams<{ id: string }>();
  const { search } = useLocation();
  return (
    <Navigate to={id ? `/social/people/${encodeURIComponent(id)}${search}` : "/social?tab=people"} replace />
  );
}

/** `/explore/groups/:id` → `/social/groups/:id`. */
function LegacyGroupRedirect() {
  const { id } = useParams<{ id: string }>();
  const { search } = useLocation();
  return (
    <Navigate to={id ? `/social/groups/${encodeURIComponent(id)}${search}` : "/social?tab=groups"} replace />
  );
}

/** Old enquiry-thread links keep working after Messages replaced Enquiries. */
function RedirectThread() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/messages/${id}` : "/messages"} replace />;
}
