import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { PhoneShell } from "@/components/layout/PhoneShell";
import { SampleGateResolver, useSampleGate } from "@/domain/sampleGate";
import { TabBar } from "@/components/layout/TabBar";
import Home from "@/screens/Home";
import Analytics from "@/screens/Analytics";
import Clients from "@/screens/Clients";
import ClientDetail from "@/screens/ClientDetail";
import Chat from "@/screens/Chat";
import Thread from "@/screens/Thread";
import OfferComposer from "@/screens/OfferComposer";
import Profile from "@/screens/Profile";
import EditProfile from "@/screens/EditProfile";
import Availability from "@/screens/Availability";
import MyMountains from "@/screens/MyMountains";
import AddMountain from "@/screens/AddMountain";
import MountainEditor from "@/screens/MountainEditor";
import Preview from "@/screens/Preview";
import BookingDetail from "@/screens/BookingDetail";
import Verification from "@/screens/Verification";
import Payouts from "@/screens/Payouts";
import Auth from "@/screens/Auth";
import { OFFLINE } from "@/offline/offline";
import { OfflineBanner } from "@/offline/OfflineBanner";

/**
 * ICEFALL Guide — the app a working mountain guide runs their season from.
 *
 * A PHONE APP, in the same frame and the same design system as the athlete app.
 * A guide reads this standing in a car park before a route or in a hut with one
 * bar of signal, not at a desk — so it is built at 430 px and shown inside the
 * house PhoneShell, exactly as ICEFALL is.
 *
 * Five tabs — Home, Analytics, Clients, Chat, Profile — to the owner's mockup of
 * 2026-08-30. Everything else (a booking, a client, a conversation, the
 * calendar, verification, payouts) is reached from one of those five, so the tab
 * bar never grows to fit a new screen.
 *
 * Separate build and separate deploy from both the athlete app and Operations.
 */
export default function App() {
  const location = useLocation();
  /* Subscribing here re-renders the whole tree when the gate flips, so screens
     that read the sample through a plain function call — not a hook — pick up
     the change too. */
  useSampleGate();
  const isAuth = location.pathname === "/welcome";

  return (
    <PhoneShell>
      <SampleGateResolver />
      <div className="flex h-full min-h-0 flex-col">
        {/* ABOVE THE ROUTER, SO IT IS ON EVERY ROUTE AND CANNOT BE SCROLLED
            AWAY. Renders only in an offline build; unset, this is nothing. */}
        {OFFLINE && <OfflineBanner />}

        {/* No `mode="wait"` — it stalls under a hidden document and can strand
            the UI mid-transition. Crossfade only. */}
        <AnimatePresence initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Routes location={location}>
              <Route path="/welcome" element={<Auth />} />
              <Route path="/" element={<Home />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/client/:id" element={<ClientDetail />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/chat/:id" element={<Thread />} />
              <Route path="/chat/:id/offer" element={<OfferComposer />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/edit" element={<EditProfile />} />
              <Route path="/availability" element={<Availability />} />
              <Route path="/mountains" element={<MyMountains />} />
              <Route path="/route/add" element={<AddMountain />} />
              <Route path="/route/:kind/:id" element={<MountainEditor />} />
              <Route path="/preview" element={<Preview />} />
              <Route path="/booking/:id" element={<BookingDetail />} />
              <Route path="/verification" element={<Verification />} />
              <Route path="/payouts" element={<Payouts />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </motion.div>
        </AnimatePresence>

        {!isAuth && <TabBar />}
      </div>
    </PhoneShell>
  );
}
