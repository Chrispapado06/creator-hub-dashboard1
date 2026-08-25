import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { PhoneShell } from "@/components/layout/PhoneShell";
import { TabBar } from "@/components/layout/TabBar";
import Today from "@/screens/Today";
import Openings from "@/screens/Openings";
import Enquiries from "@/screens/Enquiries";
import Verification from "@/screens/Verification";
import Profile from "@/screens/Profile";
import Payouts from "@/screens/Payouts";
import Auth from "@/screens/Auth";

/**
 * ICEFALL Guide — the app a working mountain guide runs their season from.
 *
 * A PHONE APP, in the same frame and the same design system as the athlete app.
 * A guide reads this standing in a car park before a route or in a hut with one
 * bar of signal, not at a desk — so it is built at 430 px and shown inside the
 * house PhoneShell, exactly as ICEFALL is.
 *
 * Separate build and separate deploy from both the athlete app and Operations.
 */
export default function App() {
  const location = useLocation();
  const isAuth = location.pathname === "/welcome";

  return (
    <PhoneShell>
      <div className="flex h-full min-h-0 flex-col">
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
              <Route path="/" element={<Today />} />
              <Route path="/openings" element={<Openings />} />
              <Route path="/enquiries" element={<Enquiries />} />
              <Route path="/verification" element={<Verification />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/payouts" element={<Payouts />} />
              <Route path="*" element={<Today />} />
            </Routes>
          </motion.div>
        </AnimatePresence>

        {!isAuth && <TabBar />}
      </div>
    </PhoneShell>
  );
}
