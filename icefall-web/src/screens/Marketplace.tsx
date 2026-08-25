import { Route, Routes } from "react-router-dom";
import { Shell } from "@/components/Shell";
import Landing from "@/screens/Landing";
import Plan from "@/screens/Plan";
import Guides from "@/screens/Guides";
import GuideDetail from "@/screens/GuideDetail";
import BookingConfirm from "@/screens/BookingConfirm";
import Expeditions from "@/screens/Expeditions";
import { Mountains, Messages } from "@/screens/Stub";

/**
 * The desktop marketplace — everything the phone app has EXCEPT training and
 * activity tracking, which belong on a device with sensors in your pocket.
 * Discovering and booking mountains, guides and expeditions, and talking to
 * them: the Airbnb half of ICEFALL.
 *
 * Unchanged from when it was the whole site; it has simply moved down a level.
 * Mounted at /preview/* in development only — see App.tsx for why and for how
 * to make it public again. Paths here are relative to that mount point, which
 * is the only edit this file has had.
 */
export default function Marketplace() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="plan" element={<Plan />} />
        <Route path="guides" element={<Guides />} />
        <Route path="guides/:id" element={<GuideDetail />} />
        <Route path="book/:id" element={<BookingConfirm />} />
        <Route path="expeditions" element={<Expeditions />} />
        <Route path="expeditions/:id" element={<Expeditions />} />
        <Route path="mountains" element={<Mountains />} />
        <Route path="messages" element={<Messages />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </Shell>
  );
}
