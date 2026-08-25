import { Route, Routes } from "react-router-dom";
import { Shell } from "@/components/Shell";
import Dashboard from "@/screens/Dashboard";
import Deals from "@/screens/Deals";
import Conversations from "@/screens/Conversations";
import Contacts from "@/screens/Contacts";
import Partners from "@/screens/Partners";
import Verification from "@/screens/Verification";
import Transactions from "@/screens/Transactions";
import Referrals from "@/screens/Referrals";
import Settings from "@/screens/Settings";

/**
 * ICEFALL Operations — the staff CRM.
 *
 * Separate software from the athlete app: its own build, its own deploy, its own
 * login. The only thing it shares is the database. Nothing in here is bundled
 * into what an athlete downloads, which is the point of keeping it apart —
 * client lists, revenue and internal notes never travel to a customer's phone.
 */
export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/conversations" element={<Conversations />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/partners" element={<Partners />} />
        <Route path="/verification" element={<Verification />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/referrals" element={<Referrals />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </Shell>
  );
}
